import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { addNote } from '@/lib/sheets';

export async function POST(req) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const body = await req.json();
  const { release, text } = body;
  try {
    await addNote({
      email: session.user.email,
      release,
      text,
      by: session.user.name || session.user.email,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e.code === 'VIEW_ONLY' ? 403 : 500;
    console.error('addNote failed', e);
    return NextResponse.json({ error: e.message || 'Save failed' }, { status });
  }
}
