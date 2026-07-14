# Game Speed Check — S5Tech DX

Mobile-first web tool for weekly casino-game speed testing. VAs sign in with
their company Google account, set up a test session, upload one screen
recording per brand, rate gameplay (Smooth / Slight lag / Strong lag), and the
tool:

1. **Uploads the video to the team Google Drive** via resumable upload into an
   auto-created `Game Speed Check/{YYYY}/W{WW}/{MARKET}/` folder, named
   `{YYYY}-W{WW}_{MARKET}{SESSION}_{PROVIDER}-{GAME}_{GROUP}-{BRAND}_{DEVICE}.{ext}`
   (e.g. `2026-W29_TH2_JILI-GoldenEmpire_KZG1-DEE99_VivoY20S.mp4`) — the VA
   never types a filename.
2. **Logs the rating into the existing Google Sheets heatmap** — one row per
   session, brand cell colored green/yellow/red, VA notes + Drive link stored
   as a cell note.

Full requirements: [PROJECT_SPEC.md](./PROJECT_SPEC.md).

## Stack

React + Vite + TypeScript, no backend. Google Identity Services (token
client) in the browser; Google Drive API v3 (resumable upload) and Google
Sheets API v4 called directly with the OAuth token. Deploy target: Vercel.

## Running locally

```bash
npm install
npm run dev        # http://localhost:5173 (or --port of your choice)
npm test           # unit tests for filename / folder / date / validation logic
npm run build      # type-check + production build
```

**Mock mode:** while `OAUTH_CLIENT_ID` in [src/config.ts](src/config.ts) is
still the `YOUR_…` placeholder, the app runs fully mocked — sign-in, Drive
uploads and Sheets writes are simulated in memory (inspect
`window.__mockGoogle` in DevTools; every action is logged to the console).
The entire flow can be exercised with zero Google setup. Set real IDs and the
same code talks to the real APIs.

## One-time Google Cloud setup (Section 10 of the spec)

1. **Create a Google Cloud project** at <https://console.cloud.google.com>
   (use the S5Tech workspace account). Enable **Google Drive API** and
   **Google Sheets API** (APIs & Services → Library).
2. **OAuth consent screen** (APIs & Services → OAuth consent screen): choose
   **Internal** (S5Tech workspace only) — this avoids Google's verification
   review. App name e.g. "Game Speed Check".
3. **Create the OAuth Client ID** (APIs & Services → Credentials → Create
   credentials → OAuth client ID → **Web application**). Under **Authorized
   JavaScript origins** add:
   - `http://localhost:5173` (local dev — add any other port you use)
   - `https://<your-app>.vercel.app` (the production Vercel domain)
   No redirect URIs are needed (GIS token client uses a popup).
4. **Fill in [src/config.ts](src/config.ts):**
   - `OAUTH_CLIENT_ID` — from step 3 (`…apps.googleusercontent.com`)
   - `SPREADSHEET_ID` — from the heatmap spreadsheet URL
     (`https://docs.google.com/spreadsheets/d/<THIS PART>/edit`)
   - `DRIVE_ROOT_FOLDER_ID` — from the team Drive folder URL
     (`https://drive.google.com/drive/folders/<THIS PART>`); the
     `Game Speed Check/{YYYY}/W{WW}/{MARKET}` tree is created under it
     automatically
5. **Share with the VAs:** give every VA account **Editor** access to both
   the Drive root folder and the heatmap spreadsheet.

### Heatmap spreadsheet expectations

One tab per market named exactly `{MARKET} - Heatmap` (e.g. `TH - Heatmap`),
row 1 = header, data from row 2. Columns: **A** week number · **B** test date
(`Ddd, DD/MM`) · **C** device · **D** game/provider as displayed · **E–J**
brand cells · **K–M** competitor cells. Column order E→M must match the
`brands` array order for that market in `src/config.ts`.

## Team lists (also in src/config.ts)

- `MARKETS` — brand slots per market. **TH is filled in per the spec; PH /
  MX / BD have placeholder brands — replace them with the real lists** (order
  = sheet column order).
- `DEVICES` — assigned test phones (`id` is used in filenames, `label` in the
  UI and Sheet).
- `GAMES` — provider/game pairs for the weekly rotation, with `sheetLabel` =
  the provider name exactly as it appears in the Sheet's Game column.

## Deploying to Vercel

Import the repo in Vercel (framework preset: **Vite**) or `vercel deploy`.
No env vars needed — all config is compiled in from `src/config.ts`.
Remember to add the production domain to the OAuth client's authorized
JavaScript origins (step 3 above).

## Error handling (Section 8 of the spec)

- Token expiry mid-upload → token silently refreshed via GIS; the resumable
  session URI stays valid, upload continues from the last confirmed chunk.
- Network drop → 8 MB chunks retry up to 3× with exponential backoff
  (1s/2s/4s), querying the session for the last confirmed byte; the slot
  shows "Reconnecting…".
- Sheets write fails after the video is already in Drive → the slot shows
  "Video uploaded, logging failed — Retry logging"; retry re-runs only the
  Sheets write, never re-uploads.
- Unsaved slots trigger a leave-page warning (`beforeunload`), and switching
  sessions with unlogged slot data asks for confirmation.
- Re-submitting a slot that already has a video this session uploads as
  `_v2`, `_v3`, … with a visible warning — nothing is overwritten.
