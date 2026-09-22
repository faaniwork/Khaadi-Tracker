# Email-code sign-in: a build guide

A passwordless sign-in system. Someone types their email, gets a six-digit
code, types it back, and is in. No passwords, no OAuth, no "verify your
account" link to click, nothing to reset.

This document is a working record of how it was built for one product
(Next.js + Cloudflare D1 + Auth.js v5 + Gmail SMTP), written so it can be
rebuilt on a different stack. It includes the parts that were wrong the
first time and why, because those are the expensive bits to rediscover.

---

## 1. What this is, and what it is not

**It is** an authentication system: it proves someone controls an email
address, then issues them a session.

**It is not** an authorization system. Nothing here decides what anyone is
allowed to do. In the original product a brand-new email signs in
successfully and lands with the lowest role in a separate `access` table;
an admin promotes them later. Keep that separation - it is the single most
important structural decision in this document, and section 7 explains why.

**Who it suits:** internal tools, team boards, client portals, B2B apps,
anything where "can you receive mail at this address" is the real question
and you don't want to run a password database.

**Who it doesn't:** consumer apps at scale (email delivery cost and latency
become the product), anything needing offline sign-in, anything where email
compromise is an unacceptable single point of failure. With this design,
whoever controls the inbox controls the account, permanently. That is the
same property as "forgot password" on almost every site on the internet -
but here it is the front door rather than the back door, so decide
deliberately.

---

## 2. Why not the obvious alternatives

Both of these were tried first. Both failed for reasons that had nothing to
do with the application's own code, which is the kind of failure worth
writing down.

### Not Google / OAuth sign-in

The blocker was Google's own review process, not any code. A Google Cloud
project's OAuth consent screen starts in **Testing** status, which means
Google itself rejects anybody not on a hand-maintained list of test users -
"you do not have access" - no matter what your app does. Moving to
**Production** requires a verification review that takes weeks if your app
touches any restricted scope (Drive, Gmail, and similar).

So: OAuth is excellent if you'll be in review anyway or your scopes are
basic. It cannot serve "anyone with an email address" on day one.

### Not a transactional email API (Resend, Postmark, SendGrid)

These are the right tool and you should use one if you can. The catch is
that every one of them requires a **verified sending domain** before it
will deliver to an arbitrary recipient. Until DNS records are in place,
their default sender typically only reaches the account owner's own
address. If you have DNS access to a domain, spend the hour and do this
properly - deliverability, bounce handling, and rate limits are all better.

If you don't have DNS access (the situation in the original build), Gmail
SMTP works: it sends as a real mailbox to anyone, exactly as if a person
hit "compose", authenticated by an **app password** rather than the
account's real password.

**Gmail SMTP caveats, in full:**

- Requires 2-Step Verification on the account, then an app password from
  Google Account → Security → 2-Step Verification → App passwords.
- Sending limits are real: roughly 500 recipients/day on a consumer
  account, ~2,000 on Google Workspace. Fine for a team tool. Not fine for
  a consumer signup funnel.
- No webhooks, no bounce tracking, no delivery dashboard. You find out a
  code didn't arrive when a person tells you.
- Mail from a personal mailbox is more likely to land in Promotions or
  Spam than from a properly authenticated sending domain.

Treat it as the thing that unblocks launch, with a migration to a real
sending domain on the list.

---

## 3. The shape of the system

Five pieces. Any stack can supply these.

```
  Browser                  Server                        Store      Mail
  ───────                  ──────                        ─────      ────
  1. type email  ────────► POST /api/auth/request-code
                             ├─ validate + cooldown  ──►  read
                             ├─ generate 6-digit code
                             ├─ delete old, insert new ►  write
                             ├─ respond 200 {ok:true}
                             └─ AFTER responding ─────────────────► send
  2. read email ◄──────────────────────────────────────────────────┘
  3. type code   ────────► sign-in / authorize
                             ├─ look up row         ──►  read
                             ├─ expired or maxed? delete, fail
                             ├─ mismatch? attempts++, fail
                             └─ match? delete row, issue session
  4. reload      ────────► server renders as signed in
```

