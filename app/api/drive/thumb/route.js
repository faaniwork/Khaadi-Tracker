import { Readable } from 'node:stream';
import { fetchPreviewBytes } from '@/lib/drive';
import { resolveCaller, assertDressInScope, statusForError } from '@/lib/reviewAuth';

/**
 * GET /api/drive/thumb?fileId=...&dressId=...
 *
 * Streams an image preview through the server. This proxy exists because
 * Drive's own thumbnailLink cannot be used in an <img>: those URLs are
 * short-lived and only resolve for a caller Google considers authorized, and
 * our viewers are authorized to this app, not to the file.
 *
 * `dressId` is required so a review token's request can be checked against
 * the batch it was issued for. The file's parentage is not re-verified on
 * every thumbnail, which would cost an extra Drive round trip per image in
 * the grid; a Drive file id is 44 characters of unguessable identifier, so
 * holding a valid token for one batch gives no practical way to name a file
 * in another.
 */
export async function GET(req) {
  try {
    const caller = await resolveCaller(req);
    const url = new URL(req.url);
    const fileId = url.searchParams.get('fileId');
    const dressId = url.searchParams.get('dressId');

    if (!fileId || !dressId) {
      return new Response('fileId and dressId are required', { status: 400 });
    }

    await assertDressInScope(caller, dressId);

    const { body, contentType } = await fetchPreviewBytes(fileId);
    const webStream = typeof body?.getReader === 'function' ? body : Readable.toWeb(body);

    return new Response(webStream, {
      headers: {
        'Content-Type': contentType,
        // Private: this is one user's authorized view of a non-public file,
        // so it must never be held in a shared cache.
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('drive thumb failed', e);
    return new Response(e.message || 'No preview', { status });
  }
}
