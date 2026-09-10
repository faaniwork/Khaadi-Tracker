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
// Where a "deleted" file goes when Drive won't let us trash it. The shoot
// folders live in someone's personal My Drive and this app talks to Drive as
// a service account, which is only an editor there — and in a personal My
// Drive only a file's OWNER may trash it (Drive reports canTrash=false for
// everyone else, whatever their edit rights). Moving the file is allowed
// though, so a removal parks it here and every listing skips this folder:
// gone from the board, still sitting in Drive for its owner to deal with.
export const REMOVED_FOLDER_NAME = 'Removed';

const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SHARED = { supportsAllDrives: true, includeItemsFromAllDrives: true };

const FILE_FIELDS =
  'id, name, mimeType, size, modifiedTime, createdTime, webViewLink, iconLink, thumbnailLink, hasThumbnail, trashed, parents';

// Drive ids are URL-safe base64-ish. Validating them is not cosmetic: ids are
// interpolated into Drive's `q` query language, where an unvalidated value
// lets a caller rewrite the query and enumerate everything the service
// account can see.
const DRIVE_ID = /^[A-Za-z0-9_-]{8,128}$/;

export function assertDriveId(id, what = 'id') {
  const clean = String(id || '');
  if (!DRIVE_ID.test(clean)) {
    const err = new Error(`BAD_ID: That is not a valid Drive ${what}.`);
    err.code = 'BAD_ID';
    err.status = 400;
    throw err;
  }
  return clean;
}

