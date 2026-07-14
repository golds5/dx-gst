import { DEVICES, GAMES, MARKETS } from '../config';
import { formatSheetDate, pad2 } from '../lib/naming';
import type { Rating, Session, SlotEntry } from '../types';
import { SlotCard } from './SlotCard';

type Props = {
  session: Session;
  slots: SlotEntry[];
  onPickFile: (index: number, file: File) => void;
  onRate: (index: number, rating: Rating) => void;
  onNotes: (index: number, notes: string) => void;
  onSubmit: (index: number) => void;
  onNewSession: () => void;
};

export function SlotGrid({
  session,
  slots,
  onPickFile,
  onRate,
  onNotes,
  onSubmit,
  onNewSession,
}: Props) {
  const marketCfg = MARKETS[session.market];
  const game = GAMES.find(
    (g) => g.provider === session.provider && g.game === session.game,
  );
  const device = DEVICES.find((d) => d.id === session.device);
  const pinnedCount = slots.filter((s) => !s.brand.isCompetitor).length;
  const loggedCount = slots.filter((s) => s.status === 'logged').length;
  const errorSlots = slots.filter((s) => s.status === 'error');

  return (
    <>
      <div className="page-head">
        <div className="game-icon">{game?.icon ?? '🎰'}</div>
        <div>
          <h1>{session.game}</h1>
          <div className="sub">
            {session.provider} · Weekly gameplay speed check · Session {session.sessionOfWeek}
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
              ✓ {device?.label ?? session.device} <span className="spec">{device?.spec}</span>
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
          <b>How to fill this in:</b> record 30–60s of gameplay per brand on the assigned
          device, drop the screen recording into the phone slot, pick one gameplay rating,
          and note any abnormal activity <span className="u">with timestamps</span>. Each
          slot uploads to Drive and logs to the heatmap when you submit it.
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

      <div className="grid">
        {slots.map((slot, i) => (
          <SlotCard
            key={`${slot.brand.group}-${slot.brand.name}`}
            slot={slot}
            onPickFile={(f) => onPickFile(i, f)}
            onRate={(r) => onRate(i, r)}
            onNotes={(n) => onNotes(i, n)}
            onSubmit={() => onSubmit(i)}
            onRetry={() => onSubmit(i)}
          />
        ))}
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
