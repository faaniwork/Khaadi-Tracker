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

/**
 * Whether sign-in also asks for Drive access.
 *
 * Uploading needs it: a service account cannot own a file ("Service Accounts
 * do not have storage quota"), so the only way a file can land in the shoot
 * folders is for the signed-in person to own it, which means uploading with
 * THEIR Google credentials. See lib/googleUserToken.js.
 *
 * It is a kill switch rather than a constant because Drive is a "restricted"
 * scope: if it has not been registered on this project's OAuth consent screen
 * Google refuses it at consent time, and that failure lands on SIGN-IN — the
 * whole app, not just uploads. Set DRIVE_UPLOAD_SCOPE=0 in the environment to
 * drop the scope and get everyone signing in again immediately, without
 * waiting on a deploy.
 */
const driveScopeEnabled = process.env.DRIVE_UPLOAD_SCOPE !== '0';

const GOOGLE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  ...(driveScopeEnabled ? ['https://www.googleapis.com/auth/drive'] : []),
].join(' ');

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          scope: GOOGLE_SCOPES,
          // Both are needed for Google to hand back a refresh token, without
          // which a person's Drive access would die an hour into their day
          // and uploading would start failing until they signed in again.
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  trustHost: true,
  callbacks: {
    async signIn({ profile }) {
      if (!allowedDomains.length) return true;
      const email = (profile?.email || '').toLowerCase();
      return allowedDomains.some((d) => email.endsWith('@' + d));
    },
    async jwt({ token, account }) {
      // `account` is only populated on the sign-in itself, so these are
      // written once and then carried by the session cookie.
      if (account) {
        if (account.access_token) token.googleAccessToken = account.access_token;
        // Google omits the refresh token on later consents, so an existing
        // one is kept rather than being overwritten with undefined.
        if (account.refresh_token) token.googleRefreshToken = account.refresh_token;
        if (account.expires_at) token.googleExpiresAt = account.expires_at * 1000;
        token.googleScope = account.scope || '';
      }
      return token;
    },
    async session({ session, token }) {
      // Deliberately does NOT copy the tokens onto the session: whatever this
      // returns is also served to the browser by /api/auth/session, and a
      // Drive-scoped access token has no business being readable by page
      // scripts. Server code reads it straight out of the session cookie
      // instead (lib/googleUserToken.js). Only the harmless fact of whether
      // Drive access was granted is exposed, so the UI can explain itself.
      session.hasDriveAccess = String(token?.googleScope || '').includes(
        'https://www.googleapis.com/auth/drive'
      );
      return session;
    },
  },
  pages: {},
});
