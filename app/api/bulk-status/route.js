import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { bulkSetStatus } from '@/lib/sheets';

export async function POST(req) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const body = await req.json();
  const { folderIds, status } = body;
  try {
    const result = await bulkSetStatus({
      email: session.user.email,
      folderIds,
      status,
      by: session.user.name || session.user.email,
    });
    return NextResponse.json(result);
  } catch (e) {
    const status2 = e.code === 'VIEW_ONLY' ? 403 : 500;
    console.error('bulkSetStatus failed', e);
    return NextResponse.json({ error: e.message || 'Save failed' }, { status: status2 });
  }
}
