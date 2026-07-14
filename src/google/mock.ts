// In-memory mock of the Google backend. Active while config.ts still has
// placeholder IDs (USE_MOCK_GOOGLE). Mimics real behavior closely enough to
// exercise the full flow locally: folder paths, duplicate-name _v2 handling,
// row find-or-create, per-slot cell updates. State is inspectable at
// window.__mockGoogle and every action is logged to the console.

import { MARKETS, RATING_COLORS } from '../config';
import { formatSheetDate } from '../lib/naming';
import { brandCellLabel, deviceLabelFor, gameSheetLabelFor } from './sheets';
import type { Session } from '../types';
import type { GoogleBackend, SlotCellArgs, UploadArgs } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type MockRow = {
  week: number;
  date: string;
  device: string;
  game: string;
  cells: Record<number, { label: string; color: string; note: string }>;
};

const state = {
  folders: new Map<string, string>(), // path → folder id
  filesByFolder: new Map<string, string[]>(), // folder id → file names
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
  async signIn() {
    await sleep(400);
    log('signed in as va.mock@s5tech.co');
    return { email: 'va.mock@s5tech.co' };
  },

  async ensureFolderPath(segments: string[]) {
    await sleep(150);
    const path = segments.join('/');
    let id = state.folders.get(path);
    if (!id) {
      id = `mock-folder-${state.folders.size + 1}`;
      state.folders.set(path, id);
      state.filesByFolder.set(id, []);
      log(`created folder path "${path}" → ${id}`);
    }
    return id;
  },

  async listFileNames(folderId: string) {
    await sleep(80);
    return [...(state.filesByFolder.get(folderId) ?? [])];
  },

  async uploadVideo({ file, name, folderId, onProgress }: UploadArgs) {
    log(`uploading "${name}" (${(file.size / 1e6).toFixed(1)} MB) → ${folderId}`);
    // Simulate chunked progress.
    for (let pct = 0; pct < 100; pct += 7) {
      onProgress(Math.min(pct, 99));
      await sleep(120);
    }
    onProgress(100);
    state.filesByFolder.get(folderId)?.push(name);
    state.uploadCounter += 1;
    const fileId = `mock-file-${state.uploadCounter}`;
    log(`uploaded "${name}" → ${fileId}`);
    return {
      fileId,
      webViewLink: `https://drive.google.com/file/d/${fileId}/view (mock)`,
    };
  },

  async findOrCreateSessionRow(session: Session) {
    await sleep(200);
    const tab = MARKETS[session.market].sheetTab;
    const rows = state.tabs.get(tab) ?? [];
    state.tabs.set(tab, rows);
    const date = formatSheetDate(session.testDate);
    const device = deviceLabelFor(session.device);
    const game = gameSheetLabelFor(session);
    const found = rows.findIndex(
      (r) => r.date === date && r.device === device && r.game === game,
    );
    if (found !== -1) {
      log(`reusing existing row ${found + 2} in "${tab}"`);
      return found + 2;
    }
    rows.unshift({ week: session.weekNumber, date, device, game, cells: {} });
    log(`created row 2 in "${tab}": W${session.weekNumber} · ${date} · ${device} · ${game}`);
    return 2;
  },

  async writeSlotCell({ session, rowNumber, brandIndex, brand, rating, notes, driveLink }: SlotCellArgs) {
    await sleep(250);
    const tab = MARKETS[session.market].sheetTab;
    const row = state.tabs.get(tab)?.[rowNumber - 2];
    if (!row) throw new Error(`mock: row ${rowNumber} not found in "${tab}"`);
    const color = JSON.stringify(RATING_COLORS[rating]);
    const note = [notes.trim(), `Video: ${driveLink}`].filter(Boolean).join('\n\n');
    row.cells[brandIndex] = { label: brandCellLabel(brand), color, note };
    log(
      `wrote cell row ${rowNumber} col ${String.fromCharCode(69 + brandIndex)} ` +
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
