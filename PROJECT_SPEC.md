# PROJECT_SPEC — Game Speed Check Tool

## 1. Purpose

Mobile-first web tool for S5Tech DX game speed testing. VAs record gameplay on assigned devices, upload one video per brand slot, rate gameplay (Smooth / Slight lag / Strong lag), and add notes. The tool:

1. Uploads raw video to the team Google Drive with an auto-generated filename (VA never types a name).
2. Logs the rating as a colored cell in the existing Google Sheets heatmap (green / yellow / red), one row per test session, so management can read either the tool or the Sheet.

## 2. Stack

- React + Vite, deployed on Vercel (same pattern as Release Date Checker).
- No backend server. Google Identity Services (GIS) token client in the browser.
- Google Drive API v3 **resumable upload** for videos.
- Google Sheets API v4 for heatmap rows (values + cell background color + cell note).
- OAuth scopes: `https://www.googleapis.com/auth/drive.file` and `https://www.googleapis.com/auth/spreadsheets`.
- Config in a single `src/config.ts`: OAuth Client ID, Spreadsheet ID, Drive root folder ID, market definitions, brand lists, device list, game/provider list.

## 3. Data model

### Session
A session = one VA testing one game on one device at one time for one market.

```ts
type Session = {
  market: 'TH' | 'PH' | 'MX' | 'BD';     // extensible
  sessionOfWeek: 1 | 2;                   // TH tests 2×/week; others 1×/week
  isoYear: number;                        // e.g. 2026
  weekNumber: number;                     // ISO week, e.g. 29
  testDate: string;                       // YYYY-MM-DD
  device: string;                         // from device list, e.g. 'VivoY20S'
  provider: string;                       // e.g. 'JILI', 'PGSoft'
  game: string;                           // e.g. 'GoldenEmpire'
}
```

### Brand slots (per market config)
```ts
type Brand = {
  group: string;   // Back-office group, e.g. 'KZG1'; use 'CMP' for competitors
  name: string;    // e.g. 'DEE99', 'BetFlik'
  isCompetitor: boolean;
}
```

TH default list (order = Sheet column order):
KZG1-DEE99, KZG2-BIG188, WDB1-TRU99, BLG1-RM99, 96G1-789BK, 96G2-TK69 | competitors: BetFlik, M98, PIG168.

### Slot entry
```ts
type SlotEntry = {
  brand: Brand;
  videoFile?: File;          // exactly one
  rating?: 'smooth' | 'slight' | 'strong';
  notes?: string;            // required if rating !== 'smooth'
  driveFileId?: string;
  status: 'empty' | 'uploading' | 'uploaded' | 'logged' | 'error';
  progress?: number;         // 0–100
}
```

## 4. User flow

1. **Sign in** — GIS button; request the two scopes. Persist token in memory (refresh via GIS when expired). Show signed-in email.
2. **Session setup screen** — VA picks: market, test date (default today), device, provider + game, session of week (auto-suggest: TH → 1 if first test this week per Sheet, else 2; other markets → 1). Week number auto-computed from date (ISO 8601), shown read-only as `W29 · 2026`.
3. **Slot grid** — one card per brand (pinned groups first, competitors last). Each card:
   - Tap the phone-frame slot → `<input type="file" accept="video/*">` (opens photo library on iOS/Android). One file max; re-tap replaces before upload starts.
   - Rating segmented control: Smooth (green) / Slight lag (yellow) / Strong lag (red).
   - Notes textarea. If rating = Slight or Strong: notes **required**, and must contain at least one timestamp matching `\d{1,2}:\d{2}` (e.g. `0:25`). Show inline validation message: "Add at least one timestamp (e.g. 0:25–0:30)."
   - "Submit slot" button — enabled only when video + rating (+ valid notes if lag) present.
4. **On submit slot** (sequential, per slot):
   a. Ensure Drive folder path exists (create-if-missing): `Game Speed Check / {YYYY} / W{WW} / {MARKET}` under the configured root folder ID.
   b. Resumable upload the video with the generated filename (Section 5). Show progress %. Chunk size 8 MB; retry each chunk up to 3× with exponential backoff.
   c. Write the heatmap cell (Section 6).
   d. Mark slot `logged` with a link to the Drive file.
5. **Session summary** — counts (x/9 logged), list of any errors with per-slot retry.

## 5. Video naming system

```
{YYYY}-W{WW}_{MARKET}{SESSION}_{PROVIDER}-{GAME}_{GROUP}-{BRAND}_{DEVICE}.{ext}
```

