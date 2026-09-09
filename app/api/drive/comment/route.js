import { NextResponse } from 'next/server';
import { assertFileInDress } from '@/lib/drive';
import { addFileComment } from '@/lib/db';
import { resolveCaller, assertDressInScope, statusForError } from '@/lib/reviewAuth';

/**
 * POST /api/drive/comment
 *   { dressId, fileId, text }
 *
 * Adds one message to a file's comment thread. Same authorisation as
 * recording a review decision (canReview, not canWrite) — a client leaving a
 * note and a team member replying are the same action from here, only `by`
 * differs. Unlike /api/drive/review this never touches Drive, so there is no
 * ordering concern beyond checking the caller can see the file at all.
 */
export async function POST(req) {
  try {
    const caller = await resolveCaller(req);
    if (caller.kind === 'user' && !caller.canReview) {
      return NextResponse.json(
        { error: 'VIEW_ONLY: You have view-only access, so you cannot comment.' },
        { status: 403 }
      );
    }

    const { dressId, fileId, text } = await req.json();
    if (!dressId || !fileId) {
      return NextResponse.json({ error: 'dressId and fileId are required' }, { status: 400 });
    }

    const dress = await assertDressInScope(caller, dressId);
    await assertFileInDress({ fileId, dressFolderId: dress.id });

    const comment = await addFileComment({
      fileId,
      dressId: dress.id,
      release: dress.release,
      text,
      by: caller.by,
    });

    return NextResponse.json({ comment });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('drive comment failed', e);
    return NextResponse.json({ error: e.message || 'Could not save that comment' }, { status });
  }
}
