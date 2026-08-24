import { useEffect, useMemo, useState } from 'react';
import type { BrandConfig } from '../config';
import {
  ADMIN_PASSCODE,
  MARKETS,
  PASSCODE_MAX_LENGTH,
  RATING_COLORS,
  SHEET_FIRST_BRAND_COL,
} from '../config';
import { backend } from '../google';
import type { HeatmapCell, HeatmapData } from '../google/types';
import { brandCellLabel } from '../lib/labels';
import type { Rating } from '../types';

const ADMIN_KEY = 'dxgst.admin';

// Sheet meta columns: A=Week, B=Date, C=Device, D=Game.
const COL_WEEK = 0;
const COL_DATE = 1;
const COL_DEVICE = 2;
const COL_GAME = 3;

// Rating → the exact CSS string the API produces from RATING_COLORS. Used to
// invert the DX cell color back to a rating name for click-to-cycle.
const RATING_TO_CSS: Record<Rating, string> = (() => {
  const to255 = (v: number) => Math.round(v * 255);
  const cssOf = (c: { red: number; green: number; blue: number }) =>
    `rgb(${to255(c.red)}, ${to255(c.green)}, ${to255(c.blue)})`;
  return {
    smooth: cssOf(RATING_COLORS.smooth),
    slight: cssOf(RATING_COLORS.slight),
    strong: cssOf(RATING_COLORS.strong),
  };
})();

const RATINGS: Rating[] = ['smooth', 'slight', 'strong'];

// Match a cell's current color back to a rating (or null when unset).
function ratingFromColor(color: string | null): Rating | null {
  if (!color) return null;
  for (const r of RATINGS) if (RATING_TO_CSS[r] === color) return r;
  return null;
}

// Cycle: none → smooth → slight → strong → none. One tap advances one step.
function nextRating(current: Rating | null): Rating | null {
  if (current === null) return 'smooth';
  if (current === 'smooth') return 'slight';
  if (current === 'slight') return 'strong';
  return null;
}

// "KZG1 - DEE99" → "DEE99". Competitor labels have no group prefix.
function shortBrand(label: string): string {
  const i = label.indexOf(' - ');
  return i === -1 ? label : label.slice(i + 3);
}

function isTested(cell: HeatmapCell | undefined): boolean {
  return Boolean(cell?.color) || (cell?.value ?? '').trim() !== '';
}

