// Google Sheets API v4: heatmap row find-or-create + per-slot cell update
// (Section 6 of the spec).

import {
  DEVICES,
  GAMES,
  MARKETS,
  RATING_COLORS,
  SHEET_FIRST_BRAND_COL,
  SPREADSHEET_ID,
} from '../config';
import type { BrandConfig } from '../config';
import { formatSheetDate } from '../lib/naming';
import type { Session } from '../types';
import { gFetch } from './auth';
import { apiError } from './drive';
import type { SlotCellArgs } from './types';

const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;

// How far down we scan for an existing session row.
const SCAN_ROWS = 500;

const sheetIdCache = new Map<string, number>(); // tab title → numeric sheetId

export function brandCellLabel(brand: BrandConfig): string {
  return brand.isCompetitor ? brand.name : `${brand.group} - ${brand.name}`;
}

export function deviceLabelFor(deviceId: string): string {
  return DEVICES.find((d) => d.id === deviceId)?.label ?? deviceId;
}

export function gameSheetLabelFor(session: Session): string {
  return (
    GAMES.find((g) => g.provider === session.provider && g.game === session.game)
      ?.sheetLabel ?? session.provider
  );
}

function tabFor(market: string): string {
  return MARKETS[market].sheetTab;
}

async function getSheetId(tabTitle: string): Promise<number> {
  const cached = sheetIdCache.get(tabTitle);
  if (cached !== undefined) return cached;
  const resp = await gFetch(`${BASE}?fields=sheets.properties`);
  if (!resp.ok) throw await apiError('Could not read spreadsheet metadata', resp);
  const data = (await resp.json()) as {
    sheets: { properties: { sheetId: number; title: string } }[];
  };
  for (const s of data.sheets) sheetIdCache.set(s.properties.title, s.properties.sheetId);
  const id = sheetIdCache.get(tabTitle);
  if (id === undefined) {
    throw new Error(`Sheet tab "${tabTitle}" not found in the spreadsheet`);
  }
  return id;
}

async function getValues(range: string): Promise<string[][]> {
  const resp = await gFetch(`${BASE}/values/${encodeURIComponent(range)}`);
  if (!resp.ok) throw await apiError('Sheets read failed', resp);
  const data = (await resp.json()) as { values?: string[][] };
  return data.values ?? [];
}

async function batchUpdate(requests: unknown[]): Promise<void> {
  const resp = await gFetch(`${BASE}:batchUpdate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Sheets write failed (${resp.status}): ${body.slice(0, 200)}`);
  }
}

const textCell = (value: string) => ({ userEnteredValue: { stringValue: value } });
const numberCell = (value: number) => ({ userEnteredValue: { numberValue: value } });

// Row = session (Section 6). Match on test date + device + game in the
// market tab; if absent, insert a new row at the top of the data range
// (row 2) with A–D filled and E–M holding brand names, neutral background.
export async function findOrCreateSessionRow(session: Session): Promise<number> {
  const tab = tabFor(session.market);
  const dateLabel = formatSheetDate(session.testDate);
  const deviceLabel = deviceLabelFor(session.device);
  const gameLabel = gameSheetLabelFor(session);

  const rows = await getValues(`'${tab}'!A2:D${SCAN_ROWS}`);
  for (let i = 0; i < rows.length; i++) {
    const [, b, c, d] = rows[i];
    if (b === dateLabel && c === deviceLabel && d === gameLabel) {
      return i + 2; // values started at row 2
    }
  }

  // No matching row — insert one at row 2.
  const sheetId = await getSheetId(tab);
  const brands = MARKETS[session.market].brands;
  const rowValues = [
    numberCell(session.weekNumber),
    textCell(dateLabel),
    textCell(deviceLabel),
    textCell(gameLabel),
    ...brands.map((brand) => textCell(brandCellLabel(brand))),
  ];
  await batchUpdate([
    {
      insertDimension: {
        range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 },
        inheritFromBefore: false,
      },
    },
    {
      updateCells: {
        start: { sheetId, rowIndex: 1, columnIndex: 0 },
        rows: [{ values: rowValues }],
        fields: 'userEnteredValue',
      },
    },
  ]);
  return 2;
}

// Color one brand cell by rating and attach notes + Drive link as the cell
// note. One batchUpdate call per slot.
export async function writeSlotCell({
  session,
  rowNumber,
  brandIndex,
  brand,
  rating,
  notes,
  driveLink,
}: SlotCellArgs): Promise<void> {
  const tab = tabFor(session.market);
  const sheetId = await getSheetId(tab);
  const note = [notes.trim(), `Video: ${driveLink}`].filter(Boolean).join('\n\n');
  await batchUpdate([
    {
      updateCells: {
        start: {
          sheetId,
          rowIndex: rowNumber - 1,
          columnIndex: SHEET_FIRST_BRAND_COL + brandIndex,
        },
        rows: [
          {
            values: [
              {
                userEnteredValue: { stringValue: brandCellLabel(brand) },
                userEnteredFormat: { backgroundColor: RATING_COLORS[rating] },
                note,
              },
            ],
          },
        ],
        fields: 'userEnteredValue,userEnteredFormat.backgroundColor,note',
      },
    },
  ]);
}

// Session-of-week auto-suggest (Section 4.2): has any row for this ISO week
// already been logged in the market tab?
export async function hasSessionThisWeek(args: {
  market: string;
  isoYear: number;
  weekNumber: number;
}): Promise<boolean> {
  const rows = await getValues(`'${tabFor(args.market)}'!A2:A${SCAN_ROWS}`);
  return rows.some((r) => r[0] === String(args.weekNumber));
}
