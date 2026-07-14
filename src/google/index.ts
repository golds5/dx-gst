import { USE_MOCK_GOOGLE } from '../config';
import { interactiveSignIn } from './auth';
import * as drive from './drive';
import * as sheets from './sheets';
import { mockBackend } from './mock';
import type { GoogleBackend } from './types';

const realBackend: GoogleBackend = {
  signIn: interactiveSignIn,
  ensureFolderPath: drive.ensureFolderPath,
  listFileNames: drive.listFileNames,
  uploadVideo: drive.uploadVideo,
  findOrCreateSessionRow: sheets.findOrCreateSessionRow,
  writeSlotCell: sheets.writeSlotCell,
  hasSessionThisWeek: sheets.hasSessionThisWeek,
};

export const backend: GoogleBackend = USE_MOCK_GOOGLE ? mockBackend : realBackend;
export { USE_MOCK_GOOGLE };
