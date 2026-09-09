/**
 * Google Drive data layer for the Khaadi Production Board.
 *
 * Uses the SAME service account as the Sheets export (lib/sheetExport.js),
 * just with the Drive scope added. That means nobody has to re-consent or
 * sign in again: a service account's scopes are declared by us, not granted
 * by each user.
 *
 * ONE-TIME MANUAL SETUP: every Drive folder this app should reach must be
 * shared with GOOGLE_SERVICE_ACCOUNT_EMAIL as Editor (or "Content manager"
 * on a Shared Drive). Sharing the batch root folders is enough, since
 * sharing inherits down. Without that, every call here returns 404 rather
 * than 403, because an unshared file simply does not exist to this account.
 *
 * Required environment variables:
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL   - service account client email
 *   GOOGLE_SERVICE_ACCOUNT_KEY     - service account private key (\n escaped)
 *
 * Every call passes supportsAllDrives so this works whether the folders live
 * in My Drive or in a Shared Drive.
 */

import { Readable } from 'node:stream';
import { google } from 'googleapis';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
export const REJECTED_FOLDER_NAME = 'Rejected';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SHARED = { supportsAllDrives: true, includeItemsFromAllDrives: true };

const FILE_FIELDS =
  'id, name, mimeType, size, modifiedTime, createdTime, webViewLink, iconLink, thumbnailLink, hasThumbnail, trashed, parents';

let cachedAuth = null;
let cachedDrive = null;

function getAuth() {
  if (cachedAuth) return cachedAuth;
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!email || !rawKey) {
    throw new Error(
      'Missing GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_KEY environment variables.'
    );
  }
  const key = rawKey.includes('\\n') ? rawKey.replace(/\\n/g, '\n') : rawKey;
  cachedAuth = new google.auth.JWT({ email, key, scopes: [DRIVE_SCOPE] });
  return cachedAuth;
}

function drive() {
  if (cachedDrive) return cachedDrive;
  cachedDrive = google.drive({ version: 'v3', auth: getAuth() });
  return cachedDrive;
}

/**
 * Turns Drive's errors into something a route can map to a status code.
 * A folder that was never shared with the service account reports 404, which
 * is indistinguishable from a genuinely missing folder, so the message says
 * so rather than guessing.
 */
function wrapDriveError(e, context) {
  const status = e?.code || e?.response?.status;
  const detail = e?.errors?.[0]?.message || e?.message || 'Drive request failed';
  if (status === 404) {
    const err = new Error(
      `DRIVE_NOT_FOUND: ${context} was not found. Either it does not exist, or it has not been shared with the service account (${
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || 'the service account'
      }) as Editor.`
    );
    err.code = 'DRIVE_NOT_FOUND';
    throw err;
  }
  if (status === 403) {
    const err = new Error(`DRIVE_FORBIDDEN: Drive refused the request for ${context}. ${detail}`);
    err.code = 'DRIVE_FORBIDDEN';
    throw err;
  }
  const err = new Error(`DRIVE_ERROR: ${detail}`);
  err.code = 'DRIVE_ERROR';
  throw err;
}

function shapeFile(f) {
  return {
    id: f.id,
    name: f.name || '',
    mimeType: f.mimeType || '',
    isFolder: f.mimeType === FOLDER_MIME,
    isImage: (f.mimeType || '').startsWith('image/'),
    size: f.size != null ? Number(f.size) : null,
    modifiedTime: f.modifiedTime ? Date.parse(f.modifiedTime) : null,
    webViewLink: f.webViewLink || '',
    hasThumbnail: Boolean(f.hasThumbnail),
  };
}

/**
 * Lists one folder's immediate children, folders first then files, each
 * alphabetically. Pages through Drive so a folder with hundreds of images
 * comes back complete rather than silently truncated at 100.
 */
export async function listFolder(folderId) {
  if (!folderId) throw new Error('folderId is required');
  const d = drive();
  const out = [];
  let pageToken;
  try {
    do {
      const res = await d.files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: `nextPageToken, files(${FILE_FIELDS})`,
        pageSize: 200,
        orderBy: 'folder,name',
        pageToken,
        ...SHARED,
      });
      (res.data.files || []).forEach((f) => out.push(shapeFile(f)));
      pageToken = res.data.nextPageToken;
    } while (pageToken);
  } catch (e) {
    wrapDriveError(e, `folder ${folderId}`);
  }
  return out;
}

