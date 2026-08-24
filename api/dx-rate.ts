// POST { market, dateLabel, device, game, weekNumber, brand, brandIndex, rating }
// Writes a single cell to the market's DX rerate tab. Never touches the VA
// tab. Rating null clears the cell (color + value). Finds the row by
// (date, device, game) — inserts one at row 2 if none exists.
import {
  MARKETS,
  RATING_COLORS,
  SHEET_FIRST_BRAND_COL,
  SPREADSHEET_ID,
} from '../src/config.js';
import type { BrandConfig } from '../src/config.js';
import { brandCellLabel } from '../src/lib/labels.js';
import { apiError, gFetch, handleError } from './_utils.js';
import type { ApiRequest, ApiResponse } from './_utils.js';

const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;
const SCAN_ROWS = 500;

type Rating = keyof typeof RATING_COLORS;

type Body = {
  market: string;
  dateLabel: string;
  device: string;
  game: string;
  weekNumber: number;
  brand: BrandConfig;
  brandIndex: number;
  rating: Rating | null;
};

async function getSheetId(tabTitle: string): Promise<number> {
  const resp = await gFetch(`${BASE}?fields=sheets.properties`);
  if (!resp.ok) throw await apiError('Could not read spreadsheet metadata', resp);
  const data = (await resp.json()) as {
    sheets: { properties: { sheetId: number; title: string } }[];
  };
  const sheet = data.sheets.find((s) => s.properties.title === tabTitle);
  if (!sheet) {
    throw new Error(
      `Sheet tab "${tabTitle}" not found. Create it in the spreadsheet with the same header row as the VA tab.`,
    );
  }
  return sheet.properties.sheetId;
}

async function getValues(range: string): Promise<string[][]> {
  const resp = await gFetch(`${BASE}/values/${encodeURIComponent(range)}`);
  if (!resp.ok) throw await apiError('Sheets read failed', resp);
  return ((await resp.json()) as { values?: string[][] }).values ?? [];
}

async function batchUpdate(requests: unknown[]): Promise<void> {
  const resp = await gFetch(`${BASE}:batchUpdate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requests }),
  });
  if (!resp.ok) throw await apiError('Sheets write failed', resp);
}

const textCell = (value: string) => ({ userEnteredValue: { stringValue: value } });
const numberCell = (value: number) => ({ userEnteredValue: { numberValue: value } });

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const body = req.body as Body;
    const cfg = MARKETS[body.market];
    if (!cfg) throw new Error(`Unknown market "${body.market}"`);

    const sheetId = await getSheetId(cfg.sheetTabDx);
    const tab = cfg.sheetTabDx;

    let rowNumber: number | null = null;
    const rows = await getValues(`'${tab}'!A2:D${SCAN_ROWS}`);
    for (let i = 0; i < rows.length; i++) {
      const [, b, c, d] = rows[i];
      if (b === body.dateLabel && c === body.device && d === body.game) {
        rowNumber = i + 2;
        break;
      }
    }

    if (rowNumber === null) {
      // Insert a fresh row at row 2 with just the meta columns filled.
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
            rows: [
              {
                values: [
                  numberCell(body.weekNumber),
                  textCell(body.dateLabel),
                  textCell(body.device),
                  textCell(body.game),
                ],
              },
            ],
            fields: 'userEnteredValue',
          },
        },
      ]);
      rowNumber = 2;
    }

    const columnIndex = SHEET_FIRST_BRAND_COL + body.brandIndex;
    if (body.rating === null) {
      // Clear this one cell: value + fill color.
      await batchUpdate([
        {
          updateCells: {
            range: {
              sheetId,
              startRowIndex: rowNumber - 1,
              endRowIndex: rowNumber,
              startColumnIndex: columnIndex,
              endColumnIndex: columnIndex + 1,
            },
            fields: 'userEnteredValue,userEnteredFormat.backgroundColor',
          },
        },
      ]);
    } else {
      const color = RATING_COLORS[body.rating];
      await batchUpdate([
        {
          updateCells: {
            start: { sheetId, rowIndex: rowNumber - 1, columnIndex },
            rows: [
              {
                values: [
                  {
                    userEnteredValue: { stringValue: brandCellLabel(body.brand) },
                    userEnteredFormat: { backgroundColor: color },
                  },
                ],
              },
            ],
            fields: 'userEnteredValue,userEnteredFormat.backgroundColor',
          },
        },
      ]);
    }

    res.status(200).json({ rowNumber });
  } catch (err) {
    handleError(res, err);
  }
}
