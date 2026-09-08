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
- **Every save is visible.** A small dot next to each field shows saving / saved /
  failed — click a failed dot to retry. A header badge summarizes any saves that
  haven't gone through yet, so nothing silently fails to save.
- **Conflict protection.** Edits are sent with the row's last-known update time. If
  someone else changed the same dress in the meantime, you get a warning instead of
  silently overwriting their change.
- **Real audit trail.** Every status/comment/credit/cost/note change is appended to a
  `Log` tab in the sheet with who changed what and when.
- **Admin / editor / viewer access control**, backed by real Google sign-in (not a
  self-typed name). Only people listed in the sheet's `Access` tab as `admin` or
  `editor` can make changes; everyone else sees a live, read-only copy. You
  (`affan.khan@imagine.art`) are seeded as the default admin.
- **Bulk "set status for all" now asks for confirmation in a proper dialog** (not a
  browser `confirm()` popup) before applying to every row in a batch/collection.

The Google Sheet stays the system of record — this app talks to it through the
Sheets API with a service account instead of running inside Apps Script.

## Stack

Next.js (App Router, JavaScript), Tailwind CSS v4 with a shadcn/ui-style design
system (OKLCH tokens, `class-variance-authority` component variants), Auth.js v5
(Google OAuth), `googleapis` for the Sheets API.

## Setup

### 1. Google service account (reads/writes the sheet)

1. In [Google Cloud Console](https://console.cloud.google.com), create (or reuse) a
   project → **APIs & Services → Library** → enable the **Google Sheets API**.
2. **APIs & Services → Credentials → Create Credentials → Service Account.** Give it
   any name, no roles needed.
3. Open the new service account → **Keys → Add Key → JSON**. This downloads a JSON
   file — you need its `client_email` and `private_key` values.
4. Open the actual Tracker Google Sheet → **Share** → paste the service account's
   `client_email` → give it **Editor** access.
5. Copy the sheet's ID out of its URL (`.../d/<THIS PART>/edit`).

### 2. Google OAuth client (sign-in)

1. In the same Cloud project → **APIs & Services → Credentials → Create Credentials
   → OAuth client ID** → type **Web application**.
2. Add an authorized redirect URI for each place you'll run this:
   - `http://localhost:3000/api/auth/callback/google` (local dev)
   - `https://<your-vercel-domain>/api/auth/callback/google` (production)
3. Copy the **Client ID** and **Client Secret**.

### 3. Environment variables

Copy `.env.example` to `.env.local` and fill in the values from steps 1–2, plus an
`AUTH_SECRET` (`npx auth secret` generates one). Set the same variables in the
Vercel project's **Settings → Environment Variables** for production.

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

The sheet gets an `Access` tab automatically (columns `Email | Role | Notes`) the
first time the app loads data. Add a row per teammate with role `admin` or `editor`
to let them make changes — anyone not listed (or listed as anything else) gets
view-only access. `affan.khan@imagine.art` is seeded as the default admin.
