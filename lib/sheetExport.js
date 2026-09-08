/**
 * Google Sheet export — a read-only, on-demand SNAPSHOT of the D1 data.
 *
 * The Google Sheet used to be the system of record; it no longer is. D1 is
 * now the source of truth (lib/db.js) and this module is the one-way path
 * FROM D1 TO the sheet, so anyone who wants "a sheet too" can still get one.
 * Nothing ever reads the sheet back into the app.
 *
 * Required environment variables (same service account as before):
 *   GOOGLE_SHEET_ID                - the spreadsheet id to write the snapshot into
 *   GOOGLE_SERVICE_ACCOUNT_EMAIL   - service account client email
 *   GOOGLE_SERVICE_ACCOUNT_KEY     - service account private key (with \n escaped)
 */

import { google } from 'googleapis';

const TRACKER_SHEET = 'Tracker';
const COSTS_SHEET = 'Costs';
const NOTES_SHEET = 'Notes';

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
  return new Map((meta.data.sheets || []).map((s) => [s.properties.title, s.properties.sheetId]));
}

async function ensureTabs(sheets) {
  const existing = await getSheetTabs(sheets);
  const toAdd = [];
  for (const title of [TRACKER_SHEET, COSTS_SHEET, NOTES_SHEET]) {
    if (!existing.has(title)) toAdd.push({ addSheet: { properties: { title } } });
  }
  if (toAdd.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: sheetId(), requestBody: { requests: toAdd } });
  }
  return getSheetTabs(sheets);
}

async function clearAndWrite(sheets, title, values) {
  await sheets.spreadsheets.values.clear({ spreadsheetId: sheetId(), range: title });
  if (!values.length) return;
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId(),
    range: `${title}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values },
  });
}

/**
 * Writes a full snapshot of the current D1 data into the Tracker/Costs/Notes
 * tabs of the Google Sheet. Overwrites whatever is there — this is a mirror,
 * not a merge.
 */
export async function syncBoardToSheet(board) {
  const sheets = await getSheetsClient();
  await ensureTabs(sheets);

  const trackerHeader = [
    'Release Date',
    'Collection / Article ID',
    'Dress / Unit',
    'Status',
    'Files in Folder',
    'Folder Link',
    'Comments / Revisions / Discard Reason',
    'Credits Utilised',
    'Last Synced',
    'Folder ID',
    'Updated By',
    'Updated At',
  ];
  const trackerRows = board.rows.map((r) => [
    r.release,
    r.collection,
    r.dress,
    r.status,
    r.files ?? '',
    '',
    r.comments || '',
    r.credits || 0,
    new Date().toISOString(),
    r.id,
    r.updatedBy || '',
    r.updatedAt || '',
  ]);
  await clearAndWrite(sheets, TRACKER_SHEET, [trackerHeader, ...trackerRows]);

  const costsHeader = ['Scope', 'Key', 'Value'];
  const costsRows = [
    ...Object.entries(board.costs?.batches || {}).map(([key, value]) => ['release', key, value]),
    ...Object.entries(board.costs?.collections || {}).map(([key, value]) => ['collection', key, value]),
  ];
  await clearAndWrite(sheets, COSTS_SHEET, [costsHeader, ...costsRows]);

  const notesHeader = ['Id', 'Release', 'Text', 'By', 'At'];
  const notesRows = [];
  Object.entries(board.notes?.batches || {}).forEach(([release, notes]) => {
    notes.forEach((n) => notesRows.push([n.id, release, n.text, n.by || '', n.at || '']));
  });
  await clearAndWrite(sheets, NOTES_SHEET, [notesHeader, ...notesRows]);

  return { syncedAt: Date.now(), rows: trackerRows.length };
}
