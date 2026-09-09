import { NextResponse } from 'next/server';
import { trashFile } from '@/lib/drive';
import { recordLog } from '@/lib/db';
import { resolveCaller, assertCanWriteFiles, assertDressInScope, statusForError } from '@/lib/reviewAuth';

/**
 * DELETE /api/drive/file   { dressId, fileId }
 *
 * Editors and admins only, and it TRASHES rather than permanently deletes.
 *
 * The original plan said permanent deletion. These are client shoot
 * deliverables and a mis-click in a thumbnail grid is easy, so this moves the
 * file to Drive's trash: it vanishes from every listing in the app straight
 * away (listFolder filters trashed files out) and stays restorable from Drive
 * for 30 days. If you genuinely want it gone, empty the Drive trash.
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
    const trashed = await trashFile(fileId);

    await recordLog({
      by: caller.by,
      scope: `file:${dress.id}`,
      field: trashed.name || fileId,
      oldValue: 'in folder',
      newValue: 'moved to Drive trash',
    });

    return NextResponse.json({ trashed: true, file: trashed });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('drive trash failed', e);
    return NextResponse.json({ error: e.message || 'Could not remove the file' }, { status });
  }
}
