import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getChatStatus, listChatRequests, getMyRole } from '@/lib/db';

/**
 * GET /api/chat/status
 *
 * What the widget checks before it decides whether to show a conversation,
 * a "request sent, waiting on an admin" state, or a "request access"
 * button. Admins also get the current pending queue back in the same call,
 * since they're the one audience who needs it and it saves the widget a
 * second round trip just to draw its own "requests" badge.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  try {
    const email = session.user.email;
    const [status, role] = await Promise.all([getChatStatus(email), getMyRole(email)]);
    const isAdmin = role === 'admin';
    const requests = isAdmin ? await listChatRequests(email) : [];
    return NextResponse.json({ status, isAdmin, requests });
  } catch (e) {
    console.error('chat status failed', e);
    return NextResponse.json({ error: e.message || 'Could not load chat status' }, { status: 500 });
  }
}
