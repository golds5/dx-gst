import { describe, expect, it } from 'vitest';
import {
  buildFolderPath,
  buildLagNotes,
  buildVideoFilename,
  camelPart,
  extensionOf,
  formatClockInput,
  formatSheetDate,
  isoWeekOf,
  isValidClock,
  stemOf,
  suggestSessionOfWeek,
  validateLagReport,
} from './naming';

const baseInput = {
  isoYear: 2026,
  weekNumber: 29,
  market: 'TH',
  sessionOfWeek: 2,
  provider: 'JILI',
  game: 'Golden Empire',
  brand: { group: 'KZG1', name: 'DEE99', isCompetitor: false },
  deviceId: 'VivoY20S',
  sourceFileName: 'screen-recording.mp4',
};

describe('buildVideoFilename', () => {
  it('matches the exact example from Section 5 of the spec', () => {
    expect(buildVideoFilename(baseInput)).toBe(
      '2026-W29_TH2_JILI-GoldenEmpire_KZG1-DEE99_VivoY20S.mp4',
    );
  });

  it('zero-pads the ISO week', () => {
    expect(buildVideoFilename({ ...baseInput, weekNumber: 5 })).toContain('2026-W05_');
  });

  it('uses CMP as group for competitor brands', () => {
    const name = buildVideoFilename({
      ...baseInput,
      brand: { group: '', name: 'BetFlik', isCompetitor: true },
    });
    expect(name).toBe('2026-W29_TH2_JILI-GoldenEmpire_CMP-BetFlik_VivoY20S.mp4');
  });

  it('CamelCases parts and strips illegal characters', () => {
    const name = buildVideoFilename({
      ...baseInput,
      provider: 'PG Soft',
      game: 'fortune tiger™ (turbo)',
      deviceId: 'Samsung A71 4G',
    });
    expect(name).toBe(
      '2026-W29_TH2_PGSoft-FortuneTigerTurbo_KZG1-DEE99_SamsungA714G.mp4',
    );
  });

  it('preserves the source extension, lowercased', () => {
    expect(
      buildVideoFilename({ ...baseInput, sourceFileName: 'IMG_1234.MOV' }),
    ).toMatch(/\.mov$/);
  });

  it('uses the session-of-week digit after the market', () => {
    expect(buildVideoFilename({ ...baseInput, sessionOfWeek: 1 })).toContain('_TH1_');
  });
});

describe('camelPart', () => {
  it('capitalizes each word and joins without spaces', () => {
    expect(camelPart('golden empire')).toBe('GoldenEmpire');
  });
  it('keeps existing inner casing', () => {
    expect(camelPart('PG Soft')).toBe('PGSoft');
    expect(camelPart('Vivo Y20S')).toBe('VivoY20S');
  });
  it('strips characters outside [A-Za-z0-9-]', () => {
    expect(camelPart('lucky™ neko! (v2)')).toBe('LuckyNekoV2');
  });
  it('keeps hyphens', () => {
    expect(camelPart('A71-4G')).toBe('A71-4G');
  });
});

describe('isoWeekOf', () => {
  it('computes a mid-year week', () => {
    // Tue 2026-07-14 is ISO week 29 of 2026
    expect(isoWeekOf('2026-07-14')).toEqual({ isoYear: 2026, weekNumber: 29 });
  });
  it('Thu 2026-01-01 is W01 of 2026', () => {
    expect(isoWeekOf('2026-01-01')).toEqual({ isoYear: 2026, weekNumber: 1 });
  });
  it('Mon 2025-12-29 belongs to ISO 2026 W01', () => {
    expect(isoWeekOf('2025-12-29')).toEqual({ isoYear: 2026, weekNumber: 1 });
  });
  it('Fri 2027-01-01 belongs to ISO 2026 W53', () => {
    expect(isoWeekOf('2027-01-01')).toEqual({ isoYear: 2026, weekNumber: 53 });
  });
  it('Sun 2026-01-04 is still W01', () => {
    expect(isoWeekOf('2026-01-04')).toEqual({ isoYear: 2026, weekNumber: 1 });
  });
});

describe('buildFolderPath', () => {
  it('builds Game Speed Check / YYYY / WWW / MARKET', () => {
    expect(buildFolderPath(2026, 29, 'TH')).toEqual([
      'Game Speed Check',
      '2026',
      'W29',
      'TH',
    ]);
  });
  it('zero-pads the week folder', () => {
    expect(buildFolderPath(2026, 5, 'PH')[2]).toBe('W05');
  });
});

