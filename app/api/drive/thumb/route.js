import { Readable } from 'node:stream';
import { fetchPreviewBytes, assertFileInDress } from '@/lib/drive';
import { resolveCaller, assertDressInScope, statusForError } from '@/lib/reviewAuth';

/**
 * GET /api/drive/thumb?fileId=...&dressId=...
 *
 * Streams an image preview through the server. This proxy exists because
 * Drive's own thumbnailLink cannot be used in an <img>: those URLs are
 * short-lived and only resolve for a caller Google considers authorized, and
 * our viewers are authorized to this app, not to the file.
 *
 * `dressId` is checked against the caller's batch, AND the file is checked to
 * be inside that dress. The parentage check is free: `parents` comes back in
 * the same Drive call that yields the thumbnail link, so it costs no extra
 * round trip. Without it, any file the service account could read was
 * retrievable by anyone holding a token for any batch.
 */
export async function GET(req) {
  try {
    const caller = await resolveCaller(req);
    const url = new URL(req.url);
    const fileId = url.searchParams.get('fileId');
    const dressId = url.searchParams.get('dressId');
    const size = url.searchParams.get('size');

    if (!fileId || !dressId) {
      return new Response('fileId and dressId are required', { status: 400 });
    }

    const dress = await assertDressInScope(caller, dressId);
    // Shares the containment check with every other file route, so previews
    // and actions can never disagree about what is inside a dress. It also
    // allows subfolders, which a flat parent comparison did not.
    await assertFileInDress({ fileId, dressFolderId: dress.id });

    const { body, contentType } = await fetchPreviewBytes(fileId, undefined, size);
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
