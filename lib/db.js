/**
 * Cloudflare D1 data layer for the Khaadi Production Board.
 *
 * Replaces the old Google Sheets data layer (lib/sheets.js). The sheet is no
 * longer the system of record — D1 is — but the sheet can still be generated
 * as a read-only, on-demand export of this data (see lib/sheetExport.js).
 *
 * Talks to D1 over Cloudflare's HTTP API (no Workers runtime needed, so this
 * works fine from Vercel serverless/edge functions):
 *   POST https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{db}/query
 *
 * Required environment variables (set these in Vercel / .env.local):
 *   CLOUDFLARE_ACCOUNT_ID       - Cloudflare account id
 *   CLOUDFLARE_D1_DATABASE_ID   - the D1 database's id
 *   CLOUDFLARE_API_TOKEN        - API token with D1 "Edit" permission
 *
 * D1 schema (see migration/schema.sql):
 *   dresses (id, release, collection, dress, status, files, comments,
 *            credits, updated_by, updated_at)
 *   costs   (scope, key, value)
 *   notes   (id, release, text, by, at)
 *   access  (email, role, notes)
 *   log     (id, at, by, scope, field, old_value, new_value)
 *   file_reviews (file_id, dress_id, release, file_name, review_status,
 *            feedback_reason, feedback_text, reviewed_by, reviewed_at)
 *   review_links (token, release, label, created_by, created_at, revoked_at)
 */

export const DEFAULT_ADMIN_EMAIL = 'affan.khan@imagine.art';

function config() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !databaseId || !apiToken) {
    throw new Error(
      'Missing CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_D1_DATABASE_ID / CLOUDFLARE_API_TOKEN environment variables.'
    );
  }
  return { accountId, databaseId, apiToken };
}

/**
 * Runs a single SQL statement against D1 and returns the raw per-statement
 * result object: { results, meta, success }.
 */
async function d1(sql, params = []) {
  const { accountId, databaseId, apiToken } = config();
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sql, params }),
    }
  );
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || !json.success) {
    const msg = json?.errors?.[0]?.message || `D1 request failed (${res.status})`;
    throw new Error(msg);
  }
  const result = json.result?.[0];
  if (!result || result.success === false) {
    throw new Error(result?.error || 'D1 query failed');
  }
  return result;
}

async function queryAll(sql, params = []) {
  const r = await d1(sql, params);
  return r.results || [];
}

async function logChange(by, scope, field, oldVal, newVal) {
  try {
    await d1(
      'INSERT INTO log (at, by, scope, field, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?)',
      [Date.now(), by || 'Someone', scope, field, oldVal ?? '', newVal ?? '']
    );
  } catch (e) {
    // Logging should never block a real save.
    console.error('log insert failed', e);
  }
}

export async function getMyRole(email) {
  const norm = (email || '').toLowerCase();
  if (!norm) return 'viewer';
  const rows = await queryAll('SELECT role FROM access WHERE lower(email) = ?', [norm]);
  if (!rows.length) return 'viewer';
  const role = String(rows[0].role || 'viewer').toLowerCase();
  return role === 'admin' || role === 'editor' ? role : 'viewer';
}

function requireEditor(role) {
  if (role !== 'admin' && role !== 'editor') {
    const err = new Error(
      `VIEW_ONLY: You have view-only access on this board. Ask ${DEFAULT_ADMIN_EMAIL} to add you to the access table as an editor.`
    );
    err.code = 'VIEW_ONLY';
    throw err;
  }
}

