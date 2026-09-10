import { describe, expect, it } from 'vitest';
import { buildSiteIndex, parseCsv, siteForBrand } from './boSites';

const HEADER =
  'country_code,country,bo,bo_site,bo_group,brand,brand_site,mp_domain,is_demo,note';

describe('parseCsv', () => {
  it('keeps a quoted field containing commas in one column', () => {
    const rows = parseCsv('a,b,c\n1,"two, and a half",3');
    expect(rows[1]).toEqual(['1', 'two, and a half', '3']);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsv('a\n"say ""hi"""')[1]).toEqual(['say "hi"']);
  });

  it('handles CRLF line endings and skips blank lines', () => {
    const rows = parseCsv('a,b\r\n1,2\r\n\r\n3,4\r\n');
    expect(rows).toEqual([
      ['a', 'b'],
      ['1', '2'],
      ['3', '4'],
    ]);
  });
});

describe('buildSiteIndex', () => {
  it('prefers mp_domain over brand_site', () => {
    const index = buildSiteIndex(
      `${HEADER}\nTH,Thailand,THKZG1,kzg1bo.com,kzg1,DEE99,d99v1.com,dee99d.com,FALSE,`,
    );
    expect(index.get('TH|DEE99')?.site).toBe('dee99d.com');
  });

  // 789BK has no mp_domain in the reference, and the DX Accounts sheet uses
  // its brand_site — so a blank mp_domain must fall through, not blank out.
  it('falls back to brand_site when mp_domain is blank', () => {
    const index = buildSiteIndex(
      `${HEADER}\nTH,Thailand,TH96G1,bo789bk.net,96g1,789BK,789bkv1.net,,FALSE,`,
    );
    expect(index.get('TH|789BK')?.site).toBe('789bkv1.net');
  });

  it('skips demo brands', () => {
    const index = buildSiteIndex(
      `${HEADER}\nTH,Thailand,THKZG1,kzg1bo.com,kzg1,DMKZ1,demokzg1.com,,TRUE,`,
    );
    expect(index.has('TH|DMKZ1')).toBe(false);
  });

  it('skips rows with no site at all', () => {
    const index = buildSiteIndex(
      `${HEADER}\nID,Indonesia,,,idk1,MAINBIG,,,FALSE,no production section`,
    );
    expect(index.has('ID|MAINBIG')).toBe(false);
  });

  it('strips a scheme, trailing slash and stray whitespace', () => {
    const index = buildSiteIndex(
      `${HEADER}\nTH,Thailand,THKZG2,kzg2bo.com,kzg2,BIG188,x.com, https://www.big188fb5.com/ ,FALSE,`,
    );
    expect(index.get('TH|BIG188')?.site).toBe('www.big188fb5.com');
  });

  // DEMO BRAND repeats across countries, so the key must include the market.
  it('keys on market and brand together', () => {
    const index = buildSiteIndex(
      `${HEADER}\n` +
        'PH,Philippines,PHKZG1,phkz1bo.com,phk1,POPWIN,popwinv1.com,popwinv1.com,FALSE,\n' +
        'BD,Bangladesh,BDKZG1,bdkz1bo.com,bdk1,BDPOP,bdpopv1.com,bdpopv1.com,FALSE,',
    );
    expect(index.get('PH|POPWIN')?.site).toBe('popwinv1.com');
    expect(index.get('BD|POPWIN')).toBeUndefined();
  });

  it('ignores a note column containing commas', () => {
    const index = buildSiteIndex(
      `${HEADER}\nPK,Pakistan,PKKZG1,pkr1kzbo.com,pkk1,PKPOP,pkpopv4.com,pkpopv1.com,FALSE,"v4 here, v1 there"`,
    );
    expect(index.get('PK|PKPOP')?.site).toBe('pkpopv1.com');
  });
});

// Reads the real kz_sites.csv bundled with the app, so a bad edit to that
// file breaks the build rather than silently blanking a VA's URL field.
describe('siteForBrand against the shipped reference', () => {
  it.each([
    ['TH', 'DEE99', 'dee99d.com'],
    ['TH', 'BIG188', 'big188.cc'],
    ['TH', 'TRU99', 'tru99.co'],
    ['TH', 'RM99', 'rm99.io'],
    ['TH', '789BK', '789bkv1.net'], // brand_site fallback
    ['TH', 'TK69', 'tk69b.org'],
    ['PH', 'EZWIN', 'ezwinv1.com'],
    ['PH', 'PHWINWIN', 'phwinwinn.com'],
    ['PH', 'WINMAYA', 'winmayab.org'],
    ['PH', 'MRJILI', 'mrjili.io'],
    ['MX', 'MXWOW', 'mxwowv1.com'],
    ['MX', 'OROMX', 'oromxjj.net'],
    ['BD', 'ADDA7', 'adda71.com'],
    ['BD', 'BDJOSS', 'bdjossbg.net'],
  ])('resolves %s / %s', (market, brand, expected) => {
    expect(siteForBrand(market, brand)).toBe(expected);
  });

  it('returns null for competitors, which the KZ reference does not cover', () => {
    expect(siteForBrand('TH', 'BetFlik')).toBeNull();
    expect(siteForBrand('PH', 'LODIBET')).toBeNull();
  });
});
