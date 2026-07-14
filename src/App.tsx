import { useCallback, useEffect, useRef, useState } from 'react';
import { MARKETS } from './config';
import { backend, USE_MOCK_GOOGLE } from './google';
import { pad2 } from './lib/naming';
import type { Rating, Session, SlotEntry } from './types';
import { SessionSetup } from './components/SessionSetup';
import { SlotGrid } from './components/SlotGrid';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [slots, setSlots] = useState<SlotEntry[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  // Refs so the sequential submit queue always sees current state.
  const slotsRef = useRef(slots);
  slotsRef.current = slots;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateSlot = useCallback((index: number, patch: Partial<SlotEntry>) => {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }, []);

  function showToast(message: string) {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }

  // Never lose VA input: warn before leaving with unsaved slots (Section 8).
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      const dirty = slotsRef.current.some(
        (s) => (s.videoFile || s.rating || s.notes) && s.status !== 'logged',
      );
      if (dirty) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  function startSession(s: Session) {
    setSession(s);
    setSlots(
      MARKETS[s.market].brands.map((brand) => ({ brand, status: 'empty' as const })),
    );
  }

  function newSession() {
    const dirty = slotsRef.current.some(
      (s) => (s.videoFile || s.rating || s.notes) && s.status !== 'logged',
    );
    if (dirty && !window.confirm('Some slots are not logged yet. Leave this session?')) {
      return;
    }
    setSession(null);
    setSlots([]);
  }

  // ── Submit pipeline (Section 4.4): sequential per slot ──────────────
  async function processSlot(index: number) {
    const currentSession = sessionRef.current;
    const slot = slotsRef.current[index];
    if (!currentSession || !slot?.videoFile || !slot.rating) return;

    const retryLoggingOnly = slot.errorPhase === 'sheets' && Boolean(slot.driveLink);

    if (!retryLoggingOnly) {
      updateSlot(index, {
        status: 'uploading',
        progress: 0,
        reconnecting: false,
        error: undefined,
        errorPhase: undefined,
      });
      try {
        // a+b. Server ensures the folder path, generates the filename
        // (with _vN if this slot already has a video), opens the session.
        const prepared = await backend.prepareUpload({
          session: currentSession,
          brand: slot.brand,
          sourceFileName: slot.videoFile.name,
          contentType: slot.videoFile.type || 'video/mp4',
        });
        const version = /_v(\d+)\.[^.]+$/.exec(prepared.finalName)?.[1];
        if (version) {
          showToast(
            `A video for this slot already exists this session — uploading as v${version}.`,
          );
        }
        const { fileId, webViewLink } = await backend.uploadVideo({
          file: slot.videoFile,
          prepared,
          onProgress: (pct) => updateSlot(index, { progress: pct, reconnecting: false }),
          onStatus: (status) =>
            updateSlot(index, { reconnecting: status === 'reconnecting' }),
        });
        updateSlot(index, {
          status: 'uploaded',
          driveFileId: fileId,
          driveLink: webViewLink,
          uploadedName: prepared.finalName,
          reconnecting: false,
        });
      } catch (err) {
        updateSlot(index, {
          status: 'error',
          errorPhase: 'upload',
          reconnecting: false,
          error: `Upload failed: ${errorMessage(err)}`,
        });
        return;
      }
    } else {
      updateSlot(index, { status: 'uploaded', error: undefined, errorPhase: undefined });
    }

    // c. Write the heatmap cell. The video is already in Drive at this
    // point — a failure here must offer "Retry logging", never re-upload.
    try {
      const latest = slotsRef.current[index];
      await backend.logSlot({
        session: currentSession,
        brandIndex: index,
        brand: latest.brand,
        rating: latest.rating!,
        notes: latest.notes ?? '',
        driveLink: latest.driveLink!,
      });
      updateSlot(index, { status: 'logged' });
    } catch (err) {
      console.error('heatmap logging failed', err);
      updateSlot(index, {
        status: 'error',
        errorPhase: 'sheets',
        error: `Video uploaded, logging failed — Retry logging (${errorMessage(err)})`,
      });
    }
  }

  function submitSlot(index: number) {
    // Serialize submissions so uploads don't compete for VA bandwidth.
    queueRef.current = queueRef.current
      .then(() => processSlot(index))
      .catch((err) => console.error('slot submit failed', err));
  }

  const week = session ? `W${pad2(session.weekNumber)}` : '';

  return (
    <div className="page">
      <div className="breadcrumb">
        S5TECH <span className="sep">/</span> DX-GST <span className="sep">/</span> WEEKLY
        GAME SPEED TEST
        {session && (
          <>
            <span className="sep">/</span>
            <span className="here">
              {week} · {session.market}
              {session.sessionOfWeek}
            </span>
          </>
        )}
        {USE_MOCK_GOOGLE && <span className="mock-chip">MOCK MODE</span>}
      </div>

      {!session ? (
        <SessionSetup onStart={startSession} />
      ) : (
        <SlotGrid
          session={session}
          slots={slots}
          onPickFile={(i, file) => {
            const s = slotsRef.current[i];
            if (s.status === 'empty' || s.status === 'error') {
              updateSlot(i, { videoFile: file, uploadedName: undefined });
            }
          }}
          onRate={(i, rating: Rating) => updateSlot(i, { rating })}
          onNotes={(i, notes) => updateSlot(i, { notes })}
          onSubmit={submitSlot}
          onNewSession={newSession}
        />
      )}

      <footer>
        <span>DX-GST · GAME SPEED TEST</span>
        <span>
          {USE_MOCK_GOOGLE
            ? 'LOCAL DEV — GOOGLE APIS MOCKED'
            : 'TEAM UPLOADER · NO SIGN-IN NEEDED'}
        </span>
      </footer>

      {toast && <div className="toast">⚠️ {toast}</div>}
    </div>
  );
}
