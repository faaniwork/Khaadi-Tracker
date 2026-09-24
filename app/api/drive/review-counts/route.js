import { NextResponse } from 'next/server';
import { getReviewCountsForDresses } from '@/lib/db';
import { resolveCaller, assertDressInScope, statusForError } from '@/lib/reviewAuth';

/**
 * POST /api/drive/review-counts   { dressIds: [...] }
 *
 * Just the two numbers a cover tile's badge needs - how many files are
 * approved, how many have a comment thread - never the files themselves.
 * Deliberately its own route rather than reusing /api/drive/list: that one
 * lists a single dress's actual Drive folder (a real API call to Drive,
 * one per dress), which is fine for opening one dress but not for painting
 * a badge on thirty tiles in a grid. This is one D1 query for however many
 * dress ids are asked about, no Drive call at all.
 *
 * Every id is still scope-checked with the same assertDressInScope every
 * other file route uses, so a client's own review-link token can't probe
 * counts on dresses outside their release just because the id is guessable.
 */
export async function POST(req) {
  try {
    const caller = await resolveCaller(req);
    const { dressIds } = await req.json();
    if (!Array.isArray(dressIds) || !dressIds.length) {
      return NextResponse.json({ counts: {} });
    }

    for (const id of dressIds) {
      await assertDressInScope(caller, id);
    }

    const counts = await getReviewCountsForDresses(dressIds);
    return NextResponse.json({ counts });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('review-counts failed', e);
    return NextResponse.json({ error: e.message || 'Could not load review counts' }, { status });
  }
}
