// "Not Started" and "In Progress" named the same state — a dress that exists
// and is not finished yet — so the board carries one of them.
export const STATUS_OPTIONS = ['In Progress', 'Delivered', 'Needs Revision', 'Discarded'];
export const MILESTONE_TARGET = 1000;

export const STATUS_TOKEN = {
  Delivered: 'good',
  'In Progress': 'info',
  'Needs Revision': 'warn',
  Discarded: 'crit',
  'Not Started': 'neutral',
};

export const STATUS_TEXT = {
  Delivered: '#fff',
  'In Progress': '#fff',
  'Needs Revision': 'var(--warn-ink)',
  Discarded: '#fff',
  'Not Started': 'var(--neutral-ink)',
};

export const RELEASE_ORDER = ['Release Aug 5', 'Release Aug 13', 'Release Aug 19', '2 Sep Release', 'Sept 9 Release'];

export const RELEASE_SHORT = {
  'Release Aug 5': 'Aug 5',
  'Release Aug 13': 'Aug 13',
  'Release Aug 19': 'Aug 19',
  '2 Sep Release': 'Sep 2',
  'Sept 9 Release': 'Sep 9',
};

export const RELEASE_LINKS = {
  'Release Aug 5': 'https://drive.google.com/drive/folders/1DstsEjsVpVtN012r6P31y4unbyHaEp-h',
  'Release Aug 13': 'https://drive.google.com/drive/folders/1ftZdxzdN_kbfS5_o1OPYKnpIj37xvks7',
  'Release Aug 19': 'https://drive.google.com/drive/folders/1kWbM_8xqUoWY_-3qXgUJsbKNK2IQ77-g',
  'Sept 9 Release': 'https://drive.google.com/drive/folders/1AeUQVzZ-IBGDYf_F_HTvYbw-i5eufXZd',
  '2 Sep Release': 'https://drive.google.com/drive/folders/1W6I-CzHdFrycQk6abCgIFwlMzmGGbtkD',
};

export const COLLECTION_LINKS = {
  '1-26-302': 'https://drive.google.com/drive/folders/12adBkYJGHMpIKGkkuPcT7PMTwzx_sd3D',
  'R-1E4': 'https://drive.google.com/drive/folders/1wP_O3IOOC9IP254G7Vh7bzDeiqFTT1qo',
  '1-26-341': 'https://drive.google.com/drive/folders/1Qp56mms7OL0TzDZNw_jQH73sRngPJYXj',
  '8-26-216B': 'https://drive.google.com/drive/folders/19_sB8NHrB2DakV60NJqz3HpUQe-DVBKp',
  '8-26-215': 'https://drive.google.com/drive/folders/1gQg-U3CG8bCmh_Ruvcf7e89kEzdI4KT9',
  '1-26-335': 'https://drive.google.com/drive/folders/1D5Rmfy9ArBCf8x6uhpGApvxcR0dUefRI',
  'Khaadi 304': 'https://drive.google.com/drive/folders/1MyODkD2_84tud43OWOIWE4w9ffKa2H5Y',
  '14-26-302': 'https://drive.google.com/drive/folders/1X-SDSSsTgTf36iiYzxo2iRDVvv3S1ih9',
  '14-26-324': 'https://drive.google.com/drive/folders/13X3PUIRF0x_Bcz7ttrsGl33sZNz1JdTp',
};

/**
 * Decides whether a Drive subfolder inside a collection counts as a dress.
 *
 * This is the rule that lets renaming a folder in Drive change the board's
 * dress count. Renaming "Flat dress v2" to "Flats" takes it out of the count,
 * because "Flats" does not name a dress; every real dress folder in the
 * pipeline carries the word somewhere ("Dress 4", "dress 5 (341)",
 * "Dress 1 - 216B").
 *
 * If a batch ever uses a different naming convention, change it HERE and
 * nowhere else, then resync.
 */
export const DRESS_FOLDER_PATTERN = /dress/i;

/**
 * Version folders INSIDE a dress: the revision rounds.
 *
 * A client rejects three of twenty images, those three get reshot, and the
 * new files cannot go back into the same folder or nobody can tell which
 * three are the corrections. They go into "V2" instead, which is the
 * convention this shoot already uses one level up, where a collection wraps
 * its dresses in V1/V2/V3.
 *
 * Deliberately strict: only a name that is nothing but a version, so a
 * "Selects" or "Rejected" folder is never mistaken for a revision round.
 */
