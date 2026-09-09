/**
 * The signed-in person's own Google access token, for the one job that
 * cannot be done with the service account: creating a file.
 *
 * A service account has no storage quota of its own, so anything it uploads
 * would have no owner able to store it and Drive refuses outright ("Service
 * Accounts do not have storage quota. Leverage shared drives, or use OAuth
 * delegation instead."). Uploading as the signed-in person instead makes them
 * the file's owner, which is both what Drive requires and a fairer record of
 * who actually added the image.
 *
 * WHY THE COOKIE IS READ DIRECTLY
 *
 * Auth.js returns one session object, and it serves that same object to the
 * browser from /api/auth/session — so anything the session callback attaches
 * is readable by page scripts. A Drive-scoped token must not be. It therefore
 * stays in the encrypted session cookie, which only the server can open, and
 * is read from there at the moment it is needed.
 */

import { cookies } from 'next/headers';
import { decode } from 'next-auth/jwt';

// Auth.js prefixes the cookie with __Secure- over https, and splits it into
// .0/.1/... chunks when it outgrows the 4KB a cookie may hold — which storing
// tokens makes far more likely. Both names are tried, chunks first.
const COOKIE_NAMES = ['__Secure-authjs.session-token', 'authjs.session-token'];

function readCookie(store, name) {
  const whole = store.get(name);
  if (whole?.value) return whole.value;
  // Chunked: authjs.session-token.0, .1, ... concatenated in order.
  const parts = [];
  for (let i = 0; ; i++) {
    const chunk = store.get(`${name}.${i}`);
    if (!chunk?.value) break;
    parts.push(chunk.value);
  }
  return parts.length ? parts.join('') : null;
}

function accessDenied(message) {
  const err = new Error(message);
  err.code = 'DRIVE_ACCESS_REQUIRED';
  err.status = 403;
  return err;
}

async function readSessionToken() {
  const store = await cookies();
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET is not configured');

  for (const name of COOKIE_NAMES) {
    const value = readCookie(store, name);
    if (!value) continue;
    try {
      // `salt` is the cookie's own name in Auth.js v5 — decoding with the
      // wrong one fails, which is why both names are attempted.
      const payload = await decode({ token: value, secret, salt: name });
      if (payload) return payload;
    } catch {
      // Wrong name for this deployment, or a cookie from an older secret.
    }
  }
  return null;
}

/**
 * A usable Google access token for the caller, refreshing it first if it has
 * expired. The refreshed token is deliberately NOT written back to the
 * cookie: a route handler cannot reliably re-issue the session cookie mid
 * request, and refreshing again on the next upload costs one cheap call
 * against Google rather than a pile of cookie-rewriting machinery.
 *
 * Throws DRIVE_ACCESS_REQUIRED when the person signed in before Drive access
 * was asked for, so the route can tell them exactly what to do rather than
 * failing as a generic 500.
 */
export async function getUserDriveAccessToken() {
  const token = await readSessionToken();
  if (!token) throw accessDenied('You are not signed in. Sign in and try again.');

  const scope = String(token.googleScope || '');
  const hasDrive = scope.includes('https://www.googleapis.com/auth/drive');
  if (!token.googleAccessToken && !token.googleRefreshToken) {
    throw accessDenied(
      'Uploading needs Drive access, which your sign-in does not have yet. Sign out and sign back in, then approve Drive access.'
    );
  }
  if (!hasDrive) {
    throw accessDenied(
      'Your sign-in predates Drive access being requested. Sign out and sign back in, then approve Drive access to upload.'
    );
  }

  const expiresAt = Number(token.googleExpiresAt || 0);
  // A minute of headroom, so a token cannot lapse between this check and
  // Drive actually reading it.
  if (token.googleAccessToken && expiresAt > Date.now() + 60_000) {
    return token.googleAccessToken;
  }

  if (!token.googleRefreshToken) {
    throw accessDenied(
      'Your Drive access has expired and cannot be renewed. Sign out and sign back in to upload.'
    );
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID || '',
      client_secret: process.env.AUTH_GOOGLE_SECRET || '',
      grant_type: 'refresh_token',
      refresh_token: token.googleRefreshToken,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('google token refresh failed', res.status, body.slice(0, 200));
    throw accessDenied(
      'Google would not renew your Drive access. Sign out and sign back in to upload.'
    );
  }
  const data = await res.json();
  if (!data.access_token) {
    throw accessDenied('Google did not return a usable Drive token. Sign out and sign back in.');
  }
  return data.access_token;
}
