import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { updateDressField } from '@/lib/sheets';

export async function POST(req) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const body = await req.json();
  const { folderId, field, value, expectedUpdatedAt } = body;
  try {
    const result = await updateDressField({
      email: session.user.email,
      folderId,
      field,
      value,
      by: session.user.name || session.user.email,
      expectedUpdatedAt,
    });
    return NextResponse.json(result);
  } catch (e) {
    const status = e.code === 'VIEW_ONLY' ? 403 : 500;
    console.error('updateDressField failed', e);
    return NextResponse.json({ error: e.message || 'Save failed' }, { status });
  }
}
