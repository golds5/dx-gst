// In-page page-speed probe. Runs on the VA's own phone, on the VA's own
// network, as the first step of Submit — so the numbers describe the same
// conditions as the screen recording being uploaded right after.
//
// WHY TWO TARGETS
// ---------------
// A laggy game can be the game server's fault or the VA's connection's
// fault, and a single number cannot tell those apart. So every run probes:
//   * the brand's MP site (when the slot has one), and
//   * a baseline — a tiny static asset on the app's own origin.
// Baseline fast + brand slow → the brand's server/CDN. Both slow → the VA's
// connection. The baseline also guarantees a CSV for slots with no site
// (competitors are not in the KZ reference).
//
// WHAT THIS CAN AND CANNOT MEASURE
// --------------------------------
// The browser's same-origin policy means a page cannot read another site's
// performance timeline. `iframe.contentWindow.performance` throws on a
// cross-origin frame, the parent's Resource Timing does not include a
// cross-origin frame's sub-resources, and cross-origin entries have every
// detailed milestone zeroed unless the server sends `Timing-Allow-Origin`.
// That is exactly why the Chrome extension in component-performance-audit/
// exists: its content script runs *inside* the target page.
//
// So this probe deliberately measures only what is honestly observable from
// the outside, and the CSV says so:
//   * response time — `fetch(url, {mode:'no-cors'})`, which resolves once
//     the response headers arrive. That covers DNS + TCP + TLS + TTFB but
//     NOT the document download (an opaque response body is unreadable).
//   * asset round trip — an <img> load of the site's favicon, which does
//     complete end-to-end, so it reflects a full small-file fetch.
//   * the device's own network conditions (navigator.connection) and
//     hardware, which are the other half of "why was it slow".
// There is no FCP / LCP / long-task / render-blocking data here. Those need
// the extension.

// Submit blocks on this, so keep the worst case short: a probe stops after
// its first failed sample, which bounds an unreachable site to one timeout.
const PROBE_TIMEOUT_MS = 8_000;

export const DEFAULT_SAMPLES = 3;

// Small static file served from the app's own origin; cache-busted per
// sample. Vercel serves this from the edge, which is as close to "the
// internet is fine" as we can get without a third-party dependency.
const BASELINE_PATH = '/favicon.svg';

export type SampleResult = {
  ms: number | null; // null when the sample failed
  error?: string;
};

export type NetworkInfo = {
  effectiveType?: string;
  downlinkMbps?: number;
  rttMs?: number;
  saveData?: boolean;
};

export type DeviceInfo = {
  userAgent: string;
  deviceMemoryGb?: number;
  cpuCores?: number;
  screen: string;
  pixelRatio?: number;
};

export type PageSpeedResult = {
  url: string | null; // brand site probed; null when the slot had none
  baselineUrl: string;
  measuredAt: string; // ISO timestamp
  samples: number;
  response: SampleResult[]; // brand: DNS+connect+TTFB per sample
  asset: SampleResult[]; // brand: favicon round trip per sample
  baseline: SampleResult[]; // app origin: full small-file round trip
  network: NetworkInfo;
  device: DeviceInfo;
};

export type SampleStats = {
  ok: number;
  failed: number;
  min: number | null;
  median: number | null;
  max: number | null;
};

// ── URL handling ────────────────────────────────────────────────────

// Accepts what a VA actually types: "dee99d.com", "www.dee99d.com",
// "https://www.dee99d.com/lobby". Forces https — the app is served over
// https, so an http probe would be blocked as mixed content anyway.
export function normalizeProbeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return null;
  }
  // A bare word like "foo" parses as a URL but is not a reachable host.
  if (!parsed.hostname.includes('.')) return null;
  parsed.protocol = 'https:';
  return parsed.toString();
}

// Site root, used for the favicon probe.
export function faviconUrlFor(url: string): string | null {
  try {
    return new URL('/favicon.ico', url).toString();
  } catch {
    return null;
  }
}

// ── Statistics ──────────────────────────────────────────────────────

export function summarize(samples: SampleResult[]): SampleStats {
  const values = samples
    .map((s) => s.ms)
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  if (values.length === 0) {
    return { ok: 0, failed: samples.length, min: null, median: null, max: null };
  }
  const mid = Math.floor(values.length / 2);
  const median =
    values.length % 2 === 1 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  return {
    ok: values.length,
    failed: samples.length - values.length,
    min: values[0],
    median,
    max: values[values.length - 1],
  };
}

// ── Probes ──────────────────────────────────────────────────────────

function errorText(err: unknown): string {
  if (err instanceof DOMException && err.name === 'AbortError') return 'timeout';
  return err instanceof Error ? err.message : String(err);
}

function withTimeout(): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

// One document probe. `no-cors` keeps the request legal against any origin;
// the opaque response is unreadable, but the timing is real. `no-store`
// defeats the HTTP cache so repeat samples are genuine round trips.
async function probeResponse(url: string): Promise<SampleResult> {
  const { signal, clear } = withTimeout();
  const started = performance.now();
  try {
    await fetch(url, {
      mode: 'no-cors',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'follow',
      signal,
    });
    return { ms: performance.now() - started };
  } catch (err) {
    return { ms: null, error: errorText(err) };
  } finally {
    clear();
  }
}

