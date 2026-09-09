import { NextResponse } from 'next/server';
import { listDressFiles, mapWithConcurrency } from '@/lib/drive';
import { getDressesForRelease, getReviewsForRelease } from '@/lib/db';
import { resolveCaller, statusForError } from '@/lib/reviewAuth';

export const maxDuration = 60;

/**
 * GET /api/review/batch?token=...
 *
 * Everything a client needs to review one batch, in a single call: each
 * dress in the batch, the images in its Drive folder (rejected ones folded
 * back in and marked), and any decision already recorded.
 *
 * The batch comes from the TOKEN, never from a query parameter, so there is
 * no batch id for a client to change. A signed-in editor or admin can also
 * call this with ?release= to preview exactly what a client sees.
 */
export async function GET(req) {
  try {
    const caller = await resolveCaller(req);
    const url = new URL(req.url);

    let release;
    if (caller.kind === 'token') {
      release = caller.release;
    } else {
      if (!caller.canWrite) {
        return NextResponse.json(
          { error: 'VIEW_ONLY: You have view-only access.' },
          { status: 403 }
        );
      }
      release = url.searchParams.get('release');
      if (!release) {
        return NextResponse.json({ error: 'release is required' }, { status: 400 });
      }
    }

    const [dresses, reviews] = await Promise.all([
      getDressesForRelease(release),
      getReviewsForRelease(release),
    ]);

    const withFiles = await mapWithConcurrency(dresses, 6, async (d) => {
      try {
        const files = await listDressFiles(d.id);
        return { ...d, files: files.filter((f) => f.isImage), error: null };
      } catch (e) {
        // One unshared or deleted folder should not blank out the whole
        // batch for the client, so it reports itself and the rest renders.
        return { ...d, files: [], error: e.message || 'Could not read this folder' };
      }
    });

    return NextResponse.json({
      release,
      label: caller.label || '',
      reviewerName: caller.kind === 'token' ? caller.by : '',
      isPreview: caller.kind === 'user',
      dresses: withFiles,
      reviews,
    });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('review batch failed', e);
    return NextResponse.json({ error: e.message || 'Could not load the batch' }, { status });
  }
}
