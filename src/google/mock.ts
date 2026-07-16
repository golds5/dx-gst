// In-memory mock of the backend, used during local `vite dev` (no API routes
// there). Mimics the real behavior: filename generation, _vN collisions,
// heatmap row find-or-create, per-slot cell updates. State is inspectable at
// window.__mockGoogle and every action is logged to the console.

import { MARKETS, RATING_COLORS } from '../config';
import {
  buildFolderPath,
  buildVideoFilename,
  formatSheetDate,
  stemOf,
} from '../lib/naming';
import { brandCellLabel, deviceLabelFor, gameSheetLabelFor } from '../lib/labels';
import type {
  GoogleBackend,
  HeatmapData,
  LogSlotArgs,
  PrepareUploadArgs,
  UploadArgs,
} from './types';

// {red,green,blue} 0–1 → css rgb() for the admin viewer.
function toCss(colorJson: string): string {
  const c = JSON.parse(colorJson) as { red: number; green: number; blue: number };
  const to255 = (v: number) => Math.round((v ?? 0) * 255);
  return `rgb(${to255(c.red)}, ${to255(c.green)}, ${to255(c.blue)})`;
}

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
    // One video per slot: same stem → replace the existing file in place.
    const prevIndex = existing.findIndex((n) => stemOf(n) === stemOf(desired));
    if (prevIndex !== -1) existing.splice(prevIndex, 1);
    log(`prepared upload "${desired}" → ${folderPath}${prevIndex !== -1 ? ' (replacing)' : ''}`);
    return {
      sessionUri: `mock-session:${folderPath}/${desired}`,
      finalName: desired,
      replaced: prevIndex !== -1,
    };
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

  async weekDates({ market, weekNumber }) {
    await sleep(100);
    const rows = state.tabs.get(MARKETS[market].sheetTab) ?? [];
    return rows.filter((r) => r.week === weekNumber).map((r) => r.date);
  },

  async fetchHeatmap(market: string): Promise<HeatmapData> {
    await sleep(250);
    const cfg = MARKETS[market];
    const rows = state.tabs.get(cfg.sheetTab) ?? [];
    const headers = ['Week', 'Date', 'Device', 'Game', ...cfg.brands.map(brandCellLabel)];
    return {
      title: cfg.sheetTab,
      headers,
      rows: rows.map((r) => {
        const cells: HeatmapData['rows'][number] = [
          { value: String(r.week), color: null, note: null },
          { value: r.date, color: null, note: null },
          { value: r.device, color: null, note: null },
          { value: r.game, color: null, note: null },
        ];
        cfg.brands.forEach((b, i) => {
          const c = r.cells[i];
          cells.push({
            value: c?.label ?? brandCellLabel(b),
            color: c ? toCss(c.color) : null,
            note: c?.note ?? null,
          });
        });
        return cells;
      }),
    };
  },
};
