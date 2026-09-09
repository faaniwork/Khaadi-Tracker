import { NextResponse } from 'next/server';
import { createFolder } from '@/lib/drive';
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
    const folder = await createFolder({ parentId: parentId || dress.id, name });

    return NextResponse.json({ folder });
  } catch (e) {
    const status = statusForError(e);
    if (status >= 500) console.error('drive create folder failed', e);
    return NextResponse.json({ error: e.message || 'Could not create the folder' }, { status });
  }
}
