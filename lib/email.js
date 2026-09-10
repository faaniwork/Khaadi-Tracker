/**
 * Sends the sign-in code by email via Resend's HTTP API.
 *
 * No SDK - it's one endpoint and one call, and a raw fetch keeps this file
 * dependency-free the same way the rest of this app's API clients are.
 *
 * Required environment variable:
 *   RESEND_API_KEY   - from resend.com, set in Vercel (never in this repo)
 *
 * RESEND_FROM is optional and defaults to Resend's own shared sending
 * domain, which works for any recipient with zero setup - a real sending
 * domain only needs to be verified later if the board wants its own address
 * in the From line instead of Resend's.
 */

const DEFAULT_FROM = 'Khaadi Production Board <onboarding@resend.dev>';

export async function sendLoginCode(email, code) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    const err = new Error(
      'Sign-in email is not configured yet. An admin needs to set RESEND_API_KEY.'
    );
    err.code = 'EMAIL_NOT_CONFIGURED';
    throw err;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || DEFAULT_FROM,
      to: [email],
      subject: `${code} is your sign-in code`,
      text: `Your Khaadi Production Board sign-in code is ${code}.\n\nIt expires in 10 minutes. If you didn't ask for this, ignore this email.`,
      html: `<p>Your Khaadi Production Board sign-in code is:</p><p style="font-size:28px;font-weight:700;letter-spacing:0.08em">${code}</p><p>It expires in 10 minutes. If you didn't ask for this, ignore this email.</p>`,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('resend send failed', res.status, body.slice(0, 300));
    throw new Error('Could not send the sign-in email. Try again in a moment.');
  }
}