// One asset probe: an <img> completes on full download, so unlike the
// opaque fetch above this includes the response body. Cache-busted with a
// query param because images are cached aggressively and `no-store` is not
// available on an <img> load.
function probeAsset(faviconUrl: string): Promise<SampleResult> {
  return new Promise((resolve) => {
    const img = new Image();
    const started = performance.now();
    let settled = false;
    const finish = (result: SampleResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      img.onload = img.onerror = null;
      img.src = '';
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ms: null, error: 'timeout' }), PROBE_TIMEOUT_MS);
    img.onload = () => finish({ ms: performance.now() - started });
    // A 404 favicon still proves the round trip happened, but we cannot tell
    // that apart from a DNS failure, so record it as unavailable.
    img.onerror = () => finish({ ms: null, error: 'no favicon / unreachable' });
    img.src = `${faviconUrl}${cacheBust(faviconUrl)}`;
  });
}

// Same-origin, so the body is readable: time the full download, not just
// the headers, to get a complete small-file round trip.
async function probeBaseline(url: string): Promise<SampleResult> {
  const { signal, clear } = withTimeout();
  const started = performance.now();
  try {
    const resp = await fetch(`${url}${cacheBust(url)}`, { cache: 'no-store', signal });
    if (!resp.ok) return { ms: null, error: `HTTP ${resp.status}` };
    await resp.arrayBuffer();
    return { ms: performance.now() - started };
  } catch (err) {
    return { ms: null, error: errorText(err) };
  } finally {
    clear();
  }
}

