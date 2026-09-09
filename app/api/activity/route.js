import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getActivityLog } from '@/lib/db';

export async function GET(req) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get('limit')) || 200;
  try {
    const entries = await getActivityLog(limit);
    return NextResponse.json({ entries });
  } catch (e) {
    console.error('getActivityLog failed', e);
    return NextResponse.json({ error: e.message || 'Failed to load activity' }, { status: 500 });
  }
}
