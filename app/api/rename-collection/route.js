import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { renameCollection, getMyRole } from '@/lib/db';
import { listFolder, renameFile } from '@/lib/drive';
import { resolveRootFolderId } from '@/lib/driveSync';

export async function POST(req) {
  const session = await auth();
  if (!session) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
  const body = await req.json();
  const { release, oldName, newName } = body;
  try {
    if (!['admin', 'editor'].includes(await getMyRole(session.user.email))) {
      return NextResponse.json({ error: 'Editor access required' }, { status: 403 });
    }
    const next = String(newName || '').trim();
    if (!next || /[\\/]/.test(next)) return NextResponse.json({ error: 'Enter a collection name without slashes.' }, { status: 400 });
    const rootId = await resolveRootFolderId(release);
    if (!rootId) return NextResponse.json({ error: 'Batch Drive folder not found' }, { status: 404 });
    const folders = (await listFolder(rootId)).filter((file) => file.isFolder);
    const folder = folders.find((file) => file.name === oldName);
    if (!folder) return NextResponse.json({ error: 'Collection folder not found' }, { status: 404 });
    if (folders.some((file) => file.id !== folder.id && file.name.toLowerCase() === next.toLowerCase())) {
      return NextResponse.json({ error: 'A collection already has that name.' }, { status: 409 });
    }
    if (next !== oldName) await renameFile(folder.id, next);
    let result;
    try {
      result = await renameCollection({
      email: session.user.email,
      release,
      oldName,
      newName,
      by: session.user.name || session.user.email,
      });
    } catch (error) {
      if (next !== oldName) await renameFile(folder.id, oldName).catch(() => {});
      throw error;
    }
    return NextResponse.json(result);
  } catch (e) {
    const status = e.status || (e.code === 'VIEW_ONLY' ? 403 : 500);
    console.error('renameCollection failed', e);
    return NextResponse.json({ error: e.message || 'Rename failed' }, { status });
  }
}
