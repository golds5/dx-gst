import { mockBackend } from './mock';
import { remoteBackend } from './remote';
import type { GoogleBackend } from './types';

// `vite dev` has no /api routes, so local dev always runs the in-memory mock.
// The deployed app (built by Vercel) talks to the real API functions.
export const USE_MOCK_GOOGLE = import.meta.env.DEV;

export const backend: GoogleBackend = USE_MOCK_GOOGLE ? mockBackend : remoteBackend;
