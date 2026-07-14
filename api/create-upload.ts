// POST { session, brand, sourceFileName, contentType }
//  → { sessionUri, finalName, replaced }
// Generates the Section 5 filename, ensures the Drive folder path, and opens
// a resumable upload session whose URI the browser streams the video to.
// One video per slot: if the slot already has a video this session (same
// filename stem, any extension), the upload REPLACES that file in place —
// same Drive file id, so heatmap links stay valid.
import { DRIVE_ROOT_FOLDER_ID } from '../src/config.js';
import type { BrandConfig } from '../src/config.js';
import {
  buildFolderPath,
  buildVideoFilename,
  stemOf,
} from '../src/lib/naming.js';
import { apiError, gFetch, handleError } from './_utils.js';
import type { ApiRequest, ApiResponse } from './_utils.js';

const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DRIVE_PARAMS = 'supportsAllDrives=true&includeItemsFromAllDrives=true';

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
  sourceFileName: string;
  contentType?: string;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
    const { session, brand, sourceFileName, contentType } = req.body as Body;

    const folderId = await ensureFolderPath(
      buildFolderPath(session.isoYear, session.weekNumber, session.market),
    );

    const desired = buildVideoFilename({
      isoYear: session.isoYear,
      weekNumber: session.weekNumber,
      market: session.market,
      sessionOfWeek: session.sessionOfWeek,
      provider: session.provider,
      game: session.game,
      brand,
      deviceId: session.device,
      sourceFileName,
    });

    const listQ = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
    const listResp = await gFetch(
      `${FILES_URL}?q=${listQ}&fields=files(id,name)&pageSize=1000&${DRIVE_PARAMS}`,
    );
    if (!listResp.ok) throw await apiError('Drive file listing failed', listResp);
    const existing = ((await listResp.json()) as {
      files: { id: string; name: string }[];
    }).files;
    const previous = existing.find((f) => stemOf(f.name) === stemOf(desired));

    // Origin must match the browser page so Google allows the cross-origin
    // chunk PUTs from the client.
    const origin =
      (req.headers.origin as string | undefined) ?? `https://${req.headers.host}`;
    const headers = {
      'Content-Type': 'application/json',
      'X-Upload-Content-Type': contentType || 'video/mp4',
      Origin: origin,
    };
    // New upload (POST) or in-place replacement of the existing file (PATCH).
    const initResp = previous
      ? await gFetch(
          `${UPLOAD_URL}/${previous.id}?uploadType=resumable&supportsAllDrives=true&fields=id,webViewLink`,
          { method: 'PATCH', headers, body: JSON.stringify({ name: desired }) },
        )
      : await gFetch(
          `${UPLOAD_URL}?uploadType=resumable&supportsAllDrives=true&fields=id,webViewLink`,
          {
            method: 'POST',
            headers,
            body: JSON.stringify({ name: desired, parents: [folderId] }),
          },
        );
    if (!initResp.ok) throw await apiError('Could not start upload session', initResp);
    const sessionUri = initResp.headers.get('Location');
    if (!sessionUri) throw new Error('Drive did not return an upload session URI');

    res.status(200).json({ sessionUri, finalName: desired, replaced: Boolean(previous) });
  } catch (err) {
    handleError(res, err);
  }
}
