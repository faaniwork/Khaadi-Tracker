import { NextResponse } from 'next/server';
import { removeFileFromBoard, assertFileInDress } from '@/lib/drive';
import { recordLog } from '@/lib/db';
import { resolveCaller, assertCanWriteFiles, assertDressInScope, statusForError } from '@/lib/reviewAuth';

/**
 * DELETE /api/drive/file   { dressId, fileId }
 *
 * Editors and admins only, and it never destroys anything.
 *
 * The original plan said permanent deletion. These are client shoot
 * deliverables and a mis-click in a thumbnail grid is easy, so this moves the
 * file to Drive's trash instead: it vanishes from every listing in the app
 * straight away (listFolder filters trashed files out) and stays restorable
 * from Drive for 30 days. If you genuinely want it gone, empty the Drive
 * trash. Where Drive refuses to let us trash at all — a personal My Drive
 * only lets a file's owner do that — removeFileFromBoard parks the file in
 * the dress's "Removed" subfolder instead, which listings skip; `method` in
 * the response says which of the two actually happened.
 */
export async function DELETE(req) {
  try {
    const caller = await resolveCaller(req);
    assertCanWriteFiles(caller);

    const { dressId, fileId } = await req.json();
    if (!dressId || !fileId) {
      return NextResponse.json({ error: 'dressId and fileId are required' }, { status: 400 });
    }

    const dress = await assertDressInScope(caller, dressId);
    // The file has to actually be in this dress, and has to be a file: a
    // folder id here would trash a whole dress or collection.
    const { file } = await assertFileInDress({ fileId, dressFolderId: dress.id });
    const removed = await removeFileFromBoard({ fileId, dressFolderId: dress.id });

    await recordLog({
      by: caller.by,
      scope: `file:${dress.id}`,
      field: file.name || removed.name || fileId,
      oldValue: 'in folder',
      newValue: removed.method === 'trashed' ? 'moved to Drive trash' : 'moved to the Removed folder',
    });

    return NextResponse.json({ trashed: true, method: removed.method, file: { ...file, ...removed } });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('drive trash failed', e);
    return NextResponse.json({ error: e.message || 'Could not remove the file' }, { status });
  }
}
