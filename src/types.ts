import type { BrandConfig } from './config';
import type { PageSpeedResult } from './lib/pagespeed';

export type Rating = 'smooth' | 'slight' | 'strong';

export type Session = {
  market: string; // key into MARKETS
  sessionOfWeek: 1 | 2 | 3;
  isoYear: number;
  weekNumber: number;
  testDate: string; // YYYY-MM-DD
  device: string; // tester-reported device label
  provider: string;
  game: string;
  minBet: string; // e.g. '0.02 PHP' — region+game specific
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
  // Page-speed probe: the VA measures the brand site from the test device
  // before submitting. Optional — a failed probe must never block logging
  // the gameplay rating, which is the real deliverable.
  perfUrl?: string; // what the VA typed / the brand's MP domain
  perfStatus?: 'idle' | 'measuring' | 'done' | 'error';
  perfProgress?: { done: number; total: number };
  perfResult?: PageSpeedResult;
  perfError?: string;
  perfLink?: string; // Drive link to the uploaded CSV
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
