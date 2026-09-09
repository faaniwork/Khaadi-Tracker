import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

// Real Google sign-in — this is what makes "who changed what" and the
// admin/editor/viewer split actually trustworthy (unlike a self-typed name).
// Optionally restrict who can even sign in via ALLOWED_EMAIL_DOMAINS, e.g.
// "imagine.art,vyro.ai" — leave unset to allow any Google account (the real
// gate is still the Access tab in the sheet, which decides editor vs viewer).
const allowedDomains = (process.env.ALLOWED_EMAIL_DOMAINS || '')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  trustHost: true,
  callbacks: {
    async signIn({ profile }) {
      if (!allowedDomains.length) return true;
      const email = (profile?.email || '').toLowerCase();
      return allowedDomains.some((d) => email.endsWith('@' + d));
    },
    async session({ session }) {
      return session;
    },
  },
  pages: {},
});