/**
 * Runs an async mapper over items with a ceiling on how many are in flight.
 *
 * Reconciling one batch means listing its root, every collection folder and
 * every dress folder inside those, which is easily 80 Drive calls. Done one
 * at a time that is 25 seconds and a serverless timeout; done all at once it
 * trips Drive's rate limiting. Eight at a time lands it in a few seconds.
 */
export async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function getFile(fileId) {
  try {
    const res = await drive().files.get({ fileId, fields: FILE_FIELDS, ...SHARED });
    return shapeFile(res.data);
  } catch (e) {
    wrapDriveError(e, `file ${fileId}`);
  }
}

/**
 * Streams bytes suitable for an <img> preview.
 *
 * Drive's own thumbnailLink cannot be used directly from the browser: those
 * URLs are short-lived and only resolve for a caller Google considers
 * authorized, and our viewers are authorized to OUR app, not to the file. So
 * the server fetches it with the service account's token and passes the bytes
 * through. Falls back to the original image bytes when no thumbnail exists
 * yet, which is common for a file uploaded seconds ago.
 */
export async function fetchPreviewBytes(fileId) {
  const d = drive();
  let meta;
  try {
    const res = await d.files.get({
      fileId,
      fields: 'id, name, mimeType, thumbnailLink, hasThumbnail',
      ...SHARED,
    });
    meta = res.data;
  } catch (e) {
    wrapDriveError(e, `file ${fileId}`);
  }

  if (meta.hasThumbnail && meta.thumbnailLink) {
    try {
      const token = await getAuth().getAccessToken();
      const accessToken = typeof token === 'string' ? token : token?.token;
      // Ask for a larger thumbnail than Drive's default 220px so the grid
      // stays sharp on a retina screen.
      const url = meta.thumbnailLink.replace(/=s\d+$/, '=s600');
      const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (res.ok) {
        return {
          body: res.body,
          contentType: res.headers.get('content-type') || 'image/jpeg',
        };
      }
    } catch {
      // Fall through to the original bytes below.
    }
  }

  if (!(meta.mimeType || '').startsWith('image/')) {
    const err = new Error('NO_PREVIEW: This file has no image preview.');
    err.code = 'NO_PREVIEW';
    throw err;
  }

  try {
    const res = await d.files.get(
      { fileId, alt: 'media', ...SHARED },
      { responseType: 'stream' }
    );
    return { body: res.data, contentType: meta.mimeType || 'application/octet-stream' };
  } catch (e) {
    wrapDriveError(e, `file ${fileId}`);
  }
}

