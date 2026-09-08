import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getBoardData, getMyRole } from '@/lib/db';
import { syncBoardToSheet } from '@/lib/sheetExport';

// Admin-only: writes a fresh snapshot of the D1 data into the Google Sheet.
// The sheet is an output now, never an input — this is the only thing that
// ever writes to it, and nothing reads it back.
export async function POST() {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });

  const role = await getMyRole(session.user.email);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can sync to the Google Sheet.' }, { status: 403 });
  }

  try {
    const board = await getBoardData(session.user.email);
    const result = await syncBoardToSheet(board);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    console.error('syncBoardToSheet failed', e);
    return NextResponse.json({ error: e.message || 'Sync failed' }, { status: 500 });
  }
}
