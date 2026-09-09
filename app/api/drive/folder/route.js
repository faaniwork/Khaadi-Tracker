import { NextResponse } from 'next/server';
import { createFolder, isWithinDress } from '@/lib/drive';
import { resolveCaller, assertCanWriteFiles, assertDressInScope, statusForError } from '@/lib/reviewAuth';

/**
 * POST /api/drive/folder   { dressId, parentId?, name }
 *
 * Editors and admins only. Creates a subfolder inside a dress's folder, for
 * organising takes ("Selects", "Flats", and so on).
 */
export async function POST(req) {
  try {
    const caller = await resolveCaller(req);
    assertCanWriteFiles(caller);

    const { dressId, parentId, name } = await req.json();
    if (!dressId) return NextResponse.json({ error: 'dressId is required' }, { status: 400 });
    if (!String(name || '').trim()) {
      return NextResponse.json({ error: 'Give the folder a name' }, { status: 400 });
    }

    const dress = await assertDressInScope(caller, dressId);
    // Same containment as uploads: the parent has to be inside this dress,
    // at any depth, never an arbitrary id.
    let parent = dress.id;
    if (parentId && parentId !== dress.id) {
      if (!(await isWithinDress({ folderId: parentId, dressFolderId: dress.id }))) {
        return NextResponse.json(
          { error: 'That folder is not inside this dress.' },
          { status: 404 }
        );
      }
      parent = parentId;
    }
    const folder = await createFolder({ parentId: parent, name });

    return NextResponse.json({ folder });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('drive create folder failed', e);
    return NextResponse.json({ error: e.message || 'Could not create the folder' }, { status });
  }
}