/** Escapes a value for use inside a single-quoted Drive `q` literal. */
function qLiteral(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

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
  assertDriveId(folderId, 'folder id');
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
  assertDriveId(fileId, 'file id');
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
export async function fetchPreviewBytes(fileId, allowedParents, size = 600) {
  // Grid thumbnails ask for 600; the fullscreen lightbox asks for more.
  // Clamped both ways so a crafted size param can neither request Drive's
  // tiny default nor an unbounded transcode.
  const clampedSize = Math.min(2000, Math.max(200, Number(size) || 600));
  assertDriveId(fileId, 'file id');
  const d = drive();
  let meta;
  try {
    const res = await d.files.get({
      fileId,
      // `parents` comes back in the same call the thumbnail link needs, so
      // containment is checked below for free rather than costing an extra
      // Drive round trip per image in the grid.
      fields: 'id, name, mimeType, thumbnailLink, hasThumbnail, parents',
      ...SHARED,
    });
    meta = res.data;
  } catch (e) {
    wrapDriveError(e, `file ${fileId}`);
  }

  if (allowedParents) {
    const parents = meta.parents || [];
    if (!parents.some((p) => allowedParents.includes(p))) {
      // Reported as not-found so a caller learns nothing about files outside
      // what they are allowed to see.
      const err = new Error('NOT_FOUND: That file is not in this dress.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }
  }

  if (meta.hasThumbnail && meta.thumbnailLink) {
    try {
      const token = await getAuth().getAccessToken();
      const accessToken = typeof token === 'string' ? token : token?.token;
      // Ask for a larger thumbnail than Drive's default 220px so the grid
      // stays sharp on a retina screen, or a bigger one still for the
      // fullscreen lightbox.
      const url = meta.thumbnailLink.replace(/=s\d+$/, `=s${clampedSize}`);
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

/**
 * The file's actual bytes, for a real download — never the resized
 * thumbnail fetchPreviewBytes serves the grid and lightbox. `allowedParents`
 * is the same containment check used there, since a download route needs
 * the identical guarantee that the file is really inside the caller's dress.
 */
export async function fetchOriginalBytes(fileId, allowedParents) {
  assertDriveId(fileId, 'file id');
  const d = drive();
  let meta;
  try {
    const res = await d.files.get({
      fileId,
      fields: 'id, name, mimeType, parents',
      ...SHARED,
    });
    meta = res.data;
  } catch (e) {
    wrapDriveError(e, `file ${fileId}`);
  }

  if (allowedParents) {
    const parents = meta.parents || [];
    if (!parents.some((p) => allowedParents.includes(p))) {
      const err = new Error('NOT_FOUND: That file is not in this dress.');
      err.code = 'NOT_FOUND';
      err.status = 404;
      throw err;
    }
  }

  try {
    const res = await d.files.get(
      { fileId, alt: 'media', ...SHARED },
      { responseType: 'stream' }
    );
    return { body: res.data, contentType: meta.mimeType || 'application/octet-stream', name: meta.name || fileId };
  } catch (e) {
    wrapDriveError(e, `file ${fileId}`);
  }
}

/** The canonical (oldest) subfolder with this name, or null. */
export async function findSubfolder({ parentId, name }) {
  const all = await findSubfolders({ parentId, name });
  return all[0]?.id || null;
}

/**
 * Every subfolder of `parentId` with this exact name, oldest first.
 *
 * Plural on purpose: duplicates happen when two requests race to create the
 * same folder, and pretending only one exists is how files go missing.
 */
export async function findSubfolders({ parentId, name }) {
  try {
    const res = await drive().files.list({
      q: `'${assertDriveId(parentId, 'folder id')}' in parents and mimeType = '${FOLDER_MIME}' and name = '${qLiteral(
        name
      )}' and trashed = false`,
      fields: 'files(id, name, createdTime)',
      // Deliberately more than one. Two concurrent rejections on the same
      // dress can each create a "Rejected" folder; asking for a single result
      // would pick one arbitrarily and the files in the other would be
      // invisible everywhere in the app. Taking the oldest makes every
      // instance agree on which one is canonical.
      pageSize: 10,
      orderBy: 'createdTime',
      ...SHARED,
    });
    return (res.data.files || [])
      .slice()
      .sort((a, b) => String(a.createdTime || '').localeCompare(String(b.createdTime || '')));
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
  const rejectedFolders = await findSubfolders({
    parentId: dressFolderId,
    name: REJECTED_FOLDER_NAME,
  });
  const [main, ...rejectedLists] = await Promise.all([
    listFolder(dressFolderId),
    // All of them, so a file that landed in a duplicate created by a race is
    // still listed rather than silently missing.
    ...rejectedFolders.map((f) => listFolder(f.id)),
  ]);
  const rejected = rejectedLists.flat();
  return [
    ...main
      .filter(
        (f) =>
          !(f.isFolder && (f.name === REJECTED_FOLDER_NAME || f.name === REMOVED_FOLDER_NAME))
      )
      .map((f) => ({ ...f, inRejectedFolder: false })),
    ...rejected.filter((f) => !f.isFolder).map((f) => ({ ...f, inRejectedFolder: true })),
  ];
}

export async function uploadFile({ folderId, name, mimeType, buffer }) {
  assertDriveId(folderId, 'folder id');
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

/**
 * Starts a Drive resumable upload session and hands back its URL, so the
 * browser can PUT the file's bytes straight to Google rather than through
 * this app's own server.
 *
 * Vercel's serverless functions cap a request body around 4-4.5MB on this
 * project's plan, well under a single export photo (routinely 4-5MB+ here),
 * so routing the actual bytes through uploadFile()/a Vercel function body at
 * all silently failed or truncated on exactly the files this board exists to
 * handle. The upload session URL Drive returns here is itself the
 * credential for the one PUT that follows — nothing about the service
 * account's key ever reaches the browser.
 */
export async function initResumableUpload({ folderId, name, mimeType, origin, accessToken: userToken }) {
  assertDriveId(folderId, 'folder id');
  if (!name) throw new Error('name is required');
  // Uploads pass the signed-in person's own token, because a service account
  // has no storage quota and so can never own a file it creates — see
  // lib/googleUserToken.js. The service account is still the fallback for any
  // caller that does not supply one.
  let accessToken = userToken;
  if (!accessToken) {
    const token = await getAuth().getAccessToken();
    accessToken = typeof token === 'string' ? token : token?.token;
  }
  const qs = new URLSearchParams({
    uploadType: 'resumable',
    supportsAllDrives: 'true',
    fields: FILE_FIELDS,
  });
  const res = await fetch(`https://www.googleapis.com/upload/drive/v3/files?${qs}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType || 'application/octet-stream',
      // Drive ties the session's allowed CORS origin to whatever Origin
      // header was present on THIS request, not on the browser's later PUT —
      // https://developers.google.com/workspace/drive/api/guides/manage-uploads#cors-support.
      // This call is made server-to-server, so it never carries one on its
      // own; without setting it explicitly here to match what the browser's
      // own PUT will send, Drive issues a session with no CORS allowance at
      // all and that PUT is silently blocked by the browser, which is what
      // made every upload fail.
      ...(origin ? { Origin: origin } : {}),
    },
    body: JSON.stringify({ name, parents: [folderId] }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    wrapDriveError({ code: res.status, message: body.slice(0, 300) }, `folder ${folderId}`);
  }
  const uploadUrl = res.headers.get('location');
  if (!uploadUrl) throw new Error('Drive did not return an upload session for that folder.');
  return uploadUrl;
}

/**
 * The folder one level up from `folderId`, or '' if it has none we can see.
 *
 * Used to find the shoot's "Output" folder without anyone having to configure
 * its id: every batch folder already lives directly inside it, so the parent
 * of a batch we already know about IS it.
 */
export async function getParentFolderId(folderId) {
  assertDriveId(folderId, 'folder id');
  try {
    const res = await drive().files.get({ fileId: folderId, fields: 'id, parents', ...SHARED });
    return res.data.parents?.[0] || '';
  } catch (e) {
    wrapDriveError(e, `folder ${folderId}`);
  }
}

export async function createFolder({ parentId, name }) {
  assertDriveId(parentId, 'folder id');
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
  assertDriveId(fileId, 'file id');
  try {
    const res = await drive().files.update({
      fileId,
      requestBody: { trashed: true },
      fields: 'id, name',
      ...SHARED,
    });
    return { id: res.data.id, name: res.data.name || '' };
  } catch (e) {
    // A 403 here is a genuine Drive-side permission gap, not something this
    // app can route around — but "the user does not have sufficient
    // permissions" alone doesn't say why. A Shared Drive's "Contributor"
    // role, for instance, can edit and add files but not trash or move them
    // out — only "Content Manager" or above can — while everything else this
    // app does (list, upload, review) only ever needed writer-level access,
    // so trashing can be the first operation that ever exercises that gap.
    // One extra read on the failure path only, so this costs nothing on the
    // common success case, and turns a generic denial into something whoever
    // owns the Drive sharing can actually act on.
    if ((e?.code || e?.response?.status) === 403) {
      try {
        const meta = await drive().files.get({
          fileId,
          fields: 'capabilities(canTrash,canDelete,canEdit), owners(displayName,emailAddress), driveId',
          ...SHARED,
        });
        const owner = meta.data.owners?.[0];
        const cap = meta.data.capabilities || {};
        const detail = [
          owner ? `owned by ${owner.displayName || owner.emailAddress}` : null,
          meta.data.driveId ? 'in a Shared Drive' : 'in a personal My Drive',
          `canTrash=${cap.canTrash}`,
          `canEdit=${cap.canEdit}`,
        ]
          .filter(Boolean)
          .join(', ');
        const err = new Error(
          `DRIVE_FORBIDDEN: Drive refused to trash file ${fileId} (${detail}). ${
            meta.data.driveId
              ? "If this is a Shared Drive, the service account likely has \"Contributor\" access there, which can edit files but not trash them — it needs \"Content Manager\" or higher, set from the Shared Drive's own member list, not the folder's Share dialog."
              : 'The file is owned by someone other than the service account, and that owner\'s sharing does not grant trash rights to editors.'
          }`
        );
        err.code = 'DRIVE_FORBIDDEN';
        throw err;
      } catch (inner) {
        if (inner?.code === 'DRIVE_FORBIDDEN') throw inner;
        // The diagnostic read itself failed — fall through to the plain error.
      }
    }
    wrapDriveError(e, `file ${fileId}`);
  }
}

/**
 * Drive has no "get or create folder" call, so this is a lookup then a create.
 *
 * Deliberately NOT cached. A cached id survives the folder being trashed in
 * Drive, and the next rejection would then add that dead folder as the file's
 * parent while removing its real one, leaving the image with no parent anyone
 * ever looks in. One extra lookup per rejection is a good trade for never
 * losing a client's image.
 */
export async function ensureSubfolder({ parentId, name }) {
  const existing = await findSubfolder({ parentId, name });
  if (existing) return existing;
  const created = await createFolder({ parentId, name });
  // Look again. Two requests can both have found nothing and both created a
  // folder; re-reading settles on the same canonical one for both, so the
  // loser's file goes where everyone else will look for it rather than into
  // a duplicate nothing lists.
  const canonical = await findSubfolder({ parentId, name });
  return canonical || created.id;
}


/**
 * The set of folders a dress legitimately owns: its own folder, plus EVERY
 * folder named "Rejected" directly inside it.
 *
 * Every one, not just the canonical oldest: two simultaneous first-ever
 * rejections on one dress can each create a "Rejected" folder, and a file
 * that landed in the loser would otherwise be unreachable through this app
 * while still existing in Drive.
 *
 * This is what containment checks compare against. Without it, naming a dress
 * you are allowed to touch and a file id you are not lets you move any object
 * the service account can reach.
 */
export async function dressScopeParents(dressFolderId) {
  assertDriveId(dressFolderId, 'folder id');
  const rejected = await findSubfolders({
    parentId: dressFolderId,
    name: REJECTED_FOLDER_NAME,
  });
  return [dressFolderId, ...rejected.map((f) => f.id)];
}

// How far below a dress folder this app will look. Deep enough for the
// organising the team actually does ("Selects/Final"), shallow enough that a
// containment check is a handful of Drive calls rather than an open-ended
// walk.
const MAX_DEPTH = 5;

/**
 * Whether `folderId` is the dress folder or sits somewhere beneath it.
 *
 * Walks upward from the folder rather than downward from the dress, because
 * upward is one call per level regardless of how many folders the dress
 * contains. Bounded by MAX_DEPTH so a pathological or circular parent chain
 * cannot spin.
 */
export async function isWithinDress({ folderId, dressFolderId }) {
  assertDriveId(folderId, 'folder id');
  assertDriveId(dressFolderId, 'folder id');
  if (folderId === dressFolderId) return true;

  const d = drive();
  let current = folderId;
  for (let hop = 0; hop < MAX_DEPTH; hop++) {
    let parents;
    try {
      const res = await d.files.get({ fileId: current, fields: 'id, parents', ...SHARED });
      parents = res.data.parents || [];
    } catch (e) {
      wrapDriveError(e, `folder ${current}`);
    }
    if (parents.includes(dressFolderId)) return true;
    if (!parents.length) return false;
    current = parents[0];
  }
  return false;
}

/**
 * Refuses anything that is not a plain file sitting directly inside the named
 * dress (or its Rejected subfolder), and hands back its metadata.
 *
 * Folders are rejected outright: a move that re-parents a dress FOLDER would
 * detach it from its collection, drop it out of every listing, and get it
 * archived by the next resync.
 */
export async function assertFileInDress({ fileId, dressFolderId }) {
  assertDriveId(fileId, 'file id');
  const allowed = await dressScopeParents(dressFolderId);
  let file;
  try {
    const res = await drive().files.get({
      fileId,
      fields: 'id, name, mimeType, parents, trashed',
      ...SHARED,
    });
    file = res.data;
  } catch (e) {
    wrapDriveError(e, `file ${fileId}`);
  }

  const notFound = () => {
    // Not-found rather than forbidden, so probing ids reveals nothing.
    const err = new Error('NOT_FOUND: That file is not in this dress.');
    err.code = 'NOT_FOUND';
    err.status = 404;
    throw err;
  };

  if (file.mimeType === FOLDER_MIME) notFound();
  if (file.trashed) notFound();

  const parents = file.parents || [];
  if (!parents.some((p) => allowed.includes(p))) {
    // Not an immediate child, but the team does organise into subfolders
    // ("Selects", "Flats"), so walk up from the file's own parent to see
    // whether it is still inside this dress. Bounded, and it only runs for
    // files that are not directly in the dress folder.
    const withinDress = parents.length
      ? await isWithinDress({ folderId: parents[0], dressFolderId })
      : false;
    if (!withinDress) notFound();
  }

  return { file: shapeFile(file), parents, allowedParents: allowed };
}

/**
 * Moves a rejected file into the dress folder's "Rejected" subfolder,
 * creating that subfolder on first use. Drive moves are a parent swap, so
 * this adds the new parent and removes the old one in a single update.
 *
 * Idempotent: a file already in Rejected is left alone, so a double-click on
 * the cross does not strip its parent and orphan the file.
 */
/**
 * Takes a file off the board, by whichever route Drive actually permits.
 *
 * Trashing is tried first and is still the outcome wherever it works (a
 * Shared Drive, or a file the service account owns): the file lands in Drive's
 * trash, restorable for 30 days, which is what everyone expects "delete" to
 * mean. Where it does not work — a personal My Drive, where only a file's
 * owner may trash it — the file is instead moved into the dress's "Removed"
 * subfolder, which every listing skips. Not as tidy, but it is the difference
 * between the button working and the button being permanently broken, and
 * nothing is ever destroyed either way.
 *
 * `method` says which happened so the caller can tell the user the truth
 * about where their file went rather than guessing.
 */
export async function removeFileFromBoard({ fileId, dressFolderId }) {
  assertDriveId(fileId, 'file id');
  assertDriveId(dressFolderId, 'folder id');
  try {
    const trashed = await trashFile(fileId);
    return { ...trashed, method: 'trashed' };
  } catch (e) {
    if (e?.code !== 'DRIVE_FORBIDDEN') throw e;
    const removedId = await ensureSubfolder({
      parentId: dressFolderId,
      name: REMOVED_FOLDER_NAME,
    });
    await moveBetween({ fileId, addParent: removedId });
    return { id: fileId, name: '', method: 'moved' };
  }
}

export async function moveToRejected({ fileId, dressFolderId }) {
  assertDriveId(fileId, 'file id');
  const rejectedId = await ensureSubfolder({
    parentId: dressFolderId,
    name: REJECTED_FOLDER_NAME,
  });
  return moveBetween({ fileId, addParent: rejectedId });
}

/**
 * Adds one parent and drops the others in a single update.
 *
 * addParents is always set, so the file can never end up parentless even if
 * the removeParents list happens to cover everything it had.
 */
async function moveBetween({ fileId, addParent }) {
  const d = drive();
  try {
    const current = await d.files.get({ fileId, fields: 'id, parents', ...SHARED });
    const parents = current.data.parents || [];
    if (parents.includes(addParent) && parents.length === 1) {
      return { movedTo: addParent, alreadyThere: true };
    }
    const removing = parents.filter((p) => p !== addParent);
    await d.files.update({
      fileId,
      addParents: addParent,
      removeParents: removing.join(','),
      fields: 'id, parents',
      ...SHARED,
    });
    return { movedTo: addParent, alreadyThere: false };
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
  assertDriveId(fileId, 'file id');
  assertDriveId(dressFolderId, 'folder id');
  return moveBetween({ fileId, addParent: dressFolderId });
}