export async function getBoardData(email) {
  // archived = 0 keeps folders that are no longer dresses (renamed in Drive
  // to something like "Flats") out of the board and out of every count,
  // without destroying their history. See migration/004_drive_resync.sql.
  const dressRows = await queryAll(
    'SELECT id, release, collection, dress, status, files, comments, credits, revisions, updated_by, updated_at FROM dresses WHERE archived = 0'
  );
  const rows = dressRows.map((r) => ({
    id: String(r.id),
    release: String(r.release || ''),
    collection: String(r.collection || ''),
    dress: String(r.dress || ''),
    status: r.status || 'Not Started',
    files: r.files != null ? Number(r.files) : null,
    comments: r.comments || '',
    credits: r.credits ? Number(r.credits) : 0,
    revisions: r.revisions != null ? Number(r.revisions) : 1,
    updatedBy: r.updated_by || '',
    updatedAt: r.updated_at ? Number(r.updated_at) : null,
  }));

  const costRows = await queryAll('SELECT scope, key, value FROM costs');
  const costs = { batches: {}, collections: {} };
  costRows.forEach((r) => {
    if (!r.key) return;
    if (r.scope === 'release') costs.batches[r.key] = Number(r.value) || 0;
    else if (r.scope === 'collection') costs.collections[r.key] = Number(r.value) || 0;
  });

  const noteRows = await queryAll('SELECT id, release, text, by, at FROM notes ORDER BY at ASC');
  const notes = { batches: {} };
  noteRows.forEach((r) => {
    if (!r.text) return;
    if (!notes.batches[r.release]) notes.batches[r.release] = [];
    notes.batches[r.release].push({
      id: String(r.id),
      text: String(r.text),
      by: String(r.by || ''),
      at: Number(r.at) || 0,
    });
  });

  const role = await getMyRole(email);
  const driveSync = await getReleaseSyncMap();

  return { rows, costs, notes, syncedAt: Date.now(), role, email: email || '', driveSync };
}

const FIELD_COLS = { status: 'status', comments: 'comments', credits: 'credits', revisions: 'revisions' };

export async function updateDressField({ email, folderId, field, value, by, expectedUpdatedAt }) {
  const role = await getMyRole(email);
  requireEditor(role);
  const col = FIELD_COLS[field];
  if (!col) throw new Error('Unknown field ' + field);

  const rows = await queryAll(
    `SELECT ${col} as val, updated_at, updated_by FROM dresses WHERE id = ?`,
    [folderId]
  );
  if (!rows.length) throw new Error('Row not found for folder ' + folderId);
  const current = rows[0];

  if (
    expectedUpdatedAt != null &&
    current.updated_at &&
    Number(current.updated_at) !== Number(expectedUpdatedAt)
  ) {
    return {
      conflict: true,
      field,
      current: {
        value: current.val ?? '',
        updatedBy: current.updated_by ?? '',
        updatedAt: Number(current.updated_at),
      },
    };
  }

  const oldVal = current.val ?? '';
  let newVal = value;
  if (field === 'credits') newVal = Number(value) || 0;
  else if (field === 'revisions') newVal = Math.max(1, Math.min(9, Number(value) || 1));
  const now = Date.now();

  await d1(`UPDATE dresses SET ${col} = ?, updated_by = ?, updated_at = ? WHERE id = ?`, [
    newVal,
    by || 'Someone',
    now,
    folderId,
  ]);
  await logChange(by, 'row:' + folderId, field, oldVal, newVal);

  return { conflict: false, updatedAt: now };
}

export async function bulkSetStatus({ email, folderIds, status, by }) {
  const role = await getMyRole(email);
  requireEditor(role);
  const now = Date.now();
  let changed = 0;
  for (const id of folderIds) {
    const r = await d1('UPDATE dresses SET status = ?, updated_by = ?, updated_at = ? WHERE id = ?', [
      status,
      by || 'Someone',
      now,
      id,
    ]);
    if (r.meta?.changes) changed++;
  }
  await logChange(by, `bulk:${changed} rows`, 'status', '', status);
  return { conflict: false, updatedAt: now, changed };
}

