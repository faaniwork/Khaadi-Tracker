import { NextResponse } from 'next/server';
import { moveToRejected, moveOutOfRejected, assertFileInDress } from '@/lib/drive';
import { setFileReview, getFileReview, validateReviewDecision } from '@/lib/db';
import { resolveCaller, assertDressInScope, statusForError } from '@/lib/reviewAuth';

const DECISIONS = ['approved', 'rejected', 'pending'];

/**
 * POST /api/drive/review
 *   { dressId, fileId, decision, reason?, feedbackText? }
 *   decision is one of 'approved' | 'rejected' | 'pending'. A comment thread
 *   (see /api/drive/comment) is the "needs a look" signal, kept independent
 *   of this decision rather than folded into a third status.
 *
 * Open to clients holding a review link for this batch, and to signed-in
 * editors and admins recording a decision themselves. Signed-in viewers
 * cannot review, for the same reason they cannot edit the board.
 *
 * ORDER OF OPERATIONS, which matters more than it looks:
 *
 *   1. authorise the caller
 *   2. check the DRESS is in their batch
 *   3. check the FILE is really inside that dress, and is a file not a folder
 *   4. validate the decision itself
 *   5. only now touch Drive
 *   6. write the row, which also writes the audit entry
 *
 * Steps 3 and 4 both used to happen after the Drive move. That let a caller
 * re-parent any object the service account could see by pairing a dress they
 * were allowed to touch with a file id they were not, and a deliberately
 * invalid decision made the whole thing fail after the move, leaving no audit
 * entry behind. Everything is now checked before anything moves.
 *
 * `fileName` is taken from Drive, never from the request body, so it cannot
 * be used to write arbitrary text into the activity log.
 */
export async function POST(req) {
  try {
    const caller = await resolveCaller(req);
    if (caller.kind === 'user' && !caller.canReview) {
      return NextResponse.json(
        { error: 'VIEW_ONLY: You have view-only access, so you cannot record review decisions.' },
        { status: 403 }
      );
    }

    const { dressId, fileId, decision, reason, feedbackText } = await req.json();
    if (!dressId || !fileId) {
      return NextResponse.json({ error: 'dressId and fileId are required' }, { status: 400 });
    }
    if (!DECISIONS.includes(decision)) {
      return NextResponse.json({ error: 'Unknown decision ' + decision }, { status: 400 });
    }

    const dress = await assertDressInScope(caller, dressId);
    const { file } = await assertFileInDress({ fileId, dressFolderId: dress.id });

    // Throws before anything in Drive is touched.
    const validated = validateReviewDecision({ status: decision, reason, text: feedbackText });

    // Keyed on the FILE, not the dress. A row can legitimately name a
    // different dress if an editor moved the image in Drive, and reading it
    // per-dress would report "pending" and skip the move back out of
    // Rejected, leaving the file somewhere nobody looks.
    const previous = (await getFileReview(fileId))?.status || 'pending';

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
      fileName: file.name,
      status: decision,
      reason: validated.reason,
      text: validated.text,
      by: caller.by,
    });

    return NextResponse.json({ review, moved, dress });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('drive review failed', e);
    return NextResponse.json({ error: e.message || 'Could not save that decision' }, { status });
  }
}