describe('stemOf', () => {
  it('strips the extension', () => {
    expect(stemOf('2026-W29_TH2_JILI-GoldenEmpire_KZG1-DEE99_VivoY20S.mp4')).toBe(
      '2026-W29_TH2_JILI-GoldenEmpire_KZG1-DEE99_VivoY20S',
    );
  });
  it('matches the same slot across extensions (.mov vs .mp4)', () => {
    expect(stemOf('clip.mov')).toBe(stemOf('clip.mp4'));
  });
  it('leaves extension-less names unchanged', () => {
    expect(stemOf('recording')).toBe('recording');
  });
});

describe('suggestSessionOfWeek', () => {
  it('suggests 1 when nothing is logged this week', () => {
    expect(suggestSessionOfWeek([], 'Wed, 15/07')).toBe(1);
  });
  it('suggests 2 on a new day after day 1 exists (Wed then Fri)', () => {
    expect(suggestSessionOfWeek(['Wed, 15/07'], 'Fri, 17/07')).toBe(2);
  });
  it('keeps session 1 when re-opening day 1 later the same day', () => {
    expect(suggestSessionOfWeek(['Wed, 15/07'], 'Wed, 15/07')).toBe(1);
  });
  it('keeps session 2 when re-opening day 2', () => {
    expect(suggestSessionOfWeek(['Wed, 15/07', 'Fri, 17/07'], 'Fri, 17/07')).toBe(2);
  });
  it('ranks days chronologically regardless of sheet order (newest rows first)', () => {
    expect(suggestSessionOfWeek(['Fri, 17/07', 'Wed, 15/07'], 'Wed, 15/07')).toBe(1);
  });
  it('caps at 2', () => {
    expect(
      suggestSessionOfWeek(['Mon, 13/07', 'Wed, 15/07'], 'Fri, 17/07'),
    ).toBe(2);
  });
});

describe('formatSheetDate', () => {
  it('matches the Ddd, DD/MM example from Section 6', () => {
    expect(formatSheetDate('2026-06-24')).toBe('Wed, 24/06');
  });
  it('zero-pads day and month', () => {
    expect(formatSheetDate('2026-01-05')).toBe('Mon, 05/01');
  });
});

describe('extensionOf', () => {
  it('extracts and lowercases the extension', () => {
    expect(extensionOf('video.MOV')).toBe('mov');
  });
  it('falls back to mp4 when missing', () => {
    expect(extensionOf('recording')).toBe('mp4');
  });
});

describe('clock input', () => {
  it('formats digits into mm:ss while typing', () => {
    expect(formatClockInput('0023')).toBe('00:23');
    expect(formatClockInput('123')).toBe('1:23');
    expect(formatClockInput('23')).toBe('23');
    expect(formatClockInput('00:23')).toBe('00:23');
    expect(formatClockInput('12345')).toBe('12:34');
  });
  it('validates mm:ss with seconds < 60', () => {
    expect(isValidClock('00:23')).toBe(true);
    expect(isValidClock('1:20')).toBe(true);
    expect(isValidClock('01:75')).toBe(false);
    expect(isValidClock('23')).toBe(false);
    expect(isValidClock('')).toBe(false);
  });
});

describe('validateLagReport', () => {
  const ok = { start: '00:23', end: '01:20', tags: ['Frame rate drop'], text: '' };
  it('accepts a valid time frame with a preset tag', () => {
    expect(validateLagReport(ok)).toBeNull();
  });
  it('accepts free text instead of a tag', () => {
    expect(validateLagReport({ ...ok, tags: [], text: 'spins stall' })).toBeNull();
  });
  it('requires both clock fields to be valid', () => {
    expect(validateLagReport({ ...ok, start: '' })).toContain('time frame');
    expect(validateLagReport({ ...ok, end: '9' })).toContain('time frame');
  });
  it('requires end >= start', () => {
    expect(validateLagReport({ ...ok, start: '02:00', end: '01:00' })).toContain('end time');
  });
  it('requires at least one tag or note text', () => {
    expect(validateLagReport({ ...ok, tags: [], text: '  ' })).toContain('issue type');
  });
});

describe('buildLagNotes', () => {
  it('composes time frame, tags, and free text', () => {
    expect(
      buildLagNotes({
        start: '00:23',
        end: '01:20',
        tags: ['Animation glitch', 'Frame rate drop'],
        text: 'worst on bonus spins',
      }),
    ).toBe('00:23 - 01:20 — Animation glitch, Frame rate drop, worst on bonus spins');
  });
  it('works with tags only', () => {
    expect(buildLagNotes({ start: '00:05', end: '00:10', tags: ['Black screen'] })).toBe(
      '00:05 - 00:10 — Black screen',
    );
  });
});
