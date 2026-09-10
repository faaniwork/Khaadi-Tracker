import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verifyLoginCode } from '@/lib/db';

// Email + a one-time code, the only way in. Google sign-in was tried as a
// fallback, but it can never actually serve "anyone" the way this needs to -
// the project's OAuth consent screen stays in Google's Testing status
// (moving it to Production means a real, multi-week verification review,
// since this app's Drive access is a restricted scope), so Google always
// rejects anyone not on a hand-maintained test-user list with "you do not
// have access", no matter what this app's own code does. Email+code has no
// such ceiling: anyone can request one and sign in.
//
// This used to also check ALLOWED_EMAIL_DOMAINS, restricting sign-in to
// specific email domains - inherited from when the only sign-in method was
// Google. That is exactly backwards from what this path exists for: it
// silently sent a real code to any email that asked, then rejected the code
// at the sign-in step for every email outside the allowed domains, which is
// why a code could "arrive" and still be reported as "wrong or expired." No
// domain restriction here any more - anyone can sign in. What they can DO
// once they're in is still entirely gated by the access table (see
// getMyRole in lib/db.js): a brand new email lands as 'viewer' until an
// admin promotes it.
//
// Uploading to Drive does not depend on how someone signed in either way -
// it always runs as one shared, already-authorized Drive account (see
// lib/googleUserToken.js and app/api/admin/drive-connect), connected once
// and unaffected by removing Google here.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      id: 'email-code',
      name: 'Email code',
      credentials: {
        email: { label: 'Email', type: 'email' },
        code: { label: 'Code', type: 'text' },
      },
      async authorize(credentials) {
        const email = String(credentials?.email || '').trim().toLowerCase();
        const code = String(credentials?.code || '').trim();
        if (!email || !code) return null;
        const ok = await verifyLoginCode(email, code);
        if (!ok) return null;
        // Auth.js wants an `id`; the email itself is the only identity this
        // app has ever needed one of.
        return { id: email, email, name: email.split('@')[0] };
      },
    }),
  ],
  // 90 days rather than Auth.js's own 30-day default: signing in is now a
  // real "check your email" step every time it happens, not a one-tap
  // Google account picker, so a session that goes stale after a month reads
  // as "I have to do this again" far more than it used to.
  session: { strategy: 'jwt', maxAge: 90 * 24 * 60 * 60 },
  trustHost: true,
  pages: {},
});
