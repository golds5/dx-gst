import { useState } from 'react';
import { DEVICES, MARKETS, PROVIDER_ICONS } from '../config';
import { formatSheetDate, pad2 } from '../lib/naming';
import type { Session, SlotEntry } from '../types';
import { SlotCard } from './SlotCard';

type Props = {
  session: Session;
  slots: SlotEntry[];
  onPickFile: (index: number, file: File) => void;
  onChange: (index: number, patch: Partial<SlotEntry>) => void;
  onSubmit: (index: number) => void;
  onNewSession: () => void;
};

// Compact ticket status shown while a brand is collapsed.
function TicketStatus({ slot }: { slot: SlotEntry }) {
  if (slot.status === 'logged') return <span className="status-chip ok">LOGGED ✓</span>;
  if (slot.status === 'error') return <span className="status-chip err">ERROR</span>;
  if (slot.status === 'uploading') {
    return <span className="status-chip busy">{slot.progress ?? 0}%</span>;
  }
  if (slot.status === 'uploaded') return <span className="status-chip busy">LOGGING</span>;
  if (slot.videoFile) return <span className="status-chip busy">DRAFT</span>;
  return <span className="add-chip">+ ADD</span>;
}

export function SlotGrid({
  session,
  slots,
  onPickFile,
  onChange,
  onSubmit,
  onNewSession,
}: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const marketCfg = MARKETS[session.market];
  // session.device is the tester-reported device label; spec shown when known.
  const deviceSpec = DEVICES.find((d) => d.label === session.device)?.spec;
  const pinnedCount = slots.filter((s) => !s.brand.isCompetitor).length;
  const loggedCount = slots.filter((s) => s.status === 'logged').length;
  const errorSlots = slots.filter((s) => s.status === 'error');

  return (
    <>
      <div className="page-head">
        <div className="game-icon">{PROVIDER_ICONS[session.provider] ?? '🎰'}</div>
        <div>
          <h1>{session.game}</h1>
          <div className="sub">
            {session.provider} · Weekly gameplay speed test · Session {session.sessionOfWeek}
          </div>
        </div>
        <div className="week-chip">
          <div className="w">W{pad2(session.weekNumber)}</div>
          <div className="m">
            {marketCfg.flag} {marketCfg.code} MARKET
          </div>
        </div>
      </div>

      <div className="props">
        <div className="prop">
          <div className="prop-label">Test date</div>
          <div className="prop-value">
            <span className="mono">{formatSheetDate(session.testDate)}</span>
            <span className="mono" style={{ color: 'var(--faint)' }}>
              · {session.isoYear}
            </span>
          </div>
        </div>
        <div className="prop">
          <div className="prop-label">Device</div>
          <div className="prop-value">
            <span className="tag active">
              ✓ {session.device}
              {deviceSpec && <span className="spec">{deviceSpec}</span>}
            </span>
          </div>
        </div>
        <div className="prop">
          <div className="prop-label">Min bet</div>
          <div className="prop-value">
            <span className="tag active minbet-tag">💰 {session.minBet}</span>
            <span className="drive-note" style={{ color: 'var(--faint)' }}>
              set this bet before recording
            </span>
          </div>
        </div>
        <div className="prop">
          <div className="prop-label">Session</div>
          <div className="prop-value">
            <button type="button" className="tag" onClick={onNewSession}>
              ← Change session setup
            </button>
          </div>
        </div>
      </div>

      <div className="callout">
        <span>💡</span>
        <div>
          <b>Log one brand at a time.</b>
          <ol className="steps-list">
            <li>
              <b>Tap</b> a brand to open it.
            </li>
            <li>
              <b>Upload</b> your screen recording into the phone slot.
            </li>
            <li>
              <b>Rate</b> the gameplay: Smooth, Slight, or Strong lag.
            </li>
            <li>
              <b>If it lags,</b> enter the time frame (mm:ss – mm:ss) and tap the issue
              types.
            </li>
            <li>
              <b>Submit.</b> The video saves to Drive and the heatmap updates.
            </li>
          </ol>
        </div>
      </div>

      <div className="section-head">
        <h2>Brand recordings</h2>
        <span className="count">
          {slots.length} BRANDS · {pinnedCount} PINNED
        </span>
        <div className="legend">
          <span>
            <span className="dot g" />
            Smooth
          </span>
          <span>
            <span className="dot a" />
            Slight lag
          </span>
          <span>
            <span className="dot r" />
            Strong lag
          </span>
        </div>
      </div>

      <div className="grid tickets">
        {slots.map((slot, i) => {
          const key = `${slot.brand.group}-${slot.brand.name}`;
          if (expanded === i) {
            return (
              <div className="expanded-wrap" key={key}>
                <SlotCard
                  slot={slot}
                  onPickFile={(f) => onPickFile(i, f)}
                  onChange={(patch) => onChange(i, patch)}
                  onSubmit={() => onSubmit(i)}
                  onCollapse={() => setExpanded(null)}
                />
              </div>
            );
          }
          return (
            <button
              type="button"
              key={key}
              className={`ticket${slot.brand.isCompetitor ? '' : ' pinned'}${
                slot.status === 'logged' ? ' logged' : ''
              }${slot.status === 'error' ? ' errored' : ''}`}
              onClick={() => setExpanded(i)}
              aria-label={`Open ${slot.brand.name}`}
            >
              <div>
                <div className="brand-group">
                  {slot.brand.isCompetitor ? 'COMPETITOR' : slot.brand.group}
                </div>
                <div className="brand-name">{slot.brand.name}</div>
              </div>
              <TicketStatus slot={slot} />
            </button>
          );
        })}
      </div>

      <div className="summary">
        <span className="prog">
          {loggedCount}/{slots.length} logged
        </span>
        {errorSlots.length > 0 && (
          <span className="errs">
            {errorSlots.length} error{errorSlots.length > 1 ? 's' : ''} —{' '}
            {errorSlots.map((s) => s.brand.name).join(', ')} (retry on the card)
          </span>
        )}
        {loggedCount === slots.length && <span>✓ Session complete</span>}
      </div>
    </>
  );
}