function cacheBust(url: string): string {
  const sep = url.includes('?') ? '&' : '?';
  return `${sep}_dxgst=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Runs one probe `samples` times, sequentially — parallel requests would
// compete for the phone's bandwidth and inflate each other's timings. Stops
// after the first failure: an unreachable host would otherwise burn a full
// timeout per sample while the VA waits on the Submit button.
async function runSeries(
  probe: () => Promise<SampleResult>,
  samples: number,
  step: () => void,
): Promise<SampleResult[]> {
  const out: SampleResult[] = [];
  for (let i = 0; i < samples; i++) {
    const r = await probe();
    out.push(r);
    step();
    if (r.ms === null) break;
  }
  return out;
}

function readNetwork(): NetworkInfo {
  const conn = (
    navigator as Navigator & {
      connection?: {
        effectiveType?: string;
        downlink?: number;
        rtt?: number;
        saveData?: boolean;
      };
    }
  ).connection;
  if (!conn) return {};
  return {
    effectiveType: conn.effectiveType,
    downlinkMbps: conn.downlink,
    rttMs: conn.rtt,
    saveData: conn.saveData,
  };
}

function readDevice(): DeviceInfo {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    hardwareConcurrency?: number;
  };
  return {
    userAgent: navigator.userAgent,
    deviceMemoryGb: nav.deviceMemory,
    cpuCores: nav.hardwareConcurrency,
    screen: `${window.screen.width}x${window.screen.height}`,
    pixelRatio: window.devicePixelRatio,
  };
}

export type MeasureOptions = {
  url?: string | null; // brand site; omit for a baseline-only run
  samples?: number;
  onProgress?: (done: number, total: number) => void;
};

export async function measurePageSpeed({
  url: rawUrl,
  samples = DEFAULT_SAMPLES,
  onProgress,
}: MeasureOptions = {}): Promise<PageSpeedResult> {
  const trimmed = rawUrl?.trim() ?? '';
  const url = trimmed ? normalizeProbeUrl(trimmed) : null;
  if (trimmed && !url) throw new Error('Enter a valid site address, e.g. www.dee99d.com');
  const favicon = url ? faviconUrlFor(url) : null;
  const baselineUrl = new URL(BASELINE_PATH, window.location.origin).toString();

  // Progress counts planned samples; a series that fast-fails simply jumps
  // its remaining steps so the counter still reaches `total`.
  const series = [url ? samples : 0, favicon ? samples : 0, samples];
  const total = series.reduce((a, b) => a + b, 0);
  let done = 0;
  const stepper = (planned: number) => {
    let seen = 0;
    return {
      step: () => {
        seen++;
        onProgress?.(++done, total);
      },
      finish: () => {
        done += planned - seen;
        onProgress?.(done, total);
      },
    };
  };

  let response: SampleResult[] = [];
  let asset: SampleResult[] = [];
  if (url) {
    const s = stepper(samples);
    response = await runSeries(() => probeResponse(url), samples, s.step);
    s.finish();
  }
  if (favicon) {
    const s = stepper(samples);
    asset = await runSeries(() => probeAsset(favicon), samples, s.step);
    s.finish();
  }
  const b = stepper(samples);
  const baseline = await runSeries(() => probeBaseline(baselineUrl), samples, b.step);
  b.finish();

  return {
    url,
    baselineUrl,
    measuredAt: new Date().toISOString(),
    samples,
    response,
    asset,
    baseline,
    network: readNetwork(),
    device: readDevice(),
  };
}

// ── CSV ─────────────────────────────────────────────────────────────

// Same escaping rules as the extension's exporter, so both CSVs open
// identically in Sheets / Excel.
function csvEscape(value: unknown): string {
  const s = String(value == null ? '' : value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const row = (...cells: unknown[]) => cells.map(csvEscape).join(',');
const ms = (v: number | null) => (v === null ? '' : v.toFixed(1));

export type CsvContext = {
  market?: string;
  brand?: string;
  device?: string;
  provider?: string;
  game?: string;
  week?: string;
  testDate?: string;
};

// Plain-language verdict so a DX lead can read the first screen of the CSV
// without comparing columns. Deliberately coarse: it only speaks when the
// two medians differ clearly.
export function verdict(result: PageSpeedResult): string {
  const brand = summarize(result.response);
  const base = summarize(result.baseline);
  if (base.ok === 0) return 'Baseline unreachable — the device had no usable connection.';
  if (result.url === null) return 'No brand site given — connection baseline only.';
  if (brand.ok === 0) return 'Brand site unreachable while the baseline responded — brand-side or blocked.';
  const ratio = brand.median! / Math.max(base.median!, 1);
  if (base.median! > 1500) return 'Baseline itself is slow — the VA connection is the bottleneck.';
  if (ratio >= 3 && brand.median! > 800) return 'Brand site is much slower than the baseline — points at the brand server/CDN.';
  return 'Brand site and baseline are in the same range — no clear network-side problem.';
}

function summaryRow(label: string, s: SampleStats): string {
  return row(label, ms(s.min), ms(s.median), ms(s.max), s.ok, s.failed);
}

function sampleRows(lines: string[], title: string, samples: SampleResult[]): void {
  lines.push(title);
  lines.push(row('Sample', 'Duration (ms)', 'Result'));
  if (samples.length === 0) {
    lines.push(row('', '', 'not probed'));
  } else {
    samples.forEach((s, i) => lines.push(row(i + 1, ms(s.ms), s.error ?? 'ok')));
  }
  lines.push('');
}

export function buildPerfCsv(result: PageSpeedResult, ctx: CsvContext = {}): string {
  const lines: string[] = [];

  lines.push('Page Speed Check');
  lines.push(row('Brand site', result.url ?? 'none'));
  lines.push(row('Baseline', result.baselineUrl));
  lines.push(row('Measured at', result.measuredAt));
  lines.push(row('Samples per probe', result.samples));
  if (ctx.week) lines.push(row('Week', ctx.week));
  if (ctx.testDate) lines.push(row('Test date', ctx.testDate));
  if (ctx.market) lines.push(row('Market', ctx.market));
  if (ctx.brand) lines.push(row('Brand', ctx.brand));
  if (ctx.provider || ctx.game) lines.push(row('Game', `${ctx.provider} - ${ctx.game}`));
  if (ctx.device) lines.push(row('Device', ctx.device));
  lines.push(row('Verdict', verdict(result)));
  lines.push('');

  lines.push('Summary');
  lines.push(row('Probe', 'Min (ms)', 'Median (ms)', 'Max (ms)', 'OK', 'Failed'));
  lines.push(summaryRow('Brand response (DNS+connect+TTFB)', summarize(result.response)));
  lines.push(summaryRow('Brand asset round trip (favicon)', summarize(result.asset)));
  lines.push(summaryRow('Baseline round trip (app server)', summarize(result.baseline)));
  lines.push('');

  sampleRows(lines, 'Brand response samples', result.response);
  sampleRows(lines, 'Brand asset samples', result.asset);
  sampleRows(lines, 'Baseline samples', result.baseline);

  lines.push('Network (as reported by the test device)');
  lines.push(row('Metric', 'Value'));
  const n = result.network;
  lines.push(row('Effective type', n.effectiveType ?? 'unavailable'));
  lines.push(row('Downlink (Mbps)', n.downlinkMbps ?? 'unavailable'));
  lines.push(row('RTT (ms)', n.rttMs ?? 'unavailable'));
  lines.push(row('Data saver', n.saveData === undefined ? 'unavailable' : n.saveData ? 'on' : 'off'));
  lines.push('');

  lines.push('Device');
  lines.push(row('Metric', 'Value'));
  lines.push(row('User agent', result.device.userAgent));
  lines.push(row('Device memory (GB)', result.device.deviceMemoryGb ?? 'unavailable'));
  lines.push(row('CPU cores', result.device.cpuCores ?? 'unavailable'));
  lines.push(row('Screen', result.device.screen));
  lines.push(row('Pixel ratio', result.device.pixelRatio ?? 'unavailable'));
  lines.push('');

  lines.push('Method');
  lines.push(
    row(
      'Note',
      'Measured from the tester device at submit time. Brand response = cross-origin no-cors fetch ' +
        '(headers only, body not readable); brand asset = favicon image load; baseline = full download ' +
        'of a small file from the app origin. FCP / LCP / long-task / render-blocking data cannot be ' +
        'read from another origin and is not included here.',
    ),
  );

  return lines.join('\n');
}
