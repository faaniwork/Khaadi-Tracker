import { createHmac } from 'node:crypto';
import { listDressFiles } from '@/lib/drive';
import { getReviewsForDress, getCommentsForDress } from '@/lib/db';
import { resolveCaller, assertDressInScope, statusForError } from '@/lib/reviewAuth';

const MODES = ['all', 'approved', 'approved_or_commented'];

function matchesMode(fileId, reviews, comments, mode) {
  if (mode === 'all') return true;
  const status = reviews?.[fileId]?.status || 'pending';
  if (mode === 'approved') return status === 'approved';
  return status === 'approved' || (comments?.[fileId] || []).length > 0;
}

function safeSegment(value, fallback) {
  return String(value || fallback).replace(/[\\/]/g, '-').trim() || fallback;
}

// Authorize file IDs without transferring their bytes through Vercel.
export async function POST(req) {
  try {
    const caller = await resolveCaller(req);
    const { items, mode } = await req.json();
    if (!Array.isArray(items) || !items.length || items.length > 500) {
      return new Response('Choose between 1 and 500 dresses from one collection', { status: 400 });
    }
    if (!MODES.includes(mode)) return new Response('Unknown mode', { status: 400 });

    const workerUrl = process.env.ZIP_FILE_WORKER_URL;
    const secret = process.env.ZIP_FILE_SIGNING_SECRET;
    if (!workerUrl || !secret) return new Response('ZIP downloads are not configured yet', { status: 503 });
    const baseUrl = new URL(workerUrl);
    if (baseUrl.protocol !== 'https:') throw new Error('ZIP_FILE_WORKER_URL must use HTTPS');

    const dresses = [];
    for (const item of items) dresses.push(await assertDressInScope(caller, item.dressId));
    if (dresses.some((dress) => dress.release !== dresses[0].release || dress.collection !== dresses[0].collection)) {
      return new Response('ZIP downloads must stay within one collection', { status: 400 });
    }

    const expires = Math.floor(Date.now() / 1000) + 60 * 60;
    const files = [];
    let estimatedBytes = 0;
    for (const dress of dresses) {
      const [listed, reviews, comments] = await Promise.all([
        listDressFiles(dress.id), getReviewsForDress(dress.id), getCommentsForDress(dress.id),
      ]);
      const used = new Set();
      for (const file of listed) {
        if (file.isFolder || !matchesMode(file.id, reviews, comments, mode)) continue;
        let name = safeSegment(file.name, file.id);
        if (used.has(name)) {
          const dot = name.lastIndexOf('.');
          name = dot > 0 ? `${name.slice(0, dot)} (${file.id.slice(0, 6)})${name.slice(dot)}` : `${name} (${file.id.slice(0, 6)})`;
        }
        used.add(name);
        estimatedBytes += Number(file.size) || 0;
        const signature = createHmac('sha256', secret).update(`${file.id}.${expires}`).digest('hex');
        const url = new URL('/file', baseUrl);
        url.searchParams.set('id', file.id);
        url.searchParams.set('exp', String(expires));
        url.searchParams.set('sig', signature);
        files.push({
          name: `${safeSegment(dress.collection, 'Collection')}/${safeSegment(dress.dress, dress.id)}/${name}`,
          url: url.toString(),
        });
      }
    }
    return Response.json({
      files,
      estimatedBytes,
      filename: `${dresses.length === 1 ? safeSegment(dresses[0].dress, 'download') : safeSegment(dresses[0].collection, 'collection')}.zip`,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('drive download manifest failed', e);
    return new Response(e.message || 'Could not prepare download', { status });
  }
}
