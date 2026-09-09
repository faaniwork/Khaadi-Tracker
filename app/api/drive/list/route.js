import { NextResponse } from 'next/server';
import { listFolder, listDressFiles, isWithinDress } from '@/lib/drive';
import { getReviewsForDress, getCommentsForDress } from '@/lib/db';
import { resolveCaller, assertDressInScope, statusForError } from '@/lib/reviewAuth';

/**
 * GET /api/drive/list?dressId=...            list a dress's Drive folder
 * GET /api/drive/list?dressId=...&folderId=  list a subfolder inside it
 *
 * `folderId` is only honoured for signed-in EDITORS and ADMINS, who can
 * already reach the whole shoot in Drive itself. Review-token clients and
 * view-only accounts get the dress folder and nothing else, so neither can
 * walk the Drive tree by naming folder ids of their own choosing.
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
      if (!caller.canWrite) {
        return NextResponse.json(
          { error: 'Only editors and admins can open subfolders from here.' },
          { status: 403 }
        );
      }
      // Even an editor only gets folders inside this dress, so `folderId` is
      // never a way to list somewhere else in Drive.
      if (!(await isWithinDress({ folderId, dressFolderId: dress.id }))) {
        return NextResponse.json(
          { error: 'That folder is not inside this dress.' },
          { status: 404 }
        );
      }
      target = folderId;
    }

    const isRoot = target === dress.id;
    const [files, reviews, comments] = await Promise.all([
      // At the dress folder itself, rejected images are folded back in so
      // they stay visible and a decision stays reversible. Deeper subfolders
      // are listed plainly.
      isRoot ? listDressFiles(dress.id) : listFolder(target),
      getReviewsForDress(dress.id),
      getCommentsForDress(dress.id),
    ]);

    return NextResponse.json({
      dress,
      folderId: target,
      isRoot,
      files,
      reviews,
      comments,
      canWrite: caller.canWrite,
      canReview: caller.canReview,
      callerKind: caller.kind,
    });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('drive list failed', e);
    return NextResponse.json({ error: e.message || 'Could not list the folder' }, { status });
  }
}
