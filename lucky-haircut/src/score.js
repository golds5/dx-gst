// The scoring engine: combines BaZi, the Chinese almanac, numerology and the
// lunar/astrological layer into one 0-100 rating per day, with every
// contribution kept as a readable reason.

import { dayOfficer, lunarDate, lunarMansion, lunarTaboos, mansionVerdict } from './almanac.js'
import { MOON_SIGN_LORE, ZODIAC, phaseScore, skyFor } from './astrology.js'
import { julianDayNumber, lastSectionalTerm } from './astro.js'
import {
  BRANCH_ANIMAL,
  ELEMENT_LABEL,
  branchElement,
  clashesWith,
  controls,
  dayPillar,
  favorableElements,
  fourPillars,
  harmonizesWith,
  harmsWith,
  produces,
  punishesWith,
  stemElement,
  trinesWith,
} from './bazi.js'
import { DAY_NUMBER_MEANING, numerologyProfile, personalCycles } from './numerology.js'

const BASE = 50
// The raw weights are unbounded, so squash them through a tanh curve: a
// modest edge still moves the score a lot, while a pile-up of small positives
// cannot push every day to 100.
const SPREAD = 50
const compress = (delta) => BASE + BASE * Math.tanh(delta / SPREAD)

// Officer -> how the almanac rates that day for cutting hair.
const OFFICER_SCORE = {
  建: { score: -2, text: 'Establish day — good for starting, neutral for grooming.' },
  除: { score: 15, text: 'Remove day — the almanac’s best officer for cutting away.' },
  满: { score: 7, text: 'Full day — abundance; fine for a fuller style.' },
  平: { score: 5, text: 'Balance day — safe and even, low risk.' },
  定: { score: 10, text: 'Settle day — locks a new look in place.' },
  执: { score: 3, text: 'Hold day — keeps what you have; suits a trim.' },
  破: { score: -22, text: 'Destruction day — avoid all appearance changes.' },
  危: { score: -12, text: 'Danger day — the almanac warns against sharp tools.' },
  成: { score: 12, text: 'Success day — favourable for completing a change.' },
  收: { score: 2, text: 'Receive day — gathering rather than cutting.' },
  开: { score: 14, text: 'Open day — opens a new cycle, excellent for a restyle.' },
  闭: { score: -16, text: 'Close day — closes things off; grooming is discouraged.' },
}

const GOALS = {
  grow: 'Grow it back fast',
  maintain: 'Keep the shape as long as possible',
  health: 'Strengthen and thicken',
  luck: 'Maximum luck, whatever the length',
}

export const GOAL_OPTIONS = Object.entries(GOALS).map(([value, label]) => ({ value, label }))

// Tuned so that over a year about one day in seven comes out excellent —
// enough choice to book around, few enough that the label means something.
const band = (score) =>
  score >= 88 ? 'excellent' : score >= 76 ? 'good' : score >= 56 ? 'fair' : score >= 36 ? 'poor' : 'avoid'

export const BAND_LABEL = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
  avoid: 'Avoid',
}

/**
 * Build the reusable part of the analysis: the natal chart, its favourable
 * elements and the numerology profile. Do this once, then score many days.
 */
export function buildProfile(input) {
  const chart = fourPillars({
    year: input.year,
    month: input.month,
    day: input.day,
    hour: input.hourKnown === false ? 12 : input.hour,
    minute: input.minute ?? 0,
    tzOffset: input.tzOffset ?? 0,
  })
  return {
    input,
    chart,
    elements: favorableElements(chart),
    numerology: numerologyProfile({
      fullName: input.fullName,
      nickname: input.nickname,
      year: input.year,
      month: input.month,
      day: input.day,
    }),
    hourKnown: input.hourKnown !== false,
  }
}