/** Looks up a subfolder without creating one. Returns null when absent. */
export async function findSubfolder({ parentId, name }) {
  try {
    const res = await drive().files.list({
      q: `'${parentId}' in parents and mimeType = '${FOLDER_MIME}' and name = '${String(name).replace(
        /'/g,
        "\\'"
      )}' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 1,
      ...SHARED,
    });
    return res.data.files?.[0]?.id || null;
  } catch (e) {
    wrapDriveError(e, `folder ${parentId}`);
  }
}

/**
 * Everything in a dress folder, INCLUDING what is sitting in its "Rejected"
 * subfolder.
 *
 * Rejecting an image moves it into that subfolder, so a plain listing of the
 * dress folder would make the image vanish the moment someone rejected it,
 * and there would be no way to undo the decision from the grid. Merging the
 * two listings keeps a rejected image visible and marked, and reversible.
 */
export async function listDressFiles(dressFolderId) {
  const rejectedId = await findSubfolder({
    parentId: dressFolderId,
    name: REJECTED_FOLDER_NAME,
  });
  const [main, rejected] = await Promise.all([
    listFolder(dressFolderId),
    rejectedId ? listFolder(rejectedId) : Promise.resolve([]),
  ]);
  return [
    ...main
      .filter((f) => !(f.isFolder && f.name === REJECTED_FOLDER_NAME))
      .map((f) => ({ ...f, inRejectedFolder: false })),
    ...rejected.filter((f) => !f.isFolder).map((f) => ({ ...f, inRejectedFolder: true })),
  ];
}

export async function uploadFile({ folderId, name, mimeType, buffer }) {
  if (!folderId) throw new Error('folderId is required');
  if (!name) throw new Error('name is required');
  try {
    const res = await drive().files.create({
      requestBody: { name, parents: [folderId] },
      media: {
        mimeType: mimeType || 'application/octet-stream',
        body: Readable.from(buffer),
      },
      fields: FILE_FIELDS,
      ...SHARED,
    });
    return shapeFile(res.data);
  } catch (e) {
    wrapDriveError(e, `folder ${folderId}`);
  }
}

export async function createFolder({ parentId, name }) {
  if (!parentId) throw new Error('parentId is required');
  const trimmed = String(name || '').trim();
  if (!trimmed) throw new Error('Folder name cannot be empty');
  try {
    const res = await drive().files.create({
      requestBody: { name: trimmed, mimeType: FOLDER_MIME, parents: [parentId] },
      fields: FILE_FIELDS,
      ...SHARED,
    });
    return shapeFile(res.data);
  } catch (e) {
    wrapDriveError(e, `folder ${parentId}`);
  }
}

/**
 * Moves a file to Drive's trash rather than deleting it outright.
 *
 * Deliberate: these are client shoot deliverables, and a mis-click in a
 * thumbnail grid is easy. Trashed files stay restorable from Drive for 30
 * days, and still disappear from every listing here because listFolder
 * filters on trashed = false.
 */
export async function trashFile(fileId) {
  if (!fileId) throw new Error('fileId is required');
  try {
    const res = await drive().files.update({
      fileId,
      requestBody: { trashed: true },
      fields: 'id, name',
      ...SHARED,
    });
    return { id: res.data.id, name: res.data.name || '' };
  } catch (e) {
    wrapDriveError(e, `file ${fileId}`);
  }
}

// Drive has no "get or create folder" call, so this is a lookup then a
// create. Cached per parent for the lifetime of the serverless instance,
// which is enough to keep a client rejecting ten images in a row from
// re-running the lookup ten times.
const subfolderCache = new Map();

export async function ensureSubfolder({ parentId, name }) {
  const cacheKey = `${parentId}/${name}`;
  const cached = subfolderCache.get(cacheKey);
  if (cached) return cached;

  const d = drive();
  try {
    const res = await d.files.list({
      q: `'${parentId}' in parents and mimeType = '${FOLDER_MIME}' and name = '${name.replace(
        /'/g,
        "\\'"
      )}' and trashed = false`,
      fields: 'files(id, name)',
      pageSize: 1,
      ...SHARED,
    });
    const found = res.data.files?.[0];
    if (found?.id) {
      subfolderCache.set(cacheKey, found.id);
      return found.id;
    }
  } catch (e) {
    wrapDriveError(e, `folder ${parentId}`);
  }

  const created = await createFolder({ parentId, name });
  subfolderCache.set(cacheKey, created.id);
  return created.id;
}

/**
 * Moves a rejected file into the dress folder's "Rejected" subfolder,
 * creating that subfolder on first use. Drive moves are a parent swap, so
 * this adds the new parent and removes the old one in a single update.
 *
 * Idempotent: a file already in Rejected is left alone, so a double-click on
 * the cross does not strip its parent and orphan the file.
 */
export async function moveToRejected({ fileId, dressFolderId }) {
  const rejectedId = await ensureSubfolder({
    parentId: dressFolderId,
    name: REJECTED_FOLDER_NAME,
  });
  const d = drive();
  try {
    const current = await d.files.get({ fileId, fields: 'id, parents', ...SHARED });
    const parents = current.data.parents || [];
    if (parents.includes(rejectedId)) return { movedTo: rejectedId, alreadyThere: true };
    await d.files.update({
      fileId,
      addParents: rejectedId,
      removeParents: parents.join(','),
      fields: 'id, parents',
      ...SHARED,
    });
    return { movedTo: rejectedId, alreadyThere: false };
  } catch (e) {
    wrapDriveError(e, `file ${fileId}`);
  }
}

/**
 * Moves an un-rejected file back out of "Rejected" into the dress folder, so
 * changing a decision from reject to approve does not leave the image
 * stranded where nobody looks for it.
 */
export async function moveOutOfRejected({ fileId, dressFolderId }) {
  const d = drive();
  try {
    const current = await d.files.get({ fileId, fields: 'id, parents', ...SHARED });
    const parents = current.data.parents || [];
    if (parents.includes(dressFolderId)) return { movedTo: dressFolderId, alreadyThere: true };
    await d.files.update({
      fileId,
      addParents: dressFolderId,
      removeParents: parents.join(','),
      fields: 'id, parents',
      ...SHARED,
    });
    return { movedTo: dressFolderId, alreadyThere: false };
  } catch (e) {
    wrapDriveError(e, `file ${fileId}`);
  }
}
