import { createHmac } from 'node:crypto';
import { assertFileInDress } from '@/lib/drive';
import { resolveCaller, assertDressInScope, statusForError } from '@/lib/reviewAuth';

export async function POST(req) {
  try {
    const caller = await resolveCaller(req);
    const { fileId, dressId } = await req.json();
    const dress = await assertDressInScope(caller, dressId);
    const { file } = await assertFileInDress({ fileId, dressFolderId: dress.id });
    const base = process.env.ZIP_FILE_WORKER_URL;
    const secret = process.env.ZIP_FILE_SIGNING_SECRET;
    if (!base || !secret) return new Response('Downloads are not configured', { status: 503 });
    const expires = Math.floor(Date.now() / 1000) + 3600;
    const url = new URL('/file', base);
    if (url.protocol !== 'https:') throw new Error('Download Worker must use HTTPS');
    url.searchParams.set('id', file.id);
    url.searchParams.set('exp', String(expires));
    url.searchParams.set('sig', createHmac('sha256', secret).update(`${file.id}.${expires}`).digest('hex'));
    return Response.json({ url: url.toString(), name: file.name }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('single file download failed', e);
    return new Response(e.message || 'Could not prepare download', { status });
  }
}
