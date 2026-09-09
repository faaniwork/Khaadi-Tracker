import { NextResponse } from 'next/server';
import { moveToRejected, moveOutOfRejected } from '@/lib/drive';
import { setFileReview, getReviewsForDress } from '@/lib/db';
import { resolveCaller, assertDressInScope, statusForError } from '@/lib/reviewAuth';

const DECISIONS = ['approved', 'rejected', 'pending'];

/**
 * POST /api/drive/review
 *   { dressId, fileId, fileName?, decision, reason?, feedbackText? }
 *
 * Open to clients holding a review link for this batch, and to signed-in
 * editors and admins recording a decision themselves. Signed-in viewers
 * cannot review, for the same reason they cannot edit the board.
 *
 * A rejection moves the file into a "Rejected" subfolder of the dress folder,
 * created on first use. Changing a decision back to approved moves it out
 * again, so an image never stays stranded somewhere nobody looks.
 *
 * The Drive move happens BEFORE the row is written. If the write then fails,
 * the file has moved but still reads as pending, and simply repeating the
 * action fixes it: both moves are idempotent. The reverse order would leave a
 * file marked rejected that is still sitting in the main folder, which is the
 * version of this that wastes someone's afternoon.
 */
export async function POST(req) {
  try {
    const caller = await resolveCaller(req);
    if (caller.kind === 'user' && !caller.canWrite) {
      return NextResponse.json(
        { error: 'VIEW_ONLY: You have view-only access, so you cannot record review decisions.' },
        { status: 403 }
      );
    }

    const { dressId, fileId, fileName, decision, reason, feedbackText } = await req.json();
    if (!dressId || !fileId) {
      return NextResponse.json({ error: 'dressId and fileId are required' }, { status: 400 });
    }
    if (!DECISIONS.includes(decision)) {
      return NextResponse.json({ error: 'Unknown decision ' + decision }, { status: 400 });
    }

    const dress = await assertDressInScope(caller, dressId);

    const existing = await getReviewsForDress(dress.id);
    const previous = existing[fileId]?.status || 'pending';

    let moved = null;
    if (decision === 'rejected') {
      moved = await moveToRejected({ fileId, dressFolderId: dress.id });
    } else if (previous === 'rejected') {
      moved = await moveOutOfRejected({ fileId, dressFolderId: dress.id });
    }

    const review = await setFileReview({
      fileId,
      dressId: dress.id,
      release: dress.release,
      fileName,
      status: decision,
      reason,
      text: feedbackText,
      by: caller.by,
    });

    return NextResponse.json({ review, moved, dress });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('drive review failed', e);
    return NextResponse.json({ error: e.message || 'Could not save that decision' }, { status });
  }
}
