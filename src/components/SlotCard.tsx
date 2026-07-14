import { useEffect, useMemo, useRef } from 'react';
import type { ChangeEvent } from 'react';
import { validateSlotNotes } from '../lib/naming';
import type { Rating, SlotEntry } from '../types';

const RATING_META: { key: Rating; cls: string; dot: string; label: string }[] = [
  { key: 'smooth', cls: 'sel-g', dot: 'g', label: 'Smooth' },
  { key: 'slight', cls: 'sel-a', dot: 'a', label: 'Slight' },
  { key: 'strong', cls: 'sel-r', dot: 'r', label: 'Strong' },
];

type Props = {
  slot: SlotEntry;
  onPickFile: (file: File) => void;
  onRate: (rating: Rating) => void;
  onNotes: (notes: string) => void;
  onSubmit: () => void;
  onRetry: () => void;
};

export function SlotCard({ slot, onPickFile, onRate, onNotes, onSubmit, onRetry }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { brand, status } = slot;
  const busy = status === 'uploading';
  const done = status === 'logged';
  // Mid-pipeline the whole card is locked. A logged slot keeps rating/notes
  // read-only but its phone frame stays tappable: picking a new video
  // replaces the uploaded one (one video per slot).
  const pipelineBusy = busy || status === 'uploaded';
  const locked = pipelineBusy || done;

  const previewUrl = useMemo(
    () => (slot.videoFile ? URL.createObjectURL(slot.videoFile) : null),
    [slot.videoFile],
  );
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const notesError = validateSlotNotes(slot.rating, slot.notes);
  const showNotesError = Boolean(notesError && slot.rating && slot.rating !== 'smooth');
  const canSubmit =
    Boolean(slot.videoFile && slot.rating && !notesError) &&
    (status === 'empty' || status === 'error');

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onPickFile(file);
    e.target.value = ''; // allow re-picking the same file
  }

  function openPicker() {
    if (!pipelineBusy) inputRef.current?.click();
  }

  return (
    <div
      className={`card${brand.isCompetitor ? '' : ' pinned'}${done ? ' logged' : ''}${
        status === 'error' ? ' errored' : ''
      }`}
    >
      <div className="card-head">
        <div>
          <div className="brand-group">{brand.isCompetitor ? 'COMPETITOR' : brand.group}</div>
          <div className="brand-name">{brand.name}</div>
        </div>
        {done ? (
          <span className="status-chip ok">LOGGED ✓</span>
        ) : status === 'error' ? (
          <span className="status-chip err">ERROR</span>
        ) : busy ? (
          <span className="status-chip busy">UPLOADING</span>
        ) : !brand.isCompetitor ? (
          <span className="pin">PINNED</span>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        style={{ display: 'none' }}
        onChange={handleFile}
      />

      <div
        className={`slot${slot.videoFile ? ' filled' : ''}${pipelineBusy ? ' busy' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`Upload screen recording for ${brand.name}`}
        onClick={openPicker}
        onKeyDown={(e) => e.key === 'Enter' && openPicker()}
      >
        {previewUrl ? (
          <>
            <video src={previewUrl} muted playsInline preload="metadata" />
            <div className="overlay">
              <div className="fname">{slot.uploadedName ?? slot.videoFile!.name}</div>
              <div className="fsize">
                {(slot.videoFile!.size / 1e6).toFixed(1)} MB
                {!pipelineBusy && (done ? ' · tap to replace video' : ' · tap to replace')}
              </div>
              {busy && (
                <>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{ width: `${slot.progress ?? 0}%` }}
                    />
                  </div>
                  <div className={`progress-label${slot.reconnecting ? ' reconnect' : ''}`}>
                    {slot.reconnecting ? 'Reconnecting…' : `${slot.progress ?? 0}%`}
                  </div>
                </>
              )}
              {done && slot.driveLink && (
                <a
                  className="drive"
                  href={slot.driveLink}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                >
                  View in Drive ↗
                </a>
              )}
            </div>
          </>
        ) : (
          <>
            <svg className="up-ic" viewBox="0 0 24 24">
              <path d="M12 16V4m0 0l-4 4m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" strokeLinecap="round" />
            </svg>
            <p>Tap to add screen recording</p>
            <span className="fmt">MP4 / MOV · PORTRAIT</span>
          </>
        )}
      </div>

      <div>
        <div className="rate-label">Gameplay rating — pick one</div>
        <div className="rating">
          {RATING_META.map((r) => (
            <button
              key={r.key}
              type="button"
              disabled={locked}
              className={slot.rating === r.key ? r.cls : ''}
              onClick={() => onRate(r.key)}
            >
              <span className={`dot ${r.dot}`} />
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <div className="notes">
        <textarea
          placeholder="Gameplay notes — include timestamps for any abnormal activity…"
          value={slot.notes ?? ''}
          disabled={locked}
          onChange={(e) => onNotes(e.target.value)}
        />
        {showNotesError ? (
          <div className="invalid-msg">{notesError}</div>
        ) : (
          <div className="hint">
            <b>Example:</b> 0:25–0:30 — symbol rotation delayed, taking longer than usual.
          </div>
        )}
      </div>

      {status === 'error' ? (
        <>
          <div className="invalid-msg">{slot.error}</div>
          <button type="button" className="btn small" onClick={onRetry}>
            {slot.errorPhase === 'sheets' ? 'Retry logging' : 'Retry upload'}
          </button>
        </>
      ) : (
        !done && (
          <button
            type="button"
            className="btn primary small block"
            disabled={!canSubmit || busy}
            onClick={onSubmit}
          >
            {busy ? 'Uploading…' : status === 'uploaded' ? 'Logging…' : 'Submit slot'}
          </button>
        )
      )}
    </div>
  );
}
