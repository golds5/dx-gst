import { describe, expect, it } from 'vitest'

import { fromJulianDay, julianDayNumber, moonPhaseAngle, newMoonBefore, solarTermJd, sunLongitude, toJulianDay } from './astro.js'
import { clashesWith, dayPillar, favorableElements, fourPillars } from './bazi.js'
import { dayOfficer, lunarDate } from './almanac.js'
import { expressionNumber, lifePathNumber, personalCycles, reduceNumber } from './numerology.js'
import { buildIcs } from './ics.js'
import { buildProfile, scoreDate, scoreRange } from './score.js'

const iso = (jd) => fromJulianDay(jd).toISOString().slice(0, 10)

describe('astro', () => {
  it('converts dates to Julian days', () => {
    expect(toJulianDay(new Date('2000-01-01T12:00:00Z'))).toBeCloseTo(2451545, 6)
    expect(julianDayNumber(2000, 1, 1)).toBe(2451545)
  })

  it('puts the Sun at the expected longitude', () => {
    // Sun crosses 0 deg at the March equinox.
    expect(sunLongitude(toJulianDay(new Date('2024-03-20T03:06:00Z')))).toBeCloseTo(0, 1)
    expect(sunLongitude(toJulianDay(new Date('2024-06-20T20:51:00Z')))).toBeCloseTo(90, 1)
  })

  it('finds solar terms on the right day', () => {
    // Lichun 2024 fell on 4 February; the Sun reaches 315 deg then.
    expect(iso(solarTermJd(21, julianDayNumber(2024, 2, 1)))).toBe('2024-02-04')
    // Winter solstice 2024: 21 December.
    expect(iso(solarTermJd(18, julianDayNumber(2024, 12, 18)))).toBe('2024-12-21')
  })

  it('finds new moons', () => {
    // New moon 11 April 2024 18:21 UT.
    const nm = newMoonBefore(julianDayNumber(2024, 4, 15))
    expect(iso(nm)).toBe('2024-04-08')
    expect(moonPhaseAngle(nm)).toBeCloseTo(0, 0)
  })
})

describe('bazi', () => {
  it('anchors the sexagenary day cycle', () => {
    // 2000-01-07 is the Jia-Zi day that restarts the 60-day cycle.
    expect(dayPillar(2000, 1, 7).name).toBe('甲子')
    expect(dayPillar(2000, 1, 8).name).toBe('乙丑')
    // 60 days later it comes round again.
    expect(dayPillar(2000, 3, 7).name).toBe('甲子')
  })

  it('builds four pillars for a known chart', () => {
    // 1990-06-15 08:30, UTC+8. Year 1990 = Geng-Wu.
    const chart = fourPillars({ year: 1990, month: 6, day: 15, hour: 8, minute: 30, tzOffset: 8 })
    expect(chart.year.name).toBe('庚午')
    // Mid-June is the Horse month (after Mangzhong).
    expect(chart.month.name).toBe('壬午')
    expect(chart.day.name).toBe(dayPillar(1990, 6, 15).name)
    // 08:30 is the Chen hour.
    expect(chart.hour.name.slice(-1)).toBe('辰')
  })

  it('moves a pre-Lichun birth into the previous sexagenary year', () => {
    // 3 February 1990 is before Lichun, so it still belongs to Ji-Si (1989).
    expect(fourPillars({ year: 1990, month: 2, day: 3, hour: 10, tzOffset: 8 }).year.name).toBe('己巳')
    expect(fourPillars({ year: 1990, month: 2, day: 10, hour: 10, tzOffset: 8 }).year.name).toBe('庚午')
  })

  it('rolls a late-Zi birth onto the next day pillar', () => {
    const late = fourPillars({ year: 1990, month: 6, day: 15, hour: 23, tzOffset: 8 })
    expect(late.day.name).toBe(dayPillar(1990, 6, 16).name)
  })

  it('detects branch clashes', () => {
    expect(clashesWith(0, 6)).toBe(true) // Rat vs Horse
    expect(clashesWith(2, 8)).toBe(true) // Tiger vs Monkey
    expect(clashesWith(0, 1)).toBe(false)
  })

  it('classifies day-master strength', () => {
    const chart = fourPillars({ year: 1990, month: 6, day: 15, hour: 8, tzOffset: 8 })
    const el = favorableElements(chart)
    expect(el.favorable).toHaveLength(el.strong ? 3 : 2)
    expect(el.favorable).not.toContain(el.unfavorable[0])
    expect(el.strength).toBeGreaterThan(0)
    expect(el.strength).toBeLessThan(1)
  })
})