export async function updateCost({ email, scope, key, value, by }) {
  const role = await getMyRole(email);
  requireEditor(role);
  const rows = await queryAll('SELECT value FROM costs WHERE scope = ? AND key = ?', [scope, key]);
  const oldVal = rows.length ? rows[0].value : 0;
  const newVal = Number(value) || 0;
  await d1(
    'INSERT INTO costs (scope, key, value) VALUES (?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value',
    [scope, key, newVal]
  );
  await logChange(by, `cost:${scope}:${key}`, 'cost', oldVal, newVal);
  return true;
}

export async function addNote({ email, release, text, by }) {
  const role = await getMyRole(email);
  requireEditor(role);
  const id = 'n' + Date.now() + Math.random().toString(36).slice(2, 7);
  await d1('INSERT INTO notes (id, release, text, by, at) VALUES (?, ?, ?, ?, ?)', [
    id,
    release,
    text,
    by || 'Someone',
    Date.now(),
  ]);
  await logChange(by, 'note:' + release, 'note', '', text);
  return true;
}

// Renames a collection across every dress row that carries it. There is no
// live link to the actual Google Drive folder name (see COLLECTION_LINKS in
// lib/constants.js) — this only renames the label stored in D1, which is
// what the board displays. Scoped to a single release so renaming a
// collection in one batch never touches a same-named collection elsewhere.
export async function renameCollection({ email, release, oldName, newName, by }) {
  const role = await getMyRole(email);
  requireEditor(role);
  const trimmed = String(newName || '').trim();
  if (!trimmed) throw new Error('New collection name cannot be empty');
  if (trimmed === oldName) return { changed: 0 };
  const now = Date.now();
  const result = await d1(
    'UPDATE dresses SET collection = ?, updated_by = ?, updated_at = ? WHERE release = ? AND collection = ?',
    [trimmed, by || 'Someone', now, release, oldName]
  );
  const changed = result.meta?.changes || 0;
  if (changed) {
    // Carry any per-collection cost row over to the new name so it isn't
    // silently orphaned under the old key.
    const oldCost = await queryAll('SELECT value FROM costs WHERE scope = ? AND key = ?', ['collection', oldName]);
    if (oldCost.length) {
      await d1(
        'INSERT INTO costs (scope, key, value) VALUES (?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value',
        ['collection', trimmed, oldCost[0].value]
      );
      await d1('DELETE FROM costs WHERE scope = ? AND key = ?', ['collection', oldName]);
    }
  }
  await logChange(by, `collection:${release}`, 'rename', oldName, trimmed);
  return { changed };
}

// ---------- activity log ----------

export async function getActivityLog(limit = 200) {
  const rows = await queryAll(
    'SELECT id, at, by, scope, field, old_value, new_value FROM log ORDER BY at DESC LIMIT ?',
    [Math.max(1, Math.min(500, Number(limit) || 200))]
  );
  return rows.map((r) => ({
    id: r.id,
    at: Number(r.at) || 0,
    by: r.by || 'Someone',
    scope: r.scope || '',
    field: r.field || '',
    oldValue: r.old_value ?? '',
    newValue: r.new_value ?? '',
  }));
}

// ---------- access management (admin only) ----------

function requireAdmin(role) {
  if (role !== 'admin') {
    const err = new Error('ADMIN_ONLY: Only admins can manage access.');
    err.code = 'ADMIN_ONLY';
    throw err;
  }
}

export async function getAccessList(email) {
  const role = await getMyRole(email);
  requireAdmin(role);
  const rows = await queryAll('SELECT email, role, notes FROM access ORDER BY email ASC');
  return rows.map((r) => ({ email: r.email, role: r.role || 'viewer', notes: r.notes || '' }));
}

export async function upsertAccess({ email, targetEmail, role: targetRole, notes, by }) {
  const role = await getMyRole(email);
  requireAdmin(role);
  const norm = String(targetEmail || '').trim().toLowerCase();
  if (!norm) throw new Error('Email is required');
  const nextRole = ['admin', 'editor', 'viewer'].includes(targetRole) ? targetRole : 'viewer';
  const existing = await queryAll('SELECT role FROM access WHERE email = ?', [norm]);
  await d1(
    'INSERT INTO access (email, role, notes) VALUES (?, ?, ?) ON CONFLICT(email) DO UPDATE SET role = excluded.role, notes = excluded.notes',
    [norm, nextRole, notes || '']
  );
  await logChange(by, 'access:' + norm, 'role', existing.length ? existing[0].role : '(new)', nextRole);
  return { email: norm, role: nextRole, notes: notes || '' };
}

