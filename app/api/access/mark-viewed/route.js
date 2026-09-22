import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { markAccessViewed } from '@/lib/db';

/**
 * POST /api/access/mark-viewed
 *
 * Clears the "N new" badge on the Access nav item for whoever calls this -
 * see getNewJoinCount. Called once the Access page has actually rendered
 * the list (not on every click of the nav item), so someone who taps
 * Access, sees the new person, and taps away still gets credit for having
 * looked.
 */
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  await markAccessViewed(session.user.email);
  return NextResponse.json({ ok: true });
}
