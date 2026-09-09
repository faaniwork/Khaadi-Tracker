# Khaadi Production Board — Handoff

Written 2026-09-09 to be pasted into a fresh Claude Code session.
Live app: https://khaadi-production-tracker.vercel.app
Repo: `faaniwork/Khaadi-Tracker` → auto-deploys to Vercel project
`khaadi-production-tracker` (account `affankhan-6366`) on every push to `main`.

**Nothing is deployed yet.** All the work below is committed locally and
delivered as a git bundle. `origin/main` is still at `d70a067`, the pre-fix
Google-Sheets version. Read "Where things stand" then `DEPLOY.md`.

---

## 1. Read this first: why the last handoff was wrong

The previous handoff described a Cloudflare D1 app and told you to merge a
bundle onto commit `7f3f616`. Neither existed on GitHub. What had actually
happened: a session ran with the user's **home directory** as its working
folder, so the whole app landed loose in `~` (`~/app`, `~/components`,
`~/lib`, `~/migration`) alongside a `~/.git`, and none of it was ever pushed.
`origin/main` was, and still is, a single unrelated commit.

Recovered this session. `~/.git` was moved to
`~/Khaadi-Tracker/_recovered/old-home-git`, which both stopped the home
folder being a git working tree and made the history readable. `git diff`
showed GitHub's `d70a067` and the recovered rebuild commit `5b55ce8` had
**byte-identical trees**, so the two real commits were replanted onto
`d70a067` with `git commit-tree`, giving a clean fast-forward with no force
push.

**Lesson worth keeping:** do not trust a handoff's architecture section.
Check `git log`, `git ls-remote`, and grep for the symbols it claims exist.

---

## 2. Where things stand

Branch `khaadi-d1-deploy`, five commits on top of GitHub's `main`:

```
5aa8ffe  Close authorization holes in the Drive and client review routes
c01ccff  Add Drive file browser, client review by link, Drive resync, UI fixes
293b17c  Document the revisions column in the D1 schema
bb7ab73  Fix theme toggle, sign-in race, batch ordering, completion display;
         add revisions stepper, collection rename, activity log, access mgmt
c803ca2  Migrate data layer from Google Sheets to Cloudflare D1
d70a067  Rebuild as Next.js app          <- origin/main, unchanged
```

62 files changed, ~5,900 insertions against `d70a067`.

Verified: `next build` compiles all 24 routes, `eslint` is clean, and the
recovered trees match `khaadi-fixes.bundle` and `khaadi-next-current.zip`
exactly. The authorization boundary was audited twice by a subagent and the
findings fixed (see section 6).

**Not verified:** none of the Drive code has ever run against real
credentials. This session had no Drive access. That is the biggest open risk.

### Files in `~/Vyro/Claude outputs/`

- `khaadi-d1-deploy.bundle` — the branch above. This is the one to use.
- `DEPLOY.md` — migrations, the Drive sharing step, push commands, checklist.
- `HANDOFF.md` — this file.
- `old-home-git/` is under `~/Khaadi-Tracker/_recovered/` — the only copy of
  the original commit objects. Do not delete until the deploy is verified.
- `khaadi-fixes.bundle`, `APPLY-INSTRUCTIONS.md`, `khaadi-next-current.zip`,
  `deploy.sh` — superseded. `APPLY-INSTRUCTIONS.md` is actively wrong.

---

## 3. Architecture

- **Framework**: Next.js 16 App Router, plain JavaScript, Turbopack.
- **Styling**: Tailwind v4, CSS-first config in `app/globals.css`, OKLCH
  tokens, light/dark via a `data-theme` attribute on `<html>`.
- **Auth**: Auth.js v5, Google OAuth only, `auth.js` at the repo root.
  Optional domain allowlist via `ALLOWED_EMAIL_DOMAINS`. Unknown emails
  default to `viewer`.
- **Data**: Cloudflare D1 over its HTTP API (`lib/db.js`), so it runs on
  Vercel serverless with no Workers runtime.
