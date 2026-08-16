// Four Pillars of Destiny (BaZi) — pillars, five-element balance, and the
// branch relationships the day-scoring rules lean on.

import { julianDayNumber, lastSectionalTerm, toJulianDay } from './astro.js'

export const STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸']
export const STEM_PINYIN = ['Jia', 'Yi', 'Bing', 'Ding', 'Wu', 'Ji', 'Geng', 'Xin', 'Ren', 'Gui']
export const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
export const BRANCH_PINYIN = [
  'Zi', 'Chou', 'Yin', 'Mao', 'Chen', 'Si', 'Wu', 'Wei', 'Shen', 'You', 'Xu', 'Hai',
]
export const BRANCH_ANIMAL = [
  'Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake',
  'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig',
]

export const ELEMENTS = ['wood', 'fire', 'earth', 'metal', 'water']
export const ELEMENT_LABEL = { wood: 'Wood', fire: 'Fire', earth: 'Earth', metal: 'Metal', water: 'Water' }

// Stems pair up by element: Jia/Yi = Wood, Bing/Ding = Fire, ...
const STEM_ELEMENT = [0, 0, 1, 1, 2, 2, 3, 3, 4, 4].map((i) => ELEMENTS[i])
const BRANCH_ELEMENT = [
  'water', 'earth', 'wood', 'wood', 'earth', 'fire',
  'fire', 'earth', 'metal', 'metal', 'earth', 'water',
]
// Hidden stems, principal first, with the conventional weighting.
const HIDDEN_STEMS = [
  [9], [5, 9, 7], [4, 2, 6], [1], [4, 9, 1], [2, 6, 8],
  [3, 5, 1], [5, 3, 0], [6, 8, 4], [7], [4, 7, 3], [8, 0],
]
const HIDDEN_WEIGHT = [0.6, 0.25, 0.15]

export const stemElement = (i) => STEM_ELEMENT[i]
export const branchElement = (i) => BRANCH_ELEMENT[i]

/** Element that `a` produces (the generating cycle). */
export const produces = (a) => ELEMENTS[(ELEMENTS.indexOf(a) + 1) % 5]
/** Element that `a` controls (the overcoming cycle). */
export const controls = (a) => ELEMENTS[(ELEMENTS.indexOf(a) + 2) % 5]

// --- branch relationships -------------------------------------------------

/** Six Clashes: branches directly opposite on the wheel. */
export const clashesWith = (a, b) => (a + 6) % 12 === b % 12

const SIX_HARMONY = [[0, 1], [2, 11], [3, 10], [4, 9], [5, 8], [6, 7]]
/** Six Harmonies (liu he): the classic pairing of branches. */
export const harmonizesWith = (a, b) =>
  SIX_HARMONY.some(([x, y]) => (x === a && y === b) || (x === b && y === a))

const TRINES = [[0, 4, 8], [1, 5, 9], [2, 6, 10], [3, 7, 11]]
/** Three Harmonies (san he): branches four apart share an elemental frame. */
export const trinesWith = (a, b) => a !== b && TRINES.some((t) => t.includes(a) && t.includes(b))

const SIX_HARMS = [[0, 7], [1, 6], [2, 5], [3, 4], [8, 11], [9, 10]]
/** Six Harms (liu hai): the minor affliction pairs. */
export const harmsWith = (a, b) =>
  SIX_HARMS.some(([x, y]) => (x === a && y === b) || (x === b && y === a))

const PUNISHMENTS = [[2, 5, 8], [1, 10, 7], [3, 0], [4], [6], [9], [11]]
/** Punishments (xing), including the self-punishing branches. */
export const punishesWith = (a, b) =>
  PUNISHMENTS.some((g) => (g.length === 1 ? a === b && g[0] === a : g.includes(a) && g.includes(b) && a !== b))

// --- pillars --------------------------------------------------------------

const pillar = (stem, branch) => ({
  stem,
  branch,
  name: STEMS[stem] + BRANCHES[branch],
  latin: `${STEM_PINYIN[stem]}-${BRANCH_PINYIN[branch]}`,
  animal: BRANCH_ANIMAL[branch],
})

/**
 * Day pillar for a civil date. The sexagenary day cycle is continuous, so it
 * is a pure function of the Julian Day Number.
 */
export function dayPillar(y, m, d) {
  const jdn = julianDayNumber(y, m, d)
  return pillar((jdn + 9) % 10, (jdn + 1) % 12)
}

