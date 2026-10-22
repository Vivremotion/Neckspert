---
name: Neckspert Play
description: A fretboard-memory trainer played on a real guitar, on the beat. « Près du silence ».
colors:
  ground-mist: '#ece8e2'
  ink: '#23211f'
  slate: '#7a7f80'
  umber: '#8c6e52'
  slate-text: '#606566'
  umber-text: '#775a41'
  amber-now: '#d9a13b'
  on-field: '#ece8e2'
  rule: 'rgba(35, 33, 31, 0.12)'
  field-light: '#8d908e'
  field-mid: '#656968'
  field-deep: '#4a4440'
  cell: 'rgba(236, 232, 226, 0.14)'
  cell-downbeat: 'rgba(236, 232, 226, 0.26)'
  cell-band: 'rgba(236, 232, 226, 0.5)'
typography:
  hero:
    fontFamily: 'Atkinson Hyperlegible Next, system-ui, sans-serif'
    fontSize: 'clamp(72px, min(40vw, 33dvh), 300px)'
    fontWeight: 300
    lineHeight: 1
  correction:
    fontFamily: 'Atkinson Hyperlegible Next, system-ui, sans-serif'
    fontSize: 'clamp(40px, min(8.4vw, 14dvh), 120px)'
    fontWeight: 300
    lineHeight: 1.05
  prompt:
    fontFamily: 'Atkinson Hyperlegible Next, system-ui, sans-serif'
    fontSize: 'clamp(28px, 2vw + 20px, 48px)'
    fontWeight: 400
    lineHeight: 1.1
  cell:
    fontFamily: 'Atkinson Hyperlegible Next, system-ui, sans-serif'
    fontSize: 'clamp(16px, 3.9vw, 56px)'
    fontWeight: 500
    lineHeight: 1
  page-title:
    fontFamily: 'Atkinson Hyperlegible Next, system-ui, sans-serif'
    fontSize: 'clamp(28px, 2vw + 20px, 48px)'
    fontWeight: 300
  block-title:
    fontFamily: 'Atkinson Hyperlegible Next, system-ui, sans-serif'
    fontSize: 'clamp(24px, 1.5vw + 14px, 32px)'
    fontWeight: 700
  figure:
    fontFamily: 'Atkinson Hyperlegible Next, system-ui, sans-serif'
    fontSize: 'clamp(24px, 1.5vw + 14px, 32px)'
    fontWeight: 300
    fontFeature: 'tnum'
  title:
    fontFamily: 'Atkinson Hyperlegible Next, system-ui, sans-serif'
    fontSize: 'clamp(24px, 1.5vw + 14px, 32px)'
    fontWeight: 400
    lineHeight: 1
  body:
    fontFamily: 'Atkinson Hyperlegible Next, system-ui, sans-serif'
    fontSize: 'clamp(18px, 1vw + 12px, 20px)'
    fontWeight: 400
    lineHeight: 1.5
  meta:
    fontFamily: 'Atkinson Hyperlegible Next, system-ui, sans-serif'
    fontSize: 'clamp(16px, 0.9vw + 11px, 18px)'
    fontWeight: 400
    fontFeature: 'tnum'
rounded:
  action: '2px'
spacing:
  step-1: '8px'
  step-2: '16px'
  step-3: '24px'
  step-4: '32px'
  step-5: '40px'
  step-6: '48px'
  step-7: '64px'
  step-8: '96px'
  cell-gap: '6px'
