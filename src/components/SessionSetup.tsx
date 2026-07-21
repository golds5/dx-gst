import { useEffect, useState } from 'react';
import {
  ADMIN_PASSCODE,
  DEVICES,
  MARKETS,
  PROVIDER_ICONS,
  REGION_PASSCODES,
  gamesForRegionProvider,
  providersForRegion,
} from '../config';
import {
  formatSheetDate,
  isoWeekBounds,
  isoWeekOf,
  pad2,
  suggestSessionOfWeek,
} from '../lib/naming';
import { backend } from '../google';
import type { Session } from '../types';

function todayLocalISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// Remembered per browser so weekly use is friction-free.
const passKey = (market: string) => `dxgst.pass.${market}`;
const DEVICES_KEY = 'dxgst.devices';
const LAST_DEVICE_KEY = 'dxgst.lastDevice';

type CustomDevice = { label: string; spec?: string };

function storedDevices(): CustomDevice[] {
  try {
    return JSON.parse(localStorage.getItem(DEVICES_KEY) ?? '[]') as CustomDevice[];
  } catch {
    return [];
  }
}

type Props = {
  onStart: (session: Session) => void;
  initial?: Session | null;
  onAdmin?: () => void;
};

export function SessionSetup({ onStart, initial, onAdmin }: Props) {
  // Resuming from "Change game": region/date/device stay, jump to the game step.
  const [step, setStep] = useState(initial ? 3 : 0);
  const [market, setMarket] = useState<string | null>(initial?.market ?? null);
  const [passInput, setPassInput] = useState('');
  const [passError, setPassError] = useState(false);
  const [testDate, setTestDate] = useState(initial?.testDate ?? todayLocalISO());
  const [device, setDevice] = useState(
    () => initial?.device ?? localStorage.getItem(LAST_DEVICE_KEY) ?? '',
  );
  const [customDevices, setCustomDevices] = useState<CustomDevice[]>(storedDevices);
  const [addingDevice, setAddingDevice] = useState(false);
  const [newDeviceName, setNewDeviceName] = useState('');
  const [newDeviceSpec, setNewDeviceSpec] = useState('');
  const [provider, setProvider] = useState<string | null>(initial?.provider ?? null);
  const [gameName, setGameName] = useState<string | null>(initial?.game ?? null);
  const [sessionOfWeek, setSessionOfWeek] = useState<1 | 2>(initial?.sessionOfWeek ?? 1);
  const [autoSuggested, setAutoSuggested] = useState(false);

  const marketCfg = market ? MARKETS[market] : null;
  const { isoYear, weekNumber } = isoWeekOf(testDate);

  // Session-of-week auto-suggest: each distinct test day this week is one
  // session (re-opening an already-logged day keeps its number).
  useEffect(() => {
    let cancelled = false;
    if (!market || !marketCfg || marketCfg.sessionsPerWeek === 1) {
      setSessionOfWeek(1);
      setAutoSuggested(false);
      return;
    }
    backend
      .weekDates({ market, weekNumber })
      .then((dates) => {
        if (!cancelled) {
          setSessionOfWeek(suggestSessionOfWeek(dates, formatSheetDate(testDate)));
          setAutoSuggested(true);
        }
      })
      .catch(() => {
        if (!cancelled) setAutoSuggested(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [market, weekNumber, testDate]);

  function pickRegion(code: string) {
    setMarket(code);
    setPassInput('');
    setPassError(false);
    if (localStorage.getItem(passKey(code)) === REGION_PASSCODES[code]) {
      setStep(1); // already unlocked on this device
    }
  }

  function unlockRegion(value: string) {
    if (!market) return;
    localStorage.setItem(passKey(market), value);
    setPassError(false);
    setPassInput('');
    setStep(1);
  }

  function submitPasscode() {
    if (!market) return;
    const value = passInput.trim();
    if (value === REGION_PASSCODES[market]) {
      unlockRegion(value);
    } else if (value === ADMIN_PASSCODE && onAdmin) {
      setPassError(false);
      setPassInput('');
      onAdmin();
    } else {
      setPassError(true);
    }
  }

  function onPassChange(raw: string) {
    // Numeric-only, max 4 characters — matches the passcode format.
    const digits = raw.replace(/\D/g, '').slice(0, 4);
    setPassInput(digits);
    setPassError(false);
    if (market && digits === REGION_PASSCODES[market]) {
      unlockRegion(digits);
    }
  }

  function saveNewDevice() {
    const label = newDeviceName.trim();
    if (!label) return;
    const entry: CustomDevice = { label, spec: newDeviceSpec.trim() || undefined };
    const next = [...customDevices.filter((d) => d.label !== label), entry];
    setCustomDevices(next);
    localStorage.setItem(DEVICES_KEY, JSON.stringify(next));
    setDevice(label);
    setAddingDevice(false);
    setNewDeviceName('');
    setNewDeviceSpec('');
  }

  function start() {
    if (!market || !provider || !gameName) return;
    const game = gamesForRegionProvider(market, provider).find((g) => g.game === gameName);
    if (!game) return;
    localStorage.setItem(LAST_DEVICE_KEY, device);
    onStart({
      market,
      sessionOfWeek,
      isoYear,
      weekNumber,
      testDate,
      device,
      provider: game.provider,
      game: game.game,
      minBet: game.minBet,
    });
  }

  const deviceOptions: CustomDevice[] = [
    ...DEVICES.map((d) => ({ label: d.label, spec: d.spec })),
    ...customDevices.filter((c) => !DEVICES.some((d) => d.label === c.label)),
  ];

  return (
    <div className="setup-panel">
      <div className="page-head" style={{ marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22 }}>Session setup</h1>
          <div className="sub">Weekly gameplay speed test</div>
        </div>
        <div className="week-chip">
          <div className="w">W{pad2(weekNumber)}</div>
          <div className="m">{isoYear}</div>
        </div>
      </div>

      {step === 0 && (
        <>
          <details className="howto" open>
            <summary>❓ How it works (5 steps)</summary>
            <ol>
              <li>
                Tap your <b>region</b> → enter the <b>passcode</b>.
              </li>
              <li>
                Pick the <b>test date</b> and your <b>device</b> (add it once if new).
              </li>
              <li>
                Pick the provider and the game you were asked to test.{' '}
                <b>Set the game&apos;s minimum bet</b> (shown on screen) before recording.
              </li>
              <li>
                For each brand: <b>record the full session</b> — from tapping the
                game icon through <b>all 50 autospins</b> — then upload the video
                and pick a <b>rating</b> (🟢/🟡/🔴). For lag, add the{' '}
                <b>time frame (mm:ss–mm:ss)</b> + <b>issue type</b>.
              </li>
              <li>
                Submit each brand. When all show <b>LOGGED ✓</b>, reply ✅ in Lark.
              </li>
            </ol>
          </details>

          <div className="field">
            <span className="field-label">Region</span>
            <div className="region-grid">
              {Object.values(MARKETS).map((m) => (
                <button
                  key={m.code}
                  type="button"
                  className={`region-card${market === m.code ? ' on' : ''}`}
                  onClick={() => pickRegion(m.code)}
                >
                  <span className="region-flag">{m.flag}</span>
                  <span className="region-code">{m.code}</span>
                  <span className="region-name">{m.label}</span>
                </button>
              ))}
            </div>
          </div>
          {market && (
            <div className="field">
              <label className="field-label" htmlFor="passcode">
                Passcode for {market}
              </label>
              <div className="pass-row">
                <input
                  id="passcode"
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  autoComplete="off"
                  placeholder="••••"
                  value={passInput}
                  onChange={(e) => onPassChange(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && submitPasscode()}
                />
                <button type="button" className="btn primary" onClick={submitPasscode}>
                  Unlock
                </button>
              </div>
              {passError && (
                <div className="invalid-msg">Wrong passcode for {market} — try again.</div>
              )}
              <div className="auto-note">
                Ask your DX lead for the region passcode. This device remembers it.
              </div>
            </div>
          )}

        </>
      )}

      {step === 1 && marketCfg && (
        <>
          <div className="field">
            <label className="field-label" htmlFor="date">
              Test date · {marketCfg.flag} {marketCfg.code} tests{' '}
              {marketCfg.sessionsPerWeek === 2 ? 'twice' : 'once'} a week
            </label>
            <input
              id="date"
              className="date-input"
              type="date"
              value={testDate}
              min={isoWeekBounds(todayLocalISO()).monday}
              max={isoWeekBounds(todayLocalISO()).sunday}
              onChange={(e) => {
                const v = e.target.value;
                if (!v) return;
                const { monday, sunday } = isoWeekBounds(todayLocalISO());
                if (v >= monday && v <= sunday) setTestDate(v);
              }}
            />
          </div>
          {marketCfg.sessionsPerWeek === 2 && (
            <div className="field">
              <span className="field-label">Test day of this week</span>
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
                    Day {n}
                  </button>
                ))}
              </div>
              {autoSuggested && (
                <div className="auto-note">
                  Auto-suggested from this week&apos;s logged test days — tap to override.
                </div>
              )}
            </div>
          )}
          <button type="button" className="btn primary block" onClick={() => setStep(2)}>
            Continue
          </button>
          <button type="button" className="step-back" onClick={() => setStep(0)}>
            ← Back
          </button>
        </>
      )}

      {step === 2 && (
        <>
          <div className="field">
            <span className="field-label">Your test device</span>
            <div className="tag-row">
              {deviceOptions.map((d) => (
                <button
                  key={d.label}
                  type="button"
                  className={`tag${device === d.label ? ' active' : ''}`}
                  onClick={() => setDevice(d.label)}
                >
                  {device === d.label && '✓ '}
                  {d.label}
                  {d.spec && <span className="spec">{d.spec}</span>}
                </button>
              ))}
              <button
                type="button"
                className="tag"
                onClick={() => setAddingDevice((v) => !v)}
              >
                ＋ Add my device
              </button>
            </div>
          </div>
          {addingDevice && (
            <div className="field add-device">
              <input
                type="text"
                placeholder="Device name — e.g. iPhone 13"
                value={newDeviceName}
                onChange={(e) => setNewDeviceName(e.target.value)}
              />
              <input
                type="text"
                placeholder="Specs (optional) — e.g. 2021 · 4G RAM"
                value={newDeviceSpec}
                onChange={(e) => setNewDeviceSpec(e.target.value)}
              />
              <button
                type="button"
                className="btn small"
                disabled={!newDeviceName.trim()}
                onClick={saveNewDevice}
              >
                Save device
              </button>
            </div>
          )}
          <button
            type="button"
            className="btn primary block"
            disabled={!device}
            onClick={() => setStep(3)}
          >
            Continue
          </button>
          <button type="button" className="step-back" onClick={() => setStep(1)}>
            ← Back
          </button>
        </>
      )}

      {step === 3 && marketCfg && (
        <>
          <div className="field">
            <span className="field-label">Provider</span>
            <div className="tag-row">
              {providersForRegion(market!).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`tag${provider === p ? ' active' : ''}`}
                  onClick={() => {
                    setProvider(p);
                    setGameName(null);
                  }}
                >
                  {PROVIDER_ICONS[p] ?? '🎰'} {p}
                </button>
              ))}
            </div>
          </div>

          {provider && (
            <div className="field">
              <span className="field-label">
                Game under test · usually 2 games per test day
              </span>
              <div className="game-list">
                {gamesForRegionProvider(market!, provider).map((g) => (
                  <button
                    key={g.game}
                    type="button"
                    className={`game-option${gameName === g.game ? ' on' : ''}`}
                    onClick={() => setGameName(g.game)}
                  >
                    <span className="game-name">{g.game}</span>
                    <span className="game-minbet">min {g.minBet}</span>
                  </button>
                ))}
              </div>
              <div className="auto-note">
                Set the game&apos;s <b>minimum bet</b> before recording. Finish this
                game&apos;s brands, then change setup to test the next game — it gets its
                own heatmap row.
              </div>
            </div>
          )}

          <button
            type="button"
            className="btn primary block"
            disabled={!gameName}
            onClick={start}
          >
            Start session → {marketCfg.brands.length} brand slots
          </button>
          <button type="button" className="step-back" onClick={() => setStep(2)}>
            ← Back
          </button>
        </>
      )}
    </div>
  );
}
