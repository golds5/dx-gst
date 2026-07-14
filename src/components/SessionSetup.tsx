import { useEffect, useState } from 'react';
import { DEVICES, GAMES, MARKETS } from '../config';
import { isoWeekOf, pad2 } from '../lib/naming';
import { backend } from '../google';
import type { Session } from '../types';

function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

type Props = { onStart: (session: Session) => void };

export function SessionSetup({ onStart }: Props) {
  const [market, setMarket] = useState('TH');
  const [testDate, setTestDate] = useState(todayLocalISO());
  const [device, setDevice] = useState(DEVICES[0].id);
  const [gameIdx, setGameIdx] = useState(0);
  const [sessionOfWeek, setSessionOfWeek] = useState<1 | 2>(1);
  const [autoSuggested, setAutoSuggested] = useState(false);

  const marketCfg = MARKETS[market];
  const { isoYear, weekNumber } = isoWeekOf(testDate);

  // Auto-suggest session of week: TH → 2 if a session already exists this
  // week in the Sheet, else 1; single-session markets are always 1.
  useEffect(() => {
    let cancelled = false;
    if (marketCfg.sessionsPerWeek === 1) {
      setSessionOfWeek(1);
      setAutoSuggested(false);
      return;
    }
    backend
      .hasSessionThisWeek({ market, isoYear, weekNumber })
      .then((has) => {
        if (!cancelled) {
          setSessionOfWeek(has ? 2 : 1);
          setAutoSuggested(true);
        }
      })
      .catch(() => {
        if (!cancelled) setAutoSuggested(false);
      });
    return () => {
      cancelled = true;
    };
  }, [market, isoYear, weekNumber, marketCfg.sessionsPerWeek]);

  function start() {
    const game = GAMES[gameIdx];
    onStart({
      market,
      sessionOfWeek,
      isoYear,
      weekNumber,
      testDate,
      device,
      provider: game.provider,
      game: game.game,
    });
  }

  return (
    <div className="setup-panel">
      <div className="page-head" style={{ marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22 }}>Session setup</h1>
          <div className="sub">Weekly gameplay speed test</div>
        </div>
        <div className="week-chip">
          <div className="w">W{pad2(weekNumber)}</div>
          <div className="m">{isoYear}</div>
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="market">Market</label>
        <select id="market" value={market} onChange={(e) => setMarket(e.target.value)}>
          {Object.values(MARKETS).map((m) => (
            <option key={m.code} value={m.code}>
              {m.flag} {m.code} · {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="date">Test date</label>
        <input
          id="date"
          type="date"
          value={testDate}
          onChange={(e) => e.target.value && setTestDate(e.target.value)}
        />
      </div>

      <div className="field">
        <span className="field-label">Test device</span>
        <div className="tag-row">
          {DEVICES.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`tag${device === d.id ? ' active' : ''}`}
              onClick={() => setDevice(d.id)}
            >
              {device === d.id && '✓ '}
              {d.label} <span className="spec">{d.spec}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label className="field-label" htmlFor="game">Provider · Game</label>
        <select
          id="game"
          value={gameIdx}
          onChange={(e) => setGameIdx(Number(e.target.value))}
        >
          {GAMES.map((g, i) => (
            <option key={`${g.provider}-${g.game}`} value={i}>
              {g.icon} {g.provider} — {g.game}
            </option>
          ))}
        </select>
      </div>

      {marketCfg.sessionsPerWeek === 2 && (
        <div className="field">
          <span className="field-label">Session of week</span>
          <div className="seg">
            {([1, 2] as const).map((n) => (
              <button
                key={n}
                type="button"
                className={sessionOfWeek === n ? 'on' : ''}
                onClick={() => {
                  setSessionOfWeek(n);
                  setAutoSuggested(false);
                }}
              >
                Session {n}
              </button>
            ))}
          </div>
          {autoSuggested && (
            <div className="auto-note">
              Auto-suggested from this week&apos;s heatmap — tap to override.
            </div>
          )}
        </div>
      )}

      <button type="button" className="btn primary block" onClick={start}>
        Start session → {marketCfg.brands.length} brand slots
      </button>
    </div>
  );
}
