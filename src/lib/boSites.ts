// Brand → site lookup, read from the KZ site reference at the repo root.
//
// The page-speed panel prefills its target from here so a VA never types a
// domain on a phone. Two columns in that file carry a site: `brand_site`
// (the marketing site, e.g. d99v1.com) and `mp_domain` (the member portal
// the VA actually logs into and plays on, e.g. dee99d.com). The probe wants
// the second — its values match the DX Accounts sheet exactly for all 14
// brands the app tests — falling back to `brand_site` for the handful of
// rows with a blank mp_domain (789BK is the one that matters today).
//
// Matching is on (country_code, brand): `brand` is unique inside a country,
// while `bo_group` is named inconsistently across markets (TH uses `kzg1`
// where the app's group is `KZG1`, but PH uses `phk1` where the app's group
// is `PHKZG1`) so it cannot be matched against BrandConfig.group.
import raw from '../../kz_sites.csv?raw';

// Minimal RFC 4180 reader — the `note` column is free text, so a field may
// be quoted and contain commas or embedded doubled quotes.
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      // Close the row on \n, and on a lone \r; swallow the \n of a \r\n.
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

// Values in the reference are bare domains, but strip a scheme / trailing
// slash / stray whitespace anyway so an edit to the source file cannot feed
// a malformed value into the URL field.
function cleanDomain(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/+$/, '')
    .trim();
}

const key = (market: string, brand: string) =>
  `${market.trim().toUpperCase()}|${brand.trim().toUpperCase()}`;

export type SiteRow = {
  market: string;
  brand: string;
  site: string; // mp_domain, or brand_site when mp_domain is blank
  isDemo: boolean;
};

export function buildSiteIndex(csvText: string): Map<string, SiteRow> {
  const rows = parseCsv(csvText);
  const index = new Map<string, SiteRow>();
  if (rows.length === 0) return index;

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iMarket = col('country_code');
  const iBrand = col('brand');
  const iBrandSite = col('brand_site');
  const iMpDomain = col('mp_domain');
  const iIsDemo = col('is_demo');
  if (iMarket === -1 || iBrand === -1) return index;

  for (const row of rows.slice(1)) {
    const market = row[iMarket]?.trim();
    const brand = row[iBrand]?.trim();
    if (!market || !brand) continue;
    // Demo brands are internal fixtures — never a VA test target.
    const isDemo = (row[iIsDemo] ?? '').trim().toUpperCase() === 'TRUE';
    if (isDemo) continue;
    const site =
      cleanDomain(row[iMpDomain] ?? '') || cleanDomain(row[iBrandSite] ?? '');
    if (!site) continue;
    // First row wins — a duplicate (market, brand) is a data error, and
    // silently preferring the later one would hide it.
    const k = key(market, brand);
    if (!index.has(k)) index.set(k, { market, brand, site, isDemo });
  }
  return index;
}

const SITE_INDEX = buildSiteIndex(raw);

// The site a VA should point the page-speed probe at, or null when the
// reference has no row for this brand (competitors are not in the KZ file,
// so those slots fall back to the DX Accounts sheet / manual entry).
export function siteForBrand(market: string, brand: string): string | null {
  return SITE_INDEX.get(key(market, brand))?.site ?? null;
}
