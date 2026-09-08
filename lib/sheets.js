/**
 * Google Sheets data layer for the Khaadi Production Board.
 *
 * Ports the logic that used to live in Apps Script's WebApp.gs, but as a
 * server-side module callable from Next.js API routes via the Sheets API
 * (googleapis) using a service account.
 *
 * Required environment variables (set these in Vercel / .env.local):
 *   GOOGLE_SHEET_ID                - the spreadsheet id
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL   - service account client email
 *   GOOGLE_SERVICE_ACCOUNT_KEY     - service account private key (with \n escaped)
 *
 * Sheet layout (matches the existing "Khaadi PDP Production Tracker" sheet):
 *   Tracker sheet columns (1-indexed):
 *     A Release Date, B Collection / Article ID, C Dress / Unit, D Status,
 *     E Files in Folder, F Folder Link, G Comments / Revisions / Discard Reason,
 *     H Credits Utilised, I Last Synced, J Folder ID, K Updated By, L Updated At
 *   Costs sheet:   Scope | Key | Value
 *   Notes sheet:   Id | Release | Text | By | At
 *   Access sheet:  Email | Role | Notes
 *   Log sheet:     When | By | Scope | Field | Old Value | New Value
 */

import { google } from 'googleapis';

const TRACKER_SHEET = 'Tracker';
const COSTS_SHEET = 'Costs';
const NOTES_SHEET = 'Notes';
const ACCESS_SHEET = 'Access';
const LOG_SHEET = 'Log';
export const DEFAULT_ADMIN_EMAIL = 'affan.khan@imagine.art';

let cachedClient = null;

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!email || !rawKey) {
    throw new Error(
      'Missing GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_KEY environment variables.'
    );
  }
  const key = rawKey.includes('\\n') ? rawKey.replace(/\\n/g, '\n') : rawKey;
  return new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

async function getSheetsClient() {
  if (cachedClient) return cachedClient;
  const auth = getAuth();
  cachedClient = google.sheets({ version: 'v4', auth });
  return cachedClient;
}

function sheetId() {
  const id = process.env.GOOGLE_SHEET_ID;
  if (!id) throw new Error('Missing GOOGLE_SHEET_ID environment variable.');
  return id;
}

async function getSheetTabs(sheets) {
  const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetId() });
  return new Set((meta.data.sheets || []).map((s) => s.properties.title));
}

async function ensureAuxSheets(sheets) {
  const existing = await getSheetTabs(sheets);
  const toAdd = [];
  const seed = [];

  if (!existing.has(COSTS_SHEET)) {
    toAdd.push({ addSheet: { properties: { title: COSTS_SHEET } } });
    seed.push({ range: `${COSTS_SHEET}!A1:C1`, values: [['Scope', 'Key', 'Value']] });
  }
  if (!existing.has(NOTES_SHEET)) {
    toAdd.push({ addSheet: { properties: { title: NOTES_SHEET } } });
    seed.push({ range: `${NOTES_SHEET}!A1:E1`, values: [['Id', 'Release', 'Text', 'By', 'At']] });
  }
  if (!existing.has(ACCESS_SHEET)) {
    toAdd.push({ addSheet: { properties: { title: ACCESS_SHEET } } });
    seed.push({ range: `${ACCESS_SHEET}!A1:C1`, values: [['Email', 'Role', 'Notes']] });
    seed.push({
      range: `${ACCESS_SHEET}!A2:C2`,
      values: [[DEFAULT_ADMIN_EMAIL, 'admin', 'Default admin — added automatically. Add a row per teammate: role is "admin", "editor" or "viewer". Anyone not listed is a viewer.']],
    });
  }
  if (!existing.has(LOG_SHEET)) {
    toAdd.push({ addSheet: { properties: { title: LOG_SHEET } } });
    seed.push({ range: `${LOG_SHEET}!A1:F1`, values: [['When', 'By', 'Scope', 'Field', 'Old Value', 'New Value']] });
  }

  if (toAdd.length) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: sheetId(),
      requestBody: { requests: toAdd },
    });
  }
  for (const s of seed) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId(),
      range: s.range,
      valueInputOption: 'RAW',
      requestBody: { values: s.values },
    });
  }
}

