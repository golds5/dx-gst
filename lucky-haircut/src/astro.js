// Astronomy primitives: Julian days, solar longitude, lunar longitude,
// solar terms and new moons. Formulae from Meeus, "Astronomical Algorithms"
// (2nd ed.), truncated to the terms that matter at day-level accuracy.
//
// Sun longitude is good to ~0.01 deg, Moon longitude to ~1 arcmin — far more
// than enough to place a solar term or a new moon on the correct calendar day.

const DEG = Math.PI / 180

export const norm360 = (x) => ((x % 360) + 360) % 360
const sin = (deg) => Math.sin(deg * DEG)

/** Julian Day for a JS Date, using its UTC instant. */
export function toJulianDay(date) {
  return date.getTime() / 86400000 + 2440587.5
}

/** Inverse of {@link toJulianDay}. */
export function fromJulianDay(jd) {
  return new Date((jd - 2440587.5) * 86400000)
}

/** Julian Day Number (integer) of the civil date `y-m-d` in the proleptic Gregorian calendar. */
export function julianDayNumber(y, m, d) {
  const a = Math.floor((14 - m) / 12)
  const yy = y + 4800 - a
  const mm = m + 12 * a - 3
  return (
    d +
    Math.floor((153 * mm + 2) / 5) +
    365 * yy +
    Math.floor(yy / 4) -
    Math.floor(yy / 100) +
    Math.floor(yy / 400) -
    32045
  )
}

const century = (jd) => (jd - 2451545) / 36525

/** Apparent geocentric longitude of the Sun, in degrees. */
export function sunLongitude(jd) {
  const T = century(jd)
  const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T
  const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T
  const C =
    (1.914602 - 0.004817 * T - 0.000014 * T * T) * sin(M) +
    (0.019993 - 0.000101 * T) * sin(2 * M) +
    0.000289 * sin(3 * M)
  const omega = 125.04 - 1934.136 * T
  return norm360(L0 + C - 0.00569 - 0.00478 * sin(omega))
}

// Meeus 47.A, the 20 largest periodic terms of the Moon's longitude.
// [D, M, M', F, coefficient in 1e-6 degrees]
const MOON_TERMS = [
  [0, 0, 1, 0, 6288774],
  [2, 0, -1, 0, 1274027],
  [2, 0, 0, 0, 658314],
  [0, 0, 2, 0, 213618],
  [0, 1, 0, 0, -185116],
  [0, 0, 0, 2, -114332],
  [2, 0, -2, 0, 58793],
  [2, -1, -1, 0, 57066],
  [2, 0, 1, 0, 53322],
  [2, -1, 0, 0, 45758],
  [0, 1, -1, 0, -40923],
  [1, 0, 0, 0, -34720],
  [0, 1, 1, 0, -30383],
  [2, 0, 0, -2, 15327],
  [0, 0, 1, 2, -12528],
  [0, 0, 1, -2, 10980],
  [4, 0, -1, 0, 10675],
  [0, 0, 3, 0, 10034],
  [4, 0, -2, 0, 8548],
  [2, 1, -1, 0, -7888],
]

/** Geocentric longitude of the Moon, in degrees. */
export function moonLongitude(jd) {
  const T = century(jd)
  const Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T * T
  const D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T * T
  const M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T * T
  const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T
  const F = 93.272095 + 483202.0175233 * T - 0.0036539 * T * T
  const E = 1 - 0.002516 * T - 0.0000074 * T * T

  let sum = 0
  for (const [cd, cm, cmp, cf, coeff] of MOON_TERMS) {
    // Terms involving the Sun's anomaly are scaled by the eccentricity factor.
    const e = cm === 0 ? 1 : Math.abs(cm) === 1 ? E : E * E
    sum += coeff * e * sin(cd * D + cm * M + cmp * Mp + cf * F)
  }
  return norm360(Lp + sum / 1e6)
}

/**
 * Elongation of the Moon from the Sun, 0..360.
 * 0 = new moon, 90 = first quarter, 180 = full, 270 = last quarter.
 */
export function moonPhaseAngle(jd) {
  return norm360(moonLongitude(jd) - sunLongitude(jd))
}

/** Illuminated fraction of the Moon's disc, 0..1. */
export function moonIllumination(jd) {
  return (1 - Math.cos(moonPhaseAngle(jd) * DEG)) / 2
}

// Generic root finder for "angle(jd) === target", given a rough daily rate.
function solveAngle(fn, target, guess, ratePerDay, iterations = 6) {
  let jd = guess
  for (let i = 0; i < iterations; i++) {
    let diff = norm360(fn(jd) - target)
    if (diff > 180) diff -= 360
    jd -= diff / ratePerDay
  }
  return jd
}

/**
 * Julian Day of the instant the Sun reaches longitude `15 * index` degrees,
 * i.e. the `index`-th solar term counting from the March equinox (index 0).
 * `nearJd` seeds the search; the returned instant is the one closest to it.
 */
export function solarTermJd(index, nearJd) {
  const target = norm360(index * 15)
  let diff = norm360(target - sunLongitude(nearJd))
  if (diff > 180) diff -= 360
  return solveAngle(sunLongitude, target, nearJd + diff / 0.9856, 0.9856)
}

/**
 * Julian Day of the sectional term (jieqi) that starts the "Chinese month"
 * containing
 * `jd`. Terms at longitudes 315, 345, 15, ... (Lichun, Jingzhe, Qingming, ...)
 * are the month boundaries used by the Four Pillars system.
 */
export function lastSectionalTerm(jd) {
  const lon = sunLongitude(jd)
  // Month boundaries sit at 315 deg (Lichun, start of the Tiger month) and
  // every 30 deg after it, so `index` counts months from Tiger.
  const index = Math.floor(norm360(lon - 315) / 30)
  const target = norm360(315 + index * 30)
  const daysSince = norm360(lon - target) / 0.9856
  return { jd: solarTermJd(Math.round(target / 15), jd - daysSince), index }
}

/** Julian Day of the last new moon at or before `jd`. */
export function newMoonBefore(jd) {
  // Mean lunation count since the reference new moon of 2000-01-06.
  let k = Math.floor((jd - 2451550.09766) / 29.530588861)
  for (let i = 0; i < 3; i++) {
    const guess = 2451550.09766 + 29.530588861 * k
    const nm = solveAngle(moonPhaseAngle, 0, guess, 12.19)
    if (nm <= jd + 1e-6) return nm
    k -= 1
  }
  return 2451550.09766 + 29.530588861 * k
}

/** Julian Day of the first new moon strictly after `jd`. */
export function newMoonAfter(jd) {
  let nm = newMoonBefore(jd)
  while (nm <= jd) {
    nm = solveAngle(moonPhaseAngle, 0, nm + 29.53, 12.19)
  }
  return nm
}

/** Zodiac sign index (0 = Aries) for an ecliptic longitude. */
export function signOfLongitude(lon) {
  return Math.floor(norm360(lon) / 30)
}

export const ZODIAC = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
]

/**
 * The last principal term (zhongqi) at or before `jd`. Principal terms sit at
 * 330 deg (Yushui), 0 deg (Chunfen) and every 30 deg after; `index` counts
 * them so that index 0 is the term that defines lunar month 1.
 */
export function lastPrincipalTerm(jd) {
  const lon = sunLongitude(jd)
  const index = Math.floor(norm360(lon - 330) / 30)
  const target = norm360(330 + index * 30)
  const daysSince = norm360(lon - target) / 0.9856
  return { jd: solarTermJd(Math.round(target / 15), jd - daysSince), index }
}
