import { NextResponse } from 'next/server';
import { createReviewLink, listReviewLinks, revokeReviewLink } from '@/lib/db';
import { resolveCaller, assertIsAdmin, statusForError } from '@/lib/reviewAuth';

/**
 * Admin-only management of the per-batch client review links.
 *
 * GET    /api/review-links               list every link, live and revoked
 * POST   /api/review-links   { release, label }
 * DELETE /api/review-links   { token }    revokes, keeping the audit trail
 *
 * A revoked link is kept rather than deleted so the Activity trail still
 * explains who reviewed what and under which link.
 */
export async function GET(req) {
  try {
    const caller = await resolveCaller(req);
    assertIsAdmin(caller);
    return NextResponse.json({ links: await listReviewLinks(caller.email) });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('list review links failed', e);
    return NextResponse.json({ error: e.message || 'Could not load review links' }, { status });
  }
}

export async function POST(req) {
  try {
    const caller = await resolveCaller(req);
    assertIsAdmin(caller);
    const { release, label } = await req.json();
    const link = await createReviewLink({
      email: caller.email,
      release,
      label,
      by: caller.by,
    });
    return NextResponse.json({ link });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('create review link failed', e);
    return NextResponse.json({ error: e.message || 'Could not create the link' }, { status });
  }
}

export async function DELETE(req) {
  try {
    const caller = await resolveCaller(req);
    assertIsAdmin(caller);
    const { token } = await req.json();
    await revokeReviewLink({ email: caller.email, token, by: caller.by });
    return NextResponse.json({ revoked: true });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('revoke review link failed', e);
    return NextResponse.json({ error: e.message || 'Could not revoke the link' }, { status });
  }
}