async function getValues(sheets, range) {
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId(), range });
  return res.data.values || [];
}

async function setValues(sheets, range, values) {
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId(),
    range,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

async function appendValues(sheets, range, values) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId(),
    range,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
}

async function logChange(sheets, by, scope, field, oldVal, newVal) {
  try {
    await appendValues(sheets, `${LOG_SHEET}!A:F`, [
      [new Date().toISOString(), by || 'Someone', scope, field, oldVal ?? '', newVal ?? ''],
    ]);
  } catch (e) {
    // Logging should never block a real save.
    console.error('log append failed', e);
  }
}

export async function getMyRole(email) {
  const sheets = await getSheetsClient();
  await ensureAuxSheets(sheets);
  const norm = (email || '').toLowerCase();
  if (!norm) return 'viewer';
  const rows = await getValues(sheets, `${ACCESS_SHEET}!A2:B`);
  for (const row of rows) {
    if (String(row[0] || '').toLowerCase() === norm) {
      const role = String(row[1] || 'viewer').toLowerCase();
      return role === 'admin' || role === 'editor' ? role : 'viewer';
    }
  }
  return 'viewer';
}

function requireEditor(role) {
  if (role !== 'admin' && role !== 'editor') {
    const err = new Error(
      `VIEW_ONLY: You have view-only access on this board. Ask ${DEFAULT_ADMIN_EMAIL} to add you to the Access tab as an editor.`
    );
    err.code = 'VIEW_ONLY';
    throw err;
  }
}

export async function getBoardData(email) {
  const sheets = await getSheetsClient();
  await ensureAuxSheets(sheets);

  const trackerRows = await getValues(sheets, `${TRACKER_SHEET}!A2:L`);
  const rows = [];
  trackerRows.forEach((row) => {
    const folderId = row[9];
    if (!folderId) return;
    rows.push({
      id: String(folderId),
      release: String(row[0] || ''),
      collection: String(row[1] || ''),
      dress: String(row[2] || ''),
      status: row[3] || 'Not Started',
      files: row[4] != null && row[4] !== '' ? Number(row[4]) : null,
      comments: row[6] || '',
      credits: row[7] ? Number(row[7]) : 0,
      updatedBy: row[10] || '',
      updatedAt: row[11] ? Number(row[11]) : null,
    });
  });

  const costRows = await getValues(sheets, `${COSTS_SHEET}!A2:C`);
  const costs = { batches: {}, collections: {} };
  costRows.forEach((r) => {
    const [scope, key, value] = r;
    if (!key) return;
    if (scope === 'release') costs.batches[key] = Number(value) || 0;
    else if (scope === 'collection') costs.collections[key] = Number(value) || 0;
  });

  const noteRows = await getValues(sheets, `${NOTES_SHEET}!A2:E`);
  const notes = { batches: {} };
  noteRows.forEach((r) => {
    const [id, release, text, by, at] = r;
    if (!text) return;
    if (!notes.batches[release]) notes.batches[release] = [];
    notes.batches[release].push({ id: String(id), text: String(text), by: String(by || ''), at: Number(at) || 0 });
  });

  const role = await getMyRole(email);

  return { rows, costs, notes, syncedAt: Date.now(), role, email: email || '' };
}

async function findRowIndexByFolderId(sheets, folderId) {
  const ids = await getValues(sheets, `${TRACKER_SHEET}!J2:J`);
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(folderId)) return i + 2; // 1-indexed, +1 for header
  }
  return -1;
}

const FIELD_COLS = { status: 'D', comments: 'G', credits: 'H' };

