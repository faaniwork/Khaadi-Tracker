import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { requestChatAccess } from '@/lib/db';

/**
 * POST /api/chat/access
 *
 * Asks for chat access for the signed-in person. There's no body - it's
 * always "for myself", an admin never needs to ask.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  try {
    const status = await requestChatAccess({ email: session.user.email, name: session.user.name });
    return NextResponse.json({ status });
  } catch (e) {
    console.error('chat access request failed', e);
    return NextResponse.json({ error: e.message || 'Could not send that request' }, { status: 500 });
  }
}
