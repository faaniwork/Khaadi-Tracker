import { NextResponse } from 'next/server';
import { resyncRelease } from '@/lib/driveSync';
import { resolveCaller, assertCanWriteFiles, statusForError } from '@/lib/reviewAuth';

// A batch with many collections means a lot of Drive calls, so give this
// route more room than the default.
export const maxDuration = 60;

/**
 * POST /api/drive/resync   { release, rootFolderId? }
 *
 * Editors and admins only. Reads the batch's Drive tree and updates the
 * board to match: picks up folder renames, moves between collections,
 * new dress folders, and refreshed file counts, and archives folders that
 * no longer qualify as a dress.
 *
 * Never touches status, comments, credits or revisions. Those are the team's
 * data about a dress, not Drive's.
 */
export async function POST(req) {
  try {
    const caller = await resolveCaller(req);
    assertCanWriteFiles(caller);

    const { release, rootFolderId } = await req.json();
    if (!String(release || '').trim()) {
      return NextResponse.json({ error: 'release is required' }, { status: 400 });
    }

    const result = await resyncRelease({
      email: caller.email,
      release,
      by: caller.by,
      rootFolderId,
    });

    return NextResponse.json(result);
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('drive resync failed', e);
    return NextResponse.json({ error: e.message || 'Resync failed' }, { status });
  }
}
