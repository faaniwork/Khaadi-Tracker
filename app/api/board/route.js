import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getBoardData } from '@/lib/sheets';

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  try {
    const data = await getBoardData(session.user.email);
    return NextResponse.json(data);
  } catch (e) {
    console.error('getBoardData failed', e);
    return NextResponse.json({ error: e.message || 'Failed to load board data' }, { status: 500 });
  }
}
