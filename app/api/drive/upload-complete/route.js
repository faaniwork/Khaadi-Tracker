import { NextResponse } from 'next/server';
import { adjustDressFileCount } from '@/lib/db';
import { resolveCaller, assertCanWriteFiles, assertDressInScope, statusForError } from '@/lib/reviewAuth';

/**
 * POST /api/drive/upload-complete   { dressId }
 *
 * Tells the board a new file actually landed, so dresses.files stops being
 * a number only "Resync from Drive" ever touches.
 *
 * Has to be its own call rather than something upload-session does: that
 * route only ever hands back a Drive upload URL BEFORE the browser's own
 * PUT of the actual bytes (see the comment there) - the file bytes go
 * straight from the browser to Google and never pass through this server at
 * all, so this server has no other way to find out the PUT actually
 * succeeded. The browser calls this once Drive's own response to that PUT
 * comes back with a 2xx (see driveUpload in lib/api.js).
 *
 * Never called for a replacement (see replaceFileId in upload-session) -
 * overwriting a file's content is not a new file, so the count does not
 * move.
 */
export async function POST(req) {
  try {
    const caller = await resolveCaller(req);
    assertCanWriteFiles(caller);
    const { dressId } = await req.json();
    if (!dressId) return NextResponse.json({ error: 'dressId is required' }, { status: 400 });
    const dress = await assertDressInScope(caller, dressId);
    await adjustDressFileCount(dress.id, 1);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('drive upload-complete failed', e);
    return NextResponse.json({ error: e.message || 'Could not record that upload' }, { status });
  }
}
