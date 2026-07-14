// GET /api/has-session?market=TH&year=2026&week=29 → { hasSession }
// Powers the session-of-week auto-suggest on the setup screen.
import { MARKETS, SPREADSHEET_ID } from '../src/config';
import { apiError, gFetch, handleError } from './_utils';
import type { ApiRequest, ApiResponse } from './_utils';

const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const market = String(req.query.market ?? '');
    const week = String(req.query.week ?? '');
    const marketCfg = MARKETS[market];
    if (!marketCfg || !week) return res.status(400).json({ error: 'market and week required' });

    const range = encodeURIComponent(`'${marketCfg.sheetTab}'!A2:A500`);
    const resp = await gFetch(`${BASE}/values/${range}`);
    if (!resp.ok) throw await apiError('Sheets read failed', resp);
    const values = ((await resp.json()) as { values?: string[][] }).values ?? [];
    res.status(200).json({ hasSession: values.some((r) => r[0] === week) });
  } catch (err) {
    handleError(res, err);
  }
}
