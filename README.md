# DX-GST — Game Speed Test (S5Tech DX)

Mobile-first web tool for weekly casino-game speed testing. VAs open the URL
(no sign-in), set up a test session, upload one screen recording per brand,
rate gameplay (Smooth / Slight lag / Strong lag), and the tool:

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

React + Vite + TypeScript frontend plus three tiny Vercel API functions
(`api/`). A **service account** is the only Google identity — VAs never sign
in (the OAuth popup flow proved unreliable on mobile browsers). The API
functions generate the filename, prepare the Drive folder, open a resumable
upload session, and write the Sheets heatmap; the video bytes stream directly
from the browser to Google, so uploads are not limited by function payload
sizes.

## Running locally

```bash
npm install
npm run dev        # http://localhost:5173 (or --port of your choice)
npm test           # unit tests for filename / folder / date / validation logic
npm run build      # type-check + production build
```

**Mock mode:** `vite dev` has no API routes, so local dev always simulates
Drive/Sheets in memory (inspect `window.__mockGoogle` in DevTools; every
action is logged to the console). The deployed app talks to the real APIs
through `api/`.

## One-time Google Cloud setup

1. **Create a Google Cloud project** at <https://console.cloud.google.com>.
   Enable **Google Drive API** and **Google Sheets API** (APIs & Services →
   Library).
2. **Create a service account:** IAM & Admin → Service Accounts → Create
   (name e.g. `dx-gst-uploader`; no roles needed) → open it → Keys → Add key
   → **JSON**. The downloaded file contains `client_email` and `private_key`.
3. **Share with the service account** (the `…@….iam.gserviceaccount.com`
   email): give it **Editor** on the Drive root folder and on the heatmap
   spreadsheet. VAs need no Google accounts at all.
4. **Set the Vercel env vars** (Project → Settings → Environment Variables,
   all environments):
   - `GOOGLE_SA_EMAIL` — the `client_email` from the JSON key
   - `GOOGLE_SA_PRIVATE_KEY` — the `private_key` from the JSON key (paste it
     whole, including the BEGIN/END lines)
   Redeploy after adding them.
5. **Fill in [src/config.ts](src/config.ts):** `SPREADSHEET_ID` (from the
   spreadsheet URL) and `DRIVE_ROOT_FOLDER_ID` (from the folder URL); the
   `Game Speed Check/{YYYY}/W{WW}/{MARKET}` tree is created automatically.

> **Storage note:** files uploaded by a service account into a normal
> My-Drive folder count against the service account's own 15 GB quota. For
> long-term use, put the root folder in a Google Workspace **Shared Drive**
> (pooled storage) and share that with the service account — the code already
> supports Shared Drives.

> **Access note:** there is no login, so anyone with the URL can upload and
> write the heatmap. Keep the URL internal.

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
Set the two `GOOGLE_SA_*` env vars (step 4 above); everything else is
compiled in from `src/config.ts`.

## Connection check (speed CSV)

Submitting a slot first runs a short connection check from the VA's phone,
then uploads the video, then a `…_speed.csv` next to it in the same Drive
folder (link added to the heatmap cell note). Its purpose is to tell a slow
game *server* apart from a slow VA *connection*:

- **Brand site** (`mp_domain` from [kz_sites.csv](./kz_sites.csv), falling back
  to `brand_site`, then to the DX Accounts sheet; resolved automatically and
  not shown to the VA) — DNS + connect + TTFB via a cross-origin `no-cors`
  fetch, plus a favicon round trip. Slots with no site on file, or a
  malformed one, run baseline-only.
- **Baseline** — full download of `/favicon.svg` from the app's own origin.
  Baseline fast + brand slow → brand server/CDN. Both slow → VA connection.
- **Device network** — `navigator.connection` (4g/3g, downlink, RTT) and
  hardware info. A one-line verdict sits at the top of the CSV.

Three samples per probe, sequential, 8 s timeout, stop after the first
failure — worst case ~24 s added to a submit. The check is best-effort: a
failed probe or CSV upload never blocks the video or the rating. It cannot
read in-page FCP / LCP / long tasks from another origin — that still needs
the Chrome extension in `component-performance-audit/`.

## Error handling (Section 8 of the spec)

- The service-account token is cached and auto-refreshed server-side; the
  resumable session URI stays valid for the whole upload.
- Network drop → 8 MB chunks retry up to 3× with exponential backoff
  (1s/2s/4s), querying the session for the last confirmed byte; the slot
  shows "Reconnecting…".
- Sheets write fails after the video is already in Drive → the slot shows
  "Video uploaded, logging failed — Retry logging"; retry re-runs only the
  Sheets write, never re-uploads.
- Unsaved slots trigger a leave-page warning (`beforeunload`), and switching
  sessions with unlogged slot data asks for confirmation.
- One video per slot: re-submitting a slot that already has a video this
  session **replaces** the file in place (same Drive file id, so heatmap
  links stay valid) with a visible notice.
