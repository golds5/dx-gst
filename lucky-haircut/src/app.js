// UI wiring: collect the birth details, score the requested range, and render
// the picks, the month calendar and the per-day breakdown.

import { ELEMENT_LABEL } from './bazi.js'
import { buildIcs, googleCalendarUrl } from './ics.js'
import { BAND_LABEL, GOAL_OPTIONS, buildProfile, scoreRange } from './score.js'

const $ = (sel) => document.querySelector(sel)
const STORAGE_KEY = 'lucky-haircut.profile.v1'

const BAND_COLOR = {
  excellent: '#4bb17a',
  good: '#8bbd5a',
  fair: '#d9b64e',
  poor: '#cf7b45',
  avoid: '#b8503f',
}
const BAND_ORDER = ['avoid', 'poor', 'fair', 'good', 'excellent']
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const state = {
  profile: null,
  days: [],
  options: null,
  allowedWeekdays: new Set([0, 1, 2, 3, 4, 5, 6]),
  monthCursor: null,
}

// --- helpers --------------------------------------------------------------

const pad = (n) => String(n).padStart(2, '0')
const toIsoDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseIsoDate = (s) => {
  const [year, month, day] = s.split('-').map(Number)
  return { year, month, day }
}
const asDate = (d) => new Date(Date.UTC(d.year, d.month - 1, d.day))
const longDate = (d) =>
  asDate(d).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
