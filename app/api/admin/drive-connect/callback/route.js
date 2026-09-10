import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { assertAdmin } from '@/lib/db';

function page(body) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>Drive connection</title>
      <style>body{font-family:system-ui,sans-serif;max-width:640px;margin:60px auto;padding:0 20px;line-height:1.5;color:#111}
      code{background:#f2f2f2;padding:2px 6px;border-radius:4px;word-break:break-all}
      .token{font-size:15px;background:#111;color:#0f0;padding:16px;border-radius:8px;word-break:break-all;user-select:all}
      .warn{color:#b00}</style></head>
      <body>${body}</body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
  );
}

/**
 * GET /api/admin/drive-connect/callback
 *
 * The other half of /api/admin/drive-connect: exchanges Google's one-time
 * code for a refresh token, then DISPLAYS it once, on this page, for the
 * admin who just completed the consent screen to copy into Vercel's
 * environment variables themselves as DRIVE_UPLOADER_REFRESH_TOKEN. It is
 * never logged, stored, or sent anywhere else by this route - this is the
 * only place it is ever shown, and only to the admin's own browser.
 */
export async function GET(req) {
  const session = await auth();
  if (!session?.user?.email) {
    return page(`<h1>Sign in first</h1><p>Sign in to the board, then start this from <code>/api/admin/drive-connect</code> again.</p>`);
  }
  try {
    await assertAdmin(session.user.email);
  } catch (e) {
    return page(`<h1>Admins only</h1><p>Only an admin can connect the shared Drive account.</p>`);
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (error) {
    return page(`<h1 class="warn">Google declined</h1><p>${error}</p><p>Start again at <code>/api/admin/drive-connect</code>.</p>`);
  }
  if (!code) {
    return page(`<h1 class="warn">No code from Google</h1><p>Start again at <code>/api/admin/drive-connect</code>.</p>`);
  }

  const clientId = process.env.AUTH_GOOGLE_ID;
  const clientSecret = process.env.AUTH_GOOGLE_SECRET;
  const redirectUri = new URL('/api/admin/drive-connect/callback', req.url).toString();

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId || '',
      client_secret: clientSecret || '',
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }),
  });
  const data = await tokenRes.json().catch(() => null);
  if (!tokenRes.ok || !data?.refresh_token) {
    // Google omits refresh_token on a repeat consent for an account that
    // already granted this exact scope without revoking it first - the
    // fix is revoking the app's access from myaccount.google.com/permissions
    // and running the connect flow again, not retrying this page.
    return page(
      `<h1 class="warn">No refresh token came back</h1>
       <p>${data?.error_description || data?.error || `HTTP ${tokenRes.status}`}</p>
       <p>If you've connected this before, revoke "Khaadi Production Board" at
       <code>myaccount.google.com/permissions</code> first, then start again at
       <code>/api/admin/drive-connect</code> - Google only issues a refresh token on a
       first-time consent.</p>`
    );
  }

  let email = '(unknown)';
  try {
    const who = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${data.access_token}` },
    }).then((r) => r.json());
    email = who?.email || email;
  } catch {
    // Cosmetic only - the token below is what actually matters.
  }

  return page(
    `<h1>Drive connected as ${email}</h1>
     <p>Copy this into Vercel now - <b>Project → Settings → Environment Variables</b> -
     as <code>DRIVE_UPLOADER_REFRESH_TOKEN</code>. This page will not show it again.</p>
     <div class="token">${data.refresh_token}</div>
     <p class="warn">Do not share this outside Vercel's environment variables - anything holding it can upload
     to and manage Drive as this account.</p>`
  );
}
