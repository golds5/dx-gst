import { useEffect, useMemo, useState } from 'react';
import type { ChangeEvent, CSSProperties } from 'react';
import { LAG_PRESETS } from '../config';
import { backend } from '../google';
import type { DxAccount } from '../google/types';
import {
  buildLagNotes,
  formatClockInput,
  normalizeClockInput,
  validateLagReport,
} from '../lib/naming';
import type { Rating, SlotEntry } from '../types';

const RATING_META: { key: Rating; cls: string; dot: string; label: string }[] = [
  { key: 'smooth', cls: 'sel-g', dot: 'g', label: 'Smooth' },
  { key: 'slight', cls: 'sel-a', dot: 'a', label: 'Slight' },
  { key: 'strong', cls: 'sel-r', dot: 'r', label: 'Strong' },
];

type Props = {
  slot: SlotEntry;
  market: string;
  onChange: (patch: Partial<SlotEntry>) => void;
  onPickFile: (file: File) => void;
  onSubmit: () => void;
  onCollapse: () => void;
};

export function SlotCard({ slot, market, onChange, onPickFile, onSubmit, onCollapse }: Props) {
  const { brand, status } = slot;
  const login = useLoginAccount(market, brand.name);
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
          className={`login-toggle-inline${login.open ? ' on' : ''}`}
          onClick={login.toggle}
        >
          🔑 Login info
          <span className="login-caret">{login.open ? '▲' : '▼'}</span>
        </button>
        <button
          type="button"
          className="collapse-btn"
          onClick={onCollapse}
          aria-label={`Collapse ${brand.name}`}
        >
          ✕
        </button>
      </div>

      {/*
        File input is associated to the label below via htmlFor. Native
        label→input activation is more reliable across Android WebViews
        (including Lark's in-app browser) than a programmatic .click().
        `accept` lists common video extensions in addition to video/* —
        some Android pickers hide files whose MIME they can't detect.
      */}
      <input
        id={`slot-file-${brand.group}-${brand.name}`}
        type="file"
        accept="video/*,.mp4,.mov,.mkv,.webm,.m4v,.3gp"
        disabled={pipelineBusy}
        className="slot-file-input"
        onChange={handleFile}
      />

      {login.open && <LoginBody state={login} />}


      <div className="card-body">
        <label
          className={`slot${slot.videoFile ? ' filled' : ''}${pipelineBusy ? ' busy' : ''}`}
          htmlFor={`slot-file-${brand.group}-${brand.name}`}
          aria-label={`Upload screen recording for ${brand.name}`}
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
        </label>

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
                  onBlur={(e) => onChange({ lagStart: normalizeClockInput(e.target.value) })}
                />
                <span className="time-sep">–</span>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="01:20"
                  value={slot.lagEnd ?? ''}
                  disabled={locked}
                  onChange={(e) => onChange({ lagEnd: formatClockInput(e.target.value) })}
                  onBlur={(e) => onChange({ lagEnd: normalizeClockInput(e.target.value) })}
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

// Encapsulates the DX MP account fetch + reveal state. The toggle button
// lives in the card head; the body renders below it. Data loads lazily on
// first expand so slots the VA never opens don't ping the sheet.
function useLoginAccount(market: string, brand: string) {
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [account, setAccount] = useState<DxAccount | null>(null);
  const [showPass, setShowPass] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  // Reset everything when the VA opens a different slot — otherwise the
  // previous brand's credentials linger in this hook's state because
  // SlotCard is the same component instance re-rendering with new props.
  useEffect(() => {
    setOpen(false);
    setLoaded(false);
    setLoading(false);
    setError(null);
    setAccount(null);
    setShowPass(false);
    setCopied(null);
  }, [market, brand]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && !loaded) {
      setLoading(true);
      setError(null);
      backend
        .fetchDxAccount(market, brand)
        .then((a) => setAccount(a))
        .catch((e) => setError(e instanceof Error ? e.message : String(e)))
        .finally(() => {
          setLoading(false);
          setLoaded(true);
        });
    }
  }

  async function copy(field: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(field);
      setTimeout(() => setCopied((c) => (c === field ? null : c)), 1200);
    } catch {
      // clipboard blocked — silent, the value stays visible on screen
    }
  }

  return {
    open,
    toggle,
    loading,
    error,
    account,
    brand,
    showPass,
    setShowPass,
    copied,
    copy,
  };
}

type LoginState = ReturnType<typeof useLoginAccount>;

function LoginBody({ state }: { state: LoginState }) {
  const { loading, error, account, brand, showPass, setShowPass, copied, copy } = state;
  return (
    <div className="login-body-standalone">
      {loading && <div className="login-status">Loading…</div>}
      {error && <div className="login-status err">Could not load: {error}</div>}
      {!loading && !error && !account && (
        <div className="login-status">
          No DX account on file for {brand}. Ask your DX lead.
        </div>
      )}
      {account && (
        <>
          <LoginRow
            label="User"
            value={account.username}
            copied={copied === 'user'}
            onCopy={() => copy('user', account.username)}
          />
          <LoginRow
            label="Phone"
            value={account.phone}
            copied={copied === 'phone'}
            onCopy={() => copy('phone', account.phone)}
          />
          <LoginRow
            label="Pass"
            value={showPass ? account.password : '•'.repeat(account.password.length || 6)}
            copied={copied === 'pass'}
            onCopy={() => copy('pass', account.password)}
            extra={
              <button
                type="button"
                className="login-mini"
                onClick={() => setShowPass((v) => !v)}
              >
                {showPass ? 'hide' : 'show'}
              </button>
            }
          />
          {account.mpDomain && (
            <a
              className="login-mp"
              href={`https://${account.mpDomain.replace(/^https?:\/\//, '')}`}
              target="_blank"
              rel="noreferrer"
            >
              Open {account.mpDomain} ↗
            </a>
          )}
        </>
      )}
    </div>
  );
}

function LoginRow({
  label,
  value,
  copied,
  onCopy,
  extra,
}: {
  label: string;
  value: string;
  copied: boolean;
  onCopy: () => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="login-row">
      <span className="login-label">{label}</span>
      <span className="login-value">{value}</span>
      {extra}
      <button type="button" className="login-mini" onClick={onCopy}>
        {copied ? 'copied' : 'copy'}
      </button>
    </div>
  );
}