The store needs exactly one table and no cron job - rows are cleaned up as
a side effect of the next request for that email.

---

## 4. The database

```sql
CREATE TABLE IF NOT EXISTS login_codes (
  email      TEXT    NOT NULL,
  code       TEXT    NOT NULL,
  expires_at INTEGER NOT NULL,   -- epoch ms
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0  -- epoch ms, powers the resend cooldown
);

CREATE INDEX IF NOT EXISTS idx_login_codes_email ON login_codes (email);
```

Design notes:

- **Not a unique key on email.** The issue path deletes then inserts, so at
  most one row exists per email in practice. A unique constraint would be
  tighter; see the hardening section.
- **`created_at` exists solely for the resend cooldown.** Without it, a
  double-click issues two codes and the email that arrives first is already
  dead - a genuinely confusing failure that looks like the system is broken.
- **No cleanup job.** Expired rows for an address are deleted the next time
  that address asks for or submits a code. Rows for people who never come
  back do linger; if that offends you, a weekly `DELETE FROM login_codes
  WHERE expires_at < ?` costs nothing.
- **Epoch milliseconds, not SQL timestamps.** Portable across SQLite, D1,
  Postgres, and Redis without timezone questions.

If you'd rather not add a table at all, this fits Redis perfectly:
`SETEX login:<email> 600 <code>` plus an `INCR` for attempts. You lose
nothing but the cooldown timestamp, which you can store in the same value.

---

## 5. The server logic

Two functions. Keep them in your data layer, not in the HTTP handler - the
handler should be boring.

```js
const CODE_TTL_MS         = 10 * 60 * 1000;  // 10 minutes
const MAX_CODE_ATTEMPTS   = 8;
const RESEND_COOLDOWN_MS  = 20 * 1000;

function randomCode() {
  // See the hardening section: use a CSPRNG here, not Math.random().
  // Zero-padded so "012345" is never displayed as "12345" - a code is
  // always exactly six digits, on screen and in the email.
  return String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Issues a fresh code, invalidating any code already pending for this
 * address. Returns the code so the caller can send it; never touches email
 * delivery itself.
 */
export async function createLoginCode(email) {
  const norm = String(email || '').trim().toLowerCase();
  if (!norm || !norm.includes('@')) throw new Error('Enter a real email address.');

  const [existing] = await queryAll(
    'SELECT created_at FROM login_codes WHERE email = ?', [norm]);
  if (existing && Date.now() - Number(existing.created_at) < RESEND_COOLDOWN_MS) {
    throw new Error('A code was just sent - check your email, or wait a few seconds.');
  }

  const code = randomCode();
  await db('DELETE FROM login_codes WHERE email = ?', [norm]);
  await db(
    'INSERT INTO login_codes (email, code, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)',
    [norm, code, Date.now() + CODE_TTL_MS, Date.now()]
  );
  return code;
}

/**
 * Checks a submitted code, consuming it on success (or once it has been
 * guessed wrong too many times) so it can never be replayed.
 */
export async function verifyLoginCode(email, code) {
  const norm  = String(email || '').trim().toLowerCase();
  const clean = String(code  || '').trim();
  if (!norm || !clean) return false;

  const rows = await queryAll(
    'SELECT code, expires_at, attempts FROM login_codes WHERE email = ?', [norm]);
  const row = rows[0];
  if (!row) return false;

  // Expired, or burned through its attempts: delete outright.
  if (Date.now() > Number(row.expires_at) || Number(row.attempts) >= MAX_CODE_ATTEMPTS) {
    await db('DELETE FROM login_codes WHERE email = ?', [norm]);
    return false;
  }

  // Wrong code: count it, but keep the row alive. Someone fat-fingering
  // their own code should not have to request a fresh email over one typo.
  if (String(row.code) !== clean) {
    await db('UPDATE login_codes SET attempts = attempts + 1 WHERE email = ?', [norm]);
    return false;
  }

  // Correct: consume it. Single use, always.
  await db('DELETE FROM login_codes WHERE email = ?', [norm]);
  return true;
}
```

### Why these three numbers

