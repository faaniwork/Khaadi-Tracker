import { NextResponse } from 'next/server';
import { initResumableUpload, isWithinDress } from '@/lib/drive';
import { getUserDriveAccessToken } from '@/lib/googleUserToken';
import { resolveCaller, assertCanWriteFiles, assertDressInScope, statusForError } from '@/lib/reviewAuth';

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
      name,
      mimeType,
      origin,
      accessToken,
    });

    return NextResponse.json({ uploadUrl });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('drive upload-session failed', e);
    return NextResponse.json({ error: e.message || 'Could not start the upload' }, { status });
  }
}
