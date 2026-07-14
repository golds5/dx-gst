import { describe, expect, it } from 'vitest';
import {
  buildFolderPath,
  buildVideoFilename,
  camelPart,
  extensionOf,
  formatSheetDate,
  hasTimestamp,
  isoWeekOf,
  stemOf,
  suggestSessionOfWeek,
  validateSlotNotes,
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

describe('notes validation', () => {
  it('accepts m:ss and mm:ss timestamps', () => {
    expect(hasTimestamp('0:25 lag on spin')).toBe(true);
    expect(hasTimestamp('lag at 12:05')).toBe(true);
    expect(hasTimestamp('no timestamps here')).toBe(false);
  });
  it('requires a timestamp for slight/strong lag', () => {
    expect(validateSlotNotes('slight', 'laggy')).not.toBeNull();
    expect(validateSlotNotes('strong', '')).not.toBeNull();
    expect(validateSlotNotes('slight', '0:25–0:30 symbol delay')).toBeNull();
  });
  it('allows empty notes for smooth', () => {
    expect(validateSlotNotes('smooth', '')).toBeNull();
    expect(validateSlotNotes('smooth', undefined)).toBeNull();
  });
});
