// This worker handles only /zip-download/* so it cannot intercept app routes.
const pending = new Map();

self.addEventListener('message', (event) => {
  const { token, filename, stream } = event.data || {};
  if (!/^[a-f0-9-]{36}$/.test(token || '') || typeof filename !== 'string' || !stream) {
    event.ports[0]?.postMessage('invalid');
    return;
  }
  pending.set(token, { filename, stream });
  event.ports[0]?.postMessage('ready');
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const token = url.pathname.match(/^\/zip-download\/([a-f0-9-]{36})$/)?.[1];
  if (!token) return;
  const download = pending.get(token);
  if (!download) return;
  pending.delete(token);
  const name = download.filename.replace(/["\r\n]/g, '_');
  event.respondWith(new Response(download.stream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  }));
});