export async function removeAccess({ email, targetEmail, by }) {
  const role = await getMyRole(email);
  requireAdmin(role);
  const norm = String(targetEmail || '').trim().toLowerCase();
  if (norm === String(email || '').trim().toLowerCase()) {
    throw new Error("You can't remove your own access.");
  }
  await d1('DELETE FROM access WHERE email = ?', [norm]);
  await logChange(by, 'access:' + norm, 'role', '', '(removed)');
  return true;
}

// ---------- guards reusable from API routes ----------

// Lets the Drive routes write into the same log table the Activity tab
// reads, so file actions sit in one timeline with board edits.
export async function recordLog({ by, scope, field, oldValue, newValue }) {
  await logChange(by, scope, field, oldValue, newValue);
}

export async function assertCanEdit(email) {
  const role = await getMyRole(email);
  requireEditor(role);
  return role;
}

export async function assertAdmin(email) {
  const role = await getMyRole(email);
  requireAdmin(role);
  return role;
}

// ---------- dress lookups for the Drive file browser ----------

// A dress row's id IS its Google Drive folder id, so this doubles as
// "which batch does this Drive folder belong to", which is what scopes a
// client review token to the batch it was issued for.
export async function getDress(dressId) {
  const rows = await queryAll(
    'SELECT id, release, collection, dress, archived FROM dresses WHERE id = ?',
    [dressId]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: String(r.id),
    release: String(r.release || ''),
    collection: String(r.collection || ''),
    dress: String(r.dress || ''),
    archived: Number(r.archived) === 1,
  };
}

// ---------- shared profile pictures ----------

// Roughly 90 KB of data: URL, which a 160x160 JPEG comes nowhere near. The
// browser resizes before sending; this is the backstop for a client that
// does not.
const MAX_AVATAR_CHARS = 90_000;

export async function getProfiles() {
  try {
    const [rows, accessRows] = await Promise.all([
      queryAll('SELECT email, display_name, avatar, updated_at FROM profiles'),
      queryAll('SELECT email, role FROM access'),
    ]);
    const trusted = new Set(
      accessRows
        .filter((a) => ['admin', 'editor'].includes(String(a.role || '').toLowerCase()))
        .map((a) => String(a.email || '').toLowerCase())
    );

    const byEmail = {};
    const claims = {};
    rows.forEach((r) => {
      const entry = {
        email: String(r.email),
        name: String(r.display_name || ''),
        avatar: String(r.avatar || ''),
        updatedAt: Number(r.updated_at) || 0,
      };
      byEmail[entry.email] = entry;
      if (entry.name) (claims[entry.name] = claims[entry.name] || []).push(entry);
    });

    // The log records an author's NAME, not their email, so Activity needs a
    // name lookup. Two accounts can end up with the same Google display name,
    // and whoever set a picture first would otherwise wear the other's face.
    // A name held by exactly one editor or admin resolves to them; anything
    // still ambiguous resolves to nobody, so Activity falls back to initials
    // rather than showing a face that might be the wrong person.
    const byName = {};
    Object.entries(claims).forEach(([name, entries]) => {
      if (entries.length === 1) {
        byName[name] = entries[0];
        return;
      }
      const trustedEntries = entries.filter((e) => trusted.has(e.email.toLowerCase()));
      if (trustedEntries.length === 1) byName[name] = trustedEntries[0];
    });

    return { byEmail, byName };
  } catch (e) {
    // A database without migration/005 should still serve the board.
    console.error('profiles read failed (has migration 005 been applied?)', e);
    return { byEmail: {}, byName: {} };
  }
}

