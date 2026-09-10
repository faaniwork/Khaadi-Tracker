/**
 * The Drive-uploading identity every upload and app-created folder runs as -
 * for the one job the service account cannot do: owning a file.
 *
 * A service account has no storage quota of its own, so anything it
 * uploads would have no owner able to store it and Drive refuses outright
 * ("Service Accounts do not have storage quota. Leverage shared drives, or
 * use OAuth delegation instead."). This used to run as whichever person was
 * actually signed in, using their own Google OAuth token - but sign-in is no
 * longer Google OAuth at all (see auth.js: it's an emailed one-time code
 * now, so nobody has a Google token to run anything as). Instead, every
 * upload runs as ONE shared, already-authorized Google account, set up once
 * via /api/admin/drive-connect and never touched again unless that
 * connection itself needs redoing.
 *
 * Attribution of who actually did what is unaffected by this: it was always
 * read from THIS APP's own session/DB (review.by, updated_by, etc.), never
 * from Drive's file-owner metadata, so it stays exactly as accurate as
 * before even though every file the app creates is now Drive-owned by the
 * same account.
 *
 * Required environment variables (set in Vercel, never in this repo):
 *   DRIVE_UPLOADER_REFRESH_TOKEN  - from the one-time /api/admin/drive-connect flow
 *   AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET  - the OAuth client that token was issued to
 */

function accessDenied(message) {
  const err = new Error(message);
  err.code = 'DRIVE_ACCESS_REQUIRED';
  err.status = 403;
  return err;
}

// A fresh access token is cheap to mint and this file has no server to hold
// state in between separate serverless invocations anyway, but a warm
// lambda instance handling several uploads back to back would otherwise
// hit Google once per file for no reason - this just skips that when the
// last one is still comfortably unexpired.
let cached = { token: null, expiresAt: 0 };

/**
 * A usable Google access token for the shared Drive-uploading account,
 * refreshing it first if needed.
 *
 * Throws DRIVE_ACCESS_REQUIRED when the one-time connection has not been
 * done yet (or Google has stopped honouring it), so the route can tell
 * whoever hit this exactly what to do rather than failing as a generic 500.
 */
export async function getUserDriveAccessToken() {
  const refreshToken = process.env.DRIVE_UPLOADER_REFRESH_TOKEN;
  if (!refreshToken) {
    throw accessDenied(
      'Uploading is not set up yet. An admin needs to complete the one-time Drive connection at /api/admin/drive-connect.'
    );
  }

  if (cached.token && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID || '',
      client_secret: process.env.AUTH_GOOGLE_SECRET || '',
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('shared Drive token refresh failed', res.status, body.slice(0, 200));
    throw accessDenied(
      'Google would not renew the shared Drive connection. An admin needs to redo /api/admin/drive-connect.'
    );
  }
  const data = await res.json();
  if (!data.access_token) {
    throw accessDenied('Google did not return a usable Drive token. An admin needs to redo /api/admin/drive-connect.');
  }
  cached = { token: data.access_token, expiresAt: Date.now() + Number(data.expires_in || 3000) * 1000 };
  return data.access_token;
}
