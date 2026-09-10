import type { Rating, Session } from '../types';
import type { BrandConfig } from '../config';

export type UploadStatus = 'uploading' | 'reconnecting';

// Server (or mock) prepares the upload: generates the filename, ensures the
// Drive folder path, resolves _vN collisions, opens a resumable session.
export type PrepareUploadArgs = {
  session: Session;
  brand: BrandConfig;
  sourceFileName: string;
  contentType: string;
};

export type PreparedUpload = {
  sessionUri: string; // pre-authorized Google resumable session URI
  finalName: string;
  replaced: boolean; // true when this upload replaces the slot's existing video
};

export type UploadArgs = {
  file: File;
  prepared: PreparedUpload;
  onProgress: (pct: number) => void;
  onStatus?: (status: UploadStatus) => void;
};

export type LogSlotArgs = {
  session: Session;
  brandIndex: number; // index into the market's brand list (→ column E+i)
  brand: BrandConfig;
  rating: Rating;
  notes: string;
  minBet: string; // recorded in the cell note as testing context
  driveLink: string;
  perfLink?: string; // page-speed CSV, when the VA measured one
};

// Page-speed CSV upload. Tiny (a few KB), so unlike the video it goes
// through the API function as one request instead of a resumable session.
export type UploadPerfCsvArgs = {
  session: Session;
  brand: BrandConfig;
  csv: string;
};

// Read-only heatmap view for the admin screen.
export type HeatmapCell = {
  value: string;
  color: string | null; // css rgb() of the cell fill, or null when unfilled
  note: string | null; // VA notes + Drive link
};
export type HeatmapData = {
  title: string; // sheet tab title, e.g. 'TH - Heatmap'
  headers: string[]; // row 1
  rows: HeatmapCell[][]; // data rows (row 2 onward)
};

// One interface, two implementations: `remote` (Vercel API + direct-to-Google
// chunk upload) and `mock` (in-memory, used during local `vite dev`).
// DX rerate: an admin adjusts an existing (or new) row's brand cell on the
// DX tab only. No video, no notes — just the rating (or null to clear).
export type SetDxRateArgs = {
  market: string;
  // Row key — matched against columns B (Date), C (Device), D (Game). If no
  // row exists yet, the endpoint inserts one at the top.
  dateLabel: string; // formatted like the VA sheet, e.g. "Fri, 21/08"
  device: string; // shown in Device column
  game: string; // "Provider - Game", matches the VA sheet convention
  weekNumber: number;
  brand: BrandConfig; // for column-index resolution + label
  brandIndex: number; // 0-based within the market's brand list → column E+i
  rating: 'smooth' | 'slight' | 'strong' | null; // null clears the cell
};

// DX MP account used by the VA to log in and record the game. Read-only,
// looked up per-brand on demand from the "DX Accounts" sheet tab.
export type DxAccount = {
  username: string;
  phone: string;
  password: string;
  creditRemark: string;
  mpDomain: string;
};

export interface GoogleBackend {
  prepareUpload(args: PrepareUploadArgs): Promise<PreparedUpload>;
  uploadVideo(args: UploadArgs): Promise<{ fileId: string; webViewLink: string }>;
  // Writes the slot's page-speed CSV next to its video in the same Drive
  // folder. Replaces an existing CSV for the slot rather than duplicating.
  uploadPerfCsv(args: UploadPerfCsvArgs): Promise<{ fileId: string; webViewLink: string }>;
  logSlot(args: LogSlotArgs): Promise<void>;
  // Column-B dates already logged this ISO week (for session-day suggest).
  weekDates(session: { market: string; weekNumber: number }): Promise<string[]>;
  // Full heatmap tab for the admin viewer.
  fetchHeatmap(market: string): Promise<HeatmapData>;
  // DX rerate tab — same shape as the VA heatmap but admins can edit.
  fetchDxRateHeatmap(market: string): Promise<HeatmapData>;
  setDxRate(args: SetDxRateArgs): Promise<void>;
  // DX login info revealed in the slot card. Returns null when the sheet
  // has no matching row so the UI can say "not on file" rather than error.
  fetchDxAccount(market: string, brand: string): Promise<DxAccount | null>;
}