export async function upsertProfile({ email, displayName, avatar }) {
  const norm = String(email || '').trim().toLowerCase();
  if (!norm) throw new Error('Not signed in');

  const value = String(avatar || '');
  if (value && !/^data:image\/(png|jpeg|webp);base64,/.test(value)) {
    throw new Error('That does not look like an image.');
  }
  if (value.length > MAX_AVATAR_CHARS) {
    throw new Error('That picture is too large even after resizing. Try a smaller one.');
  }

  const name = String(displayName || '').trim();
  const now = Date.now();
  await d1(
    `INSERT INTO profiles (email, display_name, avatar, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET display_name = excluded.display_name, avatar = excluded.avatar, updated_at = excluded.updated_at`,
    [norm, name, value, now]
  );
  await logChange(name || norm, 'profile:' + norm, 'picture', '', value ? 'updated' : 'removed');
  return { email: norm, name, avatar: value, updatedAt: now };
}

// ---------- reconciling the board against Drive ----------

export async function getReleaseSyncMap() {
  try {
    const rows = await queryAll('SELECT release, synced_at, synced_by, summary FROM release_sync');
    const map = {};
    rows.forEach((r) => {
      map[String(r.release)] = {
        at: Number(r.synced_at) || 0,
        by: String(r.synced_by || ''),
        summary: String(r.summary || ''),
      };
    });
    return map;
  } catch (e) {
    // A database that has not had migration/004 applied yet should still
    // serve the board rather than failing the whole request.
    console.error('release_sync read failed (has migration 004 been applied?)', e);
    return {};
  }
}

/**
 * Reconciles one batch's rows against what Drive actually contains.
 *
 * `seen` is the list of dress folders Drive reported for this batch, each
 * { id, collection, dress, files }. Anything on the board for this release
 * that is not in that list gets archived rather than deleted.
 *
 * Only the columns that describe the FOLDER are touched: collection, dress
 * name and file count. Status, comments, credits and revisions are the
 * team's data about the dress, never Drive's, so a resync never overwrites
 * them.
 */
