import { NextResponse } from 'next/server';
import { getFolderState } from '@/lib/drive';
import { RELEASE_LINKS, driveFolderIdFromUrl } from '@/lib/constants';
import {
  archiveReleaseMissingFromDrive,
  getReleaseFolderMap,
  listBoardReleases,
} from '@/lib/db';
import { resolveCaller, assertCanWriteFiles, statusForError } from '@/lib/reviewAuth';

export const maxDuration = 30;

/**
 * POST /api/drive/verify
 *
 * Checks that every batch on the board still has a Drive folder, and takes
 * off the ones that do not. Deleting a batch's folder in Drive used to leave
 * it sitting on the board indefinitely, because the board only ever looked at
 * Drive when somebody pressed resync on that specific batch.
 *
 * ONE Drive call per batch, which is why this can run on its own rather than
 * needing a full resync: a resync walks a batch's whole tree (roughly eighty
 * calls each) and exists to reconcile what is INSIDE a batch. This only asks
 * whether the batch is still there at all.
 *
 * Conservative by design. A batch is only removed on a definite answer - the
 * folder is missing, or it is in Drive's trash. Any other failure (a rate
 * limit, a network blip) is counted as "unknown" and changes nothing, because
 * the cost of guessing wrong is a batch vanishing off the board.
 */
export async function POST(req) {
  try {
    const caller = await resolveCaller(req);
    assertCanWriteFiles(caller);

    const [recorded, releases] = await Promise.all([getReleaseFolderMap(), listBoardReleases()]);

    // Every batch the board knows about, with wherever its folder is recorded.
    const targets = releases
      .map((release) => ({
        release,
        folderId:
          recorded[release]?.folderId || driveFolderIdFromUrl(RELEASE_LINKS[release] || ''),
      }))
      .filter((t) => t.folderId);

    const checks = await Promise.all(
      targets.map(async (t) => ({ ...t, state: await getFolderState(t.folderId) }))
    );

    const removed = [];
    for (const check of checks) {
      if (check.state !== 'missing' && check.state !== 'trashed') continue;
      const res = await archiveReleaseMissingFromDrive({
        release: check.release,
        by: caller.by,
        reason: check.state === 'trashed' ? 'folder is in Drive trash' : 'folder not found',
      });
      removed.push({ ...res, reason: check.state });
    }

    return NextResponse.json({
      checked: checks.length,
      removed,
      unknown: checks.filter((c) => c.state === 'unknown').length,
    });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('drive verify failed', e);
    return NextResponse.json({ error: e.message || 'Could not check Drive' }, { status });
  }
}
