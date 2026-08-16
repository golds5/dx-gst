// Chinese almanac (Tong Shu) layers: the Twelve Day Officers, the Twenty-Eight
// Lunar Mansions, and the lunar date — the parts of the almanac that
// traditionally govern whether a day suits cutting hair.

import { julianDayNumber, lastPrincipalTerm, newMoonAfter, newMoonBefore } from './astro.js'

// --- Twelve Day Officers (jian chu) ---------------------------------------

export const OFFICERS = [
  { name: '建', latin: 'Jian', gloss: 'Establish' },
  { name: '除', latin: 'Chu', gloss: 'Remove' },
  { name: '满', latin: 'Man', gloss: 'Full' },
  { name: '平', latin: 'Ping', gloss: 'Balance' },
  { name: '定', latin: 'Ding', gloss: 'Settle' },
  { name: '执', latin: 'Zhi', gloss: 'Hold' },
  { name: '破', latin: 'Po', gloss: 'Destruction' },
  { name: '危', latin: 'Wei', gloss: 'Danger' },
  { name: '成', latin: 'Cheng', gloss: 'Success' },
  { name: '收', latin: 'Shou', gloss: 'Receive' },
  { name: '开', latin: 'Kai', gloss: 'Open' },
  { name: '闭', latin: 'Bi', gloss: 'Close' },
]

/**
 * Day Officer index: the officer cycle is pinned so that the day whose branch
 * equals the month branch is "Establish", then advances one per day.
 */
export function dayOfficer(monthBranch, dayBranch) {
  const i = (dayBranch - monthBranch + 12) % 12
  return { index: i, ...OFFICERS[i] }
}

// --- Twenty-Eight Lunar Mansions ------------------------------------------

export const MANSIONS = [
  '角', '亢', '氐', '房', '心', '尾', '箕',
  '斗', '牛', '女', '虚', '危', '室', '壁',
  '奎', '娄', '胃', '昴', '毕', '觜', '参',
  '井', '鬼', '柳', '星', '张', '翼', '轸',
]
export const MANSION_LATIN = [
  'Jiao', 'Kang', 'Di', 'Fang', 'Xin', 'Wei-Tail', 'Ji',
  'Dou', 'Niu', 'Nu', 'Xu', 'Wei-Rooftop', 'Shi', 'Bi-Wall',
  'Kui', 'Lou', 'Wei-Stomach', 'Mao', 'Bi-Net', 'Zi', 'Shen',
  'Jing', 'Gui', 'Liu', 'Xing', 'Zhang', 'Yi', 'Zhen',
]

// The mansion cycle is 28 days long and runs unbroken, so it locks to the
// weekday: Fang/Xu/Mao/Xing always fall on Sunday. ANCHOR_JDN is a Saturday
// (2000-01-01) taken as Di, which satisfies that constraint. Almanac editions
// differ by a whole cycle in rare cases; adjust ANCHOR_INDEX if yours does.
const ANCHOR_JDN = 2451545
const ANCHOR_INDEX = 2

export function lunarMansion(y, m, d) {
  const i = (((julianDayNumber(y, m, d) - ANCHOR_JDN) % 28) + 28 + ANCHOR_INDEX) % 28
  return { index: i, name: MANSIONS[i], latin: MANSION_LATIN[i] }
}

// Mansions the almanac marks as favourable or adverse for grooming and
// "adjusting the appearance" (zheng rong).
const MANSION_GOOD = new Set(['角', '房', '尾', '箕', '斗', '室', '壁', '毕', '井', '张', '轸'])
const MANSION_BAD = new Set(['亢', '心', '女', '虚', '危', '娄', '鬼', '柳'])

export const mansionVerdict = (name) =>
  MANSION_GOOD.has(name) ? 'good' : MANSION_BAD.has(name) ? 'bad' : 'neutral'

// --- Lunar date -----------------------------------------------------------

/**
 * Lunar (yin) date for a civil date: which lunar day, and which lunar month
 * counting from the month that contains Lichun as month 1.
 *
 * The month number here is the folk "which moon is this" count used by the
 * first-month haircut taboo; it is not a full leap-month-aware conversion.
 */
export function lunarDate(y, m, d, tzOffset = 8) {
  const jdn = julianDayNumber(y, m, d)
  const localNoon = jdn - tzOffset / 24
  // Index of the local civil day a Julian Day instant belongs to.
  const localDay = (jd) => Math.floor(jd + 0.5 + tzOffset / 24)

  const nm = newMoonBefore(localNoon)
  const nextNm = newMoonAfter(localNoon)
  const day = jdn - localDay(nm) + 1

  // A lunar month takes its number from the principal term (zhongqi) it
  // contains: Yushui -> month 1, Chunfen -> month 2, and so on. A month
  // containing no principal term is a leap month and repeats the previous
  // month's number.
  const closing = lastPrincipalTerm(nextNm - 0.01)
  const leap = closing.jd < nm
  const month = (leap ? lastPrincipalTerm(nm).index : closing.index) + 1

  return { day, month, leap, newMoonJd: nm, nextNewMoonJd: nextNm }
}

/** Folk taboos that override everything else in the score. */
export function lunarTaboos(lunar) {
  const out = []
  if (lunar.month === 1) {
    out.push({
      key: 'first-month',
      text: 'First lunar month — the "no haircut in the first moon" custom applies.',
      weight: -30,
    })
  }
  if (lunar.day === 1 || lunar.day === 15) {
    out.push({
      key: 'new-full-moon',
      text: `Lunar day ${lunar.day} — traditionally reserved for offerings, not grooming.`,
      weight: -8,
    })
  }
  if (lunar.day === 7 || lunar.day === 17 || lunar.day === 27) {
    out.push({ key: 'seven', text: 'A "seven" day, mildly inauspicious for cutting.', weight: -4 })
  }
  return out
}
