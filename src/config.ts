// ════════════════════════════════════════════════════════════════════
// DX-GST (Game Speed Test) — central config.
// ALL Google IDs and team lists live here; both the browser code and the
// api/ functions import from this file. Nothing else hardcodes these.
// ════════════════════════════════════════════════════════════════════

// ─── Google identifiers ─────────────────────────────────────────────
// There is no user sign-in: all Google access goes through a service
// account whose credentials live in the Vercel env vars GOOGLE_SA_EMAIL
// and GOOGLE_SA_PRIVATE_KEY (see README). The Drive root folder and the
// spreadsheet must be shared with the service account as Editor.
export const SPREADSHEET_ID = '1JNK32r9TCrRCrvNAE3shcFVGbzTFwKU_LtH7RrxNIkE';

export const DRIVE_ROOT_FOLDER_ID = '1REdZ27EKPBG8TxWn_FsHS3UXQzfzMgkq';

// ─── Drive folder layout ─────────────────────────────────────────────
// Videos land in: {root}/Game Speed Check/{YYYY}/W{WW}/{MARKET}/
export const DRIVE_BASE_FOLDER_NAME = 'Game Speed Check';

// ─── Upload tuning (Section 4.4b of the spec) ────────────────────────
export const UPLOAD_CHUNK_BYTES = 8 * 1024 * 1024; // 8 MB
export const UPLOAD_CHUNK_RETRIES = 3;

// ─── Markets & brand slots ───────────────────────────────────────────
export type BrandConfig = {
  group: string; // back-office group, 'CMP' for competitors
  name: string;
  isCompetitor: boolean;
};

export type MarketConfig = {
  code: string;
  label: string;
  flag: string;
  sessionsPerWeek: 1 | 2;
  sheetTab: string; // tab name in the heatmap spreadsheet
  brands: BrandConfig[]; // order = Sheet column order (E→M)
};

export const MARKETS: Record<string, MarketConfig> = {
  TH: {
    code: 'TH',
    label: 'THB Market',
    flag: '🇹🇭',
    sessionsPerWeek: 2,
    sheetTab: 'TH - Heatmap',
    brands: [
      { group: 'KZG1', name: 'DEE99', isCompetitor: false },
      { group: 'KZG2', name: 'BIG188', isCompetitor: false },
      { group: 'WDB1', name: 'TRU99', isCompetitor: false },
      { group: 'BLG1', name: 'RM99', isCompetitor: false },
      { group: '96G1', name: '789BK', isCompetitor: false },
      { group: '96G2', name: 'TK69', isCompetitor: false },
      { group: 'CMP', name: 'BetFlik', isCompetitor: true },
      { group: 'CMP', name: 'M98', isCompetitor: true },
      { group: 'CMP', name: 'PIG168', isCompetitor: true },
    ],
  },
  // TODO: replace placeholder brand lists for PH / MX / BD with the real
  // ones (order must match each market's heatmap tab columns E→M).
  PH: {
    code: 'PH',
    label: 'PHP Market',
    flag: '🇵🇭',
    sessionsPerWeek: 1,
    sheetTab: 'PH - Heatmap',
    brands: [
      { group: 'GRP1', name: 'BRAND1', isCompetitor: false },
      { group: 'GRP2', name: 'BRAND2', isCompetitor: false },
      { group: 'CMP', name: 'COMPETITOR1', isCompetitor: true },
    ],
  },
  MX: {
    code: 'MX',
    label: 'MXN Market',
    flag: '🇲🇽',
    sessionsPerWeek: 1,
    sheetTab: 'MX - Heatmap',
    brands: [
      { group: 'GRP1', name: 'BRAND1', isCompetitor: false },
      { group: 'GRP2', name: 'BRAND2', isCompetitor: false },
      { group: 'CMP', name: 'COMPETITOR1', isCompetitor: true },
    ],
  },
  BD: {
    code: 'BD',
    label: 'BDT Market',
    flag: '🇧🇩',
    sessionsPerWeek: 1,
    sheetTab: 'BD - Heatmap',
    brands: [
      { group: 'GRP1', name: 'BRAND1', isCompetitor: false },
      { group: 'GRP2', name: 'BRAND2', isCompetitor: false },
      { group: 'CMP', name: 'COMPETITOR1', isCompetitor: true },
    ],
  },
};

// ─── Test devices ────────────────────────────────────────────────────
export type DeviceConfig = {
  id: string; // used in the video filename (CamelCase, no spaces)
  label: string; // shown in UI and written to Sheet column C
  spec: string;
};

export const DEVICES: DeviceConfig[] = [
  { id: 'SamsungA714G', label: 'Samsung A71 4G', spec: '2020 · 6-8G RAM' },
  { id: 'OppoReno10Pro', label: 'Oppo Reno 10 Pro', spec: '2023 · 12G RAM' },
  { id: 'VivoY20S', label: 'Vivo Y20S', spec: '2020 · 4G RAM' },
];

// ─── Providers & games ───────────────────────────────────────────────
export type GameConfig = {
  provider: string; // used in the video filename, e.g. 'JILI'
  game: string; // used in the video filename, e.g. 'Golden Empire' → GoldenEmpire
  sheetLabel: string; // provider name as displayed in Sheet column D, e.g. 'Jili'
  icon: string;
};

export const GAMES: GameConfig[] = [
  { provider: 'JILI', game: 'Golden Empire', sheetLabel: 'Jili', icon: '🪙' },
  { provider: 'JILI', game: 'Super Ace', sheetLabel: 'Jili', icon: '🃏' },
  { provider: 'PGSoft', game: 'Fortune Tiger', sheetLabel: 'PG Soft', icon: '🐯' },
  { provider: 'PGSoft', game: 'Lucky Neko', sheetLabel: 'PG Soft', icon: '🐱' },
  // TODO: extend with the full weekly rotation of provider/game pairs.
];

// ─── Lag report presets ──────────────────────────────────────────────
// Quick-pick issue types shown when rating is Slight or Strong lag.
export const LAG_PRESETS = [
  'Animation glitch',
  'Frame rate drop',
  'Black screen',
  'Freeze / stuck',
  'Slow loading',
  'Delayed spin response',
  'No music / sound',
];

// ─── Heatmap rating colors (Section 6 of the spec) ───────────────────
export const RATING_COLORS = {
  smooth: { red: 0.72, green: 0.88, blue: 0.8 },
  slight: { red: 1, green: 0.9, blue: 0.6 },
  strong: { red: 0.94, green: 0.5, blue: 0.5 },
} as const;

// First brand column in the heatmap (column E) as 0-based index.
export const SHEET_FIRST_BRAND_COL = 4;
