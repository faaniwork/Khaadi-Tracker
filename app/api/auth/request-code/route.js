import { NextResponse } from 'next/server';
import { createLoginCode } from '@/lib/db';
import { sendLoginCode } from '@/lib/email';

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
 */
export async function POST(req) {
  try {
    const { email } = await req.json();
    const code = await createLoginCode(email);
    await sendLoginCode(String(email).trim().toLowerCase(), code);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e.code === 'EMAIL_NOT_CONFIGURED' ? 500 : 400;
    if (status >= 500) console.error('request-code failed', e);
    return NextResponse.json({ error: e.message || 'Could not send a code' }, { status });
  }
}
