import { NextResponse } from 'next/server';
import { resolveReviewLink } from '@/lib/db';
import { REVIEW_COOKIE } from '@/lib/reviewAuth';

const TWELVE_HOURS = 60 * 60 * 12;

/**
 * POST /api/review/session   { token }
 *
 * Exchanges the token in the review URL for an httpOnly cookie.
 *
 * The reason this exists: thumbnails are plain <img> tags, and an <img>
 * cannot send a header. Passing the token in every image URL instead wrote
 * the whole credential into platform access logs, browser history and the
 * disk cache, once per image. The cookie carries it on those requests
 * instead, out of the URL and out of reach of page scripts.
 *
 * Lax rather than Strict, because arriving from a link in an email or a chat
 * app is exactly how these links are used, and Strict would drop the cookie
 * on that first navigation.
 */
/**
 * Refuses a cross-site call.
 *
 * This route mints a credential cookie from an unauthenticated body, so
 * without an origin check any third-party page could POST somebody else's
 * review token into a signed-in user's browser and quietly re-scope every
 * file request they make to a stranger's batch. Sec-Fetch-Site is sent by
 * every current browser; the Origin comparison covers the rest.
 */
function isSameOrigin(req) {
  const site = req.headers.get('sec-fetch-site');
  if (site) return site === 'same-origin' || site === 'same-site' || site === 'none';
  const origin = req.headers.get('origin');
  if (!origin) return true; // No Origin at all means a same-origin navigation.
  try {
    return new URL(origin).host === new URL(req.url).host;
  } catch {
    return false;
  }
}

export async function POST(req) {
  if (!isSameOrigin(req)) {
    return NextResponse.json({ error: 'Cross-site requests are not accepted here.' }, { status: 403 });
  }
  const { token } = await req.json().catch(() => ({}));
  const link = await resolveReviewLink(token);
  if (!link) {
    return NextResponse.json({ error: 'This review link is not valid any more.' }, { status: 401 });
  }

  const res = NextResponse.json({ release: link.release, label: link.label });
  res.cookies.set({
    name: REVIEW_COOKIE,
    value: link.token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: TWELVE_HOURS,
  });
  return res;
}

/** Clears the cookie, so a shared machine does not keep the access. */
export async function DELETE() {
  const res = NextResponse.json({ cleared: true });
  res.cookies.set({ name: REVIEW_COOKIE, value: '', path: '/', maxAge: 0 });
  return res;
}