/**
 * Full four pillars for a birth moment.
 *
 * @param {{year:number, month:number, day:number, hour:number, minute:number, tzOffset:number}} birth
 *   Civil local date/time plus the UTC offset in hours at the birthplace.
 * @param {{lateZiNextDay?: boolean}} [opts] When true (the default), births
 *   from 23:00 belong to the next day's pillar, as most schools hold.
 */
export function fourPillars(birth, opts = {}) {
  const { lateZiNextDay = true } = opts
  const { year, month, day, hour = 12, minute = 0, tzOffset = 0 } = birth

  const utcMs = Date.UTC(year, month - 1, day, hour, minute) - tzOffset * 3600000
  const jd = toJulianDay(new Date(utcMs))

  // Year and month follow the solar terms, not the civil calendar: the year
  // turns at Lichun and the month at each of the twelve major terms.
  const term = lastSectionalTerm(jd)
  const monthBranch = (term.index + 2) % 12
  // A birth before Lichun still belongs to the previous sexagenary year; the
  // Ox month (index 11) is the only one that straddles the civil new year.
  const beforeLichun = month <= 2 && term.index === 11
  const yearForPillar = beforeLichun ? year - 1 : year
  const yearStem = ((yearForPillar - 4) % 10 + 10) % 10
  const yearBranch = ((yearForPillar - 4) % 12 + 12) % 12

  // "Jia/Ji years start with Bing" — the Tiger month's stem is fixed by the
  // year stem, and stems then run in order through the twelve months.
  const monthStem = (((yearStem % 5) * 2 + 2 + term.index) % 10 + 10) % 10

  let dayDate = { y: year, m: month, d: day }
  if (lateZiNextDay && hour >= 23) {
    const next = new Date(Date.UTC(year, month - 1, day + 1))
    dayDate = { y: next.getUTCFullYear(), m: next.getUTCMonth() + 1, d: next.getUTCDate() }
  }
  const dp = dayPillar(dayDate.y, dayDate.m, dayDate.d)

  // Hour branch: 23:00-01:00 is Zi, then two hours per branch.
  const hourBranch = Math.floor(((hour + 1) % 24) / 2)
  const hourStem = ((dp.stem % 5) * 2 + hourBranch) % 10

  return {
    year: pillar(yearStem, yearBranch),
    month: pillar(monthStem, monthBranch),
    day: dp,
    hour: pillar(hourStem, hourBranch),
    solarYear: yearForPillar,
    monthTermJd: term.jd,
  }
}

// --- element balance ------------------------------------------------------

const PILLAR_WEIGHT = { year: 1, month: 1.6, day: 1.3, hour: 1 }

/** Weighted count of each element across the chart, stems and hidden stems. */
export function elementProfile(chart) {
  const counts = Object.fromEntries(ELEMENTS.map((e) => [e, 0]))
  for (const key of ['year', 'month', 'day', 'hour']) {
    const p = chart[key]
    const w = PILLAR_WEIGHT[key]
    counts[stemElement(p.stem)] += w
    // The month branch dominates the season, so it carries extra weight.
    const branchWeight = key === 'month' ? w * 2 : w
    HIDDEN_STEMS[p.branch].forEach((s, i) => {
      counts[stemElement(s)] += branchWeight * (HIDDEN_WEIGHT[i] ?? 0.15)
    })
  }
  return counts
}

/**
 * Day-master strength and the elements that balance the chart.
 *
 * A strong day master wants elements that drain or restrain it (output,
 * wealth, officer); a weak one wants support (resource, companion). This is
 * the simplified "balance the scales" reading, not a full yong-shen analysis.
 */
export function favorableElements(chart) {
  const dm = stemElement(chart.day.stem)
  const counts = elementProfile(chart)
  const total = Object.values(counts).reduce((a, b) => a + b, 0)

  const resource = ELEMENTS[(ELEMENTS.indexOf(dm) + 4) % 5] // produces the day master
  const output = produces(dm)
  const wealth = controls(dm)
  const officer = ELEMENTS[(ELEMENTS.indexOf(dm) + 3) % 5] // controls the day master

  const supportive = counts[dm] + counts[resource]
  const ratio = supportive / total
  const strong = ratio >= 0.45

  return {
    dayMaster: dm,
    strength: ratio,
    strong,
    favorable: strong ? [output, wealth, officer] : [resource, dm],
    unfavorable: strong ? [resource, dm] : [wealth, officer],
    counts,
    roles: { resource, output, wealth, officer, companion: dm },
  }
}
