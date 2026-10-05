import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getMyRole, archiveCollection, addCollectionDresses } from '@/lib/db';
import { createFolder, ensureSubfolder, listFolder, mapWithConcurrency, moveFolder } from '@/lib/drive';
import { resolveOutputFolderId, resolveRootFolderId } from '@/lib/driveSync';
import { getUserDriveAccessToken } from '@/lib/googleUserToken';

export const maxDuration = 60;

async function context(req) {
  const session = await auth();
  if (!session) throw Object.assign(new Error('Sign in required'), { status: 401 });
  const email = session.user?.email || '';
  if (!['admin', 'editor'].includes(await getMyRole(email))) {
    throw Object.assign(new Error('Editor access required'), { status: 403 });
  }
  const body = await req.json();
  const release = String(body.release || '').trim();
  const name = String(body.name || '').trim();
  if (!release || !name || /[\\/]/.test(name)) {
    throw Object.assign(new Error('Enter a collection name without slashes.'), { status: 400 });
  }
  const rootId = await resolveRootFolderId(release);
  if (!rootId) throw Object.assign(new Error('Batch Drive folder not found'), { status: 404 });
  const children = await listFolder(rootId);
  return { email, by: session.user?.name || email, body, release, name, rootId, children };
}

function errorResponse(error) {
  const status = error.status || (error.code === 'VIEW_ONLY' ? 403 : 500);
  if (status >= 500) console.error('collection change failed', error);
  return NextResponse.json({ error: error.message || 'Collection change failed' }, { status });
}

export async function POST(req) {
  try {
    const { email, by, body, release, name, rootId, children } = await context(req);
    if (children.some((child) => child.isFolder && child.name.toLowerCase() === name.toLowerCase())) {
      return NextResponse.json({ error: 'A collection already has that name.' }, { status: 409 });
    }
    const count = Number(body.dresses);
    if (!Number.isInteger(count) || count < 1 || count > 60) {
      return NextResponse.json({ error: 'Choose between 1 and 60 dresses.' }, { status: 400 });
    }
    let accessToken;
    try { accessToken = await getUserDriveAccessToken(); }
    catch (e) { if (e.code !== 'DRIVE_ACCESS_REQUIRED') throw e; }
    const folder = await createFolder({ parentId: rootId, name, accessToken });
    const dressNames = Array.from({ length: count }, (_, index) => `Dress ${index + 1}`);
    const folders = await mapWithConcurrency(dressNames, 6, (dressName) =>
      createFolder({ parentId: folder.id, name: dressName, accessToken }));
    return NextResponse.json(await addCollectionDresses({ email, release, collection: name, folders, by }));
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(req) {
  try {
    const { email, by, release, name, children } = await context(req);
    const folder = children.find((child) => child.isFolder && child.name === name);
    if (!folder) return NextResponse.json({ error: 'Collection folder not found' }, { status: 404 });
    if (children.filter((child) => child.isFolder).length <= 1) {
      return NextResponse.json({ error: 'Keep one collection in the batch, or remove the batch instead.' }, { status: 400 });
    }
    const outputId = await resolveOutputFolderId();
    let accessToken;
    try { accessToken = await getUserDriveAccessToken(); }
    catch (e) { if (e.code !== 'DRIVE_ACCESS_REQUIRED') throw e; }
    const removedId = await ensureSubfolder({ parentId: outputId, name: 'Removed collections', accessToken });
    await moveFolder({ folderId: folder.id, parentId: removedId, accessToken });
    const result = await archiveCollection({ email, release, name, by });
    return NextResponse.json(result);
  } catch (error) { return errorResponse(error); }
}