- **Drive**: `lib/drive.js`, Drive v3 via the **same service account** as the
  Sheets export, with the Drive scope added. No per-user OAuth, no re-consent.
- **Sheet**: `lib/sheetExport.js` is a one-way admin-triggered export. The
  sheet is never read back.
- **Roles**: `admin` / `editor` / `viewer` from the `access` table.

### The one thing to internalise

**`dresses.id` IS the Google Drive folder id of that dress.** Every join
between the board and Drive is free because of this. There is no mapping
table and there does not need to be one.

### D1 tables

```
dresses       id, release, collection, dress, status, files, comments,
              credits, revisions, archived, updated_by, updated_at
costs         scope, key, value
notes         id, release, text, by, at
access        email, role, notes
log           id, at, by, scope, field, old_value, new_value
file_reviews  file_id, dress_id, release, file_name, review_status,
              feedback_reason, feedback_text, reviewed_by, reviewed_at
review_links  token, release, label, created_by, created_at, revoked_at
release_sync  release, synced_at, synced_by, summary
profiles      email, display_name, avatar, updated_at
```

`migration/schema.sql` is the full current schema. `002`–`005` are the
incremental files for the live database.

### Key files

```
auth.js                          NextAuth config
lib/db.js                        all D1 reads/writes, role checks, guards
lib/drive.js                     Drive v3: list, upload, trash, moves,
                                 containment checks, id validation
lib/driveSync.js                 walks a batch's Drive tree for resync
lib/reviewAuth.js                THE auth boundary for every /api/drive route
lib/sheetExport.js               one-way D1 → Sheet export
lib/constants.js                 statuses, RELEASE_LINKS, COLLECTION_LINKS,
                                 sortReleasesByRecency, DRESS_FOLDER_PATTERN
lib/api.js                       client-side fetch wrappers
components/dashboard.jsx         root client component, all state
components/dashboard/files.jsx   per-dress Drive file browser
components/dashboard/activity.jsx    colour-coded activity timeline
components/dashboard/review-links.jsx  admin: mint/revoke client links
components/dashboard/profile-dialog.jsx
components/files/file-tile.jsx   one Drive item, with review controls
components/files/reject-dialog.jsx     reason + note capture
components/files/dropzone.jsx    drag-and-drop upload
components/review/review-board.jsx     the public client review view
components/ui/{avatar,logo,ring,stepper,button,input,...}.jsx
app/review/[token]/page.jsx      public, no sign-in, noindex, force-dynamic
app/api/drive/{list,thumb,upload,folder,file,review,resync}/route.js
app/api/review/{batch,session}/route.js
app/api/review-links/route.js
app/api/profile/route.js
migration/*.sql
public/khaadi-tracker-logo{,-dark}.png
```

### Environment variables

