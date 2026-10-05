import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { assertCanEdit, getDress, renameDress } from '@/lib/db';
import { renameFile } from '@/lib/drive';

export async function POST(req) {
  try {
    const session = await auth();
    if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
    const email = session.user?.email || '';
    await assertCanEdit(email);
    const { dressId, name } = await req.json();
    const dress = await getDress(dressId);
    if (!dress || dress.archived) return NextResponse.json({ error: 'Dress not found' }, { status: 404 });
    const next = String(name || '').trim();
    if (!/dress/i.test(next) || /[\\/]/.test(next)) {
      return NextResponse.json({ error: 'Use a dress name containing “Dress” without slashes.' }, { status: 400 });
    }
    if (next !== dress.dress) await renameFile(dressId, next);
    try {
      return NextResponse.json(await renameDress({ email, dressId, name: next, by: session.user?.name || email }));
    } catch (error) {
      if (next !== dress.dress) await renameFile(dressId, dress.dress).catch(() => {});
      throw error;
    }
  } catch (error) {
    const status = error.status || (error.code === 'VIEW_ONLY' ? 403 : 500);
    if (status >= 500) console.error('dress rename failed', error);
    return NextResponse.json({ error: error.message || 'Could not rename dress' }, { status });
  }
}
