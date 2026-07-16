import { useEffect, useState } from 'react';
import { ADMIN_PASSCODE, MARKETS } from '../config';
import { backend } from '../google';
import type { HeatmapCell, HeatmapData } from '../google/types';

const ADMIN_KEY = 'dxgst.admin';

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
        <button type="button" className="step-back" onClick={onExit}>
          ← Back to testing
        </button>
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
              autoComplete="off"
              placeholder="••••"
              value={passInput}
              onChange={(e) => {
                setPassInput(e.target.value);
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
        <button
          type="button"
          className="btn"
          style={{ marginLeft: 'auto' }}
          onClick={onExit}
        >
          ← Back to testing
        </button>
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
            <div className="heatmap-scroll">
              <table className="heatmap">
                <thead>
                  <tr>
                    {data.headers.map((h, i) => (
                      <th key={i}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => {
                        const isBrand = c >= 4;
                        const hasNote = Boolean(cell.note);
                        return (
                          <td
                            key={c}
                            className={`${isBrand ? 'brand-cell' : 'meta-cell'}${
                              hasNote ? ' has-note' : ''
                            }`}
                            style={cell.color ? { background: cell.color } : undefined}
                            onClick={() =>
                              hasNote &&
                              setOpenNote({ cell, label: data.headers[c] })
                            }
                            title={hasNote ? 'Click to see notes' : undefined}
                          >
                            {cell.value}
                            {hasNote && <span className="note-dot" />}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="auto-note" style={{ marginTop: 12 }}>
            {data.rows.length} record{data.rows.length === 1 ? '' : 's'} · colored cells
            have a rating · dotted cells have tester notes (tap to read).
          </div>
        </>
      )}

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
