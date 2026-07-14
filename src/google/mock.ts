// In-memory mock of the backend, used during local `vite dev` (no API routes
// there). Mimics the real behavior: filename generation, _vN collisions,
// heatmap row find-or-create, per-slot cell updates. State is inspectable at
// window.__mockGoogle and every action is logged to the console.

import { MARKETS, RATING_COLORS } from '../config';
import {
  buildFolderPath,
  buildVideoFilename,
  formatSheetDate,
  nextAvailableName,
} from '../lib/naming';
import { brandCellLabel, deviceLabelFor, gameSheetLabelFor } from '../lib/labels';
import type {
  GoogleBackend,
  LogSlotArgs,
  PrepareUploadArgs,
  UploadArgs,
} from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type MockRow = {
  week: number;
  date: string;
  device: string;
  game: string;
  cells: Record<number, { label: string; color: string; note: string }>;
};

const state = {
  filesByFolder: new Map<string, string[]>(), // folder path → file names
  tabs: new Map<string, MockRow[]>(), // tab title → rows (index 0 = sheet row 2)
  uploadCounter: 0,
};

declare global {
  interface Window {
    __mockGoogle?: typeof state;
  }
}
if (typeof window !== 'undefined') window.__mockGoogle = state;

const log = (...args: unknown[]) => console.log('[mock-google]', ...args);

export const mockBackend: GoogleBackend = {
  async prepareUpload({ session, brand, sourceFileName }: PrepareUploadArgs) {
    await sleep(250);
    const folderPath = buildFolderPath(
      session.isoYear,
      session.weekNumber,
      session.market,
    ).join('/');
    const existing = state.filesByFolder.get(folderPath) ?? [];
    state.filesByFolder.set(folderPath, existing);
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
    const finalName = nextAvailableName(desired, existing);
    log(`prepared upload "${finalName}" → ${folderPath}`);
    return { sessionUri: `mock-session:${folderPath}/${finalName}`, finalName };
  },

  async uploadVideo({ file, prepared, onProgress }: UploadArgs) {
    log(`uploading "${prepared.finalName}" (${(file.size / 1e6).toFixed(1)} MB)`);
    for (let pct = 0; pct < 100; pct += 7) {
      onProgress(Math.min(pct, 99));
      await sleep(120);
    }
    onProgress(100);
    const folderPath = prepared.sessionUri.slice('mock-session:'.length).split('/').slice(0, -1).join('/');
    state.filesByFolder.get(folderPath)?.push(prepared.finalName);
    state.uploadCounter += 1;
    const fileId = `mock-file-${state.uploadCounter}`;
    log(`uploaded "${prepared.finalName}" → ${fileId}`);
    return {
      fileId,
      webViewLink: `https://drive.google.com/file/d/${fileId}/view (mock)`,
    };
  },

  async logSlot({ session, brandIndex, brand, rating, notes, driveLink }: LogSlotArgs) {
    await sleep(350);
    const tab = MARKETS[session.market].sheetTab;
    const rows = state.tabs.get(tab) ?? [];
    state.tabs.set(tab, rows);
    const date = formatSheetDate(session.testDate);
    const device = deviceLabelFor(session.device);
    const game = gameSheetLabelFor(session.provider, session.game);
    let idx = rows.findIndex(
      (r) => r.date === date && r.device === device && r.game === game,
    );
    if (idx === -1) {
      rows.unshift({ week: session.weekNumber, date, device, game, cells: {} });
      idx = 0;
      log(`created row 2 in "${tab}": W${session.weekNumber} · ${date} · ${device} · ${game}`);
    } else {
      log(`reusing existing row ${idx + 2} in "${tab}"`);
    }
    const note = [notes.trim(), `Video: ${driveLink}`].filter(Boolean).join('\n\n');
    rows[idx].cells[brandIndex] = {
      label: brandCellLabel(brand),
      color: JSON.stringify(RATING_COLORS[rating]),
      note,
    };
    log(
      `wrote cell row ${idx + 2} col ${String.fromCharCode(69 + brandIndex)} ` +
        `(${brandCellLabel(brand)}) rating=${rating}`,
      { note },
    );
  },

  async hasSessionThisWeek({ market, weekNumber }) {
    await sleep(100);
    const rows = state.tabs.get(MARKETS[market].sheetTab) ?? [];
    return rows.some((r) => r.week === weekNumber);
  },
};
