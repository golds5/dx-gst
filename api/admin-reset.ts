// One-shot cleanup: trash every video under DRIVE_ROOT_FOLDER_ID and delete
// every data row (below the header) from each region's heatmap tab.
//
// Gated by the server-only env var ADMIN_RESET_TOKEN — the client-shipped
// ADMIN_PASSCODE is not a real secret. Set ADMIN_RESET_TOKEN in Vercel, call
// this endpoint once with the matching header, then delete the file.
//
// POST /api/admin-reset
// Header: x-reset-token: <matches ADMIN_RESET_TOKEN>
import { DRIVE_ROOT_FOLDER_ID, MARKETS, SPREADSHEET_ID } from '../src/config.js';

const NATIVE_MIME_PREFIX = 'application/vnd.google-apps.';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
import { apiError, gFetch, handleError } from './_utils.js';
import type { ApiRequest, ApiResponse } from './_utils.js';

const SHEETS_BASE = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}`;
const DRIVE_BASE = 'https://www.googleapis.com/drive/v3';

type DriveFile = { id: string; name: string; mimeType: string };

async function listChildren(parentId: string): Promise<DriveFile[]> {
  const out: DriveFile[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({
      q: `'${parentId}' in parents and trashed = false`,
      fields: 'nextPageToken, files(id,name,mimeType)',
      pageSize: '1000',
      supportsAllDrives: 'true',
      includeItemsFromAllDrives: 'true',
    });
    if (pageToken) params.set('pageToken', pageToken);
    const resp = await gFetch(`${DRIVE_BASE}/files?${params}`);
    if (!resp.ok) throw await apiError('Drive list failed', resp);
    const data = (await resp.json()) as { files: DriveFile[]; nextPageToken?: string };
    out.push(...data.files);
    pageToken = data.nextPageToken;
  } while (pageToken);
  return out;
}

async function trashFile(id: string): Promise<void> {
  const resp = await gFetch(`${DRIVE_BASE}/files/${id}?supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
  if (!resp.ok) throw await apiError(`Drive trash failed for ${id}`, resp);
}

// Recursively trash uploaded videos under root. Skip:
//   - the heatmap spreadsheet itself (lives in the same folder)
//   - any Google-native doc/sheet/slide the SA doesn't own
// Folders that end up empty are also trashed. Reported counts show what was
// touched vs. skipped so a partial run is auditable.
async function purgeDriveFolder(rootId: string): Promise<{
  trashed: number;
  skipped: { id: string; name: string; reason: string }[];
}> {
  let trashed = 0;
  const skipped: { id: string; name: string; reason: string }[] = [];

  async function walk(parentId: string): Promise<void> {
    const children = await listChildren(parentId);
    for (const child of children) {
      if (child.id === SPREADSHEET_ID) {
        skipped.push({ id: child.id, name: child.name, reason: 'heatmap spreadsheet' });
        continue;
      }
      if (child.mimeType === FOLDER_MIME) {
        await walk(child.id);
        await trashFile(child.id);
        trashed += 1;
        continue;
      }
      if (child.mimeType.startsWith(NATIVE_MIME_PREFIX)) {
        skipped.push({ id: child.id, name: child.name, reason: `native ${child.mimeType}` });
        continue;
      }
      await trashFile(child.id);
      trashed += 1;
    }
  }

  await walk(rootId);
  return { trashed, skipped };
}

type SheetMeta = { sheetId: number; title: string; rowCount: number };

async function getAllSheets(): Promise<SheetMeta[]> {
  const resp = await gFetch(
    `${SHEETS_BASE}?fields=sheets.properties(sheetId,title,gridProperties.rowCount)`,
  );
  if (!resp.ok) throw await apiError('Spreadsheet metadata read failed', resp);
  const data = (await resp.json()) as {
    sheets: {
      properties: {
        sheetId: number;
        title: string;
        gridProperties: { rowCount: number };
      };
    }[];
  };
  return data.sheets.map((s) => ({
    sheetId: s.properties.sheetId,
    title: s.properties.title,
    rowCount: s.properties.gridProperties.rowCount,
  }));
}

async function clearSheetDataRows(): Promise<{ tab: string; rowsRemoved: number }[]> {
  const wantedTabs = new Set(Object.values(MARKETS).map((m) => m.sheetTab));
  const sheets = (await getAllSheets()).filter((s) => wantedTabs.has(s.title));

  const requests = sheets
    .filter((s) => s.rowCount > 1)
    .map((s) => ({
      deleteDimension: {
        range: {
          sheetId: s.sheetId,
          dimension: 'ROWS',
          startIndex: 1,
          endIndex: s.rowCount,
        },
      },
    }));

  if (requests.length > 0) {
    const resp = await gFetch(`${SHEETS_BASE}:batchUpdate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requests }),
    });
    if (!resp.ok) throw await apiError('Sheets clear failed', resp);
  }

  return sheets.map((s) => ({
    tab: s.title,
    rowsRemoved: Math.max(0, s.rowCount - 1),
  }));
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const expected = process.env.ADMIN_RESET_TOKEN;
    if (!expected) {
      return res
        .status(500)
        .json({ error: 'Server missing ADMIN_RESET_TOKEN env var' });
    }
    const provided = req.headers['x-reset-token'];
    const providedStr = Array.isArray(provided) ? provided[0] : provided;
    if (providedStr !== expected) {
      return res.status(401).json({ error: 'Bad or missing x-reset-token' });
    }

    const drive = await purgeDriveFolder(DRIVE_ROOT_FOLDER_ID);
    const sheetsCleared = await clearSheetDataRows();

    res.status(200).json({
      ok: true,
      driveTrashed: drive.trashed,
      driveSkipped: drive.skipped,
      sheetsCleared,
      note: 'Drive files are in Trash — empty it in Drive to hard-delete.',
    });
  } catch (err) {
    handleError(res, err);
  }
}
