import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAccessList, upsertAccess, removeAccess } from '@/lib/db';
import { grantFolderAccess, revokeFolderAccess } from '@/lib/drive';
import { resolveOutputFolderId } from '@/lib/driveSync';

const CAN_UPLOAD = ['admin', 'editor'];

/**
 * Keeps Drive in step with the board.
 *
 * "Editor on the board" has to mean something in Drive, because an upload
 * runs as the signed-in person and Drive checks THEIR account against the
 * folder. Without this, being made an editor here got you a permission error
 * from Google the moment you tried to add a file, which is exactly what
 * happened to the first editor who tried.
 *
 * Viewers and clients are deliberately left out: they read images through
 * this app, which fetches them with the service account, so they never need
 * Drive access of their own.
 *
 * Best effort on purpose. If Drive will not let us share (an owner can switch
 * that off), the role change on the board still stands and the caller is told
 * the Drive half did not happen, rather than the whole thing failing.
 */
async function syncDriveAccess(targetEmail, role) {
  const address = String(targetEmail || '').trim().toLowerCase();
  if (!address) return null;
  try {
    const folderId = await resolveOutputFolderId();
    if (CAN_UPLOAD.includes(role)) {
      await grantFolderAccess({ folderId, email: address, role: 'writer' });
      return { drive: 'granted' };
    }
    const res = await revokeFolderAccess({ folderId, email: address });
    return { drive: res?.refused ? 'refused' : 'revoked' };
  } catch (e) {
    console.error('drive access sync failed', address, role, e?.message);
    return { drive: 'failed', driveError: e.message };
  }
}

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
    const drive = await syncDriveAccess(targetEmail, role);
    return NextResponse.json({ ...result, ...drive });
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
    // Losing the board should not leave someone holding the Drive folder.
    const drive = await syncDriveAccess(targetEmail, 'viewer');
    return NextResponse.json({ ok: true, ...drive });
  } catch (e) {
    console.error('removeAccess failed', e);
    return NextResponse.json({ error: e.message || 'Failed to remove access' }, { status: statusFor(e) });
  }
}
