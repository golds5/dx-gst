# Lucky Haircut Calendar

Pick your haircut dates from your own birth data. You enter your name,
nickname, date of birth, birth hour and timezone; the app builds your BaZi
chart, reads the Chinese almanac for each day, runs your numerology cycle and
checks the Moon, then rates every day in the range you asked for and shows the
best ones on a calendar you can export.

Everything runs in the browser. Nothing is uploaded, and there is no account.

## Running it

```bash
npm install
npm run haircut          # http://localhost:5273
npm test                 # engine tests (astronomy, pillars, almanac, scoring)
npm run haircut:build    # static bundle in dist-lucky-haircut/
```

The built output is a plain static site — any static host will serve it.

## What you put in, and why each field matters

| Field | Used for |
| --- | --- |
| Full name | Destiny / Soul Urge / Personality numbers |
| Nickname | The "nickname number" — the name people actually call you by |
| Date of birth | Year, month and day pillars; Life Path number |
| Birth hour | The hour pillar. Tick "I don't know" and it is left out |
| Birth timezone | Fixes the hour pillar and the solar-term boundaries |
| Goal | Whether a waxing or waning moon counts in your favour |
| Date range + weekdays | Which days are actually bookable for you |

## How a day is scored

Each day starts at 50 and collects weighted reasons from four layers. The
total is squashed through a `tanh` curve, so a genuinely strong day scores
high without every mildly good day pinning at 100. Over a year, roughly one
day in seven comes out "excellent".

**BaZi (Four Pillars).** The chart's element balance decides whether your day
master is strong or weak, and therefore which elements help you. A day whose
stem or branch carries a favourable element scores up; an unfavourable one
scores down. The day branch is then compared with your day pillar and your
zodiac animal for the classic relationships — clash (大凶 for personal
matters), six harmony, three harmony, punishment and harm.

**Chinese almanac (Tong Shu).** The Twelve Day Officers are the traditional
day-quality cycle: 除 Remove, 开 Open and 成 Success are the good ones for
cutting away; 破 Destruction and 闭 Close are the ones to avoid. On top of
that the Twenty-Eight Lunar Mansions, and the folk taboos — most importantly
"no haircut in the first lunar month".

**Numerology.** Pythagorean. Your personal year → personal month → personal
day cycle is computed for each date; 1, 5, 6 and 3 days favour a change of
appearance, 4 and 7 resist it. A personal day matching one of your core
numbers is amplified.

**Moon.** The phase and the Moon's zodiac sign. Waxing moon = fast regrowth,
waning = the shape lasts longer, so which one helps depends on your goal.
Leo and Virgo are the traditional hair signs; Cancer and Pisces grow fast but
frizz.

Open any date to see the exact list of contributions with their point values,
so nothing about the score is a black box.

## Exporting

- **Download .ics** exports every date currently passing your filters as
  all-day events, with the full reasoning in the event description. Import it
  into Google Calendar, Apple Calendar or Outlook.
- **Add to Google Calendar** on a single date opens a prefilled event.

## Accuracy notes

The astronomy is computed locally with Meeus' algorithms rather than fetched
from an almanac site, so it works offline and cannot break when a website
changes. Solar longitude is accurate to ~0.01°, lunar longitude to about an
arcminute — comfortably enough to place solar terms, new moons and the lunar
date on the correct calendar day.

Two things are deliberately simplified, and both are flagged in the code:

- **Day-master strength** uses a weighted element count rather than a full
  用神 (yòng shén) analysis. It is the standard "balance the scales" reading.
- **The 28-mansion cycle** is anchored at 2000-01-01 = 氐 (`ANCHOR_INDEX` in
  `src/almanac.js`). That anchor satisfies the weekday constraint the cycle
  must obey; if your preferred almanac edition is offset from it, change that
  one constant. Mansions carry a low weight either way.

The birth timezone is entered as a UTC offset, so for a birth under a historic
timezone or wartime daylight saving you should enter the offset that was in
force at the time, not today's.

## Layout

```
lucky-haircut/
  index.html          markup
  styles.css          styling
  src/astro.js        Julian days, sun/moon longitude, solar terms, new moons
  src/bazi.js         pillars, elements, branch relationships
  src/almanac.js      day officers, lunar mansions, lunar date and taboos
  src/numerology.js   Pythagorean numbers and personal cycles
  src/astrology.js    moon phase and moon sign lore
  src/score.js        combines everything into a rated day
  src/ics.js          .ics export and Google Calendar links
  src/app.js          UI
  src/engine.test.js  tests
```

This is folklore, presented as carefully as folklore can be. Enjoy it as such.
