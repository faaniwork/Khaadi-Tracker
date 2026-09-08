import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { updateCost } from '@/lib/sheets';

export async function POST(req) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const body = await req.json();
  const { scope, key, value } = body;
  try {
    await updateCost({
      email: session.user.email,
      scope,
      key,
      value,
      by: session.user.name || session.user.email,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e.code === 'VIEW_ONLY' ? 403 : 500;
    console.error('updateCost failed', e);
    return NextResponse.json({ error: e.message || 'Save failed' }, { status });
  }
}
