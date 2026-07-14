// Pure functions for filename / folder / date logic (Sections 5 & 6 of the
// spec). No browser or Google APIs here — everything is unit-tested.

import { DRIVE_BASE_FOLDER_NAME } from '../config.js';
import type { BrandConfig } from '../config.js';

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// CamelCase a filename part: capitalize each whitespace-separated word,
// join without spaces, then strip anything outside [A-Za-z0-9-].
export function camelPart(input: string): string {
  return input
    .trim()
    .split(/\s+/)
    .map((w) => w.replace(/[^A-Za-z0-9-]/g, ''))
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

// ISO-8601 year + week number for a YYYY-MM-DD date string.
export function isoWeekOf(dateStr: string): { isoYear: number; weekNumber: number } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1, d));
  const dayNr = (target.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // Thursday of this week
  const isoYear = target.getUTCFullYear();
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4));
  const ftDayNr = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - ftDayNr + 3);
  const weekNumber =
    1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return { isoYear, weekNumber };
}

export type FilenameInput = {
  isoYear: number;
  weekNumber: number;
  market: string;
  sessionOfWeek: number;
  provider: string;
  game: string;
  brand: BrandConfig;
  deviceId: string;
  sourceFileName: string; // extension is preserved from this
};

// {YYYY}-W{WW}_{MARKET}{SESSION}_{PROVIDER}-{GAME}_{GROUP}-{BRAND}_{DEVICE}.{ext}
export function buildVideoFilename(i: FilenameInput): string {
  const group = i.brand.isCompetitor ? 'CMP' : camelPart(i.brand.group);
  const parts = [
    `${i.isoYear}-W${pad2(i.weekNumber)}`,
    `${camelPart(i.market)}${i.sessionOfWeek}`,
    `${camelPart(i.provider)}-${camelPart(i.game)}`,
    `${group}-${camelPart(i.brand.name)}`,
    camelPart(i.deviceId),
  ];
  return `${parts.join('_')}.${extensionOf(i.sourceFileName)}`;
}

export function extensionOf(fileName: string, fallback = 'mp4'): string {
  const m = /\.([A-Za-z0-9]+)$/.exec(fileName);
  return m ? m[1].toLowerCase() : fallback;
}

// Drive folder path segments under the configured root folder:
// Game Speed Check / {YYYY} / W{WW} / {MARKET}
export function buildFolderPath(
  isoYear: number,
  weekNumber: number,
  market: string,
): string[] {
  return [DRIVE_BASE_FOLDER_NAME, String(isoYear), `W${pad2(weekNumber)}`, market];
}

// Filename without its extension. Used to detect that a slot already has a
// video this session (one video per slot — a re-upload replaces it in place,
// even if the extension changed from .mov to .mp4).
export function stemOf(name: string): string {
  return name.replace(/\.[A-Za-z0-9]+$/, '');
}

// Sheet column B date format: `Ddd, DD/MM` e.g. `Wed, 24/06`.
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function formatSheetDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${DAY_NAMES[date.getUTCDay()]}, ${pad2(d)}/${pad2(m)}`;
}

// Session-of-week suggestion for two-sessions-per-week markets (TH): each
// distinct test DAY in the week is one session. Given the sheet-format dates
// already logged this week and the chosen test date, suggest which session
// this is: re-opening an already-logged day keeps its number; a new day gets
// the next number. Result capped at `max`.
export function suggestSessionOfWeek(
  loggedDates: string[], // column-B strings, e.g. 'Wed, 24/06'
  chosenDate: string, // same format
  max: 1 | 2 = 2,
): 1 | 2 {
  const dayKey = (s: string) => {
    const m = /(\d{1,2})\/(\d{1,2})/.exec(s);
    return m ? Number(m[2]) * 100 + Number(m[1]) : 0; // MM*100+DD, sortable
  };
  const distinct = [...new Set(loggedDates)].sort((a, b) => dayKey(a) - dayKey(b));
  const idx = distinct.indexOf(chosenDate);
  const suggested = idx !== -1 ? idx + 1 : distinct.length + 1;
  return Math.min(suggested, max) as 1 | 2;
}

// Notes validation (Section 4.3): if rating is slight/strong, notes must
// contain at least one m:ss timestamp.
const TIMESTAMP_RE = /\d{1,2}:\d{2}/;

export function hasTimestamp(notes: string): boolean {
  return TIMESTAMP_RE.test(notes);
}

export const TIMESTAMP_HINT = 'Add at least one timestamp (e.g. 0:25–0:30).';

export function validateSlotNotes(
  rating: 'smooth' | 'slight' | 'strong' | undefined,
  notes: string | undefined,
): string | null {
  if (rating === 'slight' || rating === 'strong') {
    if (!notes || !notes.trim() || !hasTimestamp(notes)) return TIMESTAMP_HINT;
  }
  return null;
}
