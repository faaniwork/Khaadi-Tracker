/**
 * Sends the sign-in code by email over Gmail's SMTP relay.
 *
 * Not a transactional email API: those need a verified sending domain
 * before they'll deliver to an arbitrary recipient (Resend's own default
 * sender, for instance, only ever reaches the Resend account's own address
 * until a domain is verified) - a real step with real DNS access this board
 * doesn't have readily available. Gmail SMTP has no such requirement: it
 * sends as a real mailbox to anyone, the same as a person hitting "compose"
 * themselves, using an account-scoped "app password" instead of the
 * account's real password.
 *
 * Required environment variables (set in Vercel, never in this repo):
 *   GMAIL_USER           - the sending mailbox, e.g. affan.khan@imagine.art
 *   GMAIL_APP_PASSWORD   - an app password for it (Google Account →
 *                           Security → 2-Step Verification → App passwords;
 *                           needs 2-Step Verification already on)
 */

import nodemailer from 'nodemailer';

/**
 * A synchronous, no-network check for whether email is even set up at all -
 * for a caller that wants to fail fast on real misconfiguration before
 * responding, while the actual send happens later (see the after() call in
 * app/api/auth/request-code/route.js). Whether Gmail actually accepts the
 * send is a different, later question this can't answer without the
 * network round trip itself.
 */
export function isEmailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

let cachedTransporter = null;

function transporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  // Built once per warm serverless instance rather than per call - creating
  // a transporter is cheap, but there is no reason to redo it for every
  // code sent from the same instance.
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass },
      // Keeps one authenticated connection open across sends on the same
      // warm instance instead of paying for a fresh TLS handshake and
      // AUTH round trip every time - real cost on a cold connection to
      // Gmail, and pure waste to repeat while an instance is already warm.
      pool: true,
      maxConnections: 1,
    });
  }
  return cachedTransporter;
}

export async function sendLoginCode(email, code) {
  const mailer = transporter();
  if (!mailer) {
    const err = new Error(
      'Sign-in email is not configured yet. An admin needs to set GMAIL_USER and GMAIL_APP_PASSWORD.'
    );
    err.code = 'EMAIL_NOT_CONFIGURED';
    throw err;
  }

  try {
    await mailer.sendMail({
      from: `Khaadi Production Board <${process.env.GMAIL_USER}>`,
      to: email,
      subject: `${code} is your sign-in code`,
      text: `Your Khaadi Production Board sign-in code is ${code}.\n\nIt expires in 10 minutes. If you didn't ask for this, ignore this email.`,
      html: `<p>Your Khaadi Production Board sign-in code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:0.08em">${code}</p><p>It expires in 10 minutes. If you didn't ask for this, ignore this email.</p>`,
    });
  } catch (e) {
    console.error('gmail smtp send failed', e?.message || e);
    throw new Error('Could not send the sign-in email. Try again in a moment.');
  }
}
