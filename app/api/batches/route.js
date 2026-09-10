import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { createFolder, mapWithConcurrency, trashFile } from '@/lib/drive';
import { getUserDriveAccessToken } from '@/lib/googleUserToken';
import { resolveOutputFolderId } from '@/lib/driveSync';
import {
  assertReleaseNameFree,
  createReleaseRecord,
  deleteRelease,
  getMyRole,
  getReleaseFolderId,
} from '@/lib/db';
import { looksLikeDressFolder } from '@/lib/constants';

// Drive tolerates this comfortably and it keeps a batch of ~40 new folders
// inside a serverless request's time budget.
const CONCURRENCY = 6;

// A guard on the shape of the request, not on taste: 20 collections of 60
// dresses is 1200 folders, which is not a batch anyone means to create and
// would blow the request's time budget on the way to finding that out.
const MAX_COLLECTIONS = 20;
const MAX_DRESSES = 60;

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

    // Created as the person asking, where their Google sign-in has Drive
    // access, so the folders are owned by them and they can rename, move or
    // trash them in Drive like any other folder they made. Falling back to
    // the service account keeps this working for anyone who has not granted
    // Drive access yet — their folders just belong to the app instead.
    let accessToken;
    let ownedBy = 'the app';
    try {
      accessToken = await getUserDriveAccessToken();
      ownedBy = 'you';
    } catch (e) {
      if (e?.code !== 'DRIVE_ACCESS_REQUIRED') throw e;
    }

    const outputId = await resolveOutputFolderId();
    const batchFolder = await createFolder({ parentId: outputId, name, accessToken });

    const created = [];
    for (const collection of planned) {
      const colFolder = await createFolder({
        parentId: batchFolder.id,
        name: collection.name,
        accessToken,
      });
      const dressNames = Array.from({ length: collection.count }, (_, i) => `Dress ${i + 1}`);
      // Sanity check on our own naming rather than on input: if this ever
      // stops matching, the folders would be created and then ignored by
      // every count on the board, which is a confusing way to fail.
      if (!dressNames.every(looksLikeDressFolder)) {
        return bad('Internal: generated dress folder names the board would not count.', 500);
      }
      await mapWithConcurrency(dressNames, CONCURRENCY, (dressName) =>
        createFolder({ parentId: colFolder.id, name: dressName, accessToken })
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
      ownedBy,
    });
  } catch (e) {
    const status = e?.status || (e?.code === 'VIEW_ONLY' ? 403 : 500);
    if (status >= 500) console.error('batch create failed', e);
    return NextResponse.json({ error: e.message || 'Could not create that batch' }, { status });
  }
}

/**
 * DELETE /api/batches   { release, trashFolder }
 *
 * Admins only. Takes the batch off the board, archiving its dresses rather
 * than destroying them — their statuses and review history are a record of
 * work that happened, and it survives so a mis-click is recoverable.
 *
 * `trashFolder` additionally sends the Drive folder to the trash, as the
 * ADMIN rather than as the service account: in this Drive only an owner may
 * trash, so this works for folders the app created for them and is refused
 * for the ones it does not own. A refusal is reported rather than thrown —
 * the batch is off the board either way, and the caller deserves to know the
 * folder is still sitting there.
 */
export async function DELETE(req) {
  try {
    const session = await auth();
    if (!session) return bad('UNAUTHENTICATED', 401);
    const email = session.user?.email || '';
    const role = await getMyRole(email);
    if (role !== 'admin') return bad('Only admins can delete a batch.', 403);

    const { release, trashFolder } = await req.json();
    const name = String(release || '').trim();
    if (!name) return bad('Which batch?');

    const folderId = trashFolder ? await getReleaseFolderId(name) : '';
    const result = await deleteRelease({
      email,
      release: name,
      by: session.user?.name || email,
    });

    let folder = 'kept';
    if (trashFolder) {
      if (!folderId) {
        folder = 'unknown';
      } else {
        try {
          const accessToken = await getUserDriveAccessToken();
          await trashFile(folderId, accessToken);
          folder = 'trashed';
        } catch (e) {
          console.error('batch folder trash refused', e);
          folder = 'refused';
        }
      }
    }
    return NextResponse.json({ ...result, folder });
  } catch (e) {
    const status = e?.status || (e?.code === 'ADMIN_ONLY' ? 403 : 500);
    if (status >= 500) console.error('batch delete failed', e);
    return NextResponse.json({ error: e.message || 'Could not delete that batch' }, { status });
  }
}
