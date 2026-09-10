import { NextResponse } from 'next/server';
import { initResumableUpload, isWithinDress, getFile, listFolder } from '@/lib/drive';
import { getUserDriveAccessToken } from '@/lib/googleUserToken';
import { resolveCaller, assertCanWriteFiles, assertDressInScope, statusForError } from '@/lib/reviewAuth';
import { DRESS_VERSION_PATTERN, smartImageName } from '@/lib/constants';

/**
 * Works out which revision round `target` is, and the next picture number
 * within it, so the upload gets a name that says what it is instead of
 * whatever the camera or export tool called it.
 *
 * The dress folder itself IS the first round when nothing has ever been
 * versioned out of it, so a folder whose name is not itself a bare "V2"/"V3"
 * counts as V1. Position is one past however many images are already there,
 * so re-uploading into a partly-filled round keeps numbering instead of
 * restarting it.
 */
async function nameForUpload({ dressName, target, dressFolderId }) {
  let version = 1;
  if (target !== dressFolderId) {
    const folder = await getFile(target);
    const m = DRESS_VERSION_PATTERN.exec(String(folder?.name || '').trim());
    if (m) version = Number(m[1]);
  }
  const existing = await listFolder(target);
  const position = existing.filter((f) => !f.isFolder).length + 1;
  return { version, position };
}

async function resolveTargetFolder(dressFolderId, folderId) {
  if (!folderId || typeof folderId !== 'string' || folderId === dressFolderId) {
    return dressFolderId;
  }
  if (!(await isWithinDress({ folderId, dressFolderId }))) {
    const err = new Error('NOT_FOUND: That folder is not inside this dress.');
    err.code = 'NOT_FOUND';
    err.status = 404;
    throw err;
  }
  return folderId;
}

/**
 * POST /api/drive/upload-session   { dressId, folderId?, name, mimeType }
 *
 * Authorises the upload and hands back a Drive resumable-upload URL — no
 * file bytes pass through this route or this server at all. The browser
 * PUTs the actual file straight to that URL next (see driveUpload in
 * lib/api.js). This exists because routing real photo files through
 * uploadFile()/a normal request body ran into this project's Vercel plan's
 * request size ceiling (a few MB), well under what these exports actually
 * weigh, which is what made every upload silently fail before this.
 */
export async function POST(req) {
  try {
    const caller = await resolveCaller(req);
    assertCanWriteFiles(caller);

    const { dressId, folderId, name, mimeType } = await req.json();
    if (!dressId) return NextResponse.json({ error: 'dressId is required' }, { status: 400 });
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    const dress = await assertDressInScope(caller, dressId);
    const target = await resolveTargetFolder(dress.id, folderId);

    // Whatever the file was called on the way in, it lands in Drive named for
    // what it actually is: which dress, which revision round, which picture
    // in that round. See smartImageName in lib/constants.js.
    const ext = String(name).includes('.') ? String(name).split('.').pop() : '';
    const { version, position } = await nameForUpload({ dressName: dress.dress, target, dressFolderId: dress.id });
    const smartName = smartImageName({ dressName: dress.dress, version, position, ext });

    // The browser's own follow-up PUT (see driveUpload in lib/api.js) will
    // carry this same Origin automatically since it's a cross-origin
    // request to Google's servers — the session has to be created with it
    // too, or Drive won't allow that PUT through. See the comment in
    // initResumableUpload for why.
    const origin = req.headers.get('origin') || new URL(req.url).origin;
    // Created with the signed-in person's OWN Google credentials, so the file
    // they upload is owned by them. The service account cannot own a file at
    // all — Drive answers "Service Accounts do not have storage quota" — so
    // this is the only way an upload can land in the shoot folders. Which
    // folder it may land in is still decided above, by us, not by them.
    const accessToken = await getUserDriveAccessToken();
    const uploadUrl = await initResumableUpload({
      folderId: target,
      name: smartName,
      mimeType,
      origin,
      accessToken,
    });

    return NextResponse.json({ uploadUrl });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('drive upload-session failed', e);
    // `code` lets the browser recognise DRIVE_ACCESS_REQUIRED specifically
    // (an expired or missing Drive sign-in) and offer to sign the person out
    // and back in, rather than showing this as just another failed upload.
    return NextResponse.json({ error: e.message || 'Could not start the upload', code: e.code }, { status });
  }
}
