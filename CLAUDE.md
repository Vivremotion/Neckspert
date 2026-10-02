# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A fretboard-memory trainer for guitarists, built as a rhythm game. The player hears a metronome, sees a prompt ("F, corde de B"), and plays the note on a real guitar on the beat (mode 1, _locate_), or taps the note name for a given string/fret (mode 2, _identify_). Spaced repetition (FSRS via `ts-fsrs`) decides what comes back; only the first, _cold_ attempt at a card after a delay feeds retention stats. Read `PRODUCT.md` for the product rules and `docs/brief.md` for the original brief. Product docs, plans and UI copy are in French; code, identifiers and comments are in English.

## Commands

Node 22.23.3 (`.nvmrc`, `engine-strict=true`).

```sh
npm run dev            # vite dev server
npm run build          # static build (adapter-static, SPA fallback index.html)
npm test               # all Vitest projects, single run
npm run test:unit      # Vitest watch mode
npm run check          # svelte-kit sync + svelte-check (types)
npm run lint           # prettier --check
npm run format         # prettier --write
```

Single file / single test:

```sh
npx vitest run src/lib/domain/scoring/judgement.spec.ts
npx vitest run src/lib/domain/scoring/judgement.spec.ts -t "late"
npx vitest run --project client   # only jsdom tests
```

Vitest has two projects (`vite.config.ts`): `*.spec.ts` runs in **node** (`server`), `*.svelte.spec.ts` runs in **jsdom** (`client`). Any test that renders components or uses runes must be named `*.svelte.spec.ts`. `expect.requireAssertions` is on, so every test must assert. Dexie specs import `fake-indexeddb/auto`. The merge gate used throughout the plans is `npm test && npm run check`.

`scripts/functional-ui.mjs` drives real pages in headless Chrome against running dev servers (it fails on behavior errors and on text under 16px). It is not part of `npm test`.

## Architecture

Svelte 5, runes only (forced for all non-`node_modules` files), SvelteKit with `ssr = false`, no component library, native CSS with variables. Layered, ports-and-adapters:

- `src/lib/domain/` — pure logic, no Svelte, no browser APIs. `types.ts` holds the shared domain model (cards, attempts, verdicts, settings, planned items). `music/` (fretboard, naming, `placementTargets`/`practiceTargets` over frets 1–11), `scoring/` (verdicts, answer windows, recall threshold, fatigue), `progress/` (FSRS scheduling, lead-beat steps, temperature cold/hot, `introduction.ts` queue order, `review.ts` cold eligibility, session selectors, stats, neck map, grades).
- `src/lib/application/` — `ports/` defines the interfaces infrastructure must implement (clock, metronome, note detector, cues, calibration, repositories, backup). `app.ts` defines `AppServices`, the single object screens consume, provided through Svelte context (`provideAppServices` / `useAppServices`). `session/contract.ts` defines `PlaySessionController` and its reactive `PlayView` — the contract between orchestration and the play screen. `session/SessionController.svelte.ts` implements it (runes-based state machine: count-in → awaiting → verdict…), asking a `SessionSelector` for each prompt, `services/createAppServices.ts` builds `AppServices` from `SessionDeps`.
- `src/lib/infrastructure/` — adapters. `audio/clock` (one `WebAudioClock` owns the single `AudioContext`; `WebAudioMetronome` schedules beats), `audio/detection` (AudioWorklet `frame-processor.ts` → onset detection + pitch via `pitchy` → `NoteTracker`), `audio/cues`, `audio/calibration` (latency measurement), `storage/` (Dexie repositories, backup import/export with validation).
- `src/lib/composition/createApp.ts` — the composition root: wires real adapters into `createAppServices`. Called once in `src/routes/+layout.svelte`.
- `src/lib/ui/` — `primitives/` (Pixel* components, `VerdictSprite`), `play/` (`PlayScreen`, lane, mode-2 `answer/` pad), `screens/<name>/` (home, summary, map, calibration, settings). Each screen has a `messages.ts` using `defineMessages({ fr, en })` from `$lib/i18n/index.svelte`; locale comes from stored settings.
- `src/routes/` — thin pages that pull `useAppServices()` and render a screen. `/dev/*` (screens with fake services) and `/diagnostic` are gated by `requireDev()` and 404 in production.

Tests use fakes from `src/lib/testing/fakes.ts` (`FakeClock`, fake metronome/detector/repositories). Repository behavior is specified by reusable contract suites in `src/lib/infrastructure/storage/testing/`, which the Dexie repository specs run.

## Rules that span files

These are fixed product decisions documented in `docs/superpowers/plans/README.md` (read it before changing scoring, timing or audio behavior). All numbers are named constants meant to be tuned, not inlined.

- **Times**: audio scheduling uses `AudioContext` seconds; scoring windows and reaction times are in ms. Onsets are corrected by the calibrated latency before judging.
- **Metronome**: start at `clock.now() + 0.1` at the earliest; beats already past are dropped. `onBeat` can fire up to 100 ms _before_ the beat — never assume `clock.now() >= beat.time`, compare beat indexes with `>=`, never `===`. Tempo cannot change while running (`setTempo` throws).
- **First note is the answer**; later notes in the window are ignored. Mode 1 verdicts: wrong pitch/no answer → `wrong`, `|offset| ≤ PERFECT_WINDOW_MS` → `perfect`, else `early`/`late`. Mode 2 has no `early`.
- **Cold vs hot**: only cold attempts feed retention, FSRS and mastery. A free-play attempt on a learned card untouched for `MIN_COLD_DELAY_MS` is cold too.
- **Sessions** are `'placement' | 'learn' | 'free'`. Placement and free play run a fixed list (`createListSelector`); learn runs `createLearnSelector` (`progress/learnSelector.ts`): retests, cold reviews, resumed notes, new notes from `introductionOrder()`, then consolidation, for `LEARN_SESSION_MS`. Spec: `docs/superpowers/specs/2026-10-02-apprentissage-design.md`.
- **Open strings** (fret 0) are never prompted: the prompt names the string by its open note.
- **Audio input** is opened raw (no echo cancellation / noise suppression / AGC), except the Firefox-on-macOS built-in mic workaround in `WebAudioNoteDetector`. The metronome click is pitchless filtered noise so the detector ignores it; verdict cues are < 150 ms and play after the answer.

## Visual system

`DESIGN.md` is the source of truth: a Game Boy world in exactly four tones (`#E99568`, `#BE6754`, `#813B2A`, `#451218`), a fifth only as a checkerboard of two adjacent tones, one pixel face (VT323), 8 px tile spacing. Tokens live in `src/lib/ui/tokens.css` (`--np-*`); use them rather than raw values. Per-screen design contracts and approved mocks are under `.impeccable/surfaces/` and `.impeccable/mocks/` (the play screen contract is `.impeccable/surfaces/src-routes-session-page-svelte.md`). `prefers-reduced-motion` must drop the verdict pop.

## Workflow conventions

- Implementation plans and specs live in `docs/superpowers/plans/` and `docs/superpowers/specs/` (dated, in French). Plan work historically ran in git worktrees under `.worktrees/` on `plan/<id>` branches.
- Commit messages: Conventional Commits, lowercase, imperative and behavior-focused (`feat: open the summary when free play ends`, `fix: …`, `test: …`, `docs: …`).
- TDD for any logic: domain and application code each have colocated `*.spec.ts`.
