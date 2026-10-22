---
name: Neckspert Play
description: A fretboard-memory trainer played on a real guitar, on the beat. « Près du silence ».
colors:
  ground-mist: '#ece8e2'
  ink: '#23211f'
  slate: '#7a7f80'
  umber: '#8c6e52'
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

Confirmed rejections (direction contract): the dark neon guitar app with cards and progress rings, the gamified dashboard, and the Game Boy cartridge this world replaces.

**Key Characteristics:**

- Five named roles plus a hazy field; amber reserved for « now » and the main action.
- One face, Atkinson Hyperlegible Next, light (300) at the largest sizes; nothing under 16px.
- States told by form before tint: a verdict is a shape, its cell's tone only confirms it.
- One scale from one session to the next; the bar grid is the armature of the lane.
- Flat: no shadows, no cards; depth only from the field's gradient and a veil.

## Colors

A muted, cool-to-warm sleeve palette: mist and ink for reading, slate and umber for the field, and a single warm amber that means « now ».

### Primary

- **Amber Now** (`amber-now`): the now line of the lane, the primary button, the picked key of the answer keyboard, and the keyboard's focus ring. Nothing else.

### Neutral

- **Ground Mist** (`ground-mist`): the light pages (start, pause, end overlays) under ink text.
- **Ink** (`ink`): text on light grounds, the primary button's label, a missed cell, the black keys, chord-shape grounds on the field.
- **On Field** (`on-field`, same value as Ground Mist, separate role): every text and line on the field: prompt, info line, captions, drawn string, target and hit cells, white keys, the learning-aid tile.
- **The Field** (`field-light` → `field-mid` → `field-deep`): a radial gradient (110% × 80% at 45% 20%), light slate at the top left fading to umber-tinted dark at the bottom. It is the play ground, declared as one token (`--np-field`). The play screen adds a veil of Ink at 40% over its top 160px so the info line reads on the lightest stop.
- **Cell** (`cell`) and **Cell Downbeat** (`cell-downbeat`): mist at 14% and 26% over the field, for an empty beat and the first beat of a bar. Past cells drop to 45% opacity.
- **Cell Band** (`cell-band`): mist at 50% over the field, the fill of a held chord's band, under ink names (above 4.5:1).
- **Slate** (`slate`), **Umber** (`umber`), **Rule** (`rule`): declared roles for the coming screens (the session plan's « why » in umber, thin rules in ink at 12%); no built component uses them yet.

### Named Rules

**The One Amber Rule.** Amber marks « now » and the single main action of a screen; a second amber element on a screen is a defect.

**The Form Before Tint Rule.** A state is first a shape (verdict marks, outlined vs filled cells); colour only confirms it. Never encode a verdict by hue alone, and never add hues for verdicts (no green/red).

## Typography

**Display Font:** Atkinson Hyperlegible Next (300, 400, 500, 700, self-hosted woff2), with `system-ui, sans-serif`
**Body Font:** the same face.

**Character:** A precise, open grotesque drawn for legibility; set light and very large for the one thing to read from afar, regular for everything else. Weight 500 only for emphasis (the cell's name, the first part of the info line).

### Hierarchy

- **Hero** (300, up to 300px at 1440×900, bounded by width and height, line-height 1): the note of the prompt, alone, on one line: never broken, it scales down to the centre's width (about 0.6em per glyph), so « F#dim » fits a phone. The only big letter on screen.
- **Correction** (300, up to 120px, line-height 1.05, wraps): the right answer after a miss, in the prompt's place (« corde de B, case 6 »), and the verdict's name after a hit (« Parfait »), its offset beside it at prompt size.
- **Prompt** (400, 28–48px, line-height 1.1): the string under the note (« corde de B »), the recalled prompt above a correction, the offset beside a hit's verdict, the countdown, and the main line in mode 2.
- **Cell** (500, 16–56px, line-height 1): a name inside a lane cell.
- **Title** (400, 24–32px): the primary button and the learning-aid tile.
- **Body** (400, 18–20px, line-height 1.5, max 36rem): the how-to on light pages, the mode-2 answer caption.
- **Meta** (400, 16–18px, tabular figures): the info line, « pause » and « quitter » (lowercase, letter-spacing 0.06em), the verdict caption over a cell, keyboard key names.

### Named Rules

**The One Big Letter Rule.** Only the prompted note is set at hero size; the string beneath stays at prompt size, and in mode 2 the whole prompt drops to prompt size.

**The 16px Floor Rule.** No text under 16px at any width; every role is a clamp whose floor is at least 16px (`scripts/functional-ui.mjs` enforces it).

## Layout

The play screen is a three-row grid filling `100dvh`: the info line on top, the centre (prompt or correction, vertically centred), and the bottom stage (lane in mode 1, keyboard in mode 2). Padding is 32px on top, 48px at the bottom, and `clamp(16px, 3vw, 40px)` on the sides; rows are 32px apart.

Spacing follows an 8px base (`step-1` to `step-8`: 8, 16, 24, 32, 40, 48, 64, 96). Lane cells are 6px apart.

**The lane** shows three bars of beats: one bar before the now line, two after (past one third, future two thirds). Each cell is `1/(3 × beats per bar)` of the lane's width; the lane is `clamp(96px, 8.4vw, 120px)` tall. The now line is fixed; cells move past it, following the audio beat index.

**Phones** keep the same composition, scaled by the clamps: the hero letter and the cells shrink, the lane keeps all its cells (16px names), and the verdict mark keeps its fixed size.

**The Lane Is The Clock Rule.** What to play and when is shown by the lane alone: one cell per beat, plain, the name in its cell. No legend, no « maintenant », no « dans 2 temps », no bar numbers during play; an empty bar is the breath.

## Elevation & Depth

Flat. No shadows anywhere. Depth comes only from the field's radial gradient, the 40% ink veil under the info line, and translucent mist cells over the field. Light pages sit over the field as a full mist overlay, not a raised card.

**The No Card Rule.** Nothing floats: no shadows, no cards, no containers with borders around the prompt or the lane.

## Shapes

Square by default. The primary button has a barely softened corner (2px); cells, keys and the learning-aid tile are square. Lines are thin: 1px for the drawn strings and key borders, 2px for a cell's outline (offbeat, the outline of a held chord band), 4px for the prompted string and for the now line, which overhangs the cells by 16px above and below as the strongest mark on screen.

## Components

### Buttons

Quiet by default, one amber action per page.

- **Shape:** square with a 2px corner on the primary.
- **Primary:** amber ground, ink label at title size, 16px × 32px padding. Used for « Commencer », « Reprendre », « Recommencer ».
- **Quiet:** no ground, inherits colour, body size (meta in the info line), 8px vertical padding; underline (4px offset) on hover and focus. Used for « pause » and « Joué juste ».
- **Focus:** 2px outline in current colour, 4px offset.
- **Disabled:** 60% opacity.

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

## Do's and Don'ts

### Do:

- **Do** use the `--np-*` tokens of the « Près du silence » block in `src/lib/ui/tokens.css`, never raw values.
- **Do** keep amber for the now line and the one main action of a screen.
- **Do** tell a state by its shape first (verdict marks, filled vs outlined cells).
- **Do** keep every text at 16px or more, and set the largest text light (300).
- **Do** drop the imprint and the scene rise under `prefers-reduced-motion`.
- **Do** write a tempo as « ♩ = 80 ».

### Don't:

- **Don't** add hues for verdicts, or a second accent beside amber.
- **Don't** add legends, « maintenant », countdown words or bar numbers to the lane during play.
- **Don't** add shadows, cards or bordered containers around the prompt or the lane.
- **Don't** set anything but the prompted note at hero size.
- **Don't** mix this world with the Game Boy tokens on one screen.

## Migration

The old Game Boy world (the first `:root` block of `src/lib/ui/tokens.css`: `--np-bg`, `--np-mid`, `--np-shade`, `--np-ink`, `--np-tile`, `--np-font-pixel`, `--np-type-*`, `--np-space-*`, VT323, `.np-dither`, the global pixel `html, body` rules) is still used by screens not yet migrated: home, summary, settings, calibration, the neck map, `PlayFrame` and its views (grid scroll, link lane, rhythm figure, played cycle, `PixelWord`), the diagnostic oracle page, and `ChordShape`'s internal sizes, together with the `Pixel*` primitives, `VerdictSprite` and `Term`.

**The One World Per Screen Rule.** A screen is either wholly in « Près du silence » or wholly in the old world; it never mixes the two. A migrated screen resets what the global pixel rules impose (weight, smoothing, image rendering), as `PlayScreen` does. The old tokens, VT323, the scaffold region variables and the pixel primitives are deleted when the last screen migrates.