const shortDate = (d) =>
  asDate(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

function download(filename, text, type = 'text/calendar') {
  const url = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.append(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// --- form setup -----------------------------------------------------------

function fillSelects() {
  const goal = $('#goal')
  goal.replaceChildren(
    ...GOAL_OPTIONS.map((o) => new Option(o.label, o.value)),
  )

  const localOffset = -new Date().getTimezoneOffset() / 60
  for (const name of ['birthTz', 'tz']) {
    const el = document.querySelector(`[name="${name}"]`)
    const options = []
    for (let h = -12; h <= 14; h += 0.5) {
      const sign = h < 0 ? '-' : '+'
      const abs = Math.abs(h)
      const label = `UTC${sign}${pad(Math.floor(abs))}:${abs % 1 ? '30' : '00'}`
      options.push(new Option(label, String(h)))
    }
    el.replaceChildren(...options)
    el.value = String(localOffset)
  }

  const chips = $('#weekday-toggles')
  chips.replaceChildren(
    ...WEEKDAYS.map((label, i) => {
      const b = document.createElement('button')
      b.type = 'button'
      b.className = 'chip'
      b.textContent = label
      b.dataset.day = String(i)
      b.setAttribute('aria-pressed', 'true')
      b.addEventListener('click', () => {
        const on = b.getAttribute('aria-pressed') === 'true'
        b.setAttribute('aria-pressed', String(!on))
      })
      return b
    }),
  )

  const today = new Date()
  const in90 = new Date(today.getTime() + 90 * 86400000)
  const form = $('#profile-form')
  form.from.value = toIsoDate(today)
  form.to.value = toIsoDate(in90)
}

function readForm() {
  const form = $('#profile-form')
  const data = Object.fromEntries(new FormData(form))
  const birth = parseIsoDate(data.birthDate)
  const hourUnknown = form.hourUnknown.checked
  const [hour, minute] = (data.birthTime || '12:00').split(':').map(Number)
  return {
    input: {
      fullName: data.fullName.trim(),
      nickname: (data.nickname || '').trim(),
      gender: data.gender,
      year: birth.year,
      month: birth.month,
      day: birth.day,
      hour: hourUnknown ? 12 : hour,
      minute: hourUnknown ? 0 : minute,
      hourKnown: !hourUnknown,
      tzOffset: Number(data.birthTz),
    },
    from: parseIsoDate(data.from),
    to: parseIsoDate(data.to),
    options: { goal: data.goal, tzOffset: Number(data.tz) },
    weekdays: [...form.querySelectorAll('.chip')]
      .filter((c) => c.getAttribute('aria-pressed') === 'true')
      .map((c) => Number(c.dataset.day)),
    raw: { ...data, hourUnknown },
  }
}

function restoreForm() {
  let saved
  try {
    saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
  } catch {
    return false
  }
  if (!saved) return false
  const form = $('#profile-form')
  for (const [key, value] of Object.entries(saved.raw ?? {})) {
    const field = form.elements[key]
    if (!field) continue
    if (field.type === 'checkbox') field.checked = Boolean(value)
    else field.value = value
  }
  for (const chip of form.querySelectorAll('.chip')) {
    chip.setAttribute('aria-pressed', String((saved.weekdays ?? []).includes(Number(chip.dataset.day))))
  }
  // Never resurrect a range that has already gone by.
  const today = toIsoDate(new Date())
  if (form.from.value < today) form.from.value = today
  if (form.to.value <= form.from.value) {
    form.to.value = toIsoDate(new Date(Date.now() + 90 * 86400000))
  }
  return true
}

// --- rendering ------------------------------------------------------------

function renderChart(profile) {
  const { chart, elements, numerology, input } = profile
  $('#summary-title').textContent = input.fullName ? `${input.fullName}’s chart` : 'Your chart'

  const labels = { year: 'Year', month: 'Month', day: 'Day (self)', hour: 'Hour' }
  $('#pillars').replaceChildren(
    ...['year', 'month', 'day', 'hour'].map((key) => {
      const el = document.createElement('div')
      el.className = 'pillar'
      const known = key !== 'hour' || profile.hourKnown
      el.innerHTML = `<b>${known ? chart[key].name : '??'}</b><span>${labels[key]}<br>${
        known ? chart[key].latin : 'hour unknown'
      }</span>`
      return el
    }),
  )

  const fav = elements.favorable.map((e) => ELEMENT_LABEL[e]).join(', ')
  const unfav = elements.unfavorable.map((e) => ELEMENT_LABEL[e]).join(', ')
  const notes = [
    `Day master <strong>${ELEMENT_LABEL[elements.dayMaster]}</strong>, ${
      elements.strong ? 'strong' : 'weak'
    } (${Math.round(elements.strength * 100)}% supportive) — favourable elements <strong>${fav}</strong>, to avoid ${unfav}.`,
    `Zodiac animal <strong>${chart.year.animal}</strong>; days clashing with it are marked down.`,
    `Life Path <strong>${numerology.lifePath}</strong>${
      numerology.expression ? `, Destiny <strong>${numerology.expression}</strong>` : ''
    }${numerology.soulUrge ? `, Soul Urge <strong>${numerology.soulUrge}</strong>` : ''}${
      numerology.nicknameNumber ? `, "${input.nickname}" <strong>${numerology.nicknameNumber}</strong>` : ''
    }.`,
  ]
  if (!profile.hourKnown) {
    notes.push('Birth hour unknown — the hour pillar is excluded from the reading, so scores are a little coarser.')
  }
  $('#chart-notes').innerHTML = notes.map((n) => `<div>${n}</div>`).join('')
}

const isAvailable = (day) => state.allowedWeekdays.has(day.weekday)

function visibleDays() {
  const minBand = $('#band-filter').value
  const floor = minBand === 'all' ? 0 : BAND_ORDER.indexOf(minBand)
  return state.days.filter((d) => isAvailable(d) && BAND_ORDER.indexOf(d.band) >= floor)
}

function scoreBadge(day) {
  const el = document.createElement('div')
  el.className = 'score-badge'
  el.style.background = BAND_COLOR[day.band]
  el.textContent = day.score
  return el
}

function renderTopList() {
  const list = $('#top-list')
  const days = visibleDays().sort((a, b) => b.score - a.score || a.iso.localeCompare(b.iso)).slice(0, 12)
  if (!days.length) {
    list.innerHTML = '<li class="muted">No dates match that filter — widen the range, the weekdays, or the rating.</li>'
    $('#export-note').textContent = ''
    return
  }
  list.replaceChildren(
    ...days.map((day) => {
      const li = document.createElement('li')
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.append(scoreBadge(day))
      const when = document.createElement('div')
      when.className = 'when'
      when.innerHTML = `<b>${shortDate(day.date)}</b><span>${day.pillar.name} ${day.pillar.animal} day · ${
        day.officer.name
      } ${day.officer.gloss} · ${day.sky.phase.label}, Moon in ${day.sky.moonSignName}</span>`
      btn.append(when)
      const band = document.createElement('span')
      band.className = 'band'
      band.textContent = BAND_LABEL[day.band]
      btn.append(band)
      btn.addEventListener('click', () => openDay(day))
      li.append(btn)
      return li
    }),
  )
  $('#export-note').textContent = `${days.length} date${days.length === 1 ? '' : 's'} ready to export.`
}

function renderCalendar() {
  const cursor = state.monthCursor
  const first = new Date(Date.UTC(cursor.year, cursor.month - 1, 1))
  const daysInMonth = new Date(Date.UTC(cursor.year, cursor.month, 0)).getUTCDate()

  $('#month-title').textContent = first.toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
  $('#weekday-head').replaceChildren(
    ...WEEKDAYS.map((d) => {
      const el = document.createElement('div')
      el.textContent = d
      return el
    }),
  )

  const byIso = new Map(state.days.map((d) => [d.iso, d]))
  const cells = []
  for (let i = 0; i < first.getUTCDay(); i++) {
    const el = document.createElement('div')
    el.className = 'cell empty'
    cells.push(el)
  }
  for (let dayNum = 1; dayNum <= daysInMonth; dayNum++) {
    const iso = `${cursor.year}-${pad(cursor.month)}-${pad(dayNum)}`
    const day = byIso.get(iso)
    const el = document.createElement(day ? 'button' : 'div')
    el.className = 'cell'
    if (!day) {
      el.classList.add('unavailable')
      el.innerHTML = `<span class="num">${dayNum}</span>`
    } else {
      if (!isAvailable(day)) el.classList.add('unavailable')
      el.type = 'button'
      el.innerHTML = `<span class="num">${dayNum}</span><span class="val" style="background:${
        BAND_COLOR[day.band]
      }">${day.score}</span>`
      el.setAttribute('aria-label', `${longDate(day.date)}: ${day.score} out of 100, ${BAND_LABEL[day.band]}`)
      el.addEventListener('click', () => openDay(day))
    }
    cells.push(el)
  }
  $('#calendar').replaceChildren(...cells)

  $('#legend').innerHTML = BAND_ORDER.slice()
    .reverse()
    .map((b) => `<span><i style="background:${BAND_COLOR[b]}"></i>${BAND_LABEL[b]}</span>`)
    .join('')

  const from = state.days.at(0)?.date
  const to = state.days.at(-1)?.date
  const key = (d) => d.year * 12 + d.month
  $('#prev-month').disabled = !from || key(cursor) <= key(from)
  $('#next-month').disabled = !to || key(cursor) >= key(to)
}

function shiftMonth(delta) {
  const d = new Date(Date.UTC(state.monthCursor.year, state.monthCursor.month - 1 + delta, 1))
  state.monthCursor = { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
  renderCalendar()
}

// --- day detail -----------------------------------------------------------

function openDay(day) {
  $('#dialog-title').innerHTML = `${longDate(day.date)}<br><small>${day.score}/100 · ${
    BAND_LABEL[day.band]
  }${isAvailable(day) ? '' : ' · outside the days you picked'}</small>`

  const facts = [
    ['Day pillar', `${day.pillar.name} (${day.pillar.latin}) · ${day.pillar.animal}`],
    ['Day officer', `${day.officer.name} ${day.officer.latin} — ${day.officer.gloss}`],
    ['Lunar mansion', `${day.mansion.name} (${day.mansion.latin})`],
    ['Lunar date', `${day.lunar.leap ? 'leap ' : ''}month ${day.lunar.month}, day ${day.lunar.day}`],
    ['Moon', `${day.sky.phase.label}, ${Math.round(day.sky.illumination * 100)}% lit, in ${day.sky.moonSignName}`],
    ['Personal day', String(day.cycles.personalDay)],
  ]

  const body = $('#dialog-body')
  body.replaceChildren()
  const factGrid = document.createElement('div')
  factGrid.className = 'facts'
  factGrid.innerHTML = facts.map(([k, v]) => `<div class="fact"><span>${k}</span>${v}</div>`).join('')
  body.append(factGrid)

  const list = document.createElement('ul')
  list.className = 'reasons'
  list.innerHTML = day.reasons
    .map((r) => {
      const delta = Math.round(r.weight)
      return `<li><span class="delta ${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '+' : ''}${delta}</span><span><span class="layer">${r.layer}</span><br>${r.text}</span></li>`
    })
    .join('')
  body.append(list)

  $('#dialog-gcal').href = googleCalendarUrl(day)
  $('#dialog-ics').onclick = () => download(`haircut-${day.iso}.ics`, buildIcs([day]))
  $('#day-dialog').showModal()
}

// --- run ------------------------------------------------------------------

function run(event) {
  event?.preventDefault()
  const form = readForm()
  if (asDate(form.to) < asDate(form.from)) {
    $('#profile-form').to.setCustomValidity('End date must be after the start date.')
    $('#profile-form').reportValidity()
    return
  }
  $('#profile-form').to.setCustomValidity('')

  state.profile = buildProfile(form.input)
  state.options = form.options
  state.allowedWeekdays = new Set(form.weekdays.length ? form.weekdays : [0, 1, 2, 3, 4, 5, 6])
  state.days = scoreRange(state.profile, form.from, form.to, form.options)
  state.monthCursor = { year: form.from.year, month: form.from.month }

  localStorage.setItem(STORAGE_KEY, JSON.stringify({ raw: form.raw, weekdays: form.weekdays }))

  renderChart(state.profile)
  renderTopList()
  renderCalendar()
  $('#setup').hidden = true
  $('#results').hidden = false
  $('#edit-profile').hidden = false
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function init() {
  fillSelects()
  const hadSaved = restoreForm()

  $('#profile-form').addEventListener('submit', run)
  $('#band-filter').addEventListener('change', () => {
    renderTopList()
    renderCalendar()
  })
  $('#prev-month').addEventListener('click', () => shiftMonth(-1))
  $('#next-month').addEventListener('click', () => shiftMonth(1))
  $('#dialog-close').addEventListener('click', () => $('#day-dialog').close())
  $('#day-dialog').addEventListener('click', (e) => {
    if (e.target === $('#day-dialog')) $('#day-dialog').close()
  })
  $('#edit-profile').addEventListener('click', () => {
    $('#setup').hidden = false
    $('#results').hidden = true
    $('#edit-profile').hidden = true
  })
  $('#export-ics').addEventListener('click', () => {
    const days = visibleDays().sort((a, b) => a.iso.localeCompare(b.iso))
    if (!days.length) return
    download('lucky-haircut-days.ics', buildIcs(days, { name: 'Lucky Haircut Days' }))
  })

  // A returning visitor with complete details goes straight to their calendar.
  if (hadSaved && $('#profile-form').checkValidity()) run()
}

init()
