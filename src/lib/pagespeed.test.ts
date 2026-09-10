import { describe, expect, it } from 'vitest';
import {
  buildPerfCsv,
  faviconUrlFor,
  normalizeProbeUrl,
  summarize,
  verdict,
} from './pagespeed';
import type { PageSpeedResult } from './pagespeed';

describe('normalizeProbeUrl', () => {
  it('adds https to a bare domain', () => {
    expect(normalizeProbeUrl('www.dee99d.com')).toBe('https://www.dee99d.com/');
  });

  it('keeps the path and trims whitespace', () => {
    expect(normalizeProbeUrl('  dee99d.com/lobby  ')).toBe('https://dee99d.com/lobby');
  });

  // The app is served over https, so an http probe would be blocked as
  // mixed content — upgrade rather than fail.
  it('upgrades http to https', () => {
    expect(normalizeProbeUrl('http://dee99d.com')).toBe('https://dee99d.com/');
  });

  it('rejects empty and hostless input', () => {
    expect(normalizeProbeUrl('')).toBeNull();
    expect(normalizeProbeUrl('   ')).toBeNull();
    expect(normalizeProbeUrl('localhost')).toBeNull();
  });
});

describe('faviconUrlFor', () => {
  it('resolves against the site root, not the path', () => {
    expect(faviconUrlFor('https://dee99d.com/lobby/slots')).toBe(
      'https://dee99d.com/favicon.ico',
    );
  });
});

describe('summarize', () => {
  it('reports min/median/max over the successful samples', () => {
    const stats = summarize([{ ms: 300 }, { ms: 100 }, { ms: 200 }]);
    expect(stats).toEqual({ ok: 3, failed: 0, min: 100, median: 200, max: 300 });
  });

  it('averages the two middle values for an even count', () => {
    expect(summarize([{ ms: 100 }, { ms: 200 }, { ms: 300 }, { ms: 500 }]).median).toBe(250);
  });

  it('ignores failed samples but counts them', () => {
    const stats = summarize([{ ms: null, error: 'timeout' }, { ms: 120 }]);
    expect(stats.ok).toBe(1);
    expect(stats.failed).toBe(1);
    expect(stats.median).toBe(120);
  });

  it('returns nulls when every sample failed', () => {
    const stats = summarize([{ ms: null, error: 'timeout' }, { ms: null, error: 'x' }]);
    expect(stats).toEqual({ ok: 0, failed: 2, min: null, median: null, max: null });
  });
});

const RESULT: PageSpeedResult = {
  url: 'https://dee99d.com/',
  baselineUrl: 'https://dx-gst.vercel.app/favicon.svg',
  measuredAt: '2026-09-10T04:00:00.000Z',
  samples: 2,
  response: [{ ms: 120.44 }, { ms: null, error: 'timeout' }],
  asset: [{ ms: 80 }, { ms: 100 }],
  baseline: [{ ms: 60 }, { ms: 70 }],
  network: { effectiveType: '4g', downlinkMbps: 8.4, rttMs: 50, saveData: false },
  device: {
    userAgent:
      'Mozilla/5.0 (Linux; Android 11; SM-A715F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36',
    deviceMemoryGb: 4,
    cpuCores: 8,
    screen: '412x915',
    pixelRatio: 2.625,
  },
};

// The whole point of the baseline: tell the brand's server apart from the
// VA's connection. These are the four situations a DX lead will meet.
describe('verdict', () => {
  const withMedians = (brand: number | null, base: number | null): PageSpeedResult => ({
    ...RESULT,
    response: brand === null ? [{ ms: null, error: 'timeout' }] : [{ ms: brand }],
    baseline: base === null ? [{ ms: null, error: 'timeout' }] : [{ ms: base }],
  });

  it('blames the brand when it is far slower than a healthy baseline', () => {
    expect(verdict(withMedians(3000, 100))).toMatch(/brand server/i);
  });

  it('blames the connection when the baseline itself is slow', () => {
    expect(verdict(withMedians(3000, 2500))).toMatch(/VA connection/i);
  });

  it('reports no clear problem when both are in range', () => {
    expect(verdict(withMedians(250, 150))).toMatch(/same range/i);
  });

  it('flags a brand that failed while the baseline answered', () => {
    expect(verdict(withMedians(null, 100))).toMatch(/unreachable/i);
  });

  it('flags a dead connection when even the baseline failed', () => {
    expect(verdict(withMedians(500, null))).toMatch(/no usable connection/i);
  });

  it('says baseline-only when the slot had no brand site', () => {
    expect(verdict({ ...RESULT, url: null, response: [], asset: [] })).toMatch(/baseline only/i);
  });
});

describe('buildPerfCsv', () => {
  it('records the summary, every sample, and the failure reason', () => {
    const csv = buildPerfCsv(RESULT);
    expect(csv).toContain('Brand response (DNS+connect+TTFB),120.4,120.4,120.4,1,1');
    expect(csv).toContain('Brand asset round trip (favicon),80.0,90.0,100.0,2,0');
    expect(csv).toContain('Baseline round trip (app server),60.0,65.0,70.0,2,0');
    expect(csv).toContain('2,,timeout');
    expect(csv).toContain('Effective type,4g');
    expect(csv).toContain('CPU cores,8');
  });

  it('puts the verdict near the top', () => {
    const csv = buildPerfCsv(RESULT);
    const lines = csv.split('\n');
    const idx = lines.findIndex((l) => l.startsWith('Verdict,'));
    expect(idx).toBeGreaterThan(0);
    expect(idx).toBeLessThan(10);
  });

  it('handles a baseline-only run', () => {
    const csv = buildPerfCsv({ ...RESULT, url: null, response: [], asset: [] });
    expect(csv).toContain('Brand site,none');
    expect(csv).toContain('Brand response (DNS+connect+TTFB),,,,0,0');
  });

  it('includes the session context when given', () => {
    const csv = buildPerfCsv(RESULT, {
      market: 'TH',
      brand: 'DEE99',
      device: 'Samsung A71',
      provider: 'PG Soft',
      game: 'Ways Of The Qilin',
      week: 'W37',
      testDate: '2026-09-10',
    });
    expect(csv).toContain('Brand,DEE99');
    expect(csv).toContain('Game,PG Soft - Ways Of The Qilin');
    expect(csv).toContain('Week,W37');
  });

  // Sheets/Excel must read the file back correctly even though the user
  // agent string and the method note both contain commas.
  it('quotes values containing commas', () => {
    const csv = buildPerfCsv(RESULT);
    // "(KHTML, like Gecko)" would otherwise split into two columns.
    expect(csv).toContain(`"${RESULT.device.userAgent}"`);
  });

  it('marks the asset probe as not run when it was skipped', () => {
    const csv = buildPerfCsv({ ...RESULT, asset: [] });
    expect(csv).toContain(',,not probed');
  });
});
