import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getProfiles, upsertProfile } from '@/lib/db';

/**
 * GET  /api/profile   every profile, so avatars can be shown against the
 *                     Activity trail. Any signed-in account may read these:
 *                     a shared picture is the whole point.
 * POST /api/profile   { avatar }  sets YOUR OWN picture and nothing else.
 *
 * The email is taken from the session, never from the request body, so there
 * is no way to write somebody else's profile.
 */
export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  try {
    return NextResponse.json(await getProfiles());
  } catch (e) {
    console.error('getProfiles failed', e);
    return NextResponse.json({ error: e.message || 'Could not load profiles' }, { status: 500 });
  }
}

export async function POST(req) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  try {
    const { avatar } = await req.json();
    const profile = await upsertProfile({
      email: session.user.email,
      displayName: session.user.name || session.user.email,
      avatar,
    });
    return NextResponse.json({ profile });
  } catch (e) {
    console.error('upsertProfile failed', e);
    return NextResponse.json({ error: e.message || 'Could not save your picture' }, { status: 400 });
  }
}
