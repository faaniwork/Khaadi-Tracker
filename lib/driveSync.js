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
 * version folder ("V1", "V2", "V3", ...). Then each non-dress folder is
 * peeked one level deep, and the FIRST version that holds dress folders is
 * the one that counts — not the newest. A later version is only ever a
 * partial reshoot ("1-26-335" has six dresses in V1 and V2 but four in V3,
 * since Dress 4 and Dress 5 were never redone), so counting the newest drops
 * garments off the board while V1 is reliably the whole set.
 *
 * Files are counted per dress folder, ignoring subfolders, so the "Rejected"
 * subfolder created by the review flow never inflates a dress's file count.
 */

import { listFolder, mapWithConcurrency, getParentFolderId, renameFile, ensureSubfolder } from '@/lib/drive';
import {
  RELEASE_LINKS,
  driveFolderIdFromUrl,
  looksLikeDressFolder,
  DRESS_VERSION_PATTERN,
  smartImageName,
} from '@/lib/constants';
import { applyDriveResync, getReleaseFolderId, getReleaseFolderMap } from '@/lib/db';

// Drive tolerates this comfortably and it keeps a large batch inside a
// serverless request's time budget.
const CONCURRENCY = 8;

/**
 * The version number in a folder name ("V1" → 1, "v 02" → 2), or Infinity for
 * a name that carries none, so anything unnumbered sorts after the numbered
 * ones rather than being mistaken for the first version.
 */
function versionOf(name) {
  const m = String(name || '').match(/v\s*0*(\d+)/i);
  return m ? Number(m[1]) : Infinity;
}

export function rootFolderIdForRelease(release) {
  return driveFolderIdFromUrl(RELEASE_LINKS[release]);
}

/**
 * A batch's root folder, wherever it is recorded.
 *
 * The `releases` table is checked first because a batch created on the board
 * got its id straight from Drive, whereas RELEASE_LINKS is a hand-maintained
 * constant covering only the batches that predate that table.
 */
export async function resolveRootFolderId(release) {
  const fromDb = await getReleaseFolderId(release);
  return fromDb || rootFolderIdForRelease(release);
}

/**
 * The folder every batch folder lives inside, the shoot's "Output" folder.
 *
 * Discovered rather than configured: every batch folder already sits directly
 * inside it, so the parent of a batch we know about IS it, and there is no id
 * for anyone to set wrongly or leave stale when the shoot moves.
 * DRIVE_OUTPUT_FOLDER_ID overrides it for the case where no batch exists yet
 * to look up.
 */
export async function resolveOutputFolderId() {
  const configured = process.env.DRIVE_OUTPUT_FOLDER_ID;
  if (configured) return configured;

  // Batches created through this app come first, since their folder ids came
  // from Drive itself rather than from a link copied by hand.
  const recorded = await getReleaseFolderMap();
  const candidates = [
    ...Object.values(recorded).map((r) => r.folderId),
    ...Object.values(RELEASE_LINKS).map(driveFolderIdFromUrl),
  ].filter(Boolean);

  for (const known of candidates) {
    const parent = await getParentFolderId(known);
    if (parent) return parent;
  }
  const err = new Error(
    "Could not work out which Drive folder the shoot lives in. Set DRIVE_OUTPUT_FOLDER_ID to the Output folder's id."
  );
  err.status = 500;
  throw err;
}

const CHAT_UPLOADS_FOLDER_NAME = 'Chat uploads';

/**
 * Where images shared in the chat land - a folder next to the shoot's own
 * Output folder, created once and reused after that (see ensureSubfolder).
 * Kept out of the batch/collection/dress tree entirely, since a chat image
 * is not a shoot deliverable and has no dress to belong to.
 */
export async function resolveChatUploadsFolderId() {
  const parentId = await resolveOutputFolderId();
  return ensureSubfolder({ parentId, name: CHAT_UPLOADS_FOLDER_NAME });
}

/**
 * Renames one revision round's worth of images to the smart D/V/P scheme,
 * oldest file first, so numbering follows upload order rather than whatever
 * order Drive's own name sort happens to put them in. A file already named
 * right is left untouched (no pointless write, no thumbnail cache-bust).
 */