Example: `2026-W29_TH2_JILI-GoldenEmpire_KZG1-DEE99_VivoY20S.mp4`

Rules:
- `WW` zero-padded ISO week (W05).
- `SESSION` = sessionOfWeek digit (TH1/TH2; other markets always 1).
- Competitor brands use group `CMP` → `CMP-BetFlik`.
- All parts CamelCase, no spaces; strip characters outside `[A-Za-z0-9-]` within each part; parts joined by `_`.
- Extension preserved from the source file (mp4/mov).
- If a file with the same name already exists in the target folder, append `_v2`, `_v3`, … and warn the VA ("A video for this slot already exists this session — uploading as v2").

## 6. Sheets heatmap logging

Target: existing spreadsheet, one tab per market named `{MARKET} - Heatmap` (e.g. `TH - Heatmap`).

Column layout (must match the existing sheet):
- A: Week number
- B: Test date, formatted `Ddd, DD/MM` (e.g. `Wed, 24/06`)
- C: Device
- D: Game (provider name as displayed, e.g. `PG Soft`, `Jili`)
- E–J: KZG brand cells (`KZG1 - DEE99` … `96G2 - TK69`)
- K–M: Competitor cells (`BetFlik`, `M98`, `PIG168`)

Behavior:
- **Row = session.** On first slot submission of a session, find an existing row matching (test date + device + game) in the market tab; if none, append a new row at the top of the data range (row 2) with A–D filled and E–M containing brand names with neutral (no fill) background. Cache the row index for the session.
- **Cell update per slot:** set cell value = brand label (e.g. `KZG1 - DEE99`), background color by rating:
  - smooth → green `#B7E1CD`-family (match existing sheet: use `{red:0.72,green:0.88,blue:0.80}` or sample from sheet)
  - slight → yellow `{red:1,green:0.90,blue:0.60}`
  - strong → red `{red:0.94,green:0.50,blue:0.50}`
- **Notes:** attach gameplay notes + Drive file link as a **cell note** (Sheets `note` field), keeping the grid visually clean.
- Week column: write week number on every row (management handles merged-cell grouping manually; do not attempt merges).
- All writes via `spreadsheets.batchUpdate` (repeatCell for color + note, updateCells for values) to keep it to 1–2 API calls per slot.

## 7. UI

Reuse the dark Grok × Notion design already prototyped (`game-speed-check-template.html`): dark base, gold accent, JetBrains Mono for IDs, phone-frame upload slots, pinned-brand gold top border, rating pills glowing green/amber/red. Mobile-first (VAs work from phones); single column on <720px.

## 8. Error handling

- Token expiry mid-upload → silently re-request token via GIS, resume upload from last confirmed chunk.
- Network drop → resumable protocol resumes; show "Reconnecting…" state.
- Sheets write fails after Drive upload succeeded → slot state `error` with "Video uploaded, logging failed — Retry logging" (do not re-upload the video).
- Never lose VA input: keep slot state in memory for the session; warn on page close with unsaved slots (`beforeunload`).

## 9. Acceptance tests

1. Selecting a video from the phone library attaches exactly one file to the slot; selecting again before submit replaces it.
2. Submitting with rating = Slight lag and notes without a timestamp is blocked with the inline validation message; adding `0:25–0:30` unblocks it.
3. Rating = Smooth submits with empty notes.
4. A 150 MB video uploads successfully via resumable upload with visible progress, on a throttled 4G connection profile.
5. Uploaded file lands in `Game Speed Check/2026/W{current}/TH/` and is named exactly per Section 5 pattern for the chosen session values.
6. Uploading the same slot twice in one session produces `_v2` suffix and a warning, not an overwrite.
7. First slot submission of a new session creates one new row in `TH - Heatmap` with A–D populated and correct `Ddd, DD/MM` date format; subsequent slots update cells in the same row (no duplicate rows).
8. Cell background matches rating color; cell note contains the VA's notes and a working Drive link.
9. Two sessions on the same date with different devices produce two separate rows.
10. Killing the network mid-upload then restoring it resumes and completes the upload without restarting from 0%.

## 10. Google Cloud setup (one-time, manual — document in README)

1. Create a Google Cloud project; enable Drive API + Sheets API.
2. OAuth consent screen: Internal (S5Tech workspace) — avoids verification review.
3. Create OAuth Client ID (Web application); add Vercel domain + localhost to authorized JavaScript origins.
4. Put Client ID, Spreadsheet ID, and Drive root folder ID in `src/config.ts`.
5. Share the Drive root folder and spreadsheet with all VA accounts (Editor).
