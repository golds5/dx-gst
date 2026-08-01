// GET /api/dx-account?market=TH&brand=DEE99
// → { username, phone, password, creditRemark, mpDomain } | null
//
// Reads the "DX Accounts" tab of the heatmap spreadsheet. Sheet layout:
//   A  Market       flag or code — matched on the two-letter code substring
//   B  Group        e.g. THKZG1, PHKZG1 (not used for match, kept for context)
//   C  Brand        e.g. DEE99, EZWIN — matched exactly (case-insensitive)
//   D  Username
//   E  Phone
//   F  Password
//   G  Credit Remark
//   H  MP Domain
//
// No client-facing gate — same trust model as /api/log-slot. Real security
// lives in Google's row-level ACL on the sheet (only the service account
// can read it). The passwords never touch client storage.
import { DX_ACCOUNTS_TAB, SPREADSHEET_ID } from '../src/config.js';
import { apiError, gFetch, handleError } from './_utils.js';
import type { ApiRequest, ApiResponse } from './_utils.js';

const BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;
const RANGE = `'${DX_ACCOUNTS_TAB}'!A2:H`;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const market = String(req.query.market ?? '').trim().toUpperCase();
    const brand = String(req.query.brand ?? '').trim().toUpperCase();
    if (!market || !brand) {
      return res.status(400).json({ error: 'market and brand are required' });
    }

    const resp = await gFetch(`${BASE}/values/${encodeURIComponent(RANGE)}`);
    if (!resp.ok) throw await apiError('DX Accounts read failed', resp);
    const rows = ((await resp.json()) as { values?: string[][] }).values ?? [];

    const row = rows.find((r) => {
      const rowMarket = (r[0] ?? '').toUpperCase();
      const rowBrand = (r[2] ?? '').trim().toUpperCase();
      return rowMarket.includes(market) && rowBrand === brand;
    });

    if (!row) return res.status(200).json(null);
    res.status(200).json({
      username: row[3] ?? '',
      phone: row[4] ?? '',
      password: row[5] ?? '',
      creditRemark: row[6] ?? '',
      mpDomain: row[7] ?? '',
    });
  } catch (err) {
    handleError(res, err);
  }
}