function baziReasons(profile, dp) {
  const out = []
  const { elements, chart } = profile
  const dayEl = stemElement(dp.stem)
  const branchEl = branchElement(dp.branch)

  const favourable = new Set(elements.favorable)
  const unfavourable = new Set(elements.unfavorable)

  if (favourable.has(dayEl)) {
    out.push({ layer: 'bazi', weight: 14, text: `Day stem is ${ELEMENT_LABEL[dayEl]}, one of your favourable elements.` })
  } else if (unfavourable.has(dayEl)) {
    out.push({ layer: 'bazi', weight: -10, text: `Day stem is ${ELEMENT_LABEL[dayEl]}, which unbalances your chart further.` })
  }
  if (favourable.has(branchEl)) {
    out.push({ layer: 'bazi', weight: 8, text: `Day branch carries ${ELEMENT_LABEL[branchEl]}, supporting your useful element.` })
  } else if (unfavourable.has(branchEl)) {
    out.push({ layer: 'bazi', weight: -6, text: `Day branch carries ${ELEMENT_LABEL[branchEl]}, an element you already have too much of.` })
  }

  // Relationships with the two pillars that represent the self.
  const pairs = [
    { key: 'day', label: 'day pillar (your self)', branch: chart.day.branch, scale: 1 },
    { key: 'year', label: 'year branch (your zodiac animal)', branch: chart.year.branch, scale: 0.8 },
  ]
  for (const p of pairs) {
    const animal = BRANCH_ANIMAL[p.branch]
    if (clashesWith(dp.branch, p.branch)) {
      out.push({
        layer: 'bazi',
        weight: -26 * p.scale,
        text: `${BRANCH_ANIMAL[dp.branch]} day clashes with your ${animal} ${p.label} — a personal clash day.`,
      })
    } else if (harmonizesWith(dp.branch, p.branch)) {
      out.push({ layer: 'bazi', weight: 13 * p.scale, text: `Six Harmony with your ${animal} ${p.label}.` })
    } else if (trinesWith(dp.branch, p.branch)) {
      out.push({ layer: 'bazi', weight: 10 * p.scale, text: `Three Harmony with your ${animal} ${p.label}.` })
    } else if (punishesWith(dp.branch, p.branch)) {
      out.push({ layer: 'bazi', weight: -11 * p.scale, text: `Punishment relationship with your ${animal} ${p.label}.` })
    } else if (harmsWith(dp.branch, p.branch)) {
      out.push({ layer: 'bazi', weight: -8 * p.scale, text: `Harm relationship with your ${animal} ${p.label}.` })
    }
  }

  // The day's ten-god role relative to the day master.
  const dm = elements.dayMaster
  if (dayEl === controls(dm)) {
    out.push({ layer: 'bazi', weight: elements.strong ? 6 : -3, text: 'A wealth-element day for you.' })
  } else if (produces(dayEl) === dm) {
    out.push({ layer: 'bazi', weight: elements.strong ? -3 : 6, text: 'A resource-element day, feeding your day master.' })
  }

  return out
}

function almanacReasons(dp, target, tz) {
  const out = []
  const jd = julianDayNumber(target.year, target.month, target.day) - tz / 24
  const monthBranch = (lastSectionalTerm(jd).index + 2) % 12
  const officer = dayOfficer(monthBranch, dp.branch)
  const o = OFFICER_SCORE[officer.name]
  out.push({ layer: 'almanac', weight: o.score, text: `${officer.name} (${officer.latin}, ${officer.gloss}) — ${o.text}` })

  const mansion = lunarMansion(target.year, target.month, target.day)
  const verdict = mansionVerdict(mansion.name)
  if (verdict === 'good') {
    out.push({ layer: 'almanac', weight: 7, text: `Mansion ${mansion.name} (${mansion.latin}) favours grooming.` })
  } else if (verdict === 'bad') {
    out.push({ layer: 'almanac', weight: -7, text: `Mansion ${mansion.name} (${mansion.latin}) is adverse for grooming.` })
  }

  const lunar = lunarDate(target.year, target.month, target.day, tz)
  for (const taboo of lunarTaboos(lunar)) {
    out.push({ layer: 'almanac', weight: taboo.weight, text: taboo.text })
  }
  return { reasons: out, officer, mansion, lunar }
}

