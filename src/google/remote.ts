// Live backend: small Vercel API routes hold the service-account credentials
// and do the Drive/Sheets bookkeeping; the video bytes go straight from the
// browser to Google via the pre-authorized resumable session URI (no auth
// header needed on chunk PUTs, so no sign-in and no function size limits).

import { UPLOAD_CHUNK_BYTES, UPLOAD_CHUNK_RETRIES } from '../config';
import type {
  DxAccount,
  GoogleBackend,
  HeatmapData,
  LogSlotArgs,
  PreparedUpload,
  PrepareUploadArgs,
  SetDxRateArgs,
  UploadArgs,
  UploadPerfCsvArgs,
} from './types';

async function callApi(path: string, body?: unknown): Promise<Response> {
  const resp = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = (await resp.text()).slice(0, 300);
    throw new Error(`${path} failed (${resp.status}): ${text}`);
  }
  return resp;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type SessionState =
  | { done: false; offset: number }
  | { done: true; body: { id: string; webViewLink?: string } };

// Ask the resumable session how many bytes it has confirmed. A completed
// session answers 200 with the file metadata, which lets us recover the file
// id even if the original completion response was lost to a network drop.
async function querySession(sessionUri: string, totalBytes: number): Promise<SessionState> {
  const resp = await fetch(sessionUri, {
    method: 'PUT',
    headers: { 'Content-Range': `bytes */${totalBytes}` },
  });
  if (resp.status === 308) {
    const range = resp.headers.get('Range');
    return { done: false, offset: range ? parseInt(range.split('-')[1], 10) + 1 : 0 };
  }
  if (resp.ok) {
    return { done: true, body: (await resp.json()) as { id: string; webViewLink?: string } };
  }
  throw new Error(`Upload session status check failed (${resp.status})`);
}

export const remoteBackend: GoogleBackend = {
  async prepareUpload(args: PrepareUploadArgs): Promise<PreparedUpload> {
    const resp = await callApi('/api/create-upload', args);
    return (await resp.json()) as PreparedUpload;
  },

  // Resumable upload per Section 4.4b: 8 MB chunks, each retried up to 3×
  // with exponential backoff, resuming from the last confirmed byte.
  async uploadVideo({ file, prepared, onProgress, onStatus }: UploadArgs) {
    const { sessionUri } = prepared;
    let offset = 0;
    while (offset < file.size) {
      const end = Math.min(offset + UPLOAD_CHUNK_BYTES, file.size);
      const chunk = file.slice(offset, end);

      let attempt = 0;
      for (;;) {
        try {
          const resp = await fetch(sessionUri, {
            method: 'PUT',
            headers: { 'Content-Range': `bytes ${offset}-${end - 1}/${file.size}` },
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
          try {
            const stateNow = await querySession(sessionUri, file.size);
            if (stateNow.done) {
              onProgress(100);
              return {
                fileId: stateNow.body.id,
                webViewLink:
                  stateNow.body.webViewLink ??
                  `https://drive.google.com/file/d/${stateNow.body.id}/view`,
              };
            }
            if (stateNow.offset !== offset) {
              offset = stateNow.offset;
              onProgress(Math.round((offset / file.size) * 100));
              break; // re-slice from the new offset
            }
          } catch {
            // still offline — next attempt will retry
          }
        }
      }
    }
    throw new Error('Upload ended without completion response');
  },

  async uploadPerfCsv(args: UploadPerfCsvArgs) {
    const resp = await callApi('/api/upload-perf', args);
    return (await resp.json()) as { fileId: string; webViewLink: string };
  },

  async logSlot(args: LogSlotArgs): Promise<void> {
    await callApi('/api/log-slot', args);
  },

  async weekDates({ market, weekNumber }) {
    try {
      const resp = await callApi(
        `/api/week-info?market=${encodeURIComponent(market)}&week=${weekNumber}`,
      );
      const data = (await resp.json()) as { dates: string[] };
      return data.dates;
    } catch {
      return []; // auto-suggest is a nicety — never block setup on it
    }
  },

  async fetchHeatmap(market: string): Promise<HeatmapData> {
    const resp = await callApi(`/api/heatmap?market=${encodeURIComponent(market)}`);
    return (await resp.json()) as HeatmapData;
  },

  async fetchDxRateHeatmap(market: string): Promise<HeatmapData> {
    const resp = await callApi(`/api/dx-heatmap?market=${encodeURIComponent(market)}`);
    return (await resp.json()) as HeatmapData;
  },

  async setDxRate(args: SetDxRateArgs): Promise<void> {
    await callApi('/api/dx-rate', args);
  },

  async fetchDxAccount(market: string, brand: string): Promise<DxAccount | null> {
    const resp = await callApi(
      `/api/dx-account?market=${encodeURIComponent(market)}&brand=${encodeURIComponent(brand)}`,
    );
    return (await resp.json()) as DxAccount | null;
  },
};
