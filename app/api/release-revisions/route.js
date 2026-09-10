import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { updateReleaseRevisions } from '@/lib/db';

/** POST /api/release-revisions  { release, value } — 0..9, editors only. */
export async function POST(req) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  try {
    const { release, value } = await req.json();
    const res = await updateReleaseRevisions({
      email: session.user.email,
      release,
      value,
      by: session.user.name || session.user.email,
    });
    return NextResponse.json(res);
  } catch (e) {
    const status = e.code === 'VIEW_ONLY' ? 403 : 500;
    if (status >= 500) console.error('updateReleaseRevisions failed', e);
    return NextResponse.json({ error: e.message || 'Save failed' }, { status });
  }
}
