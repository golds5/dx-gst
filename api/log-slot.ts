// POST { session, brandIndex, brand, rating, notes, driveLink } → { rowNumber }
// Heatmap logging per Section 6: find the session row (test date + device +
// game) or insert one at row 2, then color the brand cell and attach the
// notes + Drive link as a cell note.
import {
  MARKETS,
  RATING_COLORS,
  SHEET_FIRST_BRAND_COL,
  SPREADSHEET_ID,
} from '../src/config.js';
import type { BrandConfig } from '../src/config.js';
import { formatSheetDate } from '../src/lib/naming.js';
import { brandCellLabel, deviceLabelFor, gameSheetLabelFor } from '../src/lib/labels.js';
import { apiError, gFetch, handleError } from './_utils.js';
import type { ApiRequest, ApiResponse } from './_utils.js';

const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;
const SCAN_ROWS = 500;

async function getSheetId(tabTitle: string): Promise<number> {
  const resp = await gFetch(`${BASE}?fields=sheets.properties`);
  if (!resp.ok) throw await apiError('Could not read spreadsheet metadata', resp);
  const data = (await resp.json()) as {
    sheets: { properties: { sheetId: number; title: string } }[];
  };
  const sheet = data.sheets.find((s) => s.properties.title === tabTitle);
  if (!sheet) throw new Error(`Sheet tab "${tabTitle}" not found in the spreadsheet`);
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

type Body = {
  session: {
    market: string;
    weekNumber: number;
    testDate: string;
    device: string;
    provider: string;
    game: string;
  };
  brandIndex: number;
  brand: BrandConfig;
  rating: 'smooth' | 'slight' | 'strong';
  notes: string;
  minBet: string;
  driveLink: string;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const { session, brandIndex, brand, rating, notes, minBet, driveLink } =
      req.body as Body;

    const marketCfg = MARKETS[session.market];
    if (!marketCfg) throw new Error(`Unknown market "${session.market}"`);
    const tab = marketCfg.sheetTab;
    const dateLabel = formatSheetDate(session.testDate);
    const deviceLabel = deviceLabelFor(session.device);
    const gameLabel = gameSheetLabelFor(session.provider, session.game);
    const sheetId = await getSheetId(tab);

    // Row = session: match test date + device + game, else insert at row 2.
    let rowNumber: number | null = null;
    const rows = await getValues(`'${tab}'!A2:D${SCAN_ROWS}`);
    for (let i = 0; i < rows.length; i++) {
      const [, b, c, d] = rows[i];
      if (b === dateLabel && c === deviceLabel && d === gameLabel) {
        rowNumber = i + 2;
        break;
      }
    }
    if (rowNumber === null) {
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
                // Only the four meta columns. Brand cells stay blank until a
                // brand is actually rated, so a slot the DX lead never asked
                // for reads as "not tested" rather than "tested, no result".
                values: [
                  numberCell(session.weekNumber),
                  textCell(dateLabel),
                  textCell(deviceLabel),
                  textCell(gameLabel),
                ],
              },
            ],
            fields: 'userEnteredValue',
          },
        },
      ]);
      rowNumber = 2;
    }

    const note = [`Min bet: ${minBet}`, notes.trim(), `Video: ${driveLink}`]
      .filter(Boolean)
      .join('\n\n');
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

    res.status(200).json({ rowNumber });
  } catch (err) {
    handleError(res, err);
  }
}