function numerologyReasons(profile, target) {
  const out = []
  const { input, numerology } = profile
  const cycles = personalCycles(input.month, input.day, target)
  const meaning = DAY_NUMBER_MEANING[cycles.personalDay]
  out.push({
    layer: 'numerology',
    weight: meaning.score,
    text: `Personal day ${cycles.personalDay} — ${meaning.text}`,
  })
  if (numerology.resonant.includes(cycles.personalDay)) {
    out.push({
      layer: 'numerology',
      weight: 8,
      text: `Personal day matches one of your core numbers (${numerology.resonant.join('/')}).`,
    })
  }
  if (numerology.nicknameNumber && cycles.personalDay === numerology.nicknameNumber) {
    out.push({
      layer: 'numerology',
      weight: 5,
      text: `Resonates with "${input.nickname}" (${numerology.nicknameNumber}) — the name people see you by.`,
    })
  }
  return { reasons: out, cycles }
}

function astrologyReasons(target, tz, goal) {
  const sky = skyFor(target.year, target.month, target.day, tz)
  const out = []
  if (goal !== 'luck') {
    const ph = phaseScore(sky, goal)
    out.push({ layer: 'astrology', weight: ph.score, text: ph.text })
  } else {
    out.push({
      layer: 'astrology',
      weight: sky.waxing ? 4 : 0,
      text: `${sky.phase.label} (${Math.round(sky.illumination * 100)}% lit).`,
    })
  }
  const lore = MOON_SIGN_LORE[sky.moonSignName]
  const weight = goal === 'grow' ? lore.growth * 0.9 + lore.quality * 0.4 : goal === 'maintain' ? lore.quality * 0.9 - lore.growth * 0.4 : (lore.growth + lore.quality) * 0.6
  out.push({ layer: 'astrology', weight, text: `Moon in ${sky.moonSignName} — ${lore.text}` })
  return { reasons: out, sky }
}

/** Score a single civil date for a profile. */
export function scoreDate(profile, target, options = {}) {
  const goal = options.goal ?? 'grow'
  const tz = options.tzOffset ?? profile.input.tzOffset ?? 0
  const dp = dayPillar(target.year, target.month, target.day)

  const alm = almanacReasons(dp, target, tz)
  const num = numerologyReasons(profile, target)
  const ast = astrologyReasons(target, tz, goal)
  const reasons = [...baziReasons(profile, dp), ...alm.reasons, ...num.reasons, ...ast.reasons]

  const delta = reasons.reduce((a, r) => a + r.weight, 0)
  const score = Math.max(0, Math.min(100, Math.round(compress(delta))))

  const byLayer = {}
  for (const r of reasons) byLayer[r.layer] = (byLayer[r.layer] ?? 0) + r.weight

  return {
    date: { ...target },
    iso: `${target.year}-${String(target.month).padStart(2, '0')}-${String(target.day).padStart(2, '0')}`,
    weekday: new Date(Date.UTC(target.year, target.month - 1, target.day)).getUTCDay(),
    score,
    rawDelta: delta,
    band: band(score),
    pillar: dp,
    officer: alm.officer,
    mansion: alm.mansion,
    lunar: alm.lunar,
    sky: ast.sky,
    cycles: num.cycles,
    reasons: reasons
      .filter((r) => Math.abs(r.weight) >= 0.5)
      .sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)),
    byLayer,
  }
}

/** Score every day in an inclusive civil-date range. */
export function scoreRange(profile, from, to, options = {}) {
  const out = []
  const end = Date.UTC(to.year, to.month - 1, to.day)
  for (let t = Date.UTC(from.year, from.month - 1, from.day); t <= end; t += 86400000) {
    const d = new Date(t)
    out.push(
      scoreDate(profile, { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() }, options),
    )
  }
  return out
}

export { GOALS, ZODIAC }
