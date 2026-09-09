import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAccessList, upsertAccess, removeAccess } from '@/lib/db';

function statusFor(e) {
  return e.code === 'ADMIN_ONLY' ? 403 : 500;
}

export async function GET() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  try {
    const list = await getAccessList(session.user.email);
    return NextResponse.json({ list });
  } catch (e) {
    console.error('getAccessList failed', e);
    return NextResponse.json({ error: e.message || 'Failed to load access list' }, { status: statusFor(e) });
  }
}

export async function POST(req) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const body = await req.json();
  const { email: targetEmail, role, notes } = body;
  try {
    const result = await upsertAccess({
      email: session.user.email,
      targetEmail,
      role,
      notes,
      by: session.user.name || session.user.email,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error('upsertAccess failed', e);
    return NextResponse.json({ error: e.message || 'Failed to save access' }, { status: statusFor(e) });
  }
}

export async function DELETE(req) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const body = await req.json();
  const { email: targetEmail } = body;
  try {
    await removeAccess({ email: session.user.email, targetEmail, by: session.user.name || session.user.email });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('removeAccess failed', e);
    return NextResponse.json({ error: e.message || 'Failed to remove access' }, { status: statusFor(e) });
  }
}