Already set in Vercel, names only:
`CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, `CLOUDFLARE_API_TOKEN`,
`AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_SECRET`, `ALLOWED_EMAIL_DOMAINS`,
`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_SERVICE_ACCOUNT_KEY`, `GOOGLE_SHEET_ID`.

**No new variables were added.** The Drive work reuses the service account.

---

## 4. What shipped in commit c01ccff

### Drive as the front end

Per-dress file browser reached by clicking a dress's file count. Thumbnail
grid, drag-and-drop upload with progress, create-subfolder, open-in-Drive,
and trash for editors and admins.

Three decisions worth knowing:

- **Deletion trashes, it does not destroy.** These are client deliverables
  and a mis-click in a thumbnail grid is easy. `files.update {trashed:true}`
  leaves every listing here at once and stays restorable from Drive for 30
  days.
- **Thumbnails stream through `/api/drive/thumb`.** Drive's own
  `thumbnailLink` cannot be used in an `<img>`: those URLs are short-lived
  and only resolve for a caller Google considers authorized, and viewers are
  authorized to this app, not to the file.
- **`file_reviews` is NOT a mirror of Drive.** The original plan had a row
  per file inserted on upload. The team adds and removes files in Drive all
  day, so that drifts both ways and needs a reconciler nobody asked for.
  Drive is the source of truth for which files exist; D1 stores only the
  decision, keyed by Drive file id. A file with no row is pending.

### Client review by link

Per-batch tokens at `/review/<token>`, no Google sign-in. Admins mint and
revoke them per client from the batch page; a revoked link is kept, not
deleted, so the audit trail still explains who reviewed what.

Rejecting requires a reason (Accuracy / Pose / Something else, the last
needing a note) and moves the image into a `Rejected` subfolder created on
first use. Approving something previously rejected moves it back out.
Rejected files are folded back into the listing rather than vanishing, which
is what makes a decision reversible.

The reviewer types a name once. It is **self-asserted and unverifiable**, so
it is always suffixed `(via <label> link)` in the log.

### Board follows Drive

`/api/drive/resync` per batch picks up collection and dress folder renames,
moves between collections, new folders, and refreshed file counts.

**Whether a folder counts as a dress is one rule**, `DRESS_FOLDER_PATTERN`
in `lib/constants.js`: the name must contain "dress". That is what makes
renaming "Flat dress v2" to "Flats" drop the Sep 2 batch from 13 dresses to
12. If a batch ever uses a different convention, change it there and resync.

Folders that stop qualifying are **archived, not deleted**: hidden and out of
every count, but status, comments, credits and revisions survive, and
renaming the folder back restores them. Resync never writes those fields.

Manual, not on the 15-second poll: a batch is dozens of Drive calls.

### UI fixes from the user's feedback

- Activity and Access icons were invisible. `globals.css` lifted only `span`
  above the ring's inner `::before` disc, and those icons are a bare `<svg>`.
  Both also moved out of the batch column, where they read as two more
  batches.
- A fully discarded batch and a batch at 0% delivered looked identical. The
  discarded one is now red with a slash; a 0% ring shows no bare "0".
- Removed the redundant "Complete" badge, and the bulk status confirmation
  along with its warning styling.
- Activity is colour-coded by kind of change, grouped by day, filterable, and
  no longer renders costs as "32032423.0".
- Shared profile pictures. The **browser** resizes to 160×160 JPEG before
  upload, so what is stored is a few KB of data URL: no bucket, no Drive
  folder to share, no expiring URLs, no image library on the server.
- The Khaadi Tracker wordmark replaces the gradient "K", in two files because
  the artwork's black wordmark disappears on the dark theme.

---

## 5. The auth boundary — read before touching any /api/drive route

`lib/reviewAuth.js` is the single boundary. There are exactly two callers:

- **`user`** — a signed-in Google account. Powers come from `access`.
- **`token`** — an external client with a per-batch review link. Can ONLY
  read files and record decisions, ONLY inside its own batch.

Rules that must not regress:

1. Routes never read the token themselves. They call `resolveCaller` once,
   then assert with `assertCanWriteFiles`, `assertIsAdmin`,
   `assertDressInScope`.
2. `assertDressInScope` constrains the **dress**. `assertFileInDress` in
   `lib/drive.js` constrains the **file** — it rejects folders, rejects
   trashed files, and requires the file to be inside the dress at any depth
   via `isWithinDress` (walks up, bounded to 5 hops).
3. **Every id that reaches a Drive `q` string goes through `assertDriveId`.**
   Without it a crafted `folderId` rewrites the query and enumerates
   everything the service account can see.
4. Out-of-scope is reported as **404, never 403**, so probing reveals
   nothing. Unknown and revoked tokens are indistinguishable.
5. Validate before mutating Drive. The order in the review route is
   authorise → dress scope → file scope → validate → move → write.
6. `POST /api/review/session` mints a credential cookie from an
   unauthenticated body, so it **must** keep its same-origin check.

---

## 6. Audit findings already fixed (do not reintroduce)

A subagent audited the boundary twice. Fixed:

- **Critical**: the review route scoped `dressId` but not `fileId`, and
  `moveToRejected` removed every parent. A link holder could re-parent any
  object the service account could see; with a dress folder id it detached a
  whole dress from its collection, after which resync archived it off the
  board.
- The Drive move ran before validation, so an invalid decision moved the file
  then failed, leaving no audit entry.
- Raw folder ids in Drive `q` strings, exploitable by any signed-in account.
- `/api/drive/thumb` never checked the file belonged to the dress.
- Upload, create-folder, trash and list all accepted an arbitrary folder id.
- The `Rejected` subfolder was cached for the process lifetime, so a folder
  trashed in Drive was still used as a move target, leaving images parented
  only to a trashed folder. Concurrent first rejections can still create
  duplicates, so listings and containment now cover **all** `Rejected`
  folders and `ensureSubfolder` re-reads to settle on one winner.
- Review token travelled in every thumbnail URL. Now exchanged once for an
  httpOnly SameSite=Lax cookie.
- Profile pictures were first-claim: an account renamed to an editor's Google
  display name could take over that editor's face in Activity. A contested
  name now resolves to the single editor or admin holding it, and to nobody
  when ambiguous. The first attempt blocked the second claimant, which was a
  denial of service on whoever was legitimately second.
- A first fix compared only against the dress folder and its `Rejected`
  child, which broke subfolder browsing: no thumbnails, no approve, no trash
  for anything in a subfolder, buttons still rendered. `isWithinDress` fixed
  it without widening the boundary.

---

## 7. Known gaps and next steps

Ranked.

1. **Deploy it.** Follow `DEPLOY.md`. Migrations 003/004/005 must run
   **before** the push: `getBoardData` filters on `dresses.archived`, so
   without 004 every board read fails and the app shows nothing.
2. **Share the batch root folders with the service account** as Editor. Until
   then every Drive call answers 404, because an unshared file does not exist
   to that account. The error message says so.
3. **Exercise the Drive paths for real.** Upload, trash, resync, a review
   link end to end. This is the untested half.
4. **No rate limiting on the public review routes.** `/review/<token>`,
   `/api/review/session`, `/api/review/batch`, `/api/drive/review` are
   reachable without a session. Tokens are 128 bits so guessing is not the
   concern; hammering them and spending Drive quota is.
5. **Batch roots are hardcoded** in `RELEASE_LINKS` in `lib/constants.js`. A
   new batch needs a line there before resync finds it, or pass its folder id
   with the resync request. Worth moving into D1.
6. **Resync is manual per batch.** Fine for now. If it should be automatic,
   a scheduled job is the right shape, not the 15-second poll.
7. **Activity matches log entries to avatars by display name**, because `log`
   records a name, not an email. Adding `log.by_email` would remove the
   collision handling entirely.
8. The `AGENTS.md` in the repo (pulled in by `CLAUDE.md`) is written by
   `next dev` and tells agents to read `node_modules/next/dist/docs/`. Not
   malicious, just noise; flagged twice by the auditor.

---

## 8. Working notes for the next session

- **This session could not push.** The git proxy refuses to inject
  credentials for `faaniwork/Khaadi-Tracker` and there is no tool to add it,
  so everything ships as a bundle the user applies. Check whether your
  session can push before planning around it.
- **`next build` fails on fonts in a sandbox.** `app/layout.js` uses
  `next/font/google` and `fonts.googleapis.com` is blocked by org egress
  policy (403 at the gateway). To verify a build, stub the three font imports
  locally, build, then revert the stub. Do not commit the stub. Vercel
  reaches Google Fonts fine.
- **Lint is clean; keep it that way.** Next 16 enforces
  `react-hooks/set-state-in-effect`. The pattern this repo uses: never set
  state synchronously in an effect body, set it only in a promise's
  `then`/`catch`, and use `null` state as the loading flag. Copy
  `components/dashboard/activity.jsx`. There is one justified
  `eslint-disable` in `review-board.jsx` for the localStorage read, which
  genuinely needs a post-mount render.
- **The user's preferences**: no em dashes; deliverables go in
  `~/Vyro/Claude outputs`; image and video prompts always in copy-pastable
  code blocks.
- Local checkout is `~/Khaadi-Tracker`, currently on `main` with the scratch
  branches from this session still present. `DEPLOY.md` step 3 cleans them
  up, and deliberately excludes `_recovered`.