components:
  button-primary:
    backgroundColor: '{colors.amber-now}'
    textColor: '{colors.ink}'
    typography: '{typography.title}'
    rounded: '{rounded.action}'
    padding: '16px 32px'
  button-quiet:
    textColor: 'currentColor'
    typography: '{typography.body}'
    padding: '8px 0'
  button-choice:
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    padding: '8px 24px'
  button-choice-pressed:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.ground-mist}'
  nav-rail:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.ground-mist}'
    typography: '{typography.meta}'
    width: '168px'
  page:
    backgroundColor: '{colors.ground-mist}'
    textColor: '{colors.ink}'
    width: '44rem'
    padding: '64px 64px 96px'
  page-heading:
    typography: '{typography.page-title}'
    textColor: '{colors.ink}'
  block-row:
    textColor: '{colors.ink}'
    typography: '{typography.block-title}'
    padding: '24px 0 16px'
  block-why:
    textColor: '{colors.umber-text}'
    typography: '{typography.meta}'
  select:
    backgroundColor: '{colors.ground-mist}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '0'
    height: '48px'
    padding: '8px 16px'
  neck-cell-mastered:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.ground-mist}'
    size: '96px'
  neck-cell:
    textColor: '{colors.ink}'
    typography: '{typography.meta}'
    size: '96px'
    padding: '8px'
  lane-cell:
    backgroundColor: '{colors.cell}'
    textColor: '{colors.ink}'
    typography: '{typography.cell}'
  lane-cell-downbeat:
    backgroundColor: '{colors.cell-downbeat}'
  lane-cell-target:
    backgroundColor: '{colors.on-field}'
    textColor: '{colors.ink}'
  lane-cell-hit:
    backgroundColor: '{colors.on-field}'
    textColor: '{colors.ink}'
  lane-cell-band:
    backgroundColor: '{colors.cell-band}'
    textColor: '{colors.ink}'
  lane-cell-partial:
    textColor: '{colors.on-field}'
  lane-cell-miss:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.on-field}'
  answer-key-white:
    backgroundColor: '{colors.on-field}'
    textColor: '{colors.ink}'
    typography: '{typography.meta}'
  answer-key-black:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.on-field}'
    typography: '{typography.meta}'
  answer-key-picked:
    backgroundColor: '{colors.amber-now}'
    textColor: '{colors.ink}'
  learning-aid:
    backgroundColor: '{colors.on-field}'
    textColor: '{colors.ink}'
    typography: '{typography.title}'
    padding: '8px 16px'
---

# Design System: Neckspert Play

## Overview

**Creative North Star: "Près du silence"**

An ECM sleeve: mist, ink, a hazy field of slate going to umber, one light grotesque set large, wide margins, thin rules. The screen goes quiet as the aids fade, but it always says what comes next and when. The player reads it from 60 cm to 1 m, hands on the guitar, so everything that must be read in play is large, and everything else is absent.

The play screen is the first surface built in this world. It holds a hazy field, one enormous prompt in the centre, a lane of plain cells at the bottom running into a fixed amber line, and a discreet info line at the top. A success puts its verdict and offset in the prompt's place (« Parfait · −8 ms »); a miss puts the correction there. Light pages (start, pause, end) are mist with ink and one amber button.

Off play, the app is a sleeve's back cover: a dark ink spine on the left with the destinations and the word « neckspert » running up it, and a single mist column of text beside it. Each page is named by a light title over a thin ink rule; content is rows parted by faint rules, never cards. Practice (« Pratiquer »), the summary, the settings, the calibration and the neck map live there.

Confirmed rejections (direction contract): the dark neon guitar app with cards and progress rings, the gamified dashboard, and the Game Boy cartridge this world replaces.

**Key Characteristics:**

- Five named roles plus a hazy field; amber reserved for « now » and the main action.
- One face, Atkinson Hyperlegible Next, light (300) at the largest sizes; nothing under 16px.
- States told by form before tint: a verdict is a shape, its cell's tone only confirms it; a neck cell's state is its border weight.
- One scale from one session to the next; the bar grid is the armature of the lane.
- Flat: no shadows, no cards; depth only from the field's gradient and a veil in play, from rules and the ink spine off play.

## Colors

A muted, cool-to-warm sleeve palette: mist and ink for reading, slate and umber for the field and for secondary text, and a single warm amber that means « now ».

### Primary

- **Amber Now** (`amber-now`): « now » and the one thing to do. In play: the now line of the lane, the primary button, the picked key of the answer keyboard and the keyboard's focus ring. Off play: the 4px filet of the active destination in the rail (the underline in the phone bar), the 4px inset filet of the current block in a block list, and the ground of the screen's one main action (« Commencer », « Pratiquer » on the summary, the current step of the calibration). Nothing else.