export async function updateDressField({ email, folderId, field, value, by, expectedUpdatedAt }) {
  const role = await getMyRole(email);
  requireEditor(role);
  const sheets = await getSheetsClient();
  const col = FIELD_COLS[field];
  if (!col) throw new Error('Unknown field ' + field);

  const r = await findRowIndexByFolderId(sheets, folderId);
  if (r === -1) throw new Error('Row not found for folder ' + folderId);

  const current = await getValues(sheets, `${TRACKER_SHEET}!${col}${r}:L${r}`);
  const currentUpdatedAt = (await getValues(sheets, `${TRACKER_SHEET}!L${r}`))[0]?.[0];

  if (expectedUpdatedAt != null && currentUpdatedAt && Number(currentUpdatedAt) !== Number(expectedUpdatedAt)) {
    const oldValRow = await getValues(sheets, `${TRACKER_SHEET}!${col}${r}:K${r}`);
    return {
      conflict: true,
      field,
      current: {
        value: oldValRow[0]?.[0] ?? '',
        updatedBy: oldValRow[0]?.[oldValRow[0].length - 1] ?? '',
        updatedAt: Number(currentUpdatedAt),
      },
    };
  }

  const oldValResp = await getValues(sheets, `${TRACKER_SHEET}!${col}${r}`);
  const oldVal = oldValResp[0]?.[0] ?? '';
  const newVal = field === 'credits' ? Number(value) || 0 : value;

  await setValues(sheets, `${TRACKER_SHEET}!${col}${r}`, [[newVal]]);
  const now = Date.now();
  await setValues(sheets, `${TRACKER_SHEET}!K${r}:L${r}`, [[by || 'Someone', now]]);
  await logChange(sheets, by, 'row:' + folderId, field, oldVal, newVal);

  return { conflict: false, updatedAt: now };
}

export async function bulkSetStatus({ email, folderIds, status, by }) {
  const role = await getMyRole(email);
  requireEditor(role);
  const sheets = await getSheetsClient();
  const now = Date.now();
  let changed = 0;
  for (const id of folderIds) {
    const r = await findRowIndexByFolderId(sheets, id);
    if (r !== -1) {
      await setValues(sheets, `${TRACKER_SHEET}!D${r}`, [[status]]);
      await setValues(sheets, `${TRACKER_SHEET}!K${r}:L${r}`, [[by || 'Someone', now]]);
      changed++;
    }
  }
  await logChange(sheets, by, `bulk:${changed} rows`, 'status', '', status);
  return { conflict: false, updatedAt: now, changed };
}

export async function updateCost({ email, scope, key, value, by }) {
  const role = await getMyRole(email);
  requireEditor(role);
  const sheets = await getSheetsClient();
  const rows = await getValues(sheets, `${COSTS_SHEET}!A2:C`);
  let targetRow = -1;
  let oldVal = 0;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i][0] === scope && rows[i][1] === key) {
      targetRow = i + 2;
      oldVal = rows[i][2];
      break;
    }
  }
  const newVal = Number(value) || 0;
  if (targetRow === -1) {
    await appendValues(sheets, `${COSTS_SHEET}!A:C`, [[scope, key, newVal]]);
  } else {
    await setValues(sheets, `${COSTS_SHEET}!C${targetRow}`, [[newVal]]);
  }
  await logChange(sheets, by, `cost:${scope}:${key}`, 'cost', oldVal, newVal);
  return true;
}

export async function addNote({ email, release, text, by }) {
  const role = await getMyRole(email);
  requireEditor(role);
  const sheets = await getSheetsClient();
  const id = 'n' + Date.now() + Math.random().toString(36).slice(2, 7);
  await appendValues(sheets, `${NOTES_SHEET}!A:E`, [[id, release, text, by || 'Someone', Date.now()]]);
  await logChange(sheets, by, 'note:' + release, 'note', '', text);
  return true;
}
