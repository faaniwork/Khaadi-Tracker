import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verifyLoginCode } from '@/lib/db';

// Email + a one-time code, not Google sign-in. Google OAuth for an app that
// touches Drive means every single person who ever signs in either has to be
// added to the project's OAuth "test users" list by hand (capped at 100) or
// the whole app has to pass Google's app-verification review to go public -
// weeks of work for an internal tool nobody outside the team ever needs to
// verify their identity to Google for. Anyone can type their email here and
// get in; what they can DO once they're in is still entirely gated by the
// access table (see getMyRole in lib/db.js) - a brand new email lands as
// 'viewer' until an admin promotes it, exactly as before.
//
// Uploading to Drive no longer runs "as whoever is signed in" as a result -
// there is no longer a per-person Google token to run it as. It runs as one
// shared, already-authorized Drive account instead (see
// lib/googleUserToken.js and app/api/admin/drive-connect).
//
// Optionally restrict who can even request a code via ALLOWED_EMAIL_DOMAINS,
// e.g. "imagine.art,vyro.ai" — leave unset to allow any email address (the
// real gate is still the Access tab, which decides editor vs viewer).
const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS || '')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

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
        if (allowedDomains.length && !allowedDomains.some((d) => email.endsWith('@' + d))) {
          return null;
        }
        const ok = await verifyLoginCode(email, code);
        if (!ok) return null;
        // Auth.js wants an `id`; the email itself is the only identity this
        // app has ever needed one of.
        return { id: email, email, name: email.split('@')[0] };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  trustHost: true,
  pages: {},
});