### Neutral

- **Ground Mist** (`ground-mist`): the light pages over the field, the whole off-play shell (`html` and `body` take it whenever the shell is shown), the label of the rail, the text of a pressed choice and of a mastered neck cell.
- **Ink** (`ink`): text on light grounds, the primary button's label, a missed cell, the black keys, chord-shape grounds on the field; off play the rail's spine, the 1px rule under a page title, the 1px outline of a choice and a select, the borders of learning and acquired neck cells, the fill of a pressed choice and of a mastered cell, the 4px left filet of an alert line, the calibration meter's fill.
- **On Field** (`on-field`, same value as Ground Mist, separate role): every text and line on the field: prompt, info line, captions, drawn string, target and hit cells, white keys, the learning-aid tile.
- **The Field** (`field-light` → `field-mid` → `field-deep`): a radial gradient (110% × 80% at 45% 20%), light slate at the top left fading to umber-tinted dark at the bottom. It is the play ground, declared as one token (`--np-field`). The play screen adds a veil of Ink at 40% over its top 160px so the info line reads on the lightest stop.
- **Cell** (`cell`) and **Cell Downbeat** (`cell-downbeat`): mist at 14% and 26% over the field, for an empty beat and the first beat of a bar. Past cells drop to 45% opacity.
- **Cell Band** (`cell-band`): mist at 50% over the field, the fill of a held chord's band, under ink names (above 4.5:1).
- **Umber Text** (`umber-text`): umber darkened for text at body and meta sizes (at least 4.5:1 on the ground): the « why » of a block (« 6 révisions dues »), the trend beside the cold offset, the detail lines of the summary's exercise and miss rows and of the judge's report.
- **Slate Text** (`slate-text`): slate darkened the same way: labels and hints (« Écart au temps », the settings' hints and storage usage).
- **Slate** (`slate`) and **Umber** (`umber`): the base tones, kept for rules and large text only (below 4.5:1 at body size on the ground); no migrated component reads them directly yet.
- **Rule** (`rule`): ink at 12%: the rules between blocks, summary rows and settings headings, the border of an unseen neck cell, the calibration meter's track, the accent of a chord shape on the ground.

### Named Rules

**The One Amber Rule.** Amber means « now »: the now line, the active destination, the current block, and the single main action of a screen. Only one amber ground per screen (per phase in the calibration); the other ambers are filets that point at it. A screen with nothing to start, like the settings, carries no amber ground at all.

**The Text Variant Rule.** Secondary text at body or meta size uses `umber-text` or `slate-text`, never the base `umber` or `slate`, which are for rules and large text.

**The Form Before Tint Rule.** A state is first a shape (verdict marks, outlined vs filled cells, a neck cell's border weight); colour only confirms it. Never encode a verdict by hue alone, and never add hues for verdicts (no green/red).

## Typography

**Display Font:** Atkinson Hyperlegible Next (300, 400, 500, 700, self-hosted woff2), with `system-ui, sans-serif`
**Body Font:** the same face.

**Character:** A precise, open grotesque drawn for legibility; set light and very large for the one thing to read from afar, regular for everything else. In play, weight 500 only for emphasis (the cell's name, the first part of the info line). Off play, 700 names things (a block's title, a settings heading, an alert line) and 300 sets titles and figures.

### Hierarchy

- **Hero** (300, up to 300px at 1440×900, bounded by width and height, line-height 1): the note of the prompt, alone, on one line: never broken, it scales down to the centre's width (about 0.6em per glyph), so « F#dim » fits a phone. The only big letter on screen.
- **Correction** (300, up to 120px, line-height 1.05, wraps): the right answer after a miss, in the prompt's place (« corde de B, case 6 »), and the verdict's name after a hit (« Parfait »), its offset beside it at prompt size. Off play, the grade of the summary at the same size.
- **Prompt** (400, 28–48px, line-height 1.1): the string under the note (« corde de B »), the recalled prompt above a correction, the offset beside a hit's verdict, the countdown, and the main line in mode 2; off play, the calibration's instruction.
- **Page Title** (300, the prompt's size): the h1 of every off-play page (« Pratiquer », « Bilan », « Réglages », « Carte du manche »).
- **Cell** (500, 16–56px, line-height 1): a name inside a lane cell.
- **Block Title** (700, title size): the name of a block (« Apprentissage », « Rythme »), its subtitle after « · » at 400.
- **Figure** (300, title size, tabular figures): a number read at a glance off play: a block's duration (« 5′ »), the cold offset (« 40 ms »), the value of a summary row, the gain stepper, the calibration's progress, a page title's aside.
- **Title** (400, 24–32px): the primary button and the learning-aid tile.
- **Body** (400, 18–20px, line-height 1.5, max 36rem): the how-to on light pages, the mode-2 answer caption; off play the settings, the calibration and the summary rows; settings headings at body size 700 over a rule; a neck cell's pitch at 500.
- **Meta** (400, 16–18px, tabular figures): the info line, « pause » and « quitter » (lowercase, letter-spacing 0.06em), the verdict caption over a cell, keyboard key names; off play the rail's links (lowercase, 0.06em), a block's why, labels, a neck cell's recall times.

### Named Rules

**The One Big Letter Rule.** Only the prompted note is set at hero size; the string beneath stays at prompt size, and in mode 2 the whole prompt drops to prompt size. Off play nothing goes above correction size, and only the summary's grade reaches it.

**The 16px Floor Rule.** No text under 16px at any width; every role is a clamp whose floor is at least 16px (`scripts/functional-ui.mjs` enforces it).

## Layout

The play screen is a three-row grid filling `100dvh`: the info line on top, the centre (prompt or correction, vertically centred), and the bottom stage (lane in mode 1, keyboard in mode 2). Padding is 32px on top, 48px at the bottom, and `clamp(16px, 3vw, 40px)` on the sides; rows are 32px apart.

Spacing follows an 8px base (`step-1` to `step-8`: 8, 16, 24, 32, 40, 48, 64, 96). Lane cells are 6px apart.

**The lane** shows three bars of beats: one bar before the now line, two after (past one third, future two thirds). Each cell is `1/(3 × beats per bar)` of the lane's width; the lane is `clamp(96px, 8.4vw, 120px)` tall. The now line is fixed; cells move past it, following the audio beat index.

**Phones** keep the same composition, scaled by the clamps: the hero letter and the cells shrink, the lane keeps all its cells (16px names), and the verdict mark keeps its fixed size.

**The Lane Is The Clock Rule.** What to play and when is shown by the lane alone: one cell per beat, plain, the name in its cell. No legend, no « maintenant », no « dans 2 temps », no bar numbers during play; an empty bar is the breath.

**The shell (off play).** A two-column grid: the rail (168px, `--rail-width`) and the page. The document scrolls; the rail is sticky to the viewport, full height. The app is an inline-size container (`app`); under 720px of container width the grid becomes one column and the rail a top bar. The shell is shown everywhere except where play is full screen (sessions, the mode-2 demo, the dev play views, the diagnostics), a rule kept in one place, the shell's navigation module.

**The page.** One column of 44rem at most, 64px of padding on top and sides and 96px at the bottom (24px on the sides and 64px at the bottom on phones). Its header holds the title on the left and an optional aside on the right, on one baseline, over a 1px ink rule 24px below. Sections follow 48px apart; rows inside are parted by 1px rules. A wide page (the neck map) drops the column limit.

**The One Page Column Rule.** An off-play page is a single column of rows under its title: no side panels, no grid of tiles, no dashboard.

## Elevation & Depth

Flat. No shadows anywhere. In play, depth comes only from the field's radial gradient, the 40% ink veil under the info line, and translucent mist cells over the field; light pages sit over the field as a full mist overlay, not a raised card. Off play, the only depth is the ink spine against the mist and the rules between rows. The current block's amber filet is drawn as an inset 4px edge: a line, not an elevation.

**The No Card Rule.** Nothing floats: no shadows, no cards, no bordered containers around the prompt, the lane, a block or a page section. Borders belong to controls (choices, selects) and to data cells (lane cells, neck cells).

## Shapes

Square by default. The primary button has a barely softened corner (2px); cells, keys, choices, selects, neck cells and the learning-aid tile are square. Lines are thin: 1px for the drawn strings, key borders, rules, choice and select outlines and a page title's rule; 2px for a cell's outline (offbeat, the outline of a held chord band) and an acquired neck cell; 4px for the prompted string, the now line (which overhangs the cells by 16px above and below as the strongest mark on screen), and the filets: the active destination, the current block, an alert line.

## Components

### Buttons

Quiet by default, one amber action per screen.

- **Shape:** square with a 2px corner on the primary.
- **Primary:** amber ground, ink label at title size, 16px × 32px padding. Used for « Commencer », « Reprendre », « Recommencer », « Pratiquer » at the end of the summary, and the calibration step at hand (« Écouter le niveau », « Calibrer », « Réessayer »).
- **Quiet:** no ground, inherits colour, body size (meta in the info line), 8px vertical padding; underline (4px offset) on hover and focus. Used for « pause », « Joué juste », backup and export actions, secondary links back.
- **Choice:** a 1px ink outline, transparent, body size, 8px × 24px padding; filled ink with a mist label only when pressed (`aria-pressed`). A pressed choice that is also disabled keeps full strength. Used for the settings' groups (language, chord diagram, budgets, on/off toggles, the gain stepper's − and +) and the import confirmation; never amber.
- **Focus:** 2px outline in current colour, 4px offset.
- **Disabled:** 60% opacity.

### Navigation: the rail

- **Spine:** ink, full height, 168px wide, sticky; 40px of padding on top, 24px on the left.
- **Links:** mist, meta size, lowercase, letter-spacing 0.06em, 24px apart, at 62% opacity; full opacity on hover, focus and on the active destination (`aria-current="page"`), which also gets a 4px amber filet at the spine's left edge. Destinations: « Pratiquer » (home, the summary), « Bibliothèque » (free play), « Progrès » (the neck map), « Réglages » (settings, calibration).
- **Brand:** « neckspert » read bottom to top along the spine, title size 300, letter-spacing 0.4em; decorative (hidden from assistive tech, no pointer events), and dropped under 600px of viewport height.
- **Phone bar** (container under 720px): the spine becomes a full-width ink bar with 16px padding: the brand on one line at meta size, then the links wrapping in a row, the active one underlined by a 4px amber line.

### Page

The frame of every off-play screen: a section named by its h1 (page title over a 1px ink rule), an optional aside on the title's baseline at figure size, the content below. A `wide` page drops the 44rem limit.

### Block list (signature component, off play)

The list of things to practise. Each block is a row parted by a 1px rule, 24px above and 16px below: the title in block-title (700), the subtitle after « · » at 400 (on its own line on phones, the « · » dropped), the duration on the right at figure size (« 5′ », with a spoken form for assistive tech), and the why on its own line in umber text at meta size. The whole row is the click target (the title's link or button covers it); hover and focus underline the title. The current block is marked by an inset 4px amber filet on its left and 16px of indent.

### Home (« Pratiquer »)

A page with the block list of sessions (learning first and current, then triads, gesture and rhythm exercises as they open), and below it one line: the cold offset (« Écart au temps » in slate text, the value at figure size, the trend in umber text) facing the amber « Commencer ».

### Summary (« Bilan »)

The grade at correction size, then rows: a label on the left, its value on the right at figure size (« ♩ = 92 », accuracy, median). Exercise and miss rows stack a bold name over meta lines in umber text. A line that warns (fatigue) carries a 4px ink left filet and bold text. The page ends with the amber « Pratiquer » and a quiet link to the neck map.

### Settings and calibration

Settings group by sections, each a heading at body size 700 over a rule; sub-labels at 700; hints and usage in slate text; choices for every option; no amber. Errors and notices (here and in the calibration) are alert lines: bold, a 4px ink left filet. The native select is restyled: full width, 48px high, mist ground, 1px ink border, square, body size. The calibration stacks the input, a level meter (an 8px rule-tinted track with an ink fill that scales from the left, eased over 120ms, without easing under reduced motion), its two actions (only the current step is primary: « Écouter le niveau » idle, « Calibrer » once listening, « Réessayer » when done; nothing amber while it runs), the instruction at prompt size, and the result under a 1px ink rule.

### Neck map (« Carte du manche »)

A wide page holding a grid of the neck, string by string, in a focusable frame that scrolls sideways (2px focus outline). Cells are 96px squares 2px apart, the pitch at body 500 on top, the recall times at meta below. State by form: unseen, a rule border and the pitch alone; learning, 1px ink border; acquired, 2px ink border; mastered, filled ink with mist text.

### Info line

The discreet top line: parts joined by « · » (« Apprentissage · ♩ = 80 »), meta size, tabular figures, the first part at 500, the parts at 90% opacity on the field. At its end, « pause » (only while playing) and « quitter » (a link styled like the quiet button). On light pages it turns ink and stays above the overlay.

### Prompt

The centre of the screen, in on-field mist, centred. Three sizes: `hero` (the note, string beneath at prompt size), `prompt` (mode 2 and the string preview before the note), `correction` (the right answer in the prompt's place, with the note recalled above at prompt size and 80% opacity). Below it may come the drawn string, a chord shape, a detail line (meta, 85%) or the learning-aid tile, all on the prompt's centre axis. After a hit the verdict's name takes the prompt's place at correction size, its signed offset beside it at prompt size (« En retard · +42 ms »).

### Lane and cells (signature component)

- **Empty cell:** `cell` ground; the first beat of a bar takes `cell-downbeat`.
- **Target:** mist ground, ink name at cell size: the note to play, on beat 1 of its bar.
- **Band:** the window where a held chord may be played (triad anchor), drawn as one joined band: its cells span the gaps between them (their footprint on the lane is unchanged) and share one `cell-band` fill (mist at 50%, clearly lighter than any beat, darker than the target) inside a 2px mist outline, open only at the joints, closed at its first and last beats (a one-beat band is closed on both sides); the chord's name once, in ink, from its left edge; the gap before it keeps it apart from the target.
- **Past:** 45% opacity, except the cell just played, read at full strength.
- **Played cell:** keeps its name when it has one, the verdict mark below it at the cell's bottom; a single caption line over the lane, above that cell, in meta (« en retard · +42 ms », « F# joué · +30 ms »: the signed offset whenever there is one), clear of the now line's overhang and kept inside the lane's left edge.
- **Imprint:** the just-played cell scales from 1.12 to 1 in 120ms; removed under `prefers-reduced-motion`.

### Verdict marks (by shape)

SVG in current colour, fixed 32px in the lane (never scaled with the cell), with the verdict's name as accessible label.

| Verdict   | Shape                              | Cell tone                                   |
| --------- | ---------------------------------- | ------------------------------------------- |
| perfect   | filled dot                         | hit: mist cell, ink mark                    |
| early     | filled triangle pointing left (◀)  | hit                                         |
| late      | filled triangle pointing right (▶) | hit                                         |
| offbeat   | outlined triangle pointing right   | partial: transparent cell, 2px mist outline |
| corrected | cross with a small filled dot      | miss: ink cell, mist mark                   |
| wrong     | cross (✕)                          | miss                                        |

A success also says its verdict and offset in the centre, in words, so it reads without colour.

### Drawn string (learning aid)

Six strings, high E on top, 240px wide at most, in on-field mist: thin 1px lines at 45%, the prompted string 4px at full strength; no letter (the prompt names the string above), so the drawing sits on the prompt's centre axis with the aid tile. A removable aid shown under the prompt; never a neck to answer on.

### Answer keyboard (mode 2)

One octave of a piano keyboard across the width of the bottom stage, `clamp(160px, min(38cqi, 30dvh), 300px)` tall. White keys in mist with ink names, black keys in ink with mist names (« C# / Db » on two lines), 60% of the height; 1px ink borders; names at the bottom in meta size. The pressed key turns amber until the next prompt; focus is a 3px amber outline. The stage rises in (240ms, 16px) when it replaces the lane.

### Light pages (start, pause, end)

A full mist overlay over the field: the how-to in body size (max 36rem, centred) and one primary button. Pause shows the button alone.

### Chord shapes and terms in the light world

`ChordShape` and `Term` are shared with the old world and themed from outside: a migrated screen sets `--shape-ink`, `--shape-ground`, `--shape-accent` (ink, mist, rule in the settings) and `--term-ground`, `--term-text`, `--term-rule`, `--term-gap`, `--term-pad` (mist, ink, rule, 8px, 16px in the summary).

## Do's and Don'ts

### Do:

- **Do** use the `--np-*` tokens of the « Près du silence » block in `src/lib/ui/tokens.css`, never raw values.
- **Do** keep amber for « now »: the now line, the active destination, the current block, and the one main action of a screen.
- **Do** set secondary text at body or meta size in `--np-earth-text` or `--np-muted-text`; keep `--np-earth` and `--np-muted` for rules and large text.
- **Do** put every off-play screen in `Page`, inside the shell, and its choices in `Button` with the `choice` variant.
- **Do** tell a state by its shape first (verdict marks, filled vs outlined cells, a neck cell's border weight).
- **Do** keep every text at 16px or more, and set the largest text light (300).
- **Do** drop the imprint, the scene rise and the meter's easing under `prefers-reduced-motion`.
- **Do** write a tempo as « ♩ = 92 », a latency as « Latence : 12 ms », a duration as « 5′ » with its spoken form, and name destinations « Pratiquer », « Bibliothèque », « Progrès », « Réglages ».

### Don't:

- **Don't** add hues for verdicts, or a second accent beside amber.
- **Don't** put two amber grounds on one screen, or amber on a screen with nothing to start.
- **Don't** add legends, « maintenant », countdown words or bar numbers to the lane during play.
- **Don't** add shadows, cards or bordered containers around the prompt, the lane, a block or a section.
- **Don't** set anything but the prompted note at hero size.
- **Don't** show the rail during play.
- **Don't** mix this world with the Game Boy tokens on one screen.

## Migration

After plan 2 the shell, home, summary, settings, calibration and neck map are in « Près du silence ». The old Game Boy world (the first `:root` block of `src/lib/ui/tokens.css`: `--np-bg`, `--np-mid`, `--np-shade`, `--np-ink`, `--np-tile`, `--np-font-pixel`, `--np-type-*`, `--np-space-*`, the scaffold region variables, VT323, `.np-dither`, the global pixel `html, body` rules) is still used by:

- `PlayFrame` and its views (grid scroll, link lane, rhythm figure, played cycle, `PixelWord`), until plan 3;
- the diagnostic oracle page;
- `ChordShape`'s internals and `Term`'s fallbacks, which read the old names when `--shape-*` or `--term-*` are not set;
- the `Pixel*` primitives and `VerdictSprite`, now used only inside `PlayFrame` and its views;
- the dev-only played cycle on the summary, through a commented local bridge that redefines the old names (`--np-ink`, `--np-shade`, `--np-bg`, `--np-type-body`, `--np-type-meta`) from the new tokens on its own wrapper, until plan 3.

**The One World Per Screen Rule.** A screen is either wholly in « Près du silence » or wholly in the old world; it never mixes the two. A migrated screen resets what the global pixel rules impose (weight, smoothing, image rendering), as `PlayScreen` and the shell do. A shared component used in both worlds is themed by the screen through its own variables, never by old tokens leaking in; the local bridge on the summary is the one sanctioned exception, scoped and dated. The old tokens, VT323, the scaffold region variables, the bridge and the pixel primitives are deleted when the last screen migrates.
