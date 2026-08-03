import { useCallback, useEffect, useRef, useState } from 'react';
import { MARKETS } from './config';
import { backend, USE_MOCK_GOOGLE } from './google';
import { buildLagNotes, pad2 } from './lib/naming';
import type { Session, SlotEntry } from './types';
import { AdminScreen } from './components/AdminScreen';
import { SessionSetup } from './components/SessionSetup';
import { SlotGrid } from './components/SlotGrid';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [slots, setSlots] = useState<SlotEntry[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [adminView, setAdminView] = useState(false);
  // When set, SessionSetup resumes at the game step with these prefilled.
  const [resume, setResume] = useState<Session | null>(null);

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
        (s) => (s.videoFile || s.rating || s.notes || s.lagTags?.length || s.lagStart) &&
          s.status !== 'logged',
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
    setResume(null);
    setSession(s);
    setSlots(
      MARKETS[s.market].brands.map((brand) => ({ brand, status: 'empty' as const })),
    );
  }

  function newSession() {
    const dirty = slotsRef.current.some(
      (s) => (s.videoFile || s.rating || s.notes || s.lagTags?.length || s.lagStart) &&
          s.status !== 'logged',
    );
    if (dirty && !window.confirm('Some slots are not logged yet. Leave this session?')) {
      return;
    }
    // Resume setup at the game step, keeping region/date/device (the VA is
    // usually just switching to the next game of the same test session).
    setResume(sessionRef.current);
    setSession(null);
    setSlots([]);
  }

  // Full exit: drop the session AND the resume state so setup restarts at
  // step 0 (region). Triggered by the hidden triple-tap on the W## chip in
  // SlotGrid — lets an admin jump between regions to check VA progress.
  function fullExit() {
    const dirty = slotsRef.current.some(
      (s) => (s.videoFile || s.rating || s.notes || s.lagTags?.length || s.lagStart) &&
          s.status !== 'logged',
    );
    if (dirty && !window.confirm('Some slots are not logged yet. Leave this session?')) {
      return;
    }
    setResume(null);
    setSession(null);
    setSlots([]);
  }

  // ── Submit pipeline (Section 4.4): sequential per slot ──────────────
  async function processSlot(index: number) {
    const currentSession = sessionRef.current;
    const slot = slotsRef.current[index];
    if (!currentSession || !slot?.videoFile || !slot.rating) return;

    const retryLoggingOnly = slot.errorPhase === 'sheets' && Boolean(slot.driveLink);
    // Carried locally — React state updates are async, so reading the link
    // back from state right after upload could see a stale value.
    let driveLink = slot.driveLink;

    if (!retryLoggingOnly) {
      updateSlot(index, {
        status: 'uploading',
        progress: 0,
        reconnecting: false,
        error: undefined,
        errorPhase: undefined,
      });
      try {
        // a+b. Server ensures the folder path, generates the filename, and
        // opens the session (replacing the slot's existing video if any).
        const prepared = await backend.prepareUpload({
          session: currentSession,
          brand: slot.brand,
          sourceFileName: slot.videoFile.name,
          contentType: slot.videoFile.type || 'video/mp4',
        });
        if (prepared.replaced) {
          showToast('This slot already had a video — replacing it with the new one.');
        }
        const { fileId, webViewLink } = await backend.uploadVideo({
          file: slot.videoFile,
          prepared,
          onProgress: (pct) => updateSlot(index, { progress: pct, reconnecting: false }),
          onStatus: (status) =>
            updateSlot(index, { reconnecting: status === 'reconnecting' }),
        });
        driveLink = webViewLink;
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
      const notes =
        slot.rating === 'smooth'
          ? ''
          : buildLagNotes({
              start: slot.lagStart,
              end: slot.lagEnd,
              tags: slot.lagTags,
              text: slot.notes,
            });
      await backend.logSlot({
        session: currentSession,
        brandIndex: index,
        brand: slot.brand,
        rating: slot.rating,
        notes,
        minBet: currentSession.minBet,
        driveLink: driveLink!,
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

      {adminView ? (
        <AdminScreen onExit={() => setAdminView(false)} />
      ) : !session ? (
        <SessionSetup
          onStart={startSession}
          initial={resume}
          onAdmin={() => {
            localStorage.setItem('dxgst.admin', '1345');
            setAdminView(true);
          }}
        />
      ) : (
        <SlotGrid
          session={session}
          slots={slots}
          onPickFile={(i, file) => {
            const s = slotsRef.current[i];
            // Re-picking is allowed any time except mid-pipeline; picking a
            // new video on a logged slot re-opens it for a replacement.
            if (s.status !== 'uploading' && s.status !== 'uploaded') {
              updateSlot(i, {
                videoFile: file,
                status: 'empty',
                progress: 0,
                uploadedName: undefined,
                driveFileId: undefined,
                driveLink: undefined,
                error: undefined,
                errorPhase: undefined,
              });
            }
          }}
          onChange={(i, patch) => updateSlot(i, patch)}
          onSubmit={submitSlot}
          onNewSession={newSession}
          onFullExit={fullExit}
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
