import type { BrandConfig } from './config';

export type Rating = 'smooth' | 'slight' | 'strong';

export type Session = {
  market: string; // key into MARKETS
  sessionOfWeek: 1 | 2;
  isoYear: number;
  weekNumber: number;
  testDate: string; // YYYY-MM-DD
  device: string; // DeviceConfig.id
  provider: string;
  game: string;
};

export type SlotStatus = 'empty' | 'uploading' | 'uploaded' | 'logged' | 'error';

export type SlotEntry = {
  brand: BrandConfig;
  videoFile?: File;
  rating?: Rating;
  // Lag report (required for slight/strong): issue time frame + issue types.
  lagStart?: string; // mm:ss
  lagEnd?: string; // mm:ss
  lagTags?: string[]; // from LAG_PRESETS
  notes?: string; // free-text extra details
  driveFileId?: string;
  driveLink?: string;
  uploadedName?: string;
  status: SlotStatus;
  progress?: number; // 0–100
  reconnecting?: boolean;
  error?: string;
  // 'upload' errors retry the whole submit; 'sheets' errors retry only the
  // heatmap write (the video is already in Drive — never re-upload it).
  errorPhase?: 'upload' | 'sheets';
};
