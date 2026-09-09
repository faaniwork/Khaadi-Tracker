import { NextResponse } from 'next/server';
import { uploadFile, isWithinDress } from '@/lib/drive';
import { resolveCaller, assertCanWriteFiles, assertDressInScope, statusForError } from '@/lib/reviewAuth';

// Vercel's serverless request body cap is what limits this in practice.
// Rejecting oversized files here gives a clear message instead of a platform
// level 413 with no explanation.
const MAX_BYTES = 40 * 1024 * 1024;

/**
 * Keeps the upload target inside the named dress, at any depth. Without
 * this, a `folderId` of the caller's choosing meant an editor could write
 * into any folder the service account can reach, anywhere in Drive.
 */
async function resolveTargetFolder(dressFolderId, folderId) {
  if (!folderId || typeof folderId !== 'string' || folderId === dressFolderId) {
    return dressFolderId;
  }
  if (!(await isWithinDress({ folderId, dressFolderId }))) {
    const err = new Error('NOT_FOUND: That folder is not inside this dress.');
    err.code = 'NOT_FOUND';
    err.status = 404;
    throw err;
  }
  return folderId;
}

/**
 * POST /api/drive/upload   multipart/form-data: dressId, folderId?, file
 *
 * Editors and admins only. Deliberately does NOT write a row into
 * file_reviews: Drive is the source of truth for which files exist, and a
 * freshly uploaded file is pending review by virtue of having no review row.
 */
export async function POST(req) {
  try {
    const caller = await resolveCaller(req);
    assertCanWriteFiles(caller);

    const form = await req.formData();
    const dressId = form.get('dressId');
    const folderId = form.get('folderId');
    const file = form.get('file');

    if (!dressId) return NextResponse.json({ error: 'dressId is required' }, { status: 400 });
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file was attached' }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        {
          error: `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB, over the ${
            MAX_BYTES / 1024 / 1024
          } MB limit for uploads through the dashboard. Put it straight into the Drive folder instead and it will show up here.`,
        },
        { status: 413 }
      );
    }

    const dress = await assertDressInScope(caller, dressId);
    const target = await resolveTargetFolder(dress.id, folderId);

    const buffer = Buffer.from(await file.arrayBuffer());
    const created = await uploadFile({
      folderId: target,
      name: file.name,
      mimeType: file.type,
      buffer,
    });

    return NextResponse.json({ file: created });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('drive upload failed', e);
    return NextResponse.json({ error: e.message || 'Upload failed' }, { status });
  }
}
