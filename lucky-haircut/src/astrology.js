// Western astrology layer: sun sign, transiting Moon sign, and the lunar
// phase — the two things traditional hair lore actually keys on.

import { ZODIAC, julianDayNumber, moonIllumination, moonLongitude, moonPhaseAngle, signOfLongitude, sunLongitude } from './astro.js'

export { ZODIAC }

export const PHASES = [
  { key: 'new', label: 'New Moon' },
  { key: 'waxing-crescent', label: 'Waxing Crescent' },
  { key: 'first-quarter', label: 'First Quarter' },
  { key: 'waxing-gibbous', label: 'Waxing Gibbous' },
  { key: 'full', label: 'Full Moon' },
  { key: 'waning-gibbous', label: 'Waning Gibbous' },
  { key: 'last-quarter', label: 'Last Quarter' },
  { key: 'waning-crescent', label: 'Waning Crescent' },
]

/** Phase bucket for an elongation angle (0 = new, 180 = full). */
export function phaseOf(angle) {
  const i = Math.floor(((angle + 22.5) % 360) / 45)
  return PHASES[i]
}

export const isWaxing = (angle) => angle < 180

/** Sky snapshot for local noon of a civil date. */
export function skyFor(y, m, d, tzOffset = 0) {
  const jd = julianDayNumber(y, m, d) - tzOffset / 24
  const angle = moonPhaseAngle(jd)
  const moonSign = signOfLongitude(moonLongitude(jd))
  return {
    jd,
    sunSign: signOfLongitude(sunLongitude(jd)),
    moonSign,
    moonSignName: ZODIAC[moonSign],
    phaseAngle: angle,
    phase: phaseOf(angle),
    waxing: isWaxing(angle),
    illumination: moonIllumination(jd),
  }
}

/**
 * Moon-sign lore for haircuts. Growth signs speed regrowth; the "beauty"
 * signs Leo and Virgo are the traditional pick for a cut you want to keep
 * looking sharp.
 */
export const MOON_SIGN_LORE = {
  Aries: { growth: 8, quality: -2, text: 'Fast regrowth, but Aries cuts tend to come out shorter than asked.' },
  Taurus: { growth: 4, quality: 8, text: 'Rules the neck and throat — thick, strong, well-behaved hair.' },
  Gemini: { growth: 2, quality: -3, text: 'Flighty; fine for a light trim, risky for a restyle.' },
  Cancer: { growth: 9, quality: -5, text: 'Very fast growth, but moisture-prone and frizzy.' },
  Leo: { growth: 5, quality: 12, text: 'The mane sign — the classic day for a cut you want noticed.' },
  Virgo: { growth: 3, quality: 11, text: 'Precision and health — best for shaping, split ends and detail work.' },
  Libra: { growth: 3, quality: 6, text: 'Balance and aesthetics; good for symmetry and colour.' },
  Scorpio: { growth: 6, quality: -6, text: 'Intense; results tend to be more dramatic than intended.' },
  Sagittarius: { growth: 5, quality: 2, text: 'Casual and easy-going — low-stakes trims only.' },
  Capricorn: { growth: 1, quality: 9, text: 'Slow growth and strong structure — a cut that holds its shape longest.' },
  Aquarius: { growth: 2, quality: -2, text: 'Unpredictable; expect the stylist to improvise.' },
  Pisces: { growth: 8, quality: -4, text: 'Soft and fast-growing, but hard to style.' },
}

export const SUN_SIGN_NOTE = (sign) => `Sun in ${sign}`

/**
 * Phase scoring depends on what you want out of the cut.
 * - `grow`: cut on a waxing moon so it grows back quickly and thickly.
 * - `maintain`: cut on a waning moon so the shape lasts and regrowth is slow.
 * - `health`: waxing gibbous, the traditional window for strengthening.
 */
export function phaseScore(sky, goal) {
  const { waxing, phase, illumination } = sky
  if (goal === 'maintain') {
    if (phase.key === 'full') return { score: 2, text: 'Full Moon — peak energy, but regrowth starts immediately.' }
    return waxing
      ? { score: -8, text: 'Waxing moon speeds regrowth — works against keeping the shape.' }
      : { score: 12 * (1 - illumination) + 4, text: `${phase.label} — waning moon slows regrowth, so the cut holds longer.` }
  }
  if (goal === 'health') {
    if (phase.key === 'waxing-gibbous' || phase.key === 'first-quarter') {
      return { score: 14, text: `${phase.label} — the traditional window for strengthening and thickening.` }
    }
    return waxing
      ? { score: 6, text: `${phase.label} — waxing moon supports growth and condition.` }
      : { score: -4, text: `${phase.label} — waning moon is for removal, not strengthening.` }
  }
  // default: grow it back fast
  if (phase.key === 'new') return { score: 6, text: 'New Moon — a clean restart for a new length.' }
  return waxing
    ? { score: 8 + 6 * illumination, text: `${phase.label} — waxing moon, hair grows back fast and full.` }
    : { score: -7, text: `${phase.label} — waning moon slows regrowth.` }
}
