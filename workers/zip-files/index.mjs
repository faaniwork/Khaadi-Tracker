const encoder = new TextEncoder();
let cachedToken;

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function googleToken(env) {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(encoder.encode(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const claim = base64url(encoder.encode(JSON.stringify({
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: 'https://www.googleapis.com/auth/drive.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })));
  const pem = env.GOOGLE_SERVICE_ACCOUNT_KEY.replace(/\\n/g, '\n');
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----|\s/g, '')), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(`${header}.${claim}`)));
  const result = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claim}.${base64url(signature)}` }),
  });
  if (!result.ok) throw new Error('Google authentication failed');
  const data = await result.json();
  cachedToken = { value: data.access_token, expires: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

async function authorized(url, secret) {
  const id = url.searchParams.get('id');
  const exp = Number(url.searchParams.get('exp'));
  const sig = url.searchParams.get('sig');
  if (!id || !/^[A-Za-z0-9_-]{10,}$/.test(id) || !Number.isSafeInteger(exp) || exp < Date.now() / 1000 || exp > Date.now() / 1000 + 3600 || !/^[a-f0-9]{64}$/.test(sig || '')) return null;
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const bytes = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(`${id}.${exp}`)));
  const expected = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  let mismatch = 0;
  for (let i = 0; i < 64; i++) mismatch |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  return mismatch === 0 ? id : null;
}

const worker = {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const allowed = origin === env.APP_ORIGIN;
    const cors = {
      'Access-Control-Allow-Origin': allowed ? origin : env.APP_ORIGIN,
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range',
      'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
      'Vary': 'Origin',
      'Cache-Control': 'private, no-store',
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: allowed ? 204 : 403, headers: cors });
    if (url.pathname !== '/file' || !['GET', 'HEAD'].includes(request.method)) return new Response('Not found', { status: 404, headers: cors });
    if (!allowed) return new Response('Forbidden origin', { status: 403, headers: cors });
    const id = await authorized(url, env.ZIP_FILE_SIGNING_SECRET);
    if (!id) return new Response('Invalid or expired download', { status: 403, headers: cors });
    try {
      const token = await googleToken(env);
      const endpoint = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}`);
      if (request.method === 'GET') endpoint.searchParams.set('alt', 'media');
      else endpoint.searchParams.set('fields', 'size,mimeType');
      endpoint.searchParams.set('supportsAllDrives', 'true');
      const upstream = await fetch(endpoint, {
        headers: { Authorization: `Bearer ${token}`, ...(request.headers.has('Range') && request.method === 'GET' ? { Range: request.headers.get('Range') } : {}) },
      });
      if (!upstream.ok) return new Response('Drive file unavailable', { status: upstream.status === 404 ? 404 : 502, headers: cors });
      if (request.method === 'HEAD') {
        const meta = await upstream.json();
        return new Response(null, { status: 200, headers: { ...cors, 'Content-Type': meta.mimeType || 'application/octet-stream', ...(meta.size ? { 'Content-Length': meta.size } : {}) } });
      }
      const headers = new Headers(cors);
      for (const name of ['Content-Type', 'Content-Length', 'Content-Range', 'Accept-Ranges']) {
        if (upstream.headers.has(name)) headers.set(name, upstream.headers.get(name));
      }
      return new Response(upstream.body, { status: upstream.status, headers });
    } catch (e) {
      console.error('ZIP file proxy failed', e);
      return new Response('File transfer failed', { status: 502, headers: cors });
    }
  },
};

export default worker;