export async function applyDriveResync({ email, release, seen, by }) {
  await assertCanEdit(email);

  const existing = await queryAll(
    'SELECT id, collection, dress, files, archived FROM dresses WHERE release = ?',
    [release]
  );
  const existingById = new Map(existing.map((r) => [String(r.id), r]));
  const seenIds = new Set(seen.map((s) => s.id));

  const summary = { added: 0, renamed: 0, recounted: 0, movedCollection: 0, archived: 0, restored: 0 };
  const changes = [];
  const now = Date.now();

  for (const folder of seen) {
    const prev = existingById.get(folder.id);
    if (!prev) {
      await d1(
        `INSERT INTO dresses (id, release, collection, dress, status, files, comments, credits, revisions, archived, updated_by, updated_at)
         VALUES (?, ?, ?, ?, 'Not Started', ?, '', 0, 1, 0, ?, ?)`,
        [folder.id, release, folder.collection, folder.dress, folder.files, by || 'Drive resync', now]
      );
      summary.added++;
      changes.push({ scope: `row:${folder.id}`, field: 'added from Drive', from: '', to: `${folder.collection} / ${folder.dress}` });
      continue;
    }

    const sets = [];
    const params = [];

    if (String(prev.dress || '') !== folder.dress) {
      sets.push('dress = ?');
      params.push(folder.dress);
      summary.renamed++;
      changes.push({ scope: `row:${folder.id}`, field: 'dress renamed in Drive', from: prev.dress || '', to: folder.dress });
    }
    if (String(prev.collection || '') !== folder.collection) {
      sets.push('collection = ?');
      params.push(folder.collection);
      summary.movedCollection++;
      changes.push({ scope: `row:${folder.id}`, field: 'collection changed in Drive', from: prev.collection || '', to: folder.collection });
    }
    if (Number(prev.files ?? -1) !== Number(folder.files)) {
      sets.push('files = ?');
      params.push(folder.files);
      summary.recounted++;
    }
    if (Number(prev.archived) === 1) {
      sets.push('archived = 0');
      summary.restored++;
      changes.push({ scope: `row:${folder.id}`, field: 'back on the board', from: 'archived', to: folder.dress });
    }

    if (sets.length) {
      await d1(`UPDATE dresses SET ${sets.join(', ')} WHERE id = ?`, [...params, folder.id]);
    }
  }

  for (const row of existing) {
    const id = String(row.id);
    if (seenIds.has(id) || Number(row.archived) === 1) continue;
    await d1('UPDATE dresses SET archived = 1 WHERE id = ?', [id]);
    summary.archived++;
    changes.push({
      scope: `row:${id}`,
      field: 'no longer a dress folder in Drive',
      from: `${row.collection || ''} / ${row.dress || ''}`,
      to: 'archived',
    });
  }

  // A collection folder renamed in Drive leaves its cost row keyed to the old
  // name. Carry it across, the same way a manual rename does.
  const oldCollections = new Set(existing.map((r) => String(r.collection || '')));
  const newCollections = new Set(seen.map((s) => s.collection));
  for (const oldName of oldCollections) {
    if (newCollections.has(oldName)) continue;
    const stillUsed = await queryAll(
      'SELECT 1 FROM dresses WHERE collection = ? AND archived = 0 LIMIT 1',
      [oldName]
    );
    if (stillUsed.length) continue;
    const oldCost = await queryAll('SELECT value FROM costs WHERE scope = ? AND key = ?', ['collection', oldName]);
    if (!oldCost.length) continue;
    // Only safe to move a cost across when exactly one new name appeared,
    // otherwise there is no way to know which collection it belonged to.
    const appeared = [...newCollections].filter((n) => !oldCollections.has(n));
    if (appeared.length !== 1) continue;
    await d1(
      'INSERT INTO costs (scope, key, value) VALUES (?, ?, ?) ON CONFLICT(scope, key) DO UPDATE SET value = excluded.value',
      ['collection', appeared[0], oldCost[0].value]
    );
    await d1('DELETE FROM costs WHERE scope = ? AND key = ?', ['collection', oldName]);
    changes.push({ scope: `cost:collection:${appeared[0]}`, field: 'cost carried over', from: oldName, to: appeared[0] });
  }

  for (const c of changes) {
    await logChange(by || 'Drive resync', c.scope, c.field, c.from, c.to);
  }

  const text = summarise(summary);
  await d1(
    `INSERT INTO release_sync (release, synced_at, synced_by, summary) VALUES (?, ?, ?, ?)
     ON CONFLICT(release) DO UPDATE SET synced_at = excluded.synced_at, synced_by = excluded.synced_by, summary = excluded.summary`,
    [release, now, by || '', text]
  );

  return { summary, text, syncedAt: now, dressCount: seen.length };
}

function summarise(s) {
  const bits = [];
  if (s.added) bits.push(`${s.added} added`);
  if (s.renamed) bits.push(`${s.renamed} renamed`);
  if (s.movedCollection) bits.push(`${s.movedCollection} moved collection`);
  if (s.recounted) bits.push(`${s.recounted} file count${s.recounted === 1 ? '' : 's'} updated`);
  if (s.archived) bits.push(`${s.archived} archived`);
  if (s.restored) bits.push(`${s.restored} restored`);
  return bits.length ? bits.join(', ') : 'already up to date';
}

export async function getDressesForRelease(release) {
  // archived = 0 for the same reason the board filters it: a folder that is
  // no longer a dress should not be sent to a client to review.
  const rows = await queryAll(
    'SELECT id, release, collection, dress, status FROM dresses WHERE release = ? AND archived = 0 ORDER BY collection ASC, dress ASC',
    [release]
  );
  return rows.map((r) => ({
    id: String(r.id),
    release: String(r.release || ''),
    collection: String(r.collection || ''),
    dress: String(r.dress || ''),
    status: r.status || 'Not Started',
  }));
}

