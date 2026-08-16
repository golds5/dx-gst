// Calendar export: an .ics file you can import anywhere, plus a one-click
// Google Calendar link per date.

const pad = (n) => String(n).padStart(2, '0')
const stamp = (y, m, d) => `${y}${pad(m)}${pad(d)}`

const escapeText = (s) =>
  String(s).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;')

// RFC 5545 wants lines folded at 75 octets.
function fold(line) {
  const out = []
  let rest = line
  while (rest.length > 73) {
    out.push(rest.slice(0, 73))
    rest = ' ' + rest.slice(73)
  }
  out.push(rest)
  return out.join('\r\n')
}

function summaryFor(day) {
  return `Haircut — ${day.score}/100 (${day.pillar.name} ${day.officer.name})`
}

export function descriptionFor(day) {
  const lines = [
    `Score ${day.score}/100`,
    `Day pillar ${day.pillar.name} (${day.pillar.latin}) · ${day.officer.name} ${day.officer.gloss} day · Mansion ${day.mansion.name}`,
    `Lunar ${day.lunar.month}/${day.lunar.day} · ${day.sky.phase.label}, Moon in ${day.sky.moonSignName} · Personal day ${day.cycles.personalDay}`,
    '',
    ...day.reasons.map((r) => `• ${r.text}`),
  ]
  return lines.join('\n')
}

/** Build an all-day VEVENT calendar for the chosen days. */
export function buildIcs(days, { name = 'Lucky Haircut Days', dtstamp } = {}) {
  const now = dtstamp ?? new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//lucky-haircut//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(name)}`,
  ]
  for (const day of days) {
    const next = new Date(Date.UTC(day.date.year, day.date.month - 1, day.date.day + 1))
    lines.push(
      'BEGIN:VEVENT',
      `UID:${day.iso}-haircut@lucky-haircut`,
      `DTSTAMP:${now}`,
      `DTSTART;VALUE=DATE:${stamp(day.date.year, day.date.month, day.date.day)}`,
      `DTEND;VALUE=DATE:${stamp(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())}`,
      fold(`SUMMARY:${escapeText(summaryFor(day))}`),
      fold(`DESCRIPTION:${escapeText(descriptionFor(day))}`),
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    )
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}

/** Google Calendar "add event" URL for one day. */
export function googleCalendarUrl(day) {
  const next = new Date(Date.UTC(day.date.year, day.date.month - 1, day.date.day + 1))
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: summaryFor(day),
    dates: `${stamp(day.date.year, day.date.month, day.date.day)}/${stamp(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate())}`,
    details: descriptionFor(day),
  })
  return `https://calendar.google.com/calendar/render?${params}`
}
