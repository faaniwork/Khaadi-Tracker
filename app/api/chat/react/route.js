import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { hasChatAccess, toggleChatReaction } from '@/lib/db';

/** POST /api/chat/react   { messageId, emoji }  - toggles: on if you had not reacted with that emoji, off if you had. */
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  try {
    if (!(await hasChatAccess(session.user.email))) {
      return NextResponse.json({ error: 'You do not have chat access yet.', code: 'CHAT_ACCESS_REQUIRED' }, { status: 403 });
    }
    const { messageId, emoji } = await req.json();
    await toggleChatReaction({ email: session.user.email, messageId, emoji });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('chat reaction toggle failed', e);
    return NextResponse.json({ error: e.message || 'Could not react to that' }, { status: 400 });
  }
}