| Constant | Value | Reasoning |
|---|---|---|
| `CODE_TTL_MS` | 10 min | Long enough to switch apps, find the mail, come back. Short enough that a code left in an inbox is not a standing credential. Under 5 minutes generates real support complaints. |
| `MAX_CODE_ATTEMPTS` | 8 | A million possible codes over 8 guesses is a 1-in-125,000 chance per issued code. Generous for typos, useless for brute force. |
| `RESEND_COOLDOWN_MS` | 20 s | Stops a double-click or impatient retry from invalidating the code that is already in flight - the single most confusing failure mode of this whole design. |

### The critical ordering rule

**Delete the row on success before issuing the session.** A code that
survives its own use is a replayable credential sitting in an inbox. Every
exit path from `verifyLoginCode` either consumes the row or increments the
counter - none of them leave it untouched.

---

## 6. Sending the mail without making the user wait

This was the biggest user-visible bug in the original build, and the fix is
the most transferable idea in this document.

A real SMTP handshake - TCP, TLS, AUTH, then the send - routinely took
**10-15 seconds** from a cold serverless instance. The sign-in screen sat
on "Sending…" for that whole stretch with nothing to show for it, and
people clicked the button again, which is exactly what the resend cooldown
then rejected.

The insight: **the response has nothing to wait for.** The code exists in
the database the moment the row is inserted. Whether the email has left the
building yet changes nothing about what the browser should do next, which
is show the "enter your code" screen. So respond immediately and send
afterwards.

```js
import { NextResponse, after } from 'next/server';

export async function POST(req) {
  try {
    // A synchronous, no-network check, so real misconfiguration still
    // fails loudly in the response rather than silently in the background.
    if (!isEmailConfigured()) {
      const err = new Error('Sign-in email is not configured.');
      err.code = 'EMAIL_NOT_CONFIGURED';
      throw err;
    }

    const { email } = await req.json();
    const norm = String(email).trim().toLowerCase();
    const code = await createLoginCode(norm);

    // Runs after the response is already on its way back.
    after(async () => {
      try {
        await sendLoginCode(norm, code);
      } catch (e) {
        // Logged inside the sender; the response is long gone, so there is
        // nobody left to tell.
      }
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const status = e.code === 'EMAIL_NOT_CONFIGURED' ? 500 : 400;
    if (status >= 500) console.error('request-code failed', e);
    return NextResponse.json({ error: e.message || 'Could not send a code' }, { status });
  }
}
```

**Equivalents on other stacks** - the platform must be told to keep the
process alive past the response, or a serverless host will freeze it
mid-send:

| Platform | Mechanism |
|---|---|
| Next.js 15+ | `after()` from `next/server` |
| Vercel (any framework) | `waitUntil()` from `@vercel/functions` |
| Cloudflare Workers | `ctx.waitUntil(promise)` |
| AWS Lambda | Not supported - use SQS/SNS, or accept the latency |
| Long-running Node/Rails/Django | A real job queue (BullMQ, Sidekiq, Celery) |

**Do not** just drop the `await` and return. On a serverless host the
instance is frozen the instant the response is sent and the mail silently
never leaves.

The second, smaller latency fix: **pool the SMTP connection** so a warm
instance reuses one authenticated connection instead of redoing the TLS and
AUTH round trip per send.

