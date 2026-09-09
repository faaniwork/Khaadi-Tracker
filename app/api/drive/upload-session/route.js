import { NextResponse } from 'next/server';
import { initResumableUpload, isWithinDress } from '@/lib/drive';
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

    const uploadUrl = await initResumableUpload({ folderId: target, name, mimeType });

    return NextResponse.json({ uploadUrl });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('drive upload-session failed', e);
    return NextResponse.json({ error: e.message || 'Could not start the upload' }, { status });
  }
}
