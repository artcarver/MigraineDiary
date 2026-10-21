# Migraine Diary

A private migraine diary for the iPhone home screen. It is free, works with no
signal, needs no account, and keeps every entry on the phone.

Live at https://artcarver.github.io/MigraineDiary/

## Putting it on the home screen

1. Open the link above in Safari.
2. Tap the three dots next to the address bar, then Share. On older iPhones,
   tap the Share button at the bottom of the screen.
3. Scroll down and tap Add to Home Screen.
4. Leave Open as Web App turned on, then tap Add.

Always open it from the icon. Safari keeps its own separate copy of the data,
so entries made in Safari do not show up in the home screen app.

## What it records

- **Every day:** how the day went, on a traffic-light scale (no migraine,
  could function, slowed down, had to stop or in bed). Blank days show up for
  catch-up, because migraine days per month is the number doctors use most.
- **Each migraine:** when it started (or that you woke up with it), pain from 0
  to 10, where it hurts on a front-of-face drawing, what it feels like,
  symptoms, aura, and warning signs beforehand.
- **Each day it continues:** worst pain, symptoms, missed work, school or
  plans, and medicines.
- **Each dose:** the medicine, the time, and your pain when you took it. Two
  hours later the app asks whether it helped (gone, better, same or worse).
- **When it ends:** the end time and whether there was a migraine hangover.
- **Optional:** sleep, meals and caffeine; daily supplements or a preventive
  medicine.

## What it shows

- A 72-hour note when a migraine passes 3 days.
- No warnings or limits about how much medicine is taken anywhere in the app.
  Rebound headache comes up only in the exported summary, below.
- A one-page doctor summary for 30 days, 90 days or one month:
  - migraine days and medicine days, with a month-by-month table
  - how each medicine worked, both when taken early and when taken later
  - how often a migraine came back after a medicine had made it go
  - side and location of the pain, and symptoms
  - patterns with sleep, meals and caffeine
  - a before-and-after comparison for a preventive
  - the MIDAS questionnaire score
  - medicine days in the last 30 days, and whether they are at a level where
    rebound headache is possible

  **Save or print as PDF** builds the PDF on the phone and opens the share
  sheet, where it can be printed, saved to Files, or mailed. **Share as
  text** sends the same summary as plain text.

## Backups

Settings has **Save backup file**, which saves to iCloud Drive or Files, and
**Load a backup file** for restoring it. If the phone won't share the backup
as a .json file, it saves it as a .txt file instead, and loading accepts
either. It also exports three CSV files for
Numbers or Excel. If no backup has been saved for 30 days, the app reminds you.

## Daily reminder

A web app on the home screen cannot send notifications without a paid server,
and a Shortcuts automation opens the link in Safari rather than in the app. A
repeating reminder in the Reminders app is the reliable option. Set it to
Daily at a time such as 8 PM.

## Where the features come from

- Medication overuse limits (10 days a month for triptans and combination
  medicines, 15 for simple pain relievers, 10 for any mix), menstrual migraine
  window, and the migraine features worth recording:
  [ICHD-3](https://ichd-3.org/)
- 4 or more migraine days a month as the point to offer prevention:
  [AAN and AHS guideline, 2026](https://www.aan.com/PressRoom/Home/PressRelease/5361)
- The traffic-light day rating:
  [Migraine Canada](https://migrainecanada.org/the-migraine-traffic-light-system/)
  and the Mayo Clinic stoplight diary
- Warning signs predicting attacks:
  [Giffin et al., 2003](https://pubmed.ncbi.nlm.nih.gov/12654956/)
- Sleep, exercise, eating, diary and stress as the lifestyle factors to track:
  [SEEDS for success, 2019](https://www.ccjm.org/content/86/11/741)
- [MIDAS questionnaire](https://en.wikipedia.org/wiki/Migraine_Disability_Assessment_Test),
  copyright Innovative Medical Research, 1997

This is a diary, not medical advice.

## Working on it

There is no build step and there are no dependencies. Serve the folder with
any static server and open it in a browser.

- `index.html`, `css/app.css`: the page and its styles (dark only).
- `js/app.js`: screens and taps.
- `js/stats.js`: everything the app counts, as pure functions.
- `js/store.js`: saving to `localStorage`, plus the backup format.
- `js/csv.js`: the spreadsheet export.
- `js/report.js`: the doctor summary as text, shared by the PDF and by Share
  as text.
- `js/pdf.js`: a small PDF writer for that summary.
- `js/defaults.js`: starting medicine and symptom lists, and the overuse limits.
- `sw.js`: offline cache. **Change `CACHE` whenever any file changes**, or
  phones keep running the old version.
- `tools/make_icons.py`: redraws the icons (needs Pillow).

Run the tests with `npm test` (Node 20 or later).