// ---------- Drive file review state ----------
//
// These rows describe DECISIONS, not files. Drive is the source of truth for
// which files exist (see migration/003_drive_review.sql). A Drive file with
// no row here is pending, which is why nothing writes a row on upload.

const REVIEW_STATUSES = ['pending', 'approved', 'rejected'];
const FEEDBACK_REASONS = ['accuracy', 'pose', 'other'];

function shapeReview(r) {
  return {
    fileId: String(r.file_id),
    dressId: String(r.dress_id),
    status: r.review_status || 'pending',
    reason: r.feedback_reason || null,
    text: r.feedback_text || '',
    by: r.reviewed_by || '',
    at: Number(r.reviewed_at) || 0,
  };
}

export async function getFileReview(fileId) {
  const rows = await queryAll(
    'SELECT file_id, dress_id, review_status, feedback_reason, feedback_text, reviewed_by, reviewed_at FROM file_reviews WHERE file_id = ?',
    [fileId]
  );
  return rows.length ? shapeReview(rows[0]) : null;
}

export async function getReviewsForDress(dressId) {
  const rows = await queryAll(
    'SELECT file_id, dress_id, review_status, feedback_reason, feedback_text, reviewed_by, reviewed_at FROM file_reviews WHERE dress_id = ?',
    [dressId]
  );
  const map = {};
  rows.forEach((r) => {
    map[String(r.file_id)] = shapeReview(r);
  });
  return map;
}

export async function getReviewsForRelease(release) {
  // Joined through `dresses` rather than trusting file_reviews.release, which
  // is only a snapshot of where the dress sat when the decision was made. A
  // dress that later moved batch would otherwise drop its whole review
  // history out of this view.
  const rows = await queryAll(
    `SELECT fr.file_id, fr.dress_id, fr.review_status, fr.feedback_reason, fr.feedback_text, fr.reviewed_by, fr.reviewed_at
     FROM file_reviews fr
     JOIN dresses d ON d.id = fr.dress_id
     WHERE d.release = ? AND d.archived = 0`,
    [release]
  );
  const map = {};
  rows.forEach((r) => {
    map[String(r.file_id)] = shapeReview(r);
  });
  return map;
}

/**
 * Checks a decision is coherent and returns the normalised reason and note.
 *
 * Separate from the write so a route can validate BEFORE it moves anything in
 * Drive. When this ran inside setFileReview, an invalid decision failed after
 * the file had already been moved, and left no audit entry behind.
 */
export function validateReviewDecision({ status, reason, text }) {
  if (!REVIEW_STATUSES.includes(status)) throw new Error('Unknown review status ' + status);
  let normReason = reason && FEEDBACK_REASONS.includes(reason) ? reason : null;
  let normText = String(text || '').trim().slice(0, 500);

  if (status === 'rejected') {
    if (!normReason) throw new Error('A rejection needs a reason.');
    if (normReason === 'other' && !normText) {
      throw new Error('Choosing "Something else" needs a short note explaining what is wrong.');
    }
  } else {
    // An approval carries no rejection reason, so clear any leftover from a
    // previous reject on the same file.
    normReason = null;
    normText = '';
  }
  return { status, reason: normReason, text: normText };
}

