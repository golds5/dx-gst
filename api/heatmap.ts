// GET /api/heatmap?market=TH → { title, headers, rows: [[{value,color,note}]] }
// Read-only heatmap dump for the admin viewer: cell values, fill colors, and
// notes (VA notes + Drive link) straight from the market's sheet tab.
import { MARKETS, SPREADSHEET_ID } from '../src/config.js';
import { apiError, gFetch, handleError } from './_utils.js';
import type { ApiRequest, ApiResponse } from './_utils.js';

const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;
const MAX_ROWS = 500;
const LAST_COL = 'M';

type GColor = { red?: number; green?: number; blue?: number };
type GCellData = {
  formattedValue?: string;
  note?: string;
  effectiveFormat?: { backgroundColor?: GColor };
};

// Google returns white (1,1,1) for unfilled cells — treat those as no fill.
function toCss(c?: GColor): string | null {
  if (!c) return null;
  const r = c.red ?? 0;
  const g = c.green ?? 0;
  const b = c.blue ?? 0;
  if (r >= 0.99 && g >= 0.99 && b >= 0.99) return null;
  const to255 = (v: number) => Math.round(v * 255);
  return `rgb(${to255(r)}, ${to255(g)}, ${to255(b)})`;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const market = String(req.query.market ?? '');
    const cfg = MARKETS[market];
    if (!cfg) return res.status(400).json({ error: `Unknown market "${market}"` });

    const range = `'${cfg.sheetTab}'!A1:${LAST_COL}${MAX_ROWS}`;
    const fields =
      'sheets.data.rowData.values(formattedValue,note,effectiveFormat.backgroundColor)';
    const resp = await gFetch(
      `${BASE}?ranges=${encodeURIComponent(range)}&fields=${encodeURIComponent(fields)}`,
    );
    if (!resp.ok) throw await apiError('Heatmap read failed', resp);

    const data = (await resp.json()) as {
      sheets?: { data?: { rowData?: { values?: GCellData[] }[] }[] }[];
    };
    const rowData = data.sheets?.[0]?.data?.[0]?.rowData ?? [];

    const mapRow = (values: GCellData[] = []) =>
      Array.from({ length: 13 }, (_, i) => {
        const cell = values[i];
        return {
          value: cell?.formattedValue ?? '',
          color: toCss(cell?.effectiveFormat?.backgroundColor),
          note: cell?.note ?? null,
        };
      });

    const headerCells = mapRow(rowData[0]?.values);
    const headers = headerCells.map((c, i) =>
      c.value ? c.value : ['Week', 'Date', 'Device', 'Game'][i] ?? '',
    );
    // Data rows: keep any row that has a value in the date column (B).
    const rows = rowData
      .slice(1)
      .map((r) => mapRow(r.values))
      .filter((cells) => cells[1].value.trim() !== '');

    res.status(200).json({ title: cfg.sheetTab, headers, rows });
  } catch (err) {
    handleError(res, err);
  }
}
