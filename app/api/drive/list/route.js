import { NextResponse } from 'next/server';
import { listFolder, listDressFiles } from '@/lib/drive';
import { getReviewsForDress } from '@/lib/db';
import { resolveCaller, assertDressInScope, statusForError } from '@/lib/reviewAuth';

/**
 * GET /api/drive/list?dressId=...            list a dress's Drive folder
 * GET /api/drive/list?dressId=...&folderId=  list a subfolder inside it
 *
 * `folderId` is only honoured for signed-in users. A client holding a review
 * token can list the dress folders in its own batch and nothing else, so it
 * cannot walk the Drive tree by passing folder ids of its own choosing.
 */
export async function GET(req) {
  try {
    const caller = await resolveCaller(req);
    const url = new URL(req.url);
    const dressId = url.searchParams.get('dressId');
    const folderId = url.searchParams.get('folderId');

    if (!dressId) {
      return NextResponse.json({ error: 'dressId is required' }, { status: 400 });
    }

    const dress = await assertDressInScope(caller, dressId);

    let target = dress.id;
    if (folderId && folderId !== dress.id) {
      if (caller.kind !== 'user') {
        return NextResponse.json(
          { error: 'Review links can only list the folders in their own batch.' },
          { status: 403 }
        );
      }
      target = folderId;
    }

    const isRoot = target === dress.id;
    const [files, reviews] = await Promise.all([
      // At the dress folder itself, rejected images are folded back in so
      // they stay visible and a decision stays reversible. Deeper subfolders
      // are listed plainly.
      isRoot ? listDressFiles(dress.id) : listFolder(target),
      getReviewsForDress(dress.id),
    ]);

    return NextResponse.json({
      dress,
      folderId: target,
      isRoot,
      files,
      reviews,
      canWrite: caller.canWrite,
      callerKind: caller.kind,
    });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('drive list failed', e);
    return NextResponse.json({ error: e.message || 'Could not list the folder' }, { status });
  }
}