export async function setFileReview({
  fileId,
  dressId,
  release,
  fileName,
  status,
  reason,
  text,
  by,
}) {
  if (!fileId) throw new Error('fileId is required');
  if (!dressId) throw new Error('dressId is required');
  const { reason: normReason, text: normText } = validateReviewDecision({ status, reason, text });
  // Capped because it is written into the activity log's field column.
  const safeName = String(fileName || '').replace(/[\r\n]/g, ' ').slice(0, 160);

  const existing = await queryAll('SELECT review_status FROM file_reviews WHERE file_id = ?', [fileId]);
  const oldStatus = existing.length ? existing[0].review_status || 'pending' : 'pending';
  const now = Date.now();

  await d1(
    `INSERT INTO file_reviews
       (file_id, dress_id, release, file_name, review_status, feedback_reason, feedback_text, reviewed_by, reviewed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(file_id) DO UPDATE SET
       dress_id = excluded.dress_id,
       release = excluded.release,
       file_name = excluded.file_name,
       review_status = excluded.review_status,
       feedback_reason = excluded.feedback_reason,
       feedback_text = excluded.feedback_text,
       reviewed_by = excluded.reviewed_by,
       reviewed_at = excluded.reviewed_at`,
    [
      fileId,
      dressId,
      release || '',
      safeName,
      status,
      normReason,
      normText,
      by || 'Client',
      now,
    ]
  );

  // Goes through the same log table the Activity tab already reads, so client
  // decisions appear in the same timeline as the team's own edits.
  const label = normReason ? `${status} (${normReason})` : status;
  await logChange(by || 'Client', `file:${dressId}`, safeName || fileId, oldStatus, label);

  return {
    fileId,
    status,
    reason: normReason,
    text: normText,
    by: by || 'Client',
    at: now,
    previousStatus: oldStatus,
  };
}

// ---------- client review links ----------

function newToken() {
  // 32 hex chars of crypto randomness. The token is the entire credential
  // for a review link, so it is generated here and never derived from the
  // batch name or anything else guessable.
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createReviewLink({ email, release, label, by }) {
  await assertAdmin(email);
  const rel = String(release || '').trim();
  if (!rel) throw new Error('A review link has to be tied to a batch.');
  const token = newToken();
  await d1(
    'INSERT INTO review_links (token, release, label, created_by, created_at, revoked_at) VALUES (?, ?, ?, ?, ?, 0)',
    [token, rel, String(label || '').trim(), by || email || '', Date.now()]
  );
  await logChange(by, 'review-link:' + rel, 'created', '', String(label || '').trim() || token.slice(0, 8));
  return { token, release: rel, label: String(label || '').trim(), createdAt: Date.now(), revokedAt: 0 };
}

export async function listReviewLinks(email) {
  await assertAdmin(email);
  const rows = await queryAll(
    'SELECT token, release, label, created_by, created_at, revoked_at FROM review_links ORDER BY created_at DESC'
  );
  return rows.map((r) => ({
    token: String(r.token),
    release: String(r.release || ''),
    label: String(r.label || ''),
    createdBy: String(r.created_by || ''),
    createdAt: Number(r.created_at) || 0,
    revokedAt: Number(r.revoked_at) || 0,
  }));
}

export async function revokeReviewLink({ email, token, by }) {
  await assertAdmin(email);
  const rows = await queryAll('SELECT release, label FROM review_links WHERE token = ?', [token]);
  if (!rows.length) throw new Error('That review link does not exist.');
  await d1('UPDATE review_links SET revoked_at = ? WHERE token = ? AND revoked_at = 0', [
    Date.now(),
    token,
  ]);
  await logChange(by, 'review-link:' + (rows[0].release || ''), 'revoked', rows[0].label || token.slice(0, 8), '');
  return true;
}

/**
 * Resolves a client review token to the batch it grants access to.
 * Returns null for an unknown or revoked token, so a caller cannot tell the
 * difference between the two.
 */
export async function resolveReviewLink(token) {
  const clean = String(token || '').trim();
  if (!clean || !/^[0-9a-f]{32}$/.test(clean)) return null;
  const rows = await queryAll(
    'SELECT token, release, label, revoked_at FROM review_links WHERE token = ?',
    [clean]
  );
  if (!rows.length) return null;
  if (Number(rows[0].revoked_at) > 0) return null;
  return {
    token: clean,
    release: String(rows[0].release || ''),
    label: String(rows[0].label || ''),
  };
}
