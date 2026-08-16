// Pythagorean numerology: core numbers from the birth date and names, plus
// the personal year / month / day cycle used to rate individual dates.

const LETTER_VALUE = {}
'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').forEach((c, i) => {
  LETTER_VALUE[c] = (i % 9) + 1
})

const MASTER = new Set([11, 22, 33])

/** Reduce to a single digit, preserving the master numbers 11/22/33. */
export function reduceNumber(n, keepMaster = true) {
  let v = Math.abs(Math.trunc(n))
  while (v > 9) {
    if (keepMaster && MASTER.has(v)) return v
    v = String(v).split('').reduce((a, c) => a + Number(c), 0)
  }
  return v
}

const letters = (name) =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .split('')

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U'])

const sumLetters = (chars) => chars.reduce((a, c) => a + LETTER_VALUE[c], 0)

/** Destiny / Expression number — the whole name. */
export const expressionNumber = (name) => reduceNumber(sumLetters(letters(name)))
/** Soul Urge — vowels only. */
export const soulUrgeNumber = (name) => reduceNumber(sumLetters(letters(name).filter((c) => VOWELS.has(c))))
/** Personality — consonants only, i.e. how the world reads your look. */
export const personalityNumber = (name) =>
  reduceNumber(sumLetters(letters(name).filter((c) => !VOWELS.has(c))))

/** Life Path — the birth date, each component reduced then summed. */
export function lifePathNumber(y, m, d) {
  return reduceNumber(reduceNumber(y) + reduceNumber(m) + reduceNumber(d))
}

/** Birthday number — the day of the month, reduced. */
export const birthdayNumber = (d) => reduceNumber(d)

/**
 * Personal year / month / day for a target date, from the birth month and day.
 * The personal day is the fast-moving cycle a haircut date is judged on.
 */
export function personalCycles(birthMonth, birthDay, target) {
  const personalYear = reduceNumber(reduceNumber(birthMonth) + reduceNumber(birthDay) + reduceNumber(target.year))
  const personalMonth = reduceNumber(reduceNumber(personalYear) + reduceNumber(target.month))
  const personalDay = reduceNumber(reduceNumber(personalMonth) + reduceNumber(target.day))
  return { personalYear, personalMonth, personalDay }
}

/** Full numerology profile for a person. */
export function numerologyProfile({ fullName, nickname, year, month, day }) {
  const lifePath = lifePathNumber(year, month, day)
  const expression = fullName ? expressionNumber(fullName) : null
  const nick = nickname ? expressionNumber(nickname) : null
  return {
    lifePath,
    expression,
    soulUrge: fullName ? soulUrgeNumber(fullName) : null,
    personality: fullName ? personalityNumber(fullName) : null,
    // The nickname is the name the world actually calls you by, so it drives
    // how a change of appearance lands.
    nicknameNumber: nick,
    birthday: birthdayNumber(day),
    // Numbers this person resonates with; a date whose personal day matches
    // one of them is amplified.
    resonant: [lifePath, expression, nick].filter((n) => n != null),
  }
}

// How each personal-day number treats a deliberate change of appearance.
export const DAY_NUMBER_MEANING = {
  1: { score: 12, text: 'New beginnings — a fresh cut sets the tone for a whole cycle.' },
  2: { score: 0, text: 'Receptive and slow; fine for a trim, weak for a restyle.' },
  3: { score: 10, text: 'Self-expression and visibility — a good day to be seen differently.' },
  4: { score: -6, text: 'Structure and grind; change meets friction today.' },
  5: { score: 11, text: 'Change and movement — the classic day to alter your look.' },
  6: { score: 9, text: 'Beauty, grooming and harmony — the appearance number.' },
  7: { score: -5, text: 'Inward and analytical; the mirror will not be kind.' },
  8: { score: 6, text: 'Status and authority — good before anything professional.' },
  9: { score: 4, text: 'Endings — best for cutting away length you are done with.' },
  11: { score: 7, text: 'Master intuition — go only with a stylist you trust.' },
  22: { score: 5, text: 'Master builder — suits a long-term style change.' },
  33: { score: 5, text: 'Master nurturer — gentle reshaping favoured.' },
}
