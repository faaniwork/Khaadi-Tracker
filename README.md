# Khaadi Production Board (Next.js)

Rebuild of the Khaadi × ImagineArt PDP tracker as a real Next.js app — replacing the
Google Apps Script version, which was hitting real ceilings: slow updates, screen
flicker while typing, no audit trail, no access control, and no way to tell whether a
change actually saved.

## What changed vs. the Apps Script version

- **No more flicker / can't-type bug.** The old dashboard re-rendered the entire page
  on every keystroke. This is a real React app — inputs are normal DOM elements that
  React updates surgically, so typing (including the credit amount, which used to be
  click-to-increment only) just works.
- **A real database, not a spreadsheet.** [Cloudflare D1](https://developers.cloudflare.com/d1/)
  (serverless SQLite) is the system of record — no more sheet-as-database quirks
  (rate limits, accidental cell edits, slow range reads). The Google Sheet still
  exists, but only as an on-demand, read-only **export** admins can regenerate from
  the current data with one click — it's an output now, never an input.
- **Every save is visible.** A small dot next to each field shows saving / saved /
  failed — click a failed dot to retry. A header badge summarizes any saves that
  haven't gone through yet, so nothing silently fails to save.
- **Conflict protection.** Edits are sent with the row's last-known update time. If
  someone else changed the same dress in the meantime, you get a warning instead of
  silently overwriting their change.
- **Real audit trail.** Every status/comment/credit/cost/note change is appended to a
  `log` table with who changed what and when.
- **Admin / editor / viewer access control**, backed by real Google sign-in (not a
  self-typed name). Only people listed in the `access` table as `admin` or `editor`
  can make changes; everyone else sees a live, read-only copy. You
  (`affan.khan@imagine.art`) are seeded as the default admin.
- **Bulk "set status for all" now asks for confirmation in a proper dialog** (not a
  browser `confirm()` popup) before applying to every row in a batch/collection.

## Stack

Next.js (App Router, JavaScript), Tailwind CSS v4 with a shadcn/ui-style design
system (OKLCH tokens, `class-variance-authority` component variants), Auth.js v5
(Google OAuth), Cloudflare D1 (via its HTTP API — no Workers runtime needed, so this
runs fine on Vercel), `googleapis` for the optional read-only Sheets export.

## Setup

### 1. Cloudflare D1 database (system of record)

1. In the [Cloudflare dashboard](https://dash.cloudflare.com) → **Storage & databases
   → D1 SQLite Database → Create Database**. Name it anything (e.g.
   `khaadi-production-tracker`).
2. Open its **Console** tab and run the schema in `migration/schema.sql` to create
   the `dresses`, `costs`, `notes`, `access` and `log` tables.
3. If you're migrating from an existing sheet, also run the generated
   `migration/insert_dresses.sql` (and seed the `access` table with your admins).
4. Grab the database's id from its **Overview** tab, and your account id from the
   dashboard URL (`dash.cloudflare.com/<THIS PART>/...`).
5. **Manage account → Account API tokens → Create Token → Custom token**, grant
   **D1 → Edit**, no expiration (or whatever your org's policy is). Copy the token —
   it's shown only once.

### 2. Google OAuth client (sign-in)

1. In [Google Cloud Console](https://console.cloud.google.com), create (or reuse) a
   project → **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → type **Web application**.
2. Add an authorized redirect URI for each place you'll run this:
   - `http://localhost:3000/api/auth/callback/google` (local dev)
   - `https://<your-vercel-domain>/api/auth/callback/google` (production)
3. Copy the **Client ID** and **Client Secret**.

### 3. Environment variables

Copy `.env.example` to `.env.local` and fill in the values from steps 1–2, plus an
`AUTH_SECRET` (`npx auth secret` generates one). Set the same variables in the
Vercel project's **Settings → Environment Variables** for production. The Google
Sheets export variables at the bottom are optional — leave them unset if you don't
need a sheet snapshot.

### 4. Run locally

```bash
npm install
npm run dev
```

### 5. Deploy

Push this repo to GitHub, then import it in [Vercel](https://vercel.com/new) — it
auto-detects Next.js. Add the environment variables from step 3 before the first
deploy (or redeploy after adding them).

## Access control

The `access` table in D1 (`email | role | notes`) gates who can make changes. Add a
row per teammate with role `admin` or `editor` to let them edit; anyone not listed
(or listed as anything else) gets view-only access. `affan.khan@imagine.art` is
seeded as the default admin. Only admins see the "sync to sheet" button in the
header.

## Google Sheet export

If you (or your team) want a spreadsheet copy of the current data — to share, print,
or plug into something else — an admin can click the sheet icon in the header at any
time. It overwrites the `Tracker` / `Costs` / `Notes` tabs of the configured sheet
with a fresh snapshot of what's in D1 right now. Nothing in the app ever reads the
sheet back — editing it directly has no effect and will just be overwritten on the
next sync.
