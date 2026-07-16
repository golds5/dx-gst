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
  driveLink: string;
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
export interface GoogleBackend {
  prepareUpload(args: PrepareUploadArgs): Promise<PreparedUpload>;
  uploadVideo(args: UploadArgs): Promise<{ fileId: string; webViewLink: string }>;
  logSlot(args: LogSlotArgs): Promise<void>;
  // Column-B dates already logged this ISO week (for session-day suggest).
  weekDates(session: { market: string; weekNumber: number }): Promise<string[]>;
  // Full heatmap tab for the admin viewer.
  fetchHeatmap(market: string): Promise<HeatmapData>;
}
