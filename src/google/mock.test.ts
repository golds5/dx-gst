import { describe, expect, it } from 'vitest';
import { MARKETS } from '../config';
import { mockBackend } from './mock';
import type { Session } from '../types';

const session: Session = {
  market: 'TH',
  sessionOfWeek: 1,
  isoYear: 2026,
  weekNumber: 30,
  testDate: '2026-07-21',
  device: 'Samsung A71 4G',
  provider: 'PG Soft',
  game: 'Ways of the Qilin',
  minBet: '1 THB',
};

describe('mock heatmap', () => {
  it('leaves brands the tester never logged blank', async () => {
    const brands = MARKETS.TH.brands;
    await mockBackend.logSlot({
      session,
      brandIndex: 0,
      brand: brands[0],
      rating: 'smooth',
      notes: '',
      minBet: '1 THB',
      driveLink: 'https://drive.google.com/file/d/abc/view',
    });

    const data = await mockBackend.fetchHeatmap('TH');
    expect(data.rows).toHaveLength(1);
    const row = data.rows[0];

    // The logged brand carries a label and a rating fill…
    expect(row[4].value).not.toBe('');
    expect(row[4].color).toBeTruthy();

    // …every brand that was not requested stays empty, so the admin view can
    // tell "not tested" apart from "tested, no result".
    for (let i = 5; i < 4 + brands.length; i++) {
      expect(row[i].value).toBe('');
      expect(row[i].color).toBeNull();
    }

    // Headers still name every brand column so the grid stays readable.
    expect(data.headers.slice(4)).toHaveLength(brands.length);
    expect(data.headers[4]).not.toBe('');
  });
});
