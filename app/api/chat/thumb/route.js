import { Readable } from 'node:stream';
import { auth } from '@/auth';
import { hasChatAccess } from '@/lib/db';
import { fetchPreviewBytes } from '@/lib/drive';
import { resolveChatUploadsFolderId } from '@/lib/driveSync';

/**
 * GET /api/chat/thumb?fileId=...
 *
 * Same proxy pattern as /api/drive/thumb, scoped to chat access instead of
 * a dress: `allowedParents` is pinned to the chat uploads folder itself, so
 * this can never be used to fetch an arbitrary Drive file by id - only
 * something actually shared in the chat.
 */
export async function GET(req) {
  try {
    const session = await auth();
    if (!session?.user?.email) return new Response('UNAUTHENTICATED', { status: 401 });
    if (!(await hasChatAccess(session.user.email))) {
      return new Response('You do not have chat access yet.', { status: 403 });
    }

    const url = new URL(req.url);
    const fileId = url.searchParams.get('fileId');
    const size = url.searchParams.get('size');
    if (!fileId) return new Response('fileId is required', { status: 400 });

    const folderId = await resolveChatUploadsFolderId();
    const { body, contentType } = await fetchPreviewBytes(fileId, [folderId], size);
    const webStream = typeof body?.getReader === 'function' ? body : Readable.toWeb(body);

    return new Response(webStream, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=86400, stale-while-revalidate=604800',
      },
    });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('chat thumb failed', e);
    return new Response(e.message || 'No preview', { status });
  }
}
