import { NextResponse } from 'next/server';
import { listRemovedFiles, restoreRemovedFile, assertDriveId } from '@/lib/drive';
import { recordLog } from '@/lib/db';
import { resolveCaller, assertCanWriteFiles, assertDressInScope, statusForError } from '@/lib/reviewAuth';

/**
 * GET  /api/drive/restore?dressId=...          what is in this dress's bin
 * POST /api/drive/restore  { dressId, fileId } put one back
 *
 * The bin is the "Removed" subfolder that a removal parks files in, because
 * this Drive will not let the app trash anything it does not own (see
 * removeFileFromBoard). Putting a file back is therefore just a move in the
 * other direction — there is no earlier location to remember, since Removed
 * sits directly inside the dress the file came from.
 */
export async function GET(req) {
  try {
    const caller = await resolveCaller(req);
    const dressId = new URL(req.url).searchParams.get('dressId');
    if (!dressId) return NextResponse.json({ error: 'dressId is required' }, { status: 400 });
    const dress = await assertDressInScope(caller, dressId);
    const files = await listRemovedFiles(dress.id);
    return NextResponse.json({ files, canWrite: caller.canWrite });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('drive restore list failed', e);
    return NextResponse.json({ error: e.message || 'Could not read the bin' }, { status });
  }
}

export async function POST(req) {
  try {
    const caller = await resolveCaller(req);
    assertCanWriteFiles(caller);
    const { dressId, fileId } = await req.json();
    if (!dressId || !fileId) {
      return NextResponse.json({ error: 'dressId and fileId are required' }, { status: 400 });
    }
    const dress = await assertDressInScope(caller, dressId);

    // The file has to actually be one of THIS dress's removed files. Without
    // this, a caller could name any id the service account can reach and have
    // it moved into a dress they happen to have access to.
    const removed = await listRemovedFiles(dress.id);
    const match = removed.find((f) => f.id === assertDriveId(fileId, 'file id'));
    if (!match) {
      return NextResponse.json({ error: "That file is not in this dress's bin." }, { status: 404 });
    }

    await restoreRemovedFile({ fileId, dressFolderId: dress.id });
    await recordLog({
      by: caller.by,
      scope: `file:${dress.id}`,
      field: match.name || fileId,
      oldValue: 'removed',
      newValue: 'restored',
    });
    return NextResponse.json({ restored: true, file: match });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('drive restore failed', e);
    return NextResponse.json({ error: e.message || 'Could not restore that file' }, { status });
  }
}
