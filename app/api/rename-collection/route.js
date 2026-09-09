import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { renameCollection } from '@/lib/db';

export async function POST(req) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const body = await req.json();
  const { release, oldName, newName } = body;
  try {
    const result = await renameCollection({
      email: session.user.email,
      release,
      oldName,
      newName,
      by: session.user.name || session.user.email,
    });
    return NextResponse.json(result);
  } catch (e) {
    const status = e.code === 'VIEW_ONLY' ? 403 : 500;
    console.error('renameCollection failed', e);
    return NextResponse.json({ error: e.message || 'Rename failed' }, { status });
  }
}
