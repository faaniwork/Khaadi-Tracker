/**
 * Reconciles a batch on the board against what is actually in Google Drive.
 *
 * The board's rows were imported from a spreadsheet once and then never
 * looked at Drive again, so renaming or reorganising folders in Drive left
 * the board quietly wrong. This walks the batch's folder tree and hands the
 * result to applyDriveResync, which is where the database writes live.
 *
 * FOLDER LAYOUT IT EXPECTS
 *
 *   <batch root>/<collection>/<dress>/<the image files>
 *
 * Two levels of folder under the batch root, matching how the pipeline is
 * organised. A folder at the dress level counts as a dress when its name
 * satisfies looksLikeDressFolder (see lib/constants.js), which is what makes
 * renaming "Flat dress v2" to "Flats" take it off the board.
 *
 * Files are counted per dress folder, ignoring subfolders, so the "Rejected"
 * subfolder created by the review flow never inflates a dress's file count.
 */

import { listFolder, mapWithConcurrency } from '@/lib/drive';
import { RELEASE_LINKS, driveFolderIdFromUrl, looksLikeDressFolder } from '@/lib/constants';
import { applyDriveResync } from '@/lib/db';

// Drive tolerates this comfortably and it keeps a large batch inside a
// serverless request's time budget.
const CONCURRENCY = 8;

export function rootFolderIdForRelease(release) {
  return driveFolderIdFromUrl(RELEASE_LINKS[release]);
}

export async function resyncRelease({ email, release, by, rootFolderId }) {
  const rootId = rootFolderId || rootFolderIdForRelease(release);
  if (!rootId) {
    const err = new Error(
      `NO_ROOT_FOLDER: There is no Drive folder on file for "${release}". Add it to RELEASE_LINKS in lib/constants.js, or pass its folder id with the resync request.`
    );
    err.code = 'NO_ROOT_FOLDER';
    err.status = 400;
    throw err;
  }

  const rootChildren = await listFolder(rootId);
  const collectionFolders = rootChildren.filter((f) => f.isFolder);

  // Level two: every folder inside each collection, flattened before counting
  // so the concurrency ceiling applies across the whole batch rather than per
  // collection.
  const perCollection = await mapWithConcurrency(collectionFolders, CONCURRENCY, async (col) => {
    const children = await listFolder(col.id);
    const folders = children.filter((f) => f.isFolder);
    return {
      dresses: folders
        .filter((f) => looksLikeDressFolder(f.name))
        .map((f) => ({ id: f.id, collection: col.name, dress: f.name })),
      // Folders that did not qualify, so whoever clicks resync can see why a
      // count is not what they expected rather than assuming it is broken.
      skipped: folders
        .filter((f) => !looksLikeDressFolder(f.name))
        .map((f) => `${col.name} / ${f.name}`),
    };
  });
  const dressFolders = perCollection.flatMap((c) => c.dresses);
  const skipped = perCollection.flatMap((c) => c.skipped).sort();

  const seen = await mapWithConcurrency(dressFolders, CONCURRENCY, async (d) => {
    const inner = await listFolder(d.id);
    return { ...d, files: inner.filter((f) => !f.isFolder).length };
  });

  const result = await applyDriveResync({ email, release, seen, by });

  return {
    ...result,
    release,
    rootFolderId: rootId,
    collections: collectionFolders.length,
    skipped,
  };
}
