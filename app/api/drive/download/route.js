import { Readable } from 'node:stream';
import { fetchOriginalBytes, assertFileInDress } from '@/lib/drive';
import { resolveCaller, assertDressInScope, statusForError } from '@/lib/reviewAuth';

/**
 * GET /api/drive/download?fileId=...&dressId=...
 *
 * A real download of the file's own bytes, as an attachment — separate from
 * /api/drive/thumb, which only ever serves a resized preview. Same
 * containment checks as everything else here: the dress has to be in the
 * caller's scope, and the file has to really be inside that dress.
 *
 * One file per request by design. A "download this whole batch" button on
 * the client fires one of these per matching file rather than this route
 * trying to zip anything server-side, which keeps every request small,
 * fast, and no different in risk from the thumbnail route it sits next to.
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

    const dress = await assertDressInScope(caller, dressId);
    // Rejects folders and trashed files itself, same as every other file
    // route here.
    const { file } = await assertFileInDress({ fileId, dressFolderId: dress.id });

    const { body, contentType, name } = await fetchOriginalBytes(fileId);
    const webStream = typeof body?.getReader === 'function' ? body : Readable.toWeb(body);
    const safeName = String(name || file.name || fileId).replace(/["\r\n]/g, '');

    return new Response(webStream, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${safeName}"`,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('drive download failed', e);
    return new Response(e.message || 'Could not download that file', { status });
  }
}
