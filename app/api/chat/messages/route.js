import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { hasChatAccess, listChatMessages, postChatMessage } from '@/lib/db';

async function requireAccess(email) {
  if (!(await hasChatAccess(email))) {
    const err = new Error('You do not have chat access yet.');
    err.code = 'CHAT_ACCESS_REQUIRED';
    err.status = 403;
    throw err;
  }
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  try {
    await requireAccess(session.user.email);
    const messages = await listChatMessages();
    return NextResponse.json({ messages });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('chat messages list failed', e);
    return NextResponse.json({ error: e.message || 'Could not load messages', code: e.code }, { status });
  }
}

export async function POST(req) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  try {
    const { text, imageId, imageName } = await req.json();
    const message = await postChatMessage({
      email: session.user.email,
      name: session.user.name || session.user.email,
      text,
      imageId,
      imageName,
    });
    return NextResponse.json({ message });
  } catch (e) {
    const status = e.code === 'CHAT_ACCESS_REQUIRED' ? 403 : e.status || 400;
    if (status >= 500) console.error('chat message post failed', e);
    return NextResponse.json({ error: e.message || 'Could not send that', code: e.code }, { status });
  }
}
