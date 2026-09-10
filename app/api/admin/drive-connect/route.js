import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { assertAdmin } from '@/lib/db';

/**
 * GET /api/admin/drive-connect
 *
 * Starts the ONE-TIME manual OAuth flow that connects a single, real Google
 * account as the shared Drive-uploading identity (see the header comment in
 * lib/googleUserToken.js for why this exists). Not part of anyone's regular
 * sign-in - this is infrastructure setup an admin runs once, then never
 * needs again unless the connection has to be redone.
 *
 * Naturally self-gated on top of the admin check below: Drive is still a
 * "restricted" OAuth scope on this project, and the OAuth consent screen is
 * still in Google's "Testing" status - so only an account on this project's
 * own test-user list can complete the consent screen this redirects to at
 * all. Nobody outside that list gets far enough to receive a token even if
 * they somehow reached this URL.
 */
export async function GET(req) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  }
  try {
    await assertAdmin(session.user.email);
  } catch (e) {
    return NextResponse.json({ error: 'Only an admin can connect the shared Drive account.' }, { status: 403 });
  }

  const clientId = process.env.AUTH_GOOGLE_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'AUTH_GOOGLE_ID is not configured.' }, { status: 500 });
  }

  const redirectUri = new URL('/api/admin/drive-connect/callback', req.url).toString();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'https://www.googleapis.com/auth/drive');
  // Both are needed for Google to hand back a refresh token at all, which is
  // the entire point of this flow - a token that dies in an hour would need
  // this whole page run again before lunch.
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');
  url.searchParams.set('login_hint', session.user.email);

  return NextResponse.redirect(url.toString());
}
