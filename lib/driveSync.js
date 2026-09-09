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
 * usually organised. A folder at the dress level counts as a dress when its
 * name satisfies looksLikeDressFolder (see lib/constants.js), which is what
 * makes renaming "Flat dress v2" to "Flats" take it off the board.
 *
 * ONE GARMENT, ONE ROW
 *
 * Dress folders sitting directly in a collection win outright, and nothing
 * beneath them is descended into. A collection's other subfolders are not
 * more dresses: "Khaadi 304" lists six "Dress N (v3)" folders plus a "Flats"
 * folder holding six "dress N" folders, and those are flat-lay shots of the
 * same six garments — counting both is what made that collection report
 * twelve dresses. A "V1"/"V2" folder left behind by a reshoot is the same
 * story.
 *
 * Only when a collection has NO dress folders directly inside it is this
 * treated as the other known layout, where everything is wrapped in a
 * version folder ("V3", "Round 2", ...). Then each non-dress folder is
 * peeked one level deep, and the most recently modified wrapper that holds
 * dress folders is the one that counts.
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

    const directDresses = folders.filter((f) => looksLikeDressFolder(f.name));
    const nonDress = folders.filter((f) => !looksLikeDressFolder(f.name));

    // Dress folders sitting directly in the collection win OUTRIGHT, and
    // nothing below them is ever descended into.
    //
    // A collection's subfolders are not more dresses. "Khaadi 304" holds six
    // "Dress N (v3)" folders plus a "Flats" folder that itself holds six
    // "dress N" folders — those are flat-lay shots OF THE SAME six garments,
    // not six more garments, and counting both is what made one collection
    // report twelve dresses instead of six. The same goes for a "V1"/"V2"
    // folder left behind by a reshoot. One garment, one row, counted where
    // the collection actually lists it.
    let dresses;
    let skipped;
    if (directDresses.length > 0) {
      dresses = directDresses.map((f) => ({ id: f.id, collection: col.name, dress: f.name }));
      skipped = nonDress.map(
        (f) => `${col.name} / ${f.name} (not counted — this collection lists its dresses directly)`
      );
    } else {
      // Nothing dress-shaped directly in the collection, so this is the
      // layout that wraps everything in a version folder instead. Peek one
      // level in and take the most recently modified wrapper, since the older
      // ones are previous cuts of the same garments.
      const containerChecks = await mapWithConcurrency(nonDress, CONCURRENCY, async (folder) => {
        const inner = await listFolder(folder.id);
        return { folder, dresses: inner.filter((f) => f.isFolder && looksLikeDressFolder(f.name)) };
      });
      const containers = containerChecks.filter((c) => c.dresses.length > 0);
      const junk = containerChecks.filter((c) => c.dresses.length === 0).map((c) => c.folder);

      if (containers.length > 0) {
        const [winner, ...rest] = [...containers].sort(
          (a, b) => (b.folder.modifiedTime || 0) - (a.folder.modifiedTime || 0)
        );
        dresses = winner.dresses.map((f) => ({ id: f.id, collection: col.name, dress: f.name }));
        skipped = [
          ...junk.map((f) => `${col.name} / ${f.name}`),
          ...rest.map((c) => `${col.name} / ${c.folder.name} (superseded by ${winner.folder.name})`),
        ];
      } else {
        dresses = [];
        skipped = junk.map((f) => `${col.name} / ${f.name}`);
      }
    }

    // Folders that did not qualify, so whoever clicks resync can see why a
    // count is not what they expected rather than assuming it is broken.
    return { dresses, skipped };
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
