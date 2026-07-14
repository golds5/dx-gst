import type { Rating, Session } from '../types';
import type { BrandConfig } from '../config';

export type UploadStatus = 'uploading' | 'reconnecting';

export type UploadArgs = {
  file: File;
  name: string;
  folderId: string;
  onProgress: (pct: number) => void;
  onStatus?: (status: UploadStatus) => void;
};

export type SlotCellArgs = {
  session: Session;
  rowNumber: number; // 1-based sheet row
  brandIndex: number; // index into the market's brand list (→ column E+i)
  brand: BrandConfig;
  rating: Rating;
  notes: string;
  driveLink: string;
};

// One interface, two implementations: `real` (Google APIs from the browser)
// and `mock` (in-memory, used while config.ts still has placeholder IDs).
export interface GoogleBackend {
  signIn(): Promise<{ email: string }>;
  ensureFolderPath(segments: string[]): Promise<string>; // → leaf folder id
  listFileNames(folderId: string): Promise<string[]>;
  uploadVideo(args: UploadArgs): Promise<{ fileId: string; webViewLink: string }>;
  findOrCreateSessionRow(session: Session): Promise<number>; // → 1-based row
  writeSlotCell(args: SlotCellArgs): Promise<void>;
  hasSessionThisWeek(session: {
    market: string;
    isoYear: number;
    weekNumber: number;
  }): Promise<boolean>;
}
