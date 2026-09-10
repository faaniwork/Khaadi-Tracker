import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { grantChatAccess, revokeChatAccess } from '@/lib/db';

/** POST /api/chat/access/grant   { targetEmail } — admin only. */
export async function POST(req) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  try {
    const { targetEmail } = await req.json();
    await grantChatAccess({ email: session.user.email, targetEmail });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e.code === 'ADMIN_ONLY' ? 403 : 500;
    if (status >= 500) console.error('chat access grant failed', e);
    return NextResponse.json({ error: e.message || 'Could not grant access' }, { status });
  }
}

/** DELETE /api/chat/access/grant   { targetEmail } — admin only, pulls access back. */
export async function DELETE(req) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  try {
    const { targetEmail } = await req.json();
    await revokeChatAccess({ email: session.user.email, targetEmail });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e.code === 'ADMIN_ONLY' ? 403 : 500;
    if (status >= 500) console.error('chat access revoke failed', e);
    return NextResponse.json({ error: e.message || 'Could not remove access' }, { status });
  }
}
