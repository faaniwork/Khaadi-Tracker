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
  const dressRows = await queryAll(
    'SELECT id, release, collection, dress, status, files, comments, credits, revisions, updated_by, updated_at FROM dresses'
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

  return { rows, costs, notes, syncedAt: Date.now(), role, email: email || '' };
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
