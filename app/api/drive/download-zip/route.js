import { Readable } from 'node:stream';
import archiver from 'archiver';
import { listDressFiles, fetchOriginalBytes } from '@/lib/drive';
import { getReviewsForDress, getCommentsForDress } from '@/lib/db';
import { resolveCaller, assertDressInScope, statusForError } from '@/lib/reviewAuth';

const MODES = ['all', 'approved', 'approved_or_commented'];

function matchesMode(fileId, reviews, comments, mode) {
  if (mode === 'all') return true;
  const status = reviews?.[fileId]?.status || 'pending';
  if (mode === 'approved') return status === 'approved';
  return status === 'approved' || (comments?.[fileId] || []).length > 0;
}

// Zip entry names can't safely carry a path separator from a folder name
// that happens to contain one, and a blank name would collide with every
// other blank one.
function safeSegment(name, fallback) {
  const clean = String(name || fallback).replace(/[\\/]/g, '-').trim();
  return clean || fallback;
}

/**
 * POST /api/drive/download-zip
 *   { items: [{ dressId, dress, collection }], mode: 'all'|'approved'|'approved_or_commented' }
 *
 * One zip, built by streaming straight from Drive into the response as each
 * file arrives — nothing buffers in memory, so this doesn't care whether
 * `items` is one dress or an entire batch. Entries are laid out
 * `<collection>/<dress>/<filename>`, so extracting the zip reproduces the
 * same folder shape the board already groups things into.
 *
 * Each dress is scope-checked with the same assertDressInScope every other
 * file route uses; a client can only ever have been handed dress rows that
 * are already theirs to see, so this adds no new exposure beyond what
 * browsing to that dress already grants.
 */
export async function POST(req) {
  try {
    const caller = await resolveCaller(req);
    const { items, mode } = await req.json();

    if (!Array.isArray(items) || !items.length) {
      return new Response('items is required', { status: 400 });
    }
    if (!MODES.includes(mode)) {
      return new Response('Unknown mode ' + mode, { status: 400 });
    }

    // Every dress checked before any Drive listing starts, so a request
    // naming one dress outside the caller's scope fails outright rather
    // than silently zipping everyone else's.
    const dresses = [];
    for (const item of items) {
      const dress = await assertDressInScope(caller, item.dressId);
      dresses.push(dress);
    }

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('warning', (e) => console.error('zip warning', e));
    archive.on('error', (e) => console.error('zip error', e));

    // Fire-and-stream: this runs concurrently with the response being read,
    // rather than being awaited before responding, which is what makes a
    // large batch stream out instead of buffering.
    (async () => {
      try {
        for (const dress of dresses) {
          const [files, reviews, comments] = await Promise.all([
            listDressFiles(dress.id),
            getReviewsForDress(dress.id),
            getCommentsForDress(dress.id),
          ]);
          const collectionName = safeSegment(dress.collection, 'Collection');
          const dressName = safeSegment(dress.dress, dress.id);
          const seenNames = new Set();

          for (const file of files) {
            if (file.isFolder) continue;
            if (!matchesMode(file.id, reviews, comments, mode)) continue;

            let entryName = safeSegment(file.name, file.id);
            if (seenNames.has(entryName)) {
              const dot = entryName.lastIndexOf('.');
              entryName = dot > 0
                ? `${entryName.slice(0, dot)} (${file.id.slice(0, 6)})${entryName.slice(dot)}`
                : `${entryName} (${file.id.slice(0, 6)})`;
            }
            seenNames.add(entryName);

            try {
              const { body } = await fetchOriginalBytes(file.id);
              const nodeStream = typeof body?.pipe === 'function' ? body : Readable.from(body);
              archive.append(nodeStream, { name: `${collectionName}/${dressName}/${entryName}` });
            } catch (e) {
              console.error(`zip: skipping ${dressName}/${entryName}`, e);
            }
          }
        }
      } finally {
        archive.finalize();
      }
    })();

    const webStream = Readable.toWeb(archive);
    const zipName = dresses.length === 1 ? safeSegment(dresses[0].dress, 'download') : 'khaadi-download';

    return new Response(webStream, {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${zipName}.zip"`,
      },
    });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('drive download-zip failed', e);
    return new Response(e.message || 'Could not build that download', { status });
  }
}