async function normalizeRound({ folderId, dressName, version }) {
  const children = await listFolder(folderId);
  const images = children
    .filter((f) => !f.isFolder)
    .sort((a, b) => new Date(a.createdTime || 0) - new Date(b.createdTime || 0));
  await mapWithConcurrency(images, CONCURRENCY, async (file, i) => {
    const ext = file.name.includes('.') ? file.name.split('.').pop() : '';
    const wanted = smartImageName({ dressName, version, position: i + 1, ext });
    if (wanted !== file.name) await renameFile(file.id, wanted);
  });
}

/**
 * Whatever a file was called when it landed in a dress folder, on the board
 * or dropped straight into Drive, this leaves it named for what it is. The
 * dress folder's own files are round V1 unless the folder itself is a bare
 * "V2"/"V3" wrapper (the revision-round convention from the files panel), in
 * which case its direct files are that round and any further version
 * subfolders are later rounds.
 */
async function normalizeDressFileNames({ dressFolderId, dressName }) {
  const selfVersion = DRESS_VERSION_PATTERN.exec(String(dressName || '').trim());
  const children = await listFolder(dressFolderId);
  const versionFolders = children.filter((f) => f.isFolder && DRESS_VERSION_PATTERN.test(f.name));
  await normalizeRound({
    folderId: dressFolderId,
    dressName,
    version: selfVersion ? Number(selfVersion[1]) : 1,
  });
  await mapWithConcurrency(versionFolders, CONCURRENCY, (folder) =>
    normalizeRound({
      folderId: folder.id,
      dressName,
      version: Number(DRESS_VERSION_PATTERN.exec(folder.name)[1]),
    })
  );
}

export async function resyncRelease({ email, release, by, rootFolderId }) {
  const rootId = rootFolderId || (await resolveRootFolderId(release));
  if (!rootId) {
    const err = new Error(
      `NO_ROOT_FOLDER: There is no Drive folder on file for "${release}". Create the batch from the board, add it to RELEASE_LINKS in lib/constants.js, or pass its folder id with the resync request.`
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
      // level in and take the first version, for the reason spelled out
      // below.
      const containerChecks = await mapWithConcurrency(nonDress, CONCURRENCY, async (folder) => {
        const inner = await listFolder(folder.id);
        return { folder, dresses: inner.filter((f) => f.isFolder && looksLikeDressFolder(f.name)) };
      });
      const containers = containerChecks.filter((c) => c.dresses.length > 0);
      const junk = containerChecks.filter((c) => c.dresses.length === 0).map((c) => c.folder);

      if (containers.length > 0) {
        // The FIRST version wins, not the newest. A later version is only
        // ever a partial reshoot: "1-26-335" has six dresses in V1 and in
        // V2, but its V3 holds four, because Dress 4 and Dress 5 were never
        // redone. Taking the newest folder therefore drops garments off the
        // board entirely, while V1 is the one cut that is always the complete
        // set — so V1 is what the dress count is built from.
        const [winner, ...rest] = [...containers].sort(
          (a, b) =>
            versionOf(a.folder.name) - versionOf(b.folder.name) ||
            (a.folder.modifiedTime || 0) - (b.folder.modifiedTime || 0)
        );
        dresses = winner.dresses.map((f) => ({ id: f.id, collection: col.name, dress: f.name }));
        skipped = [
          ...junk.map((f) => `${col.name} / ${f.name}`),
          ...rest.map(
            (c) => `${col.name} / ${c.folder.name} (a later cut — counted from ${winner.folder.name})`
          ),
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

  // Renaming is a write, so it only runs once applyDriveResync's own
  // assertCanEdit has already confirmed this caller may touch the release.
  // Best-effort per dress: one folder Drive is fussy about should not stop
  // the rest from getting named.
  await mapWithConcurrency(dressFolders, CONCURRENCY, async (d) => {
    try {
      await normalizeDressFileNames({ dressFolderId: d.id, dressName: d.dress });
    } catch {
      // A rename failing here never touched the resync result above.
    }
  });

  return {
    ...result,
    release,
    rootFolderId: rootId,
    collections: collectionFolders.length,
    skipped,
  };
}
