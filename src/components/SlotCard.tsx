import { useEffect, useMemo, useRef } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { LAG_PRESETS } from '../config';
import { buildLagNotes, formatClockInput, validateLagReport } from '../lib/naming';
import type { Rating, SlotEntry } from '../types';

const RATING_META: { key: Rating; cls: string; dot: string; label: string }[] = [
  { key: 'smooth', cls: 'sel-g', dot: 'g', label: 'Smooth' },
  { key: 'slight', cls: 'sel-a', dot: 'a', label: 'Slight' },
  { key: 'strong', cls: 'sel-r', dot: 'r', label: 'Strong' },
];

type Props = {
  slot: SlotEntry;
  onChange: (patch: Partial<SlotEntry>) => void;
  onPickFile: (file: File) => void;
  onSubmit: () => void;
  onCollapse: () => void;
};

export function SlotCard({ slot, onChange, onPickFile, onSubmit, onCollapse }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { brand, status } = slot;
  const busy = status === 'uploading';
  const done = status === 'logged';
  // Mid-pipeline the whole card is locked. A logged slot keeps its report
  // read-only but the phone frame stays tappable: picking a new video
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

  // Lag report is required (and shown) only for Slight / Strong.
  const isLag = slot.rating === 'slight' || slot.rating === 'strong';
  const report = {
    start: slot.lagStart,
    end: slot.lagEnd,
    tags: slot.lagTags,
    text: slot.notes,
  };
  const lagError = isLag ? validateLagReport(report) : null;
  const canSubmit =
    Boolean(slot.videoFile && slot.rating && !lagError) &&
    (status === 'empty' || status === 'error');

  function handleFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) onPickFile(file);
    e.target.value = ''; // allow re-picking the same file
  }

  function openPicker() {
    if (!pipelineBusy) inputRef.current?.click();
  }

  function toggleTag(tag: string) {
    const current = slot.lagTags ?? [];
    onChange({
      lagTags: current.includes(tag)
        ? current.filter((t) => t !== tag)
        : [...current, tag],
    });
  }

  return (
    <div
      className={`card expanded${brand.isCompetitor ? '' : ' pinned'}${done ? ' logged' : ''}${
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
        ) : null}
        <button
          type="button"
          className="collapse-btn"
          onClick={onCollapse}
          aria-label={`Collapse ${brand.name}`}
        >
          ✕
        </button>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        style={{ display: 'none' }}
        onChange={handleFile}
      />

      <div className="card-body">
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
                  {!pipelineBusy &&
                    (done ? ' · tap to replace video' : ' · tap to replace')}
                </div>
                {busy && (
                  <>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{ width: `${slot.progress ?? 0}%` }}
                      />
                    </div>
                    <div
                      className={`progress-label${slot.reconnecting ? ' reconnect' : ''}`}
                    >
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
                <path
                  d="M12 16V4m0 0l-4 4m4-4l4 4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path d="M4 16v3a1 1 0 001 1h14a1 1 0 001-1v-3" strokeLinecap="round" />
              </svg>
              <p>Tap to add screen recording</p>
              <span className="fmt">MP4 / MOV · PORTRAIT</span>
            </>
          )}
        </div>

        <div className="controls">
          <div>
            <div className="rate-label">Gameplay rating — pick one</div>
            <div className="rating">
              {RATING_META.map((r) => (
                <button
                  key={r.key}
                  type="button"
                  disabled={locked}
                  className={slot.rating === r.key ? r.cls : ''}
                  onClick={() => onChange({ rating: r.key })}
                >
                  <span className={`dot ${r.dot}`} />
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {isLag && (
            <div className="notes">
              <div className="rate-label">Issue time frame (mm:ss – mm:ss)</div>
              <div className="time-range">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="00:23"
                  value={slot.lagStart ?? ''}
                  disabled={locked}
                  onChange={(e) => onChange({ lagStart: formatClockInput(e.target.value) })}
                />
                <span className="time-sep">–</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="01:20"
                  value={slot.lagEnd ?? ''}
                  disabled={locked}
                  onChange={(e) => onChange({ lagEnd: formatClockInput(e.target.value) })}
                />
              </div>

              <div className="rate-label">Issue type — tap all that apply</div>
              <div className="preset-row">
                {LAG_PRESETS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    disabled={locked}
                    className={`preset${slot.lagTags?.includes(tag) ? ' sel' : ''}`}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>

              <textarea
                placeholder="Extra details (optional if an issue type is picked)…"
                value={slot.notes ?? ''}
                disabled={locked}
                onChange={(e) => onChange({ notes: e.target.value })}
              />
              {lagError ? (
                <div className="invalid-msg">{lagError}</div>
              ) : (
                <div className="hint">
                  <b>Will log:</b> {buildLagNotes(report)}
                </div>
              )}
            </div>
          )}

          {status === 'error' ? (
            <>
              <div className="invalid-msg">{slot.error}</div>
              <button type="button" className="btn small" onClick={onSubmit}>
                {slot.errorPhase === 'sheets' ? 'Retry logging' : 'Retry upload'}
              </button>
            </>
          ) : (
            !done && (
              <button
                type="button"
                className="btn primary small block submit-btn"
                disabled={!canSubmit || busy}
                onClick={onSubmit}
                style={
                  busy
                    ? ({ '--pct': `${slot.progress ?? 0}%` } as CSSProperties)
                    : undefined
                }
              >
                {busy
                  ? slot.reconnecting
                    ? 'Reconnecting…'
                    : `Uploading ${slot.progress ?? 0}%`
                  : status === 'uploaded'
                    ? 'Logging…'
                    : 'Submit slot'}
              </button>
            )
          )}
        </div>
      </div>
    </div>
  );
}