```js
let cachedTransporter = null;

function transporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return null;
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user, pass },
      pool: true,
      maxConnections: 1,
    });
  }
  return cachedTransporter;
}

export async function sendLoginCode(email, code) {
  const mailer = transporter();
  if (!mailer) {
    const err = new Error('Sign-in email is not configured.');
    err.code = 'EMAIL_NOT_CONFIGURED';
    throw err;
  }
  await mailer.sendMail({
    from: `<Your product> <${process.env.GMAIL_USER}>`,
    to: email,
    // The code in the subject line: visible in the notification banner and
    // the inbox list, so most people never open the mail at all.
    subject: `${code} is your sign-in code`,
    text: `Your <Your product> sign-in code is ${code}.\n\n`
        + `It expires in 10 minutes. If you didn't ask for this, ignore this email.`,
    html: `<p>Your <Your product> sign-in code is:</p>`
        + `<p style="font-size:28px;font-weight:700;letter-spacing:0.08em">${code}</p>`
        + `<p>It expires in 10 minutes. If you didn't ask for this, ignore this email.</p>`,
  });
}
```

Put the code in the **subject line**. It shows up in the phone's
notification banner and the inbox list, so most people read it without ever
opening the message. This one detail does more for perceived speed than any
backend optimisation.

---

## 7. Issuing the session

The verification step and the session step are separate concerns. In Auth.js
v5 the code slots into a Credentials provider - the provider's only job is
to turn (email, code) into an identity or `null`:

```js
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      id: 'email-code',
      name: 'Email code',
      credentials: {
        email: { label: 'Email', type: 'email' },
        code:  { label: 'Code',  type: 'text'  },
      },
      async authorize(credentials) {
        const email = String(credentials?.email || '').trim().toLowerCase();
        const code  = String(credentials?.code  || '').trim();
        if (!email || !code) return null;
        if (!(await verifyLoginCode(email, code))) return null;
        return { id: email, email, name: email.split('@')[0] };
      },
    }),
  ],
  session: { strategy: 'jwt', maxAge: 90 * 24 * 60 * 60 },
  trustHost: true,
});
```

**Session length deserves a deliberate choice.** The default is 30 days.
This build uses **90**, because signing in is now a genuine "go and check
your email" errand rather than a one-tap account picker. A session that
expires monthly reads as a chore in a way an OAuth session never did.
Longer sessions are the correct trade here; the sign-in cost is higher, so
pay it less often.

### The mistake worth not repeating

The original version also checked an `ALLOWED_EMAIL_DOMAINS` list inside
`authorize()` - inherited from when sign-in was Google-only. The result:
the system **sent a real code to any address that asked**, then rejected
that code at the final step for anyone outside the allowed domains. People
watched a code arrive in their inbox and then got told it was "wrong or
expired." Unfalsifiable from their side, and it looked like a broken
product rather than a closed door.

The rule this produced:

> **Authentication answers "are you who you say you are." Authorization
> answers "are you allowed." Never let the second one masquerade as a
> failure of the first.**

So: anyone can get a code, anyone can sign in, and a separate `access`
table decides what they can see or do. A new email lands as the lowest role
until someone promotes it. If you need to refuse a domain outright, refuse
it at the *request* step with an honest message, not at verification.

### Enumeration

The request endpoint responds identically for a known and an unknown
address. A brand-new email gets a code exactly as an existing one does.
This is the right default - any system that says "no account found" hands
an attacker a free membership oracle. It costs you nothing here because
there is no pre-registration step at all: receiving the code *is* the
registration.

---

## 8. The client

Two steps in one component, with local state for which step you're on.
Full working version in `components/sign-in.jsx` of the original repo; the
details that matter:

```jsx
const [step, setStep] = useState("email");  // "email" | "code"
```

- **`inputMode="numeric"`** on the code field - a phone shows the number pad
  rather than a full keyboard.
- **Strip non-digits and cap length as they type:**
  `e.target.value.replace(/\D/g, "").slice(0, 6)`. Pasting "Code: 123456"
  from the email then just works.
- **Disable submit until `code.length === 6`.** The button cannot be
  pressed in a state that can only fail.
- **Show which address it went to** on the code step, with a "Use a
  different email" link back. Typos in the email are the most common
  failure, and without this the only recovery is a page refresh.
- **One error message for every verification failure:** *"That code is
  wrong or has expired. Check your email, or send a new one."* Do not
  distinguish wrong from expired from consumed - it tells an attacker
  whether an address has a live code pending, and it doesn't change what
  the person in front of you should do next.
- **`autoFocus`** on both fields.
- **Hard reload after success**, not a client-side route push, when the app
  shell reads the session server-side on first render. A soft navigation
  leaves the sign-in screen on screen until the next full load.

Worth adding if you have the time (this build does not have it):
`autoComplete="one-time-code"` on the input lets iOS and Chrome offer the
code straight from the notification.

---

## 9. Hardening for a new product

The original is an internal team board. Some of its choices are too relaxed
for a public product. In rough priority order:

1. **Use a CSPRNG for the code.** The original uses `Math.random()`, which
   is not cryptographically secure - V8's generator is seeded and its
   output is, in principle, predictable from observed values. Replace with
   `crypto.randomInt(0, 1_000_000)` (Node) or `crypto.getRandomValues()`.
   One line, no downside, do it on day one.

2. **Rate-limit by IP, not just by address.** The 20-second cooldown is
   per-email and exists for usability, not defence. Nothing stops a script
   from requesting codes for thousands of addresses and burning your
   sending quota (and your sender reputation). Add an IP-scoped limit at
   the edge - Cloudflare Rate Limiting, Vercel's firewall, or an
   `ip:<addr>` counter in the same store.

3. **Hash the codes at rest.** They're stored in plaintext. They live ten
   minutes, so the exposure is small, but anyone with read access to that
   table can sign in as anyone during that window. `sha256(email + code)`
   is enough here - these are single-use, high-entropy-per-minute secrets,
   not passwords, so bcrypt's cost is not required.

4. **Compare in constant time.** `String(row.code) !== clean` short-circuits
   on the first differing character. The timing signal is minuscule over a
   network, but `crypto.timingSafeEqual` costs nothing.

5. **Add a unique constraint on `email`** and do the issue as a single
   upsert. The current delete-then-insert has a theoretical race under
   concurrent requests for the same address; the cooldown makes it very
   unlikely rather than impossible.

6. **Move to a verified sending domain.** See section 2. This fixes
   deliverability, gives you bounce visibility, and lifts the daily cap.

7. **Log sign-in events.** Address, timestamp, IP, success or failure. You
   will want this the first time someone asks "did anyone else get into my
   account", and it cannot be reconstructed after the fact.

Deliberately *not* on this list: making codes longer, or shortening the
TTL. Both trade real usability for security the attempt counter already
provides.

---

## 10. Porting checklist

1. Create the `login_codes` table (or the Redis equivalent).
2. Port `createLoginCode` / `verifyLoginCode` - pure data-layer functions,
   no framework dependency, translate to any language in twenty minutes.
3. Wire up a mail sender. Prefer a transactional API with a verified
   domain; fall back to SMTP with an app password.
4. Build `POST /request-code`, and make sure the send happens **after** the
   response using your platform's mechanism from section 6.
5. Hook verification into whatever issues your sessions. Auth.js
   Credentials provider, a signed cookie, a JWT - it only needs a boolean.
6. Build the two-step client form, with the details in section 8.
7. Set your env vars in the host, never in the repo:
   `GMAIL_USER`, `GMAIL_APP_PASSWORD` (or your provider's key), plus your
   session secret (`AUTH_SECRET` for Auth.js).
8. Work through section 9 before anyone outside your team uses it.

### Test these specifically

- Code arrives, is typed correctly → in. *(The happy path.)*
- Same code submitted twice → second attempt fails. *(Single use.)*
- Request a code, wait past the TTL, submit → fails with the generic error.
- Wrong code eight times → ninth fails even if correct. *(Counter works.)*
- Two codes requested in a row → the second is refused by the cooldown, and
  the first one still works. *(This is the one people get wrong.)*
- A never-before-seen address → gets a code, signs in, lands with the
  lowest role. *(Enumeration resistance and the auth/authz split.)*
- Request a code and time the HTTP response → should be well under a
  second, regardless of how long the mail itself takes.
- Uppercase and whitespace in the email (`"  Foo@Bar.com "`) → works
  identically to the clean form. *(Everything normalises at every edge.)*

---

## Reference implementation

In the original repo:

| File | Contains |
|---|---|
| `migration/008_login_codes.sql` | Table and index |
| `lib/db.js` | `createLoginCode`, `verifyLoginCode`, the three constants |
| `lib/email.js` | Pooled transporter, `sendLoginCode`, `isEmailConfigured` |
| `app/api/auth/request-code/route.js` | The endpoint, with `after()` |
| `auth.js` | Auth.js Credentials provider and session config |
| `components/sign-in.jsx` | Two-step client form |

Stack it was built on: Next.js 16 (App Router), Auth.js v5 beta,
Cloudflare D1 over the HTTP API, nodemailer 8, deployed on Vercel.
