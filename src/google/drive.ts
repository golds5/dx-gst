// Google Drive API v3: folder find-or-create + resumable video upload
// (Section 4.4a/b and Section 8 of the spec).

import {
  DRIVE_ROOT_FOLDER_ID,
  UPLOAD_CHUNK_BYTES,
  UPLOAD_CHUNK_RETRIES,
} from '../config';
import { gFetch, getAccessToken } from './auth';
import type { UploadArgs } from './types';

const FILES_URL = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DRIVE_PARAMS = 'supportsAllDrives=true&includeItemsFromAllDrives=true';

const folderCache = new Map<string, string>(); // path key → folder id

function escapeQuery(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Surface Google's own error message (e.g. "Drive API has not been used in
// project … or it is disabled") instead of a bare status code.
export async function apiError(prefix: string, resp: Response): Promise<Error> {
  let detail = '';
  try {
    const body = (await resp.json()) as { error?: { message?: string } };
    detail = body.error?.message ?? '';
  } catch {
    // non-JSON body — keep just the status
  }
  return new Error(`${prefix} (${resp.status}${detail ? `: ${detail}` : ''})`);
}

async function findChildFolder(parentId: string, name: string): Promise<string | null> {
  const q = encodeURIComponent(
    `name = '${escapeQuery(name)}' and '${parentId}' in parents and mimeType = '${FOLDER_MIME}' and trashed = false`,
  );
  const resp = await gFetch(`${FILES_URL}?q=${q}&fields=files(id)&${DRIVE_PARAMS}`);
  if (!resp.ok) throw await apiError('Drive folder lookup failed', resp);
  const data = (await resp.json()) as { files: { id: string }[] };
  return data.files[0]?.id ?? null;
}

async function createFolder(parentId: string, name: string): Promise<string> {
  const resp = await gFetch(`${FILES_URL}?fields=id&supportsAllDrives=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
  });
  if (!resp.ok) throw await apiError('Drive folder creation failed', resp);
  return ((await resp.json()) as { id: string }).id;
}

// Walk segments under the configured root, creating any missing folder.
export async function ensureFolderPath(segments: string[]): Promise<string> {
  let parentId = DRIVE_ROOT_FOLDER_ID;
  let key = '';
  for (const segment of segments) {
    key += `/${segment}`;
    const cached = folderCache.get(key);
    if (cached) {
      parentId = cached;
      continue;
    }
    const id =
      (await findChildFolder(parentId, segment)) ??
      (await createFolder(parentId, segment));
    folderCache.set(key, id);
    parentId = id;
  }
  return parentId;
}

export async function listFileNames(folderId: string): Promise<string[]> {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
  const resp = await gFetch(
    `${FILES_URL}?q=${q}&fields=files(name)&pageSize=1000&${DRIVE_PARAMS}`,
  );
  if (!resp.ok) throw await apiError('Drive file listing failed', resp);
  const data = (await resp.json()) as { files: { name: string }[] };
  return data.files.map((f) => f.name);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Ask the resumable session how many bytes it has confirmed so far.
// Returns the next offset to send, or -1 if the upload already completed.
async function queryResumeOffset(
  sessionUri: string,
  totalBytes: number,
): Promise<number> {
  const resp = await fetch(sessionUri, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes */${totalBytes}` },
  });
  if (resp.status === 308) {
    const range = resp.headers.get('Range'); // e.g. "bytes=0-8388607"
    if (!range) return 0;
    return parseInt(range.split('-')[1], 10) + 1;
  }
  if (resp.ok) return -1; // already finished
  throw new Error(`Upload session status check failed (${resp.status})`);
}

// Resumable upload per Section 4.4b: 8 MB chunks, each chunk retried up to
// 3× with exponential backoff, resuming from the last confirmed byte.
export async function uploadVideo({
  file,
  name,
  folderId,
  onProgress,
  onStatus,
}: UploadArgs): Promise<{ fileId: string; webViewLink: string }> {
  // 1. Initiate the resumable session.
  const token = await getAccessToken();
  const initResp = await fetch(
    `${UPLOAD_URL}?uploadType=resumable&supportsAllDrives=true&fields=id,webViewLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': file.type || 'video/mp4',
        'X-Upload-Content-Length': String(file.size),
      },
      body: JSON.stringify({ name, parents: [folderId] }),
    },
  );
  if (!initResp.ok) throw await apiError('Could not start upload', initResp);
  const sessionUri = initResp.headers.get('Location');
  if (!sessionUri) throw new Error('Drive did not return an upload session URI');

  // 2. Send chunks. The session URI is itself authorized, so a token expiring
  // mid-upload does not invalidate it; we keep pushing bytes.
  let offset = 0;
  while (offset < file.size) {
    const end = Math.min(offset + UPLOAD_CHUNK_BYTES, file.size);
    const chunk = file.slice(offset, end);

    let attempt = 0;
    for (;;) {
      try {
        const resp = await fetch(sessionUri, {
          method: 'PUT',
          headers: {
            'Content-Range': `bytes ${offset}-${end - 1}/${file.size}`,
          },
          body: chunk,
        });

        if (resp.status === 308) {
          const range = resp.headers.get('Range');
          offset = range ? parseInt(range.split('-')[1], 10) + 1 : end;
          onStatus?.('uploading');
          onProgress(Math.round((offset / file.size) * 100));
          break;
        }
        if (resp.ok) {
          onProgress(100);
          const body = (await resp.json()) as { id: string; webViewLink?: string };
          return {
            fileId: body.id,
            webViewLink:
              body.webViewLink ?? `https://drive.google.com/file/d/${body.id}/view`,
          };
        }
        throw new Error(`Chunk upload failed (${resp.status})`);
      } catch (err) {
        attempt += 1;
        if (attempt > UPLOAD_CHUNK_RETRIES) throw err;
        onStatus?.('reconnecting');
        await sleep(1000 * 2 ** (attempt - 1)); // 1s, 2s, 4s
        // After a network drop, ask the session where to resume from.
        try {
          const confirmed = await queryResumeOffset(sessionUri, file.size);
          if (confirmed === -1) {
            // Finished while we were offline; fetch metadata via files API.
            onProgress(100);
            const meta = await gFetch(
              `${FILES_URL}?q=${encodeURIComponent(
                `name = '${escapeQuery(name)}' and '${folderId}' in parents and trashed = false`,
              )}&fields=files(id,webViewLink)&${DRIVE_PARAMS}`,
            );
            const data = (await meta.json()) as {
              files: { id: string; webViewLink?: string }[];
            };
            const f = data.files[0];
            if (f) {
              return {
                fileId: f.id,
                webViewLink:
                  f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
              };
            }
            throw new Error('Upload finished but file metadata not found');
          }
          if (confirmed !== offset) {
            offset = confirmed;
            onProgress(Math.round((offset / file.size) * 100));
            break; // re-slice from the new offset
          }
        } catch {
          // status check itself failed (still offline) — next attempt will retry
        }
      }
    }
  }
  throw new Error('Upload ended without completion response');
}
