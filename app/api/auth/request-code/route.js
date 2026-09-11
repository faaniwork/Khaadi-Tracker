import { NextResponse, after } from 'next/server';
import { createLoginCode } from '@/lib/db';
import { sendLoginCode, isEmailConfigured } from '@/lib/email';

/**
 * POST /api/auth/request-code   { email }
 *
 * The first half of sign-in: mints a one-time code for this email and
 * emails it. The second half is the actual sign-in, which goes straight
 * through NextAuth's credentials provider (see auth.js) - this route never
 * creates a session itself, only the code that lets someone get one.
 *
 * Deliberately does not reveal whether the email is already known to the
 * board (every access-controlled system leaks less by responding the same
 * way either way) - a brand new email gets a code exactly like an existing
 * one, and simply lands as 'viewer' on first sign-in.
 *
 * The email itself goes out via after(), once the response is already on
 * its way back - a real Gmail SMTP handshake (TLS, auth, the send itself)
 * routinely ran several seconds on its own, especially from a cold
 * serverless instance, and this screen had nothing to show for that whole
 * stretch but "Sending…". The code exists in D1 the moment this responds
 * either way, so there is nothing left for the response to wait on.
 */
export async function POST(req) {
  try {
    if (!isEmailConfigured()) {
      const err = new Error('Sign-in email is not configured yet. An admin needs to set GMAIL_USER and GMAIL_APP_PASSWORD.');
      err.code = 'EMAIL_NOT_CONFIGURED';
      throw err;
    }
    const { email } = await req.json();
    const norm = String(email).trim().toLowerCase();
    const code = await createLoginCode(norm);
    after(async () => {
      try {
        await sendLoginCode(norm, code);
      } catch (e) {
        // Already logged inside sendLoginCode itself; the response this
        // code belonged to is long gone, so there is no one left to tell.
      }
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e.code === 'EMAIL_NOT_CONFIGURED' ? 500 : 400;
    if (status >= 500) console.error('request-code failed', e);
    return NextResponse.json({ error: e.message || 'Could not send a code' }, { status });
  }
}
