import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Google from 'next-auth/providers/google';
import { verifyLoginCode } from '@/lib/db';

// Two ways in: email + a one-time code (see components/sign-in.jsx), or
// Google - kept as a fallback specifically because the email path depends on
// RESEND_API_KEY being configured, and until that's done nobody could sign
// in at all otherwise. Google only ever identifies someone here now (no
// Drive scope, no offline access) - uploading no longer runs "as whoever is
// signed in" for anyone, Google or email alike, since it now always runs as
// one shared, already-authorized Drive account (see lib/googleUserToken.js
// and app/api/admin/drive-connect). That also means Google sign-in itself
// never touches a "restricted" OAuth scope any more, though the project's
// OAuth consent screen being in Testing status still caps it to whoever is
// on the test-user list - the email+code path is what removes that cap
// entirely once RESEND_API_KEY is set.
//
// What either path gets someone is still entirely gated by the access
// table (see getMyRole in lib/db.js) - a brand new email lands as 'viewer'
// until an admin promotes it, exactly as before.
//
// Optionally restrict who can sign in via ALLOWED_EMAIL_DOMAINS, e.g.
// "imagine.art,vyro.ai" — leave unset to allow any email address (the real
// gate is still the Access tab, which decides editor vs viewer).
const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS || '')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

function domainAllowed(email) {
  if (!allowedDomains.length) return true;
  return allowedDomains.some((d) => String(email || '').toLowerCase().endsWith('@' + d));
}

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
        if (!email || !code || !domainAllowed(email)) return null;
        const ok = await verifyLoginCode(email, code);
        if (!ok) return null;
        // Auth.js wants an `id`; the email itself is the only identity this
        // app has ever needed one of.
        return { id: email, email, name: email.split('@')[0] };
      },
    }),
    Google({
      authorization: { params: { scope: 'openid email profile' } },
    }),
  ],
  session: { strategy: 'jwt' },
  trustHost: true,
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider !== 'google') return true;
      return domainAllowed(profile?.email);
    },
  },
  pages: {},
});