export const DRESS_VERSION_PATTERN = /^v\s*0*(\d+)$/i;

export function dressVersionNumber(name) {
  const m = String(name || '').trim().match(DRESS_VERSION_PATTERN);
  return m ? Number(m[1]) : null;
}

export function looksLikeDressFolder(name) {
  return DRESS_FOLDER_PATTERN.test(String(name || ""));
}

/**
 * The dress's number, pulled out of its folder name the same way a resync
 * matches one garment across version cuts ("dress 1--- (335)", "Dress 1 v2"
 * are both Dress 1).
 */
export function dressNumberFromName(name) {
  const m = String(name || '').match(/dress\D*0*(\d+)/i);
  return m ? Number(m[1]) : null;
}

/**
 * The short, sortable filename every uploaded image gets: which dress, which
 * revision round, which picture in that round. A folder full of camera-export
 * names ("IMG_4821.jpg", "affan_khan_..._9182.jpg") tells nobody anything;
 * "D3-V2-P7.jpg" says it on sight. Extension is kept as uploaded, everything
 * else is derived, never typed by hand.
 */
export function smartImageName({ dressName, version, position, ext }) {
  const d = dressNumberFromName(dressName);
  const cleanExt = ext ? `.${String(ext).replace(/^\./, '')}` : '';
  return `D${d ?? 0}-V${version || 1}-P${position}${cleanExt}`;
}

/** Pulls the folder id out of a Drive folder URL as stored in the maps above. */
export function driveFolderIdFromUrl(url) {
  const m = String(url || "").match(/\/folders\/([a-zA-Z0-9_-]+)/);
  return m ? m[1] : "";
}

export const MASCOT_LINES = {
  sleepy: [
    '1,000 dresses. We have done… some of them. 🫠',
    'The dresses are not going to shoot themselves. 📸',
    'Currently moving at the speed of a Drive sync. 🐌',
    'Somewhere, a mannequin is waiting. 🧍',
    'This progress bar and I have a lot in common. 😴',
  ],
  eager: [
    'Halfway to bragging rights. 💅',
    'The dresses fear us now. 👗',
    'Momentum! Nobody look directly at it. ✨',
    'Steady. Unbothered. Moisturised. 🧴',
    'At this pace we finish comfortably this decade. 🏃',
  ],
  hype: [
    '1,000 is RIGHT THERE. Do not blink. 👀',
    'Someone start drafting the acceptance speech. 🏆',
    'The finish line is getting nervous. 🏁',
    'Dangerously close to being finished. 🚨',
    'History will remember this batch. 📜',
  ],
};

export function moodFor(pct) {
  return pct < 15 ? 'sleepy' : pct < 60 ? 'eager' : 'hype';
}

export function mascotMessage(mood) {
  const pool = MASCOT_LINES[mood] || MASCOT_LINES.eager;
  return pool[Math.floor(Math.random() * pool.length)];
}

export function fmt(n) {
  return Number(n || 0).toLocaleString();
}

export function timeAgo(ts) {
  if (!ts) return '';
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return s + 's ago';
  const m = Math.floor(s / 60);
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

export function shortRelease(rel) {
  return RELEASE_SHORT[rel] || rel;
}

const MONTH_INDEX = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

// Pulls a rough "month*100 + day" sort key out of a batch/release name like
// "Release Aug 5", "2 Sep Release" or "Sept 9 Release", regardless of
// whether the month or the day comes first. Returns null when no
// month+day pair can be found, so new/odd-shaped batch names never crash
// the sort — they just fall to the end instead of needing a manual entry
// in a hardcoded order list.
export function releaseSortKey(name) {
  const s = String(name || '').toLowerCase();
  const monthMatch = s.match(/jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/);
  const dayMatch = s.match(/\b(\d{1,2})\b/);
  if (!monthMatch || !dayMatch) return null;
  const month = MONTH_INDEX[monthMatch[0]];
  const day = parseInt(dayMatch[1], 10);
  if (Number.isNaN(day)) return null;
  return month * 100 + day;
}

// Most-recent-first ordering for an arbitrary set of release/batch names —
// no manual maintenance needed as new batches show up over time.
export function sortReleasesByRecency(names) {
  return [...names].sort((a, b) => {
    const ka = releaseSortKey(a);
    const kb = releaseSortKey(b);
    if (ka == null && kb == null) return a.localeCompare(b);
    if (ka == null) return 1;
    if (kb == null) return -1;
    return kb - ka;
  });
}
