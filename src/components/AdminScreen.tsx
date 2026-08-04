import { useEffect, useMemo, useState } from 'react';
import {
  ADMIN_PASSCODE,
  MARKETS,
  PASSCODE_MAX_LENGTH,
  SHEET_FIRST_BRAND_COL,
} from '../config';
import { backend } from '../google';
import type { HeatmapCell, HeatmapData } from '../google/types';

const ADMIN_KEY = 'dxgst.admin';

// Sheet meta columns: A=Week, B=Date, C=Device, D=Game.
const COL_WEEK = 0;
const COL_DATE = 1;
const COL_DEVICE = 2;
const COL_GAME = 3;

// "KZG1 - DEE99" → "DEE99". Competitor labels have no group prefix.
function shortBrand(label: string): string {
  const i = label.indexOf(' - ');
  return i === -1 ? label : label.slice(i + 3);
}

// A brand cell counts as tested only once it has been rated (filled) or
// written to. Slots the DX lead never asked for stay blank.
function isTested(cell: HeatmapCell | undefined): boolean {
  return Boolean(cell?.color) || (cell?.value ?? '').trim() !== '';
}

type Props = { onExit: () => void };

export function AdminScreen({ onExit }: Props) {
  const [unlocked, setUnlocked] = useState(
    () => localStorage.getItem(ADMIN_KEY) === ADMIN_PASSCODE,
  );
  const [passInput, setPassInput] = useState('');
  const [passError, setPassError] = useState(false);
  const [market, setMarket] = useState(Object.keys(MARKETS)[0]);
  const [data, setData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openNote, setOpenNote] = useState<{ cell: HeatmapCell; label: string } | null>(
    null,
  );

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    backend
      .fetchHeatmap(market)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [unlocked, market]);

  // Real brand columns only. The API pads every row out to 13 cells, so a
  // market with fewer brands would otherwise render dead columns.
  const brandCols = useMemo(
    () =>
      (data?.headers ?? [])
        .map((label, index) => ({ label, index }))
        .filter((c) => c.index >= SHEET_FIRST_BRAND_COL && c.label.trim() !== ''),
    [data],
  );

  function submitPasscode() {
    if (passInput.trim() === ADMIN_PASSCODE) {
      localStorage.setItem(ADMIN_KEY, passInput.trim());
      setUnlocked(true);
      setPassError(false);
    } else {
      setPassError(true);
    }
  }

  if (!unlocked) {
    return (
      <div className="setup-panel">
        <div className="page-head" style={{ marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22 }}>Admin · Heatmap records</h1>
            <div className="sub">Enter the admin passcode to view records.</div>
          </div>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="adminpass">
            Admin passcode
          </label>
          <div className="pass-row">
            <input
              id="adminpass"
              type="password"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={PASSCODE_MAX_LENGTH}
              autoComplete="off"
              placeholder="••••"
              value={passInput}
              onChange={(e) => {
                setPassInput(
                  e.target.value.replace(/\D/g, '').slice(0, PASSCODE_MAX_LENGTH),
                );
                setPassError(false);
              }}
              onKeyDown={(e) => e.key === 'Enter' && submitPasscode()}
            />
            <button type="button" className="btn primary" onClick={submitPasscode}>
              Unlock
            </button>
          </div>
          {passError && <div className="invalid-msg">Wrong passcode — try again.</div>}
        </div>
        <button type="button" className="step-back" onClick={onExit}>
          ← Back to testing
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 style={{ fontSize: 24 }}>Heatmap records</h1>
          <div className="sub">Read-only view of what testers have logged.</div>
        </div>
      </div>

      <div className="admin-tabs">
        {Object.values(MARKETS).map((m) => (
          <button
            key={m.code}
            type="button"
            className={`admin-tab${market === m.code ? ' on' : ''}`}
            onClick={() => setMarket(m.code)}
          >
            {m.flag} {m.code}
          </button>
        ))}
      </div>

      {loading && <div className="admin-status">Loading {market} heatmap…</div>}
      {error && <div className="invalid-msg">{error}</div>}
      {data && !loading && (
        <>
          {data.rows.length === 0 ? (
            <div className="admin-status">No records logged yet for {market}.</div>
          ) : (
            <>
              <div className="heat-legend">
                <span>
                  <i className="dot g" /> Smooth
                </span>
                <span>
                  <i className="dot a" /> Slight
                </span>
                <span>
                  <i className="dot r" /> Strong
                </span>
                <span className="heat-legend-note">Blank = not tested</span>
              </div>

              {/* Phones: one card per session. A 13-column table is unreadable
                  at this width — horizontal scrolling loses the row's date and
                  game, which is the context you need to read a rating. */}
              <div className="heat-cards">
                {data.rows.map((row, r) => {
                  const tested = brandCols.filter((c) => isTested(row[c.index]));
                  const untested = brandCols.length - tested.length;
                  return (
                    <div className="heat-card" key={r}>
                      <div className="heat-card-head">
                        <span className="heat-card-date">{row[COL_DATE]?.value}</span>
                        <span className="heat-card-week">W{row[COL_WEEK]?.value}</span>
                      </div>
                      <div className="heat-card-meta">
                        <span className="heat-card-game">{row[COL_GAME]?.value}</span>
                        <span className="heat-card-device">{row[COL_DEVICE]?.value}</span>
                      </div>
                      {tested.length === 0 ? (
                        <div className="heat-card-none">Nothing logged yet.</div>
                      ) : (
                        <div className="heat-chips">
                          {tested.map((c) => {
                            const cell = row[c.index];
                            const hasNote = Boolean(cell.note);
                            return (
                              <button
                                key={c.index}
                                type="button"
                                className={`heat-chip${hasNote ? ' has-note' : ''}`}
                                style={
                                  cell.color ? { background: cell.color } : undefined
                                }
                                title={c.label}
                                disabled={!hasNote}
                                onClick={() =>
                                  hasNote && setOpenNote({ cell, label: c.label })
                                }
                              >
                                {shortBrand(c.label)}
                                {hasNote && <span className="note-dot" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {untested > 0 && (
                        <div className="heat-card-untested">
                          {untested} of {brandCols.length} not tested
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Wide screens: the real grid, for comparing brands at a glance.
                  Date column is pinned so it survives horizontal scrolling. */}
              <div className="heatmap-scroll">
                <table className="heatmap">
                  <thead>
                    <tr>
                      <th className="sticky-col">Date</th>
                      <th>Device</th>
                      <th>Game</th>
                      {brandCols.map((c) => (
                        <th key={c.index} title={c.label}>
                          {shortBrand(c.label)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((row, r) => (
                      <tr key={r}>
                        <td className="meta-cell sticky-col">
                          {row[COL_DATE]?.value}
                          <span className="week-badge">W{row[COL_WEEK]?.value}</span>
                        </td>
                        <td className="meta-cell">{row[COL_DEVICE]?.value}</td>
                        <td className="meta-cell">{row[COL_GAME]?.value}</td>
                        {brandCols.map((c) => {
                          const cell = row[c.index];
                          const hasNote = Boolean(cell?.note);
                          const tested = isTested(cell);
                          return (
                            <td
                              key={c.index}
                              className={`brand-cell${hasNote ? ' has-note' : ''}${
                                tested ? '' : ' untested'
                              }`}
                              style={cell?.color ? { background: cell.color } : undefined}
                              onClick={() =>
                                hasNote && setOpenNote({ cell, label: c.label })
                              }
                              title={hasNote ? 'Click to see notes' : c.label}
                            >
                              {tested ? shortBrand(cell.value || c.label) : '—'}
                              {hasNote && <span className="note-dot" />}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="auto-note" style={{ marginTop: 12 }}>
                {data.rows.length} session{data.rows.length === 1 ? '' : 's'} logged ·
                colored cells have a rating · dotted cells have tester notes (tap to
                read).
              </div>
            </>
          )}
        </>
      )}

      <button type="button" className="step-back" onClick={onExit}>
        ← Back to testing
      </button>

      {openNote && (
        <div className="note-modal-backdrop" onClick={() => setOpenNote(null)}>
          <div className="note-modal" onClick={(e) => e.stopPropagation()}>
            <div className="note-modal-head">
              <b>{openNote.label}</b>
              <button
                type="button"
                className="collapse-btn"
                onClick={() => setOpenNote(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <NoteBody note={openNote.cell.note ?? ''} />
          </div>
        </div>
      )}
    </>
  );
}

// Render the cell note, turning a "Video: <url>" line into a link.
function NoteBody({ note }: { note: string }) {
  const match = /Video:\s*(\S+)/.exec(note);
  const link = match?.[1];
  const text = link ? note.replace(/Video:\s*\S+/, '').trim() : note;
  return (
    <div className="note-body">
      {text && <p style={{ whiteSpace: 'pre-wrap' }}>{text}</p>}
      {link && link.startsWith('http') && (
        <a className="drive" href={link} target="_blank" rel="noreferrer">
          View video in Drive ↗
        </a>
      )}
    </div>
  );
}
