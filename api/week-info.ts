// GET /api/week-info?market=TH&week=29 → { dates: ['Wed, 15/07', …] }
// Column-B dates of rows already logged for this ISO week in the market tab.
// Powers the session-of-week (= test day of week) auto-suggest.
import { MARKETS, SPREADSHEET_ID } from '../src/config.js';
import { apiError, gFetch, handleError } from './_utils.js';
import type { ApiRequest, ApiResponse } from './_utils.js';

const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const market = String(req.query.market ?? '');
    const week = String(req.query.week ?? '');
    const marketCfg = MARKETS[market];
    if (!marketCfg || !week) {
      return res.status(400).json({ error: 'market and week required' });
    }

    const range = encodeURIComponent(`'${marketCfg.sheetTab}'!A2:B500`);
    const resp = await gFetch(`${BASE}/values/${range}`);
    if (!resp.ok) throw await apiError('Sheets read failed', resp);
    const values = ((await resp.json()) as { values?: string[][] }).values ?? [];
    const dates = values.filter((r) => r[0] === week && r[1]).map((r) => r[1]);
    res.status(200).json({ dates });
  } catch (err) {
    handleError(res, err);
  }
}
