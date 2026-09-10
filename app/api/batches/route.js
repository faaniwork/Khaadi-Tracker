import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createFolder, getParentFolderId, mapWithConcurrency } from '@/lib/drive';
import {
  assertReleaseNameFree,
  createReleaseRecord,
  getMyRole,
  getReleaseFolderMap,
} from '@/lib/db';
import { RELEASE_LINKS, driveFolderIdFromUrl, looksLikeDressFolder } from '@/lib/constants';

// Drive tolerates this comfortably and it keeps a batch of ~40 new folders
// inside a serverless request's time budget.
const CONCURRENCY = 6;

// A guard on the shape of the request, not on taste: 20 collections of 60
// dresses is 1200 folders, which is not a batch anyone means to create and
// would blow the request's time budget on the way to finding that out.
const MAX_COLLECTIONS = 20;
const MAX_DRESSES = 60;

/**
 * The folder every batch folder lives inside — the shoot's "Output" folder.
 *
 * Deliberately discovered rather than configured: every existing batch folder
 * already sits directly inside it, so the parent of a batch we already know
 * about IS it, and there is no id for anyone to set, paste wrong, or leave
 * stale when the shoot moves. DRIVE_OUTPUT_FOLDER_ID overrides it for the
 * case where no batch exists yet to look up.
 */
async function resolveOutputFolderId() {
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
    'Could not work out which Drive folder new batches belong in. Set DRIVE_OUTPUT_FOLDER_ID to the shoot\'s Output folder id.'
  );
  err.status = 500;
  throw err;
}

function bad(message, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/**
 * POST /api/batches
 *   { name, date, collections: [{ name, dresses }] }
 *
 * Builds a batch's folder tree in Drive — the batch folder inside Output,
 * a folder per collection inside that, and `dresses` empty dress folders
 * inside each — then records the batch so the board can find its folder
 * later. Images are uploaded into the dress folders afterwards, through the
 * dress's own view.
 *
 * It deliberately does NOT resync afterwards: creating ~40 folders and then
 * walking the whole tree back is two jobs' worth of Drive calls for one
 * request, and the resync route already exists and is already proven. The
 * client calls it once this returns, so a slow tree walk cannot take the
 * folder creation down with it.
 *
 * Dress folders are named "Dress 1", "Dress 2", ... and the name matters:
 * the board only counts a folder as a dress when its name contains "dress"
 * (see looksLikeDressFolder), which is what lets renaming one take it off
 * the board. Anything else here would create folders the board ignores.
 */
export async function POST(req) {
  try {
    const session = await auth();
    if (!session) return bad('UNAUTHENTICATED', 401);
    const email = session.user?.email || '';
    const role = await getMyRole(email);
    if (role !== 'admin' && role !== 'editor') {
      return bad('Only editors and admins can create a batch.', 403);
    }

    const body = await req.json();
    const name = String(body?.name || '').trim();
    const date = String(body?.date || '').trim();
    const collections = Array.isArray(body?.collections) ? body.collections : [];

    if (!name) return bad('Give the batch a name.');
    // Drive treats these as path separators and silently mangles the name.
    if (/[\\/]/.test(name)) return bad('A batch name cannot contain a slash.');
    if (!collections.length) return bad('Add at least one collection.');
    if (collections.length > MAX_COLLECTIONS) {
      return bad(`That is more than ${MAX_COLLECTIONS} collections — split it into separate batches.`);
    }

    const planned = [];
    for (const entry of collections) {
      const colName = String(entry?.name || '').trim();
      const count = Number(entry?.dresses);
      if (!colName) return bad('Every collection needs a name.');
      if (/[\\/]/.test(colName)) return bad('A collection name cannot contain a slash.');
      if (!Number.isInteger(count) || count < 1) {
        return bad(`How many dresses are in "${colName}"?`);
      }
      if (count > MAX_DRESSES) {
        return bad(`${count} dresses in "${colName}" is more than this creates at once (${MAX_DRESSES}).`);
      }
      planned.push({ name: colName, count });
    }
    const names = planned.map((c) => c.name.toLowerCase());
    if (new Set(names).size !== names.length) {
      return bad('Two collections have the same name.');
    }

    // Checked before a single folder is created, so a batch rejected for its
    // name never leaves an orphaned tree behind in Drive.
    await assertReleaseNameFree({ email, release: name });

    const outputId = await resolveOutputFolderId();
    const batchFolder = await createFolder({ parentId: outputId, name });

    const created = [];
    for (const collection of planned) {
      const colFolder = await createFolder({ parentId: batchFolder.id, name: collection.name });
      const dressNames = Array.from({ length: collection.count }, (_, i) => `Dress ${i + 1}`);
      // Sanity check on our own naming rather than on input: if this ever
      // stops matching, the folders would be created and then ignored by
      // every count on the board, which is a confusing way to fail.
      if (!dressNames.every(looksLikeDressFolder)) {
        return bad('Internal: generated dress folder names the board would not count.', 500);
      }
      await mapWithConcurrency(dressNames, CONCURRENCY, (dressName) =>
        createFolder({ parentId: colFolder.id, name: dressName })
      );
      created.push({ collection: collection.name, folderId: colFolder.id, dresses: collection.count });
    }

    await createReleaseRecord({
      email,
      release: name,
      folderId: batchFolder.id,
      date,
      by: session.user?.name || email,
    });

    return NextResponse.json({
      release: name,
      folderId: batchFolder.id,
      webViewLink: batchFolder.webViewLink || `https://drive.google.com/drive/folders/${batchFolder.id}`,
      collections: created,
      dresses: created.reduce((n, c) => n + c.dresses, 0),
    });
  } catch (e) {
    const status = e?.status || (e?.code === 'VIEW_ONLY' ? 403 : 500);
    if (status >= 500) console.error('batch create failed', e);
    return NextResponse.json({ error: e.message || 'Could not create that batch' }, { status });
  }
}
