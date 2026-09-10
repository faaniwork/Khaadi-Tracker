import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { hasChatAccess } from '@/lib/db';
import { initResumableUpload } from '@/lib/drive';
import { getUserDriveAccessToken } from '@/lib/googleUserToken';
import { resolveChatUploadsFolderId } from '@/lib/driveSync';

/**
 * POST /api/chat/upload-session   { name, mimeType }
 *
 * The same two-step upload dress photos use (see the matching route at
 * app/api/drive/upload-session): this only authorises the upload and hands
 * back a Drive resumable-upload URL, the actual bytes go straight from the
 * browser to Google. Lands in the shared "Chat uploads" folder (see
 * resolveChatUploadsFolderId), owned by the same shared Drive account
 * everything else uploads as.
 */
export async function POST(req) {
  try {
    const session = await auth();
    if (!session?.user?.email) return NextResponse.json({ error: 'UNAUTHENTICATED' }, { status: 401 });
    if (!(await hasChatAccess(session.user.email))) {
      return NextResponse.json({ error: 'You do not have chat access yet.', code: 'CHAT_ACCESS_REQUIRED' }, { status: 403 });
    }

    const { name, mimeType } = await req.json();
    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
    if (mimeType && !String(mimeType).startsWith('image/')) {
      return NextResponse.json({ error: 'Only images can be shared in chat.' }, { status: 400 });
    }

    const folderId = await resolveChatUploadsFolderId();
    const origin = req.headers.get('origin') || new URL(req.url).origin;
    const accessToken = await getUserDriveAccessToken();
    const uploadUrl = await initResumableUpload({ folderId, name, mimeType, origin, accessToken });

    return NextResponse.json({ uploadUrl });
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('chat upload-session failed', e);
    return NextResponse.json({ error: e.message || 'Could not start the upload', code: e.code }, { status });
  }
}
