import { useRef, useState } from 'react';
import { GAME_ICONS, MARKETS, PROVIDER_ICON_IMAGES, PROVIDER_ICONS } from '../config';
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
  onFullExit: () => void;
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
  onFullExit,
}: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const marketCfg = MARKETS[session.market];
  const loggedCount = slots.filter((s) => s.status === 'logged').length;
  const errorSlots = slots.filter((s) => s.status === 'error');

  // Two-tap exit: tapping the W## chip reveals a "Back to setup" button.
  // Tapping that button drops back to region select. The hint auto-hides
  // after 5s if not used, so it never sits in front of a testing VA.
  const [showBack, setShowBack] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function onWeekTap() {
    setShowBack(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowBack(false), 5000);
  }
  function onBackTap() {
    setShowBack(false);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    onFullExit();
  }

  return (
    <>
      <div className="page-head">
        {(() => {
          const gameSrc = GAME_ICONS[session.game];
          const providerSrc = PROVIDER_ICON_IMAGES[session.provider];
          if (gameSrc) return <img className="game-icon-img" src={gameSrc} alt="" />;
          if (providerSrc)
            return <img className="game-icon-img" src={providerSrc} alt="" />;
          return (
            <div className="game-icon">{PROVIDER_ICONS[session.provider] ?? '🎰'}</div>
          );
        })()}
        <div>
          <h1>{session.game}</h1>
          <div className="sub">
            {session.provider} · Weekly gameplay speed test · Session {session.sessionOfWeek}
          </div>
        </div>
        <div className="week-wrap">
          <button
            type="button"
            className="week-chip"
            onClick={onWeekTap}
            aria-label="Tap to reveal Back button"
          >
            <div className="w">W{pad2(session.weekNumber)}</div>
            <div className="m">
              {marketCfg.flag} {marketCfg.code} MARKET
            </div>
          </button>
          {showBack && (
            <button type="button" className="week-back" onClick={onBackTap}>
              ← Back to setup
            </button>
          )}
        </div>
      </div>

      {/* Compact always-visible session bar — min bet is the critical value. */}
      <div className="session-bar">
        <span className="chip strong">💰 min {session.minBet}</span>
        <span className="chip">📱 {session.device}</span>
        <span className="chip muted">{formatSheetDate(session.testDate)}</span>
        <button type="button" className="chip change" onClick={onNewSession}>
          ↺ Change game
        </button>
      </div>

      {/* Secondary content collapsed by default to keep actions above the fold. */}
      <details className="callout compact">
        <summary>💡 How to log a brand</summary>
        <ol className="steps-list">
          <li>
            <b>Tap</b> a brand → <b>upload</b> your recording for that brand.
          </li>
          <li>
            <b>Rate</b> it: Smooth / Slight / Strong lag.
          </li>
          <li>
            <b>If it lags,</b> add the time frame (mm:ss – mm:ss) + issue type.
          </li>
          <li>
            <b>Submit.</b> Cell turns green/amber/red when logged.
          </li>
        </ol>
      </details>

      <div className="section-head">
        <h2>Brands</h2>
        <span className="count">
          {loggedCount}/{slots.length} logged
        </span>
        <div className="legend">
          <span>
            <span className="dot g" />
            Smooth
          </span>
          <span>
            <span className="dot a" />
            Slight
          </span>
          <span>
            <span className="dot r" />
            Strong
          </span>
        </div>
      </div>

      {/* The opened brand is pinned to the top so the VA never scrolls to find
          the card they're working on. */}
      {expanded !== null && slots[expanded] && (
        <div className="expanded-top">
          <SlotCard
            slot={slots[expanded]}
            market={session.market}
            onPickFile={(f) => onPickFile(expanded, f)}
            onChange={(patch) => onChange(expanded, patch)}
            onSubmit={() => onSubmit(expanded)}
            onCollapse={() => setExpanded(null)}
          />
        </div>
      )}

      <div className="grid tickets">
        {slots.map((slot, i) => {
          const key = `${slot.brand.group}-${slot.brand.name}`;
          return (
            <button
              type="button"
              key={key}
              className={`ticket${slot.brand.isCompetitor ? '' : ' pinned'}${
                slot.status === 'logged' ? ' logged' : ''
              }${slot.status === 'error' ? ' errored' : ''}${
                expanded === i ? ' open' : ''
              }`}
              onClick={() => setExpanded(expanded === i ? null : i)}
              aria-label={`Open ${slot.brand.name}`}
            >
              <div>
                <div className="brand-group">
                  {slot.brand.isCompetitor ? 'COMPETITOR' : slot.brand.group}
                </div>
                <div className="brand-name">{slot.brand.name}</div>
              </div>
              {expanded === i ? (
                <span className="status-chip busy">OPEN ↑</span>
              ) : (
                <TicketStatus slot={slot} />
              )}
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