// Key a row by its meta columns so we can align DX rows to VA rows.
function rowKey(row: HeatmapCell[]): string {
  return `${row[COL_DATE]?.value}|${row[COL_DEVICE]?.value}|${row[COL_GAME]?.value}`;
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
  const [dxData, setDxData] = useState<HeatmapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [openNote, setOpenNote] = useState<{ cell: HeatmapCell; label: string } | null>(
    null,
  );
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!unlocked) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setDxData(null);
    Promise.all([backend.fetchHeatmap(market), backend.fetchDxRateHeatmap(market)])
      .then(([va, dx]) => {
        if (cancelled) return;
        setData(va);
        setDxData(dx);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [unlocked, market]);

  const brandCols = useMemo(() => {
    const cfg = MARKETS[market];
    if (!cfg) return [];
    return cfg.brands.map((b, i) => ({
      brand: b,
      label: brandCellLabel(b),
      index: SHEET_FIRST_BRAND_COL + i,
      brandIndex: i,
    }));
  }, [market]);

  // DX rows aligned by (date, device, game) so each VA row has a partner.
  const dxByKey = useMemo(() => {
    const m = new Map<string, HeatmapCell[]>();
    for (const row of dxData?.rows ?? []) m.set(rowKey(row), row);
    return m;
  }, [dxData]);

  // Optimistically flip one DX cell + fire the write to the sheet.
  async function cycleDxCell(
    row: HeatmapCell[],
    col: (typeof brandCols)[number],
  ) {
    if (!data || !dxData) return;
    const cfg = MARKETS[market];
    if (!cfg) return;

    const key = rowKey(row);
    const existing = dxByKey.get(key);
    const currentCell: HeatmapCell | undefined = existing?.[col.index];
    const current = ratingFromColor(currentCell?.color ?? null);
    const next = nextRating(current);

    // Optimistic local update: mutate a fresh copy of dxData.rows.
    const newRows = (dxData.rows ?? []).map((r) => r.slice());
    const targetIdx = newRows.findIndex((r) => rowKey(r) === key);
    let target: HeatmapCell[];
    if (targetIdx === -1) {
      // Row doesn't exist in DX yet — synthesize one so the render matches.
      target = Array.from({ length: 13 }, (_, i) => ({
        value:
          i === COL_WEEK
            ? row[COL_WEEK]?.value ?? ''
            : i === COL_DATE
              ? row[COL_DATE]?.value ?? ''
              : i === COL_DEVICE
                ? row[COL_DEVICE]?.value ?? ''
                : i === COL_GAME
                  ? row[COL_GAME]?.value ?? ''
                  : '',
        color: null,
        note: null,
      }));
      newRows.unshift(target);
    } else {
      target = newRows[targetIdx];
    }
    target[col.index] = {
      value: next === null ? '' : col.label,
      color: next === null ? null : RATING_TO_CSS[next],
      note: null,
    };
    setDxData({ ...dxData, rows: newRows });
    setSaveError(null);

    try {
      await backend.setDxRate({
        market: cfg.code,
        dateLabel: String(row[COL_DATE]?.value ?? ''),
        device: String(row[COL_DEVICE]?.value ?? ''),
        game: String(row[COL_GAME]?.value ?? ''),
        weekNumber: Number(row[COL_WEEK]?.value ?? 0),
        brand: col.brand,
        brandIndex: col.brandIndex,
        rating: next,
      });
    } catch (e) {
      // Roll back by re-fetching the DX tab.
      setSaveError(
        `Save failed (${e instanceof Error ? e.message : String(e)}). Refreshing DX table.`,
      );
      backend
        .fetchDxRateHeatmap(market)
        .then((d) => setDxData(d))
        .catch(() => {});
    }
  }

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
          <div className="sub">
            VA / CS ratings (read-only) and DX rerates (tap a cell to cycle).
          </div>
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

              <HeatmapSection
                title="VA / CS rate"
                subtitle="What testers logged this week (read-only)."
                rows={data.rows}
                brandCols={brandCols}
                onCellClick={(row, col) => {
                  const cell = row[col.index];
                  if (cell?.note) setOpenNote({ cell, label: col.label });
                }}
                editable={false}
              />

              <HeatmapSection
                title="DX rate"
                subtitle="Tap a cell to cycle Smooth → Slight → Strong → blank. Only affects this table."
                rows={data.rows.map((va) => {
                  // For DX rendering, prefer the DX row aligned to this VA
                  // row; when none exists yet, fall back to the VA's meta
                  // columns + empty brand cells (so the row still shows).
                  const key = rowKey(va);
                  const dxRow = dxByKey.get(key);
                  if (dxRow) return dxRow;
                  return va.map((c, i) =>
                    i < SHEET_FIRST_BRAND_COL
                      ? c
                      : { value: '', color: null, note: null },
                  );
                })}
                brandCols={brandCols}
                onCellClick={(row, col) => {
                  const key = rowKey(row);
                  const vaRow = data.rows.find((r) => rowKey(r) === key) ?? row;
                  cycleDxCell(vaRow, col);
                }}
                editable={true}
              />

              {saveError && (
                <div className="invalid-msg" style={{ marginTop: 8 }}>
                  {saveError}
                </div>
              )}

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

type BrandCol = {
  brand: BrandConfig;
  label: string;
  index: number;
  brandIndex: number;
};

function HeatmapSection({
  title,
  subtitle,
  rows,
  brandCols,
  onCellClick,
  editable,
}: {
  title: string;
  subtitle: string;
  rows: HeatmapCell[][];
  brandCols: BrandCol[];
  onCellClick: (row: HeatmapCell[], col: BrandCol) => void;
  editable: boolean;
}) {
  return (
    <section className={`heat-section${editable ? ' editable' : ''}`}>
      <div className="heat-section-head">
        <h2>{title}</h2>
        <span className="heat-section-sub">{subtitle}</span>
      </div>

      <div className="heat-cards">
        {rows.map((row, r) => (
          <div className="heat-card" key={r}>
            <div className="heat-card-head">
              <span className="heat-card-date">{row[COL_DATE]?.value}</span>
              <span className="heat-card-week">W{row[COL_WEEK]?.value}</span>
            </div>
            <div className="heat-card-meta">
              <span className="heat-card-game">{row[COL_GAME]?.value}</span>
              <span className="heat-card-device">{row[COL_DEVICE]?.value}</span>
            </div>
            <div className="heat-chips">
              {brandCols.map((c) => {
                const cell = row[c.index];
                const tested = isTested(cell);
                const hasNote = Boolean(cell?.note);
                const chipEditable = editable;
                const clickable = chipEditable || hasNote;
                return (
                  <button
                    key={c.index}
                    type="button"
                    className={`heat-chip${hasNote ? ' has-note' : ''}${
                      tested ? '' : ' untested'
                    }`}
                    style={cell?.color ? { background: cell.color } : undefined}
                    title={c.label}
                    disabled={!clickable}
                    onClick={() => clickable && onCellClick(row, c)}
                  >
                    {shortBrand(c.label)}
                    {hasNote && <span className="note-dot" />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

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
            {rows.map((row, r) => (
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
                  const clickable = editable || hasNote;
                  return (
                    <td
                      key={c.index}
                      className={`brand-cell${hasNote ? ' has-note' : ''}${
                        tested ? '' : ' untested'
                      }${editable ? ' editable' : ''}`}
                      style={cell?.color ? { background: cell.color } : undefined}
                      onClick={() => clickable && onCellClick(row, c)}
                      title={
                        editable
                          ? 'Tap to cycle rating'
                          : hasNote
                            ? 'Click to see notes'
                            : c.label
                      }
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
    </section>
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