describe('almanac', () => {
  it('starts the officer cycle on the month branch', () => {
    expect(dayOfficer(5, 5).name).toBe('建')
    expect(dayOfficer(5, 6).name).toBe('除')
    expect(dayOfficer(5, 4).name).toBe('闭')
  })

  it('reads lunar dates', () => {
    // Chinese New Year 2024 fell on 10 February — lunar 1/1.
    const cny = lunarDate(2024, 2, 10, 8)
    expect(cny.day).toBe(1)
    expect(cny.month).toBe(1)
    // Mid-autumn 2024: 17 September was lunar 8/15.
    const mid = lunarDate(2024, 9, 17, 8)
    expect(mid.day).toBe(15)
    expect(mid.month).toBe(8)
  })
})

describe('numerology', () => {
  it('reduces, keeping master numbers', () => {
    expect(reduceNumber(29)).toBe(11)
    expect(reduceNumber(29, false)).toBe(2)
    expect(reduceNumber(1987)).toBe(7)
  })

  it('computes life path and expression', () => {
    expect(lifePathNumber(1990, 6, 15)).toBe(4) // 1990->1, 6, 15->6 => 13 -> 4
    expect(expressionNumber('Amy')).toBe(reduceNumber(1 + 4 + 7))
  })

  it('walks the personal year/month/day cycle', () => {
    // Born 15 June; personal year 2026 = 6 + 6 + 1 = 13 -> 4.
    const a = personalCycles(6, 15, { year: 2026, month: 8, day: 16 })
    expect(a).toEqual({ personalYear: 4, personalMonth: 3, personalDay: 1 })
    // The next day advances by one, and 11 is kept as a master number.
    expect(personalCycles(6, 15, { year: 2026, month: 8, day: 17 }).personalDay).toBe(11)
  })
})

describe('scoring', () => {
  const profile = buildProfile({
    fullName: 'Test Person',
    nickname: 'Testy',
    year: 1990,
    month: 6,
    day: 15,
    hour: 8,
    minute: 30,
    tzOffset: 8,
  })

  it('scores a day with readable reasons', () => {
    const day = scoreDate(profile, { year: 2026, month: 9, day: 3 }, { goal: 'grow', tzOffset: 8 })
    expect(day.score).toBeGreaterThanOrEqual(0)
    expect(day.score).toBeLessThanOrEqual(100)
    expect(day.reasons.length).toBeGreaterThan(3)
    expect(day.reasons.every((r) => typeof r.text === 'string' && r.text.length > 0)).toBe(true)
    expect(day.iso).toBe('2026-09-03')
  })

  it('is deterministic', () => {
    const args = [{ year: 2026, month: 9, day: 3 }, { goal: 'grow', tzOffset: 8 }]
    expect(scoreDate(profile, ...args).score).toBe(scoreDate(profile, ...args).score)
  })

  it('scores an inclusive range', () => {
    const days = scoreRange(profile, { year: 2026, month: 9, day: 1 }, { year: 2026, month: 9, day: 30 }, { tzOffset: 8 })
    expect(days).toHaveLength(30)
    expect(days[0].iso).toBe('2026-09-01')
    expect(days[29].iso).toBe('2026-09-30')
  })

  it('separates the goals', () => {
    const range = { from: { year: 2026, month: 9, day: 1 }, to: { year: 2026, month: 10, day: 31 } }
    const grow = scoreRange(profile, range.from, range.to, { goal: 'grow', tzOffset: 8 })
    const maintain = scoreRange(profile, range.from, range.to, { goal: 'maintain', tzOffset: 8 })
    const best = (list) => list.slice().sort((a, b) => b.score - a.score)[0]
    // Growth wants a waxing moon; maintenance wants a waning one.
    expect(best(grow).sky.waxing).toBe(true)
    expect(best(maintain).sky.waxing).toBe(false)
  })

  it('penalises the first lunar month', () => {
    // Lunar 1/2 in 2027 (Chinese New Year 2027-02-06).
    const inTaboo = scoreDate(profile, { year: 2027, month: 2, day: 7 }, { tzOffset: 8 })
    expect(inTaboo.lunar.month).toBe(1)
    expect(inTaboo.reasons.some((r) => r.text.includes('first moon'))).toBe(true)
  })
})

describe('ics export', () => {
  const profile = buildProfile({ fullName: 'Test Person', nickname: 'Testy', year: 1990, month: 6, day: 15, hour: 8, tzOffset: 8 })

  it('emits a valid all-day calendar', () => {
    const days = [scoreDate(profile, { year: 2026, month: 9, day: 3 }, { tzOffset: 8 })]
    const ics = buildIcs(days, { dtstamp: '20260816T000000Z' })
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('DTSTART;VALUE=DATE:20260903')
    expect(ics).toContain('DTEND;VALUE=DATE:20260904')
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    // Every content line must be at most 75 octets after folding.
    expect(ics.split('\r\n').every((l) => l.length <= 75)).toBe(true)
  })
})
