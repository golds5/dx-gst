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

// Sheet tab that holds the DX MP accounts revealed in the slot card. One
// row per (market, brand). See /api/dx-account.ts for the column layout.
export const DX_ACCOUNTS_TAB = 'DX Accounts';

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
  sessionsPerWeek: 1 | 2 | 3;
  sheetTab: string; // tab name in the heatmap spreadsheet
  brands: BrandConfig[]; // order = Sheet column order (E→M)
};

export const MARKETS: Record<string, MarketConfig> = {
  TH: {
    code: 'TH',
    label: 'THB Market',
    flag: '🇹🇭',
    // Bumped from 2 to 3 to add an extra test day for red-signal weeks.
    sessionsPerWeek: 3,
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
    // Brands match the DX Accounts sheet (KZG-normalized group codes).
    brands: [
      { group: 'PHKZG1', name: 'EZWIN', isCompetitor: false },
      { group: 'PHKZG2', name: 'PHWINWIN', isCompetitor: false },
      { group: 'PH96G1', name: 'WINMAYA', isCompetitor: false },
      { group: 'PHBLG1', name: 'MRJILI', isCompetitor: false },
      { group: 'CMP', name: 'LODIBET', isCompetitor: true },
      { group: 'CMP', name: 'BOSSPHP.VIP', isCompetitor: true },
    ],
  },
  MX: {
    code: 'MX',
    label: 'MXN Market',
    flag: '🇲🇽',
    sessionsPerWeek: 1,
    sheetTab: 'MX - Heatmap',
    // MX checks one brand per group only. Matches the DX Accounts sheet.
    brands: [
      { group: 'MXKZG1', name: 'MXWOW', isCompetitor: false },
      { group: 'MX96G1', name: 'OROMX', isCompetitor: false },
    ],
  },
  BD: {
    code: 'BD',
    label: 'BDT Market',
    flag: '🇧🇩',
    sessionsPerWeek: 1,
    sheetTab: 'BD - Heatmap',
    // BD checks one brand per group only. Matches the DX Accounts sheet
    // (KZG-normalized group codes).
    brands: [
      { group: 'BDKZG1', name: 'ADDA7', isCompetitor: false },
      { group: 'BD96G1', name: 'BDJOSS', isCompetitor: false },
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
  { id: 'HonorX6c', label: 'Honor X6c', spec: '2024 · 12G RAM' },
  { id: 'OppoA5i', label: 'Oppo A5i', spec: '2024 · 4G RAM' },
  { id: 'RealmeC61', label: 'Realme C61', spec: '2024 · 4G RAM' },
];

// ─── Providers & games (region-scoped) ───────────────────────────────
// Games available per region. A game absent from a region's list is banned /
// not opened there (e.g. Jili "Golden Empire 2" is not in MX). Min bet is in
// that region's currency and can differ per game (e.g. PH PP games).
export type GameConfig = {
  provider: string; // display + sheet + filename, e.g. 'PP', 'PG Soft'
  game: string; // e.g. 'Gates of Olympus Super Scatter'
  minBet: string; // e.g. '0.02 PHP' (currency included)
};

// Emoji fallback per provider — used if no image icon is available.
export const PROVIDER_ICONS: Record<string, string> = {
  'PG Soft': '🀄',
  Jili: '🪙',
  PP: '⚡',
  Fachai: '🐉',
};

// Provider logo images, keyed by provider name. Files under
// public/provider-icons/ so Vite serves them from the site root. Falls
// back to PROVIDER_ICONS when a provider has no image on file.
export const PROVIDER_ICON_IMAGES: Record<string, string> = {
  'PG Soft': '/provider-icons/pg-soft.png',
  Jili: '/provider-icons/jili.png',
  PP: '/provider-icons/pragmatic-play.png',
  Fachai: '/provider-icons/fachai.png',
};

// Per-game icon, keyed by game name. File lives under public/game-icons/
// so Vite serves it from the site root.
export const GAME_ICONS: Record<string, string> = {
  'Ways of the Qilin': '/game-icons/ways-of-the-qilin.webp',
  'Treasures of Aztec': '/game-icons/treasures-of-aztec.webp',
  'Mahjong Ways 2': '/game-icons/mahjong-ways-2.webp',
  'Golden Empire': '/game-icons/golden-empire.webp',
  'Golden Empire 2': '/game-icons/golden-empire-2.webp',
  'Fortune Coins': '/game-icons/fortune-coins.webp',
  'Fortune Coins 2': '/game-icons/fortune-coins-2.webp',
  "Joker's Revenge": '/game-icons/jokers-revenge.webp',
  'Wild Skullz': '/game-icons/wild-skullz.webp',
  'Gates of Olympus Super Scatter': '/game-icons/gates-of-olympus-super-scatter.webp',
  ZEUS: '/game-icons/zeus.webp',
  'KONG ISLAND': '/game-icons/kong-island.webp',
};

export const REGION_GAMES: Record<string, GameConfig[]> = {
  TH: [
    { provider: 'PG Soft', game: 'Ways of the Qilin', minBet: '1 THB' },
    { provider: 'PG Soft', game: 'Treasures of Aztec', minBet: '1 THB' },
    { provider: 'PG Soft', game: 'Mahjong Ways 2', minBet: '1 THB' },
    { provider: 'Jili', game: 'Golden Empire 2', minBet: '1 THB' },
    { provider: 'Jili', game: 'Golden Empire', minBet: '1 THB' },
    { provider: 'Jili', game: 'Fortune Coins', minBet: '1 THB' },
    { provider: 'Jili', game: 'Fortune Coins 2', minBet: '1 THB' },
    { provider: 'PP', game: "Joker's Revenge", minBet: '1 THB' },
    { provider: 'PP', game: 'Wild Skullz', minBet: '1 THB' },
    { provider: 'PP', game: 'Gates of Olympus Super Scatter', minBet: '1 THB' },
    { provider: 'Fachai', game: 'ZEUS', minBet: '1 THB' },
    { provider: 'Fachai', game: 'KONG ISLAND', minBet: '1 THB' },
  ],
  PH: [
    { provider: 'PG Soft', game: 'Ways of the Qilin', minBet: '1 PHP' },
    { provider: 'PG Soft', game: 'Treasures of Aztec', minBet: '1 PHP' },
    { provider: 'PG Soft', game: 'Mahjong Ways 2', minBet: '1 PHP' },
    { provider: 'Jili', game: 'Golden Empire 2', minBet: '1 PHP' },
    { provider: 'Jili', game: 'Golden Empire', minBet: '1 PHP' },
    { provider: 'Jili', game: 'Fortune Coins', minBet: '1 PHP' },
    { provider: 'Jili', game: 'Fortune Coins 2', minBet: '1 PHP' },
    { provider: 'PP', game: "Joker's Revenge", minBet: '0.05 PHP' },
    { provider: 'PP', game: 'Wild Skullz', minBet: '0.02 PHP' },
    { provider: 'PP', game: 'Gates of Olympus Super Scatter', minBet: '0.02 PHP' },
    { provider: 'Fachai', game: 'ZEUS', minBet: '1 PHP' },
    { provider: 'Fachai', game: 'KONG ISLAND', minBet: '0.5 PHP' },
  ],
  BD: [
    { provider: 'PG Soft', game: 'Ways of the Qilin', minBet: '2 TK' },
    { provider: 'PG Soft', game: 'Treasures of Aztec', minBet: '2 TK' },
    { provider: 'PG Soft', game: 'Mahjong Ways 2', minBet: '2 TK' },
    { provider: 'Jili', game: 'Golden Empire 2', minBet: '1 TK' },
    { provider: 'Jili', game: 'Golden Empire', minBet: '1 TK' },
    { provider: 'Jili', game: 'Fortune Coins', minBet: '1 TK' },
    { provider: 'Jili', game: 'Fortune Coins 2', minBet: '1 TK' },
    { provider: 'PP', game: "Joker's Revenge", minBet: '0.5 TK' },
    { provider: 'PP', game: 'Wild Skullz', minBet: '0.4 TK' },
    { provider: 'PP', game: 'Gates of Olympus Super Scatter', minBet: '0.4 TK' },
    { provider: 'Fachai', game: 'ZEUS', minBet: '1 TK' },
    { provider: 'Fachai', game: 'KONG ISLAND', minBet: '0.5 TK' },
  ],
  MX: [
    { provider: 'PG Soft', game: 'Ways of the Qilin', minBet: '2 MXN' },
    { provider: 'PG Soft', game: 'Treasures of Aztec', minBet: '2 MXN' },
    { provider: 'PG Soft', game: 'Mahjong Ways 2', minBet: '2 MXN' },
    // Jili "Golden Empire 2" is not opened in MX.
    { provider: 'Jili', game: 'Golden Empire', minBet: '2 MXN' },
    { provider: 'Jili', game: 'Fortune Coins', minBet: '2 MXN' },
    { provider: 'Jili', game: 'Fortune Coins 2', minBet: '2 MXN' },
    { provider: 'PP', game: "Joker's Jewels Cash", minBet: '0.5 MXN' },
    { provider: 'PP', game: 'Wild Skullz', minBet: '0.6 MXN' },
    { provider: 'PP', game: 'Gates of Olympus Super Scatter', minBet: '0.6 MXN' },
    { provider: 'Fachai', game: 'ZEUS', minBet: '1 MXN' },
    { provider: 'Fachai', game: 'KONG ISLAND', minBet: '0.1 MXN' },
  ],
};

// Distinct providers available in a region, in list order.
export function providersForRegion(market: string): string[] {
  const seen: string[] = [];
  for (const g of REGION_GAMES[market] ?? []) {
    if (!seen.includes(g.provider)) seen.push(g.provider);
  }
  return seen;
}

export function gamesForRegionProvider(market: string, provider: string): GameConfig[] {
  return (REGION_GAMES[market] ?? []).filter((g) => g.provider === provider);
}

export function findGame(
  market: string,
  provider: string,
  game: string,
): GameConfig | undefined {
  return (REGION_GAMES[market] ?? []).find(
    (g) => g.provider === provider && g.game === game,
  );
}

// ─── Admin passcode ──────────────────────────────────────────────────
// Gate for the read-only heatmap viewer. Client-side soft gate (ships in
// the bundle) — treat as team friction, not real security.
// TODO: change before rollout.
export const ADMIN_PASSCODE = '346789';

// ─── Region passcodes ────────────────────────────────────────────────
// Soft gate: a tester must enter the region's code before opening a session
// for it (the browser then remembers it). NOTE: these ship in the app bundle,
// so treat this as team-level friction, not real security.
export const REGION_PASSCODES: Record<string, string> = {
  TH: '1244',
  PH: '2233',
  MX: '6612',
  BD: '9451',
};

// Longest passcode we accept in the setup input. Admin is 6 digits, region
// is 4 — take the max so a single input can hold either.
export const PASSCODE_MAX_LENGTH = Math.max(
  ADMIN_PASSCODE.length,
  ...Object.values(REGION_PASSCODES).map((c) => c.length),
);

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
