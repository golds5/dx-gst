// POST { session, brand, csv } → { fileId, webViewLink }
// Stores a slot's page-speed CSV beside its video, in the same
// Game Speed Check/{YYYY}/W{WW}/{MARKET} folder, named like the video with a
// `_speed.csv` suffix. The payload is a few KB, so this is a single
// multipart upload through the function rather than a resumable session.
// Re-measuring a slot overwrites the existing CSV in place.
import { DRIVE_ROOT_FOLDER_ID } from '../src/config.js';
import type { BrandConfig } from '../src/config.js';
import { buildFolderPath, buildPerfCsvFilename } from '../src/lib/naming.js';
import { apiError, gFetch, handleError } from './_utils.js';
import type { ApiRequest, ApiResponse } from './_utils.js';

const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DRIVE_PARAMS = 'supportsAllDrives=true&includeItemsFromAllDrives=true';
const CSV_MIME = 'text/csv';

// Guards against a runaway client — a normal CSV here is 1–3 KB.
const MAX_CSV_BYTES = 512 * 1024;

const escapeQuery = (v: string) => v.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function ensureFolderPath(segments: string[]): Promise<string> {
  let parentId = DRIVE_ROOT_FOLDER_ID;
  for (const segment of segments) {
    const q = encodeURIComponent(
      `name = '${escapeQuery(segment)}' and '${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
    );
    const found = await gFetch(`${FILES_URL}?q=${q}&fields=files(id)&${DRIVE_PARAMS}`);
    if (!found.ok) throw await apiError('Drive folder lookup failed', found);
    const files = ((await found.json()) as { files: { id: string }[] }).files;
    if (files[0]) {
      parentId = files[0].id;
      continue;
    }
    const created = await gFetch(`${FILES_URL}?fields=id&supportsAllDrives=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: segment, mimeType: FOLDER_MIME, parents: [parentId] }),
    });
    if (!created.ok) throw await apiError('Drive folder creation failed', created);
    parentId = ((await created.json()) as { id: string }).id;
  }
  return parentId;
}

type Body = {
  session: {
    market: string;
    sessionOfWeek: number;
    isoYear: number;
    weekNumber: number;
    device: string;
    provider: string;
    game: string;
  };
  brand: BrandConfig;
  csv: string;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const { session, brand, csv } = req.body as Body;
    if (typeof csv !== 'string' || !csv.trim()) {
      return res.status(400).json({ error: 'Missing CSV content' });
    }
    if (Buffer.byteLength(csv, 'utf8') > MAX_CSV_BYTES) {
      return res.status(413).json({ error: 'CSV too large' });
    }

    const folderId = await ensureFolderPath(
      buildFolderPath(session.isoYear, session.weekNumber, session.market),
    );
    const name = buildPerfCsvFilename({
      isoYear: session.isoYear,
      weekNumber: session.weekNumber,
      market: session.market,
      sessionOfWeek: session.sessionOfWeek,
      provider: session.provider,
      game: session.game,
      brand,
      deviceId: session.device,
    });

    // Exact-name match: the CSV stem differs from the video's, so this only
    // ever finds a previous CSV for the same slot.
    const listQ = encodeURIComponent(
      `'${folderId}' in parents and name = '${escapeQuery(name)}' and trashed = false`,
    );
    const listResp = await gFetch(
      `${FILES_URL}?q=${listQ}&fields=files(id)&${DRIVE_PARAMS}`,
    );
    if (!listResp.ok) throw await apiError('Drive file listing failed', listResp);
    const previous = ((await listResp.json()) as { files: { id: string }[] }).files[0];

    // multipart/related: metadata part then the file bytes, per the Drive
    // upload API. Only a new file carries `parents`; a replacement PATCHes
    // the existing id so the link already written to the sheet stays valid.
    const boundary = `dxgst${Date.now().toString(36)}`;
    const metadata = previous
      ? { name, mimeType: CSV_MIME }
      : { name, mimeType: CSV_MIME, parents: [folderId] };
    const body =
      `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      `${JSON.stringify(metadata)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Type: ${CSV_MIME}; charset=UTF-8\r\n\r\n` +
      `${csv}\r\n` +
      `--${boundary}--`;

    const target = previous
      ? `${UPLOAD_URL}/${previous.id}?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`
      : `${UPLOAD_URL}?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink`;
    const resp = await gFetch(target, {
      method: previous ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    if (!resp.ok) throw await apiError('Speed CSV upload failed', resp);
    const uploaded = (await resp.json()) as { id: string; webViewLink?: string };

    res.status(200).json({
      fileId: uploaded.id,
      webViewLink:
        uploaded.webViewLink ?? `https://drive.google.com/file/d/${uploaded.id}/view`,
    });
  } catch (err) {
    handleError(res, err);
  }
}
