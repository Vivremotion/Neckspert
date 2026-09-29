# P0 — Socle et contrats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Créer le projet SvelteKit, installer toutes les dépendances du prototype, et figer les types, ports, contrats et doublures de test que les plans parallèles utilisent.

**Architecture:** Architecture hexagonale. Le domaine (`src/lib/domain`) ne dépend de rien d'autre que de lui-même et de `ts-fsrs`. L'application (`src/lib/application`) définit les ports et les contrats consommés par l'interface. L'infrastructure (`src/lib/infrastructure`) implémente les ports. Ce plan n'écrit presque aucune logique : il écrit les interfaces que les autres plans implémentent, pour qu'ils puissent avancer en parallèle sans se coordonner.

**Tech Stack:** SvelteKit 2 (adapter-static, `ssr = false`), Svelte 5 (runes uniquement), TypeScript, Vitest (projets `server` en Node et `client` en jsdom), Prettier, `ts-fsrs`, `dexie`, `pitchy`, `fake-indexeddb`, `@testing-library/svelte`.

## Global Constraints

- Svelte 5, runes uniquement : `$state`, `$derived`, `$effect`, `$props`. Pas de stores Svelte 4 (`writable`), pas de `export let`.
- SvelteKit en site statique : adapter-static avec `fallback: 'index.html'`, `ssr = false` dans `src/routes/+layout.ts`.
- Toute la temporisation audio est calée sur `AudioContext.currentTime` (secondes). Jamais `setInterval`, jamais `performance.now()` pour mesurer un temps musical. Les horodatages de stockage sont en millisecondes epoch (`Date.now()` ou `AudioClockPort.toEpochMs`).
- CSS natif avec variables ; pas de bibliothèque de composants ni de Tailwind.
- Tests Vitest : fichiers `*.spec.ts` (Node) ; tests de composants dans `*.svelte.spec.ts` (jsdom).
- Noms de notes toujours en lettres (C, D, E…), dièses canoniques en interne (`C#`), bémols seulement à l'affichage.
- Interface bilingue français et anglais ; français par défaut.
- Données uniquement en local (IndexedDB), sans compte.
- Prettier : tabulations, guillemets simples, pas de virgule finale, largeur 100 (configuration générée par `sv`).
- Node : version de `.nvmrc` (22.23.3).

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `package.json`, `vite.config.ts`, `tsconfig.json`, `prettier.config.js`, `.npmrc`, `.prettierignore`, `src/app.html`, `src/app.d.ts` | Projet généré par `sv create`, ajusté |
| `src/routes/+layout.ts` | `ssr = false`, `prerender = false` |
| `src/routes/+layout.svelte`, `src/routes/+page.svelte` | Générés, remplacés plus tard par les plans d'écrans |
| `src/lib/domain/music/types.ts` | Types et constantes musicales partagés |
| `src/lib/domain/types.ts` | Cibles, clés de carte, tentatives, états de carte, sessions, réglages, vues statistiques, sauvegarde, seuil de rappel direct |
| `src/lib/domain/stats.ts` | `median`, partagée par les calculs de statistiques |
| `src/lib/application/ports/*.ts` | Ports : horloge audio, métronome, détecteur de notes, calibration, dépôts, sauvegarde |
| `src/lib/application/session/contract.ts` | Contrat entre l'orchestration de session et l'écran de jeu |
| `src/lib/application/app.ts` | Contrat `AppServices` et accès par contexte Svelte |
| `src/lib/i18n/index.svelte.ts` | Langue courante et `defineMessages` |
| `src/lib/testing/fakes.ts` | Doublures de test partagées |

---

### Task 1: Créer le projet

**Files:**
- Create: fichiers générés par `sv create` (voir tableau)
- Modify: `.gitignore` (ajout des entrées générées)
- Create: `src/routes/+layout.ts`
- Modify: `vite.config.ts`, `package.json`

**Interfaces:**
- Consumes: rien.
- Produces: scripts `npm run check`, `npm test`, `npm run build`, `npm run format` ; alias `$lib` → `src/lib`.

- [ ] **Step 1: Générer le projet dans un dossier temporaire**

Le dépôt contient déjà `PRODUCT.md`, `docs/` et `.impeccable/` : on génère ailleurs et on copie.

```bash
rm -rf /tmp/np-scaffold
cd /tmp && npx -y sv@0.17.1 create np-scaffold --template minimal --types ts --add prettier "vitest=usages:unit" "sveltekit-adapter=adapter:static" --no-install
```

Expected: se termine par « You're all set! ».

- [ ] **Step 2: Copier dans le dépôt sans écraser l'existant**

```bash
cd /Users/cyril/Development/neckspert-play
rsync -a --exclude .gitignore --exclude README.md --exclude src/lib/vitest-examples /tmp/np-scaffold/ ./
cat /tmp/np-scaffold/.gitignore >> .gitignore
```

- [ ] **Step 3: Renommer le paquet**

Dans `package.json`, remplacer `"name": "np-scaffold"` par `"name": "neckspert-play"`.

- [ ] **Step 4: Installer toutes les dépendances du prototype**

Toutes les dépendances des plans parallèles sont installées ici, pour qu'aucun plan ne touche `package.json` ni `package-lock.json`.

```bash
npm install
npm install ts-fsrs@^5.4.2 dexie@^4.4.6 pitchy@^4.1.0
npm install -D fake-indexeddb@^6.2.5 jsdom @testing-library/svelte
```

Expected: pas d'erreur `ERESOLVE`.

- [ ] **Step 5: Configurer le site statique et les deux projets de test**

Remplacer `vite.config.ts` par :

```ts
import { defineConfig } from 'vitest/config';
import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ fallback: 'index.html' })
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			},
			{
				extends: './vite.config.ts',
				resolve: { conditions: ['browser'] },
				test: {
					name: 'client',
					environment: 'jsdom',
					include: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
```

Créer `src/routes/+layout.ts` :

```ts
export const ssr = false;
export const prerender = false;
```

- [ ] **Step 6: Vérifier le projet**

```bash
npm run check
npm test -- --passWithNoTests
npm run build
```

Expected: `svelte-check found 0 errors`, Vitest termine sans échec, le build écrit `build/index.html`.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold SvelteKit static project with test setup"
```

---

### Task 2: Types musicaux partagés

**Files:**
- Create: `src/lib/domain/music/types.ts`
- Test: `src/lib/domain/music/types.spec.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `CHROMATIC_NOTES`, `PitchName`, `Midi`, `StringNumber`, `STRING_NUMBERS`, `FretPosition`, `STANDARD_TUNING`, `MAX_PLAYABLE_FRET`, `MAX_PROMPT_FRET`, `Spelling`, `NoteLabel`, `pitchOfMidi(midi: Midi): PitchName`.

- [ ] **Step 1: Écrire le test**

```ts
import { describe, expect, it } from 'vitest';
import { CHROMATIC_NOTES, STANDARD_TUNING, pitchOfMidi } from './types';

describe('pitchOfMidi', () => {
	it('maps MIDI numbers to sharp pitch names', () => {
		expect(pitchOfMidi(60)).toBe('C');
		expect(pitchOfMidi(64)).toBe('E');
		expect(pitchOfMidi(66)).toBe('F#');
		expect(pitchOfMidi(40)).toBe('E');
	});

	it('handles every pitch class exactly once over an octave', () => {
		const names = Array.from({ length: 12 }, (_, i) => pitchOfMidi(48 + i));
		expect(names).toEqual([...CHROMATIC_NOTES]);
	});
});

describe('STANDARD_TUNING', () => {
	it('tunes string 1 to E4 and string 6 to E2', () => {
		expect(STANDARD_TUNING[1]).toBe(64);
		expect(STANDARD_TUNING[6]).toBe(40);
		expect(pitchOfMidi(STANDARD_TUNING[2])).toBe('B');
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/domain/music/types.spec.ts`
Expected: FAIL, « Failed to resolve import "./types" ».

- [ ] **Step 3: Écrire les types**

```ts
/** Chromatic scale in sharp notation: the canonical internal spelling. */
export const CHROMATIC_NOTES = [
	'C',
	'C#',
	'D',
	'D#',
	'E',
	'F',
	'F#',
	'G',
	'G#',
	'A',
	'A#',
	'B'
] as const;

export type PitchName = (typeof CHROMATIC_NOTES)[number];

/** MIDI note number: 60 = C4, 64 = E4. */
export type Midi = number;

/** Guitar string: 1 = high E … 6 = low E. */
export type StringNumber = 1 | 2 | 3 | 4 | 5 | 6;

export const STRING_NUMBERS: readonly StringNumber[] = [1, 2, 3, 4, 5, 6];

export interface FretPosition {
	string: StringNumber;
	/** 0 = open string. */
	fret: number;
}

/** Open-string MIDI notes in standard tuning. */
export const STANDARD_TUNING: Readonly<Record<StringNumber, Midi>> = {
	1: 64,
	2: 59,
	3: 55,
	4: 50,
	5: 45,
	6: 40
};

/** Highest fret accepted as an answer in mode 1. */
export const MAX_PLAYABLE_FRET = 24;

/** Mode 2 prompts use frets 0 to 11; fret 12 repeats fret 0. */
export const MAX_PROMPT_FRET = 11;

export type Spelling = 'sharp' | 'flat';

/** A pitch with the spelling chosen for display (F# or Gb). */
export interface NoteLabel {
	pitch: PitchName;
	spelling: Spelling;
}

export function pitchOfMidi(midi: Midi): PitchName {
	return CHROMATIC_NOTES[((midi % 12) + 12) % 12];
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/domain/music/types.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/music/types.ts src/lib/domain/music/types.spec.ts
git commit -m "feat: add shared music types"
```

---

### Task 3: Types du domaine

**Files:**
- Create: `src/lib/domain/types.ts`
- Test: `src/lib/domain/types.spec.ts`

**Interfaces:**
- Consumes: `PitchName`, `Midi`, `StringNumber`, `CHROMATIC_NOTES` (Task 2).
- Produces: tous les types listés dans le code ci-dessous, plus `cardKey(target: Target): CardKey`, `parseCardKey(key: CardKey): Target`, `LEAD_STEPS`, `RECALL_THRESHOLD_MS`, `DEFAULT_SETTINGS`, et `median(values: readonly number[]): number | null` dans `src/lib/domain/stats.ts`.

Définitions à respecter par tous les plans :
- **Cible** : `locate` (mode 1, nom vers position : jouer `pitch` sur `string`, à n'importe quelle octave jouable sur cette corde) ou `identify` (mode 2, position vers nom : nommer la note de `string`, case `fret`, entre 0 et 11).
- **Carte** : une cible suivie par la répétition espacée. Une clé par cible.
- **Annonce** (`leadBeats`) : nombre de temps entre l'affichage de la consigne et le temps cible, en mode 1. Paliers `8, 4, 2, 1` : deux mesures pendant l'apprentissage, puis de plus en plus court à mesure que la position progresse.
- **À froid / à chaud** : une tentative est à froid si c'est le premier essai de la carte dans la session et que la tentative précédente date d'au moins le délai minimal (défini par le plan C). Seules les tentatives à froid comptent pour la rétention.

- [ ] **Step 1: Écrire le test**

```ts
import { describe, expect, it } from 'vitest';
import { cardKey, parseCardKey, type Target } from './types';

describe('cardKey', () => {
	it('encodes locate and identify targets', () => {
		expect(cardKey({ direction: 'locate', string: 2, pitch: 'F' })).toBe('locate:2:F');
		expect(cardKey({ direction: 'identify', string: 5, fret: 8 })).toBe('identify:5:8');
	});

	it('round-trips through parseCardKey', () => {
		const targets: Target[] = [
			{ direction: 'locate', string: 6, pitch: 'G#' },
			{ direction: 'identify', string: 1, fret: 0 },
			{ direction: 'identify', string: 3, fret: 11 }
		];
		for (const target of targets) {
			expect(parseCardKey(cardKey(target))).toEqual(target);
		}
	});

	it('rejects malformed keys', () => {
		expect(() => parseCardKey('locate:7:F')).toThrow();
		expect(() => parseCardKey('locate:2:H')).toThrow();
		expect(() => parseCardKey('identify:2:12')).toThrow();
		expect(() => parseCardKey('play:2:F')).toThrow();
	});
});

describe('isDirectRecall', () => {
	it('requires a correct answer at or under the threshold', () => {
		expect(isDirectRecall({ correct: true, reactionMs: RECALL_THRESHOLD_MS })).toBe(true);
		expect(isDirectRecall({ correct: true, reactionMs: RECALL_THRESHOLD_MS + 1 })).toBe(false);
		expect(isDirectRecall({ correct: false, reactionMs: 400 })).toBe(false);
		expect(isDirectRecall({ correct: true, reactionMs: null })).toBe(false);
	});
});

describe('median', () => {
	it('returns the middle value, or the mean of the two middle values', () => {
		expect(median([])).toBeNull();
		expect(median([900, 300, 600])).toBe(600);
		expect(median([400, 100, 300, 200])).toBe(250);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/domain/types.spec.ts`
Expected: FAIL, « Failed to resolve import "./types" ».

- [ ] **Step 3: Écrire les types**

```ts
import {
	CHROMATIC_NOTES,
	MAX_PROMPT_FRET,
	type Midi,
	type PitchName,
	type StringNumber
} from './music/types';

export type Locale = 'fr' | 'en';

export type Direction = 'locate' | 'identify';

/** Mode 1: play `pitch` on `string`, any octave playable on that string. */
export interface LocateTarget {
	direction: 'locate';
	string: StringNumber;
	pitch: PitchName;
}

/** Mode 2: name the note at `string`, `fret` (0 to MAX_PROMPT_FRET). */
export interface IdentifyTarget {
	direction: 'identify';
	string: StringNumber;
	fret: number;
}

export type Target = LocateTarget | IdentifyTarget;

export type CardKey = string;

export function cardKey(target: Target): CardKey {
	return target.direction === 'locate'
		? `locate:${target.string}:${target.pitch}`
		: `identify:${target.string}:${target.fret}`;
}

export function parseCardKey(key: CardKey): Target {
	const [direction, rawString, value] = key.split(':');
	const string = Number(rawString);
	if (!Number.isInteger(string) || string < 1 || string > 6) {
		throw new Error(`Invalid string in card key: ${key}`);
	}
	if (direction === 'locate') {
		if (!(CHROMATIC_NOTES as readonly string[]).includes(value)) {
			throw new Error(`Invalid pitch in card key: ${key}`);
		}
		return { direction, string: string as StringNumber, pitch: value as PitchName };
	}
	if (direction === 'identify') {
		const fret = Number(value);
		if (!Number.isInteger(fret) || fret < 0 || fret > MAX_PROMPT_FRET) {
			throw new Error(`Invalid fret in card key: ${key}`);
		}
		return { direction, string: string as StringNumber, fret };
	}
	throw new Error(`Invalid direction in card key: ${key}`);
}

export type Verdict = 'perfect' | 'early' | 'late' | 'wrong';

/** A correct answer faster than this is direct recall; slower is calculation. To calibrate. */
export const RECALL_THRESHOLD_MS = 1500;

export type Temperature = 'cold' | 'hot';

export type SessionKind = 'placement' | 'daily' | 'free';

/** Where an attempt happened inside a session. */
export type ItemPhase = 'placement' | 'review' | 'learning' | 'free';

/** Help shown with a mode 1 prompt: the fret, or nothing. */
export type AidLevel = 'show-position' | 'none';

/** Lead time steps, in beats, between the prompt and the target beat (mode 1). */
export const LEAD_STEPS = [8, 4, 2, 1] as const;
export type LeadBeats = (typeof LEAD_STEPS)[number];

/** What the guitarist answered: a played note (mode 1) or a tapped name (mode 2). */
export type Answer = { kind: 'note'; midi: Midi } | { kind: 'name'; pitch: PitchName };

/** How a wrong answer relates to the expected one. */
export type Confusion =
	| { kind: 'semitone'; delta: -2 | -1 | 1 | 2 }
	| { kind: 'octave' }
	| { kind: 'other'; semitones: number };

export interface Attempt {
	id?: number;
	sessionId: string;
	cardKey: CardKey;
	target: Target;
	phase: ItemPhase;
	temperature: Temperature;
	aid: AidLevel;
	/** Mode 1 only. */
	leadBeats: LeadBeats | null;
	/** Epoch ms when the prompt appeared. */
	promptedAt: number;
	/** Null when nothing was answered before the window closed. */
	answer: Answer | null;
	/** Pitch (mode 1) or name (mode 2) is right, whatever the timing. */
	correct: boolean;
	verdict: Verdict;
	/** Mode 1 only: latency-corrected onset minus target beat time, in ms. */
	timingOffsetMs: number | null;
	/** Prompt to answer, in ms. Null without an answer. */
	reactionMs: number | null;
	confusion: Confusion | null;
}

/** Serializable mirror of a ts-fsrs Card; dates are epoch ms. */
export interface SchedulingState {
	due: number;
	stability: number;
	difficulty: number;
	elapsedDays: number;
	scheduledDays: number;
	learningSteps: number;
	reps: number;
	lapses: number;
	/** ts-fsrs State: 0 New, 1 Learning, 2 Review, 3 Relearning. */
	state: 0 | 1 | 2 | 3;
	lastReview: number | null;
}

export interface CardState {
	key: CardKey;
	target: Target;
	/** Epoch ms of the learning (or placement) that introduced the card. */
	introducedAt: number;
	introducedInSession: string;
	/** Current lead step, mode 1 only; identify cards keep 1. */
	leadBeats: LeadBeats;
	scheduling: SchedulingState;
	acquiredAt: number | null;
	masteredAt: number | null;
}

/** A set of cards introduced together. Opens when `requires` is acquired enough. */
export interface CurriculumSet {
	id: string;
	direction: Direction;
	targets: Target[];
	/** Set id that must be acquired first; null for the first set. */
	requires: string | null;
}

export type Curriculum = readonly CurriculumSet[];

export interface PlannedItem {
	target: Target;
	phase: ItemPhase;
	temperature: Temperature;
	aid: AidLevel;
	/** Mode 1 only. */
	leadBeats: LeadBeats | null;
	/** Learning items come back until answered correctly. */
	repeatUntilCorrect: boolean;
}

export interface SessionPlan {
	id: string;
	kind: SessionKind;
	createdAt: number;
	items: PlannedItem[];
}

export interface SessionRecord {
	id: string;
	kind: SessionKind;
	startedAt: number;
	endedAt: number | null;
	fatigueDetected: boolean;
}

export interface Settings {
	locale: Locale;
	tempoBpm: number;
	/** Detection latency in ms, subtracted from onset times. Null until calibrated. */
	calibrationOffsetMs: number | null;
	inputDeviceId: string | null;
	placementDoneAt: number | null;
}

export const DEFAULT_SETTINGS: Settings = {
	locale: 'fr',
	tempoBpm: 80,
	calibrationOffsetMs: null,
	inputDeviceId: null,
	placementDoneAt: null
};

export type CardStatus = 'unseen' | 'learning' | 'acquired' | 'mastered';

export interface HomeStats {
	nextAction: 'placement' | 'session' | 'wait';
	/** Epoch ms of the next due review, when waiting. */
	nextReviewAt: number | null;
	/** The one number on the home screen. */
	medianColdReactionMs: number | null;
	trend: 'improving' | 'stable' | 'worsening' | null;
}

export interface SessionSummary {
	sessionId: string;
	coldCount: number;
	coldCorrect: number;
	medianColdReactionMs: number | null;
	learnedCount: number;
	fatigueDetected: boolean;
	nextSuggestedAt: number | null;
}

/** One cell of the neck map: a position and what is known about it. */
export interface NeckMapCell {
	string: StringNumber;
	fret: number;
	pitch: PitchName;
	locate: CardStatus;
	identify: CardStatus;
	medianColdReactionMs: number | null;
	coldAccuracy: number | null;
}

export interface BackupFile {
	app: 'neckspert-play';
	version: 1;
	exportedAt: number;
	settings: Settings;
	cards: CardState[];
	attempts: Attempt[];
	sessions: SessionRecord[];
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/domain/types.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Écrire le test de la médiane**

Créer `src/lib/domain/stats.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { median } from './stats';

describe('median', () => {
	it('returns null for an empty list', () => {
		expect(median([])).toBeNull();
	});

	it('returns the middle value, or the mean of the two middle values', () => {
		expect(median([900, 1200, 700])).toBe(900);
		expect(median([4, 1, 3, 2])).toBe(2.5);
	});

	it('does not mutate its input', () => {
		const values = [3, 1, 2];
		median(values);
		expect(values).toEqual([3, 1, 2]);
	});
});
```

Run: `npx vitest run src/lib/domain/stats.spec.ts`
Expected: FAIL, « Failed to resolve import "./stats" ».

- [ ] **Step 6: Écrire la médiane**

Créer `src/lib/domain/stats.ts` :

```ts
export function median(values: readonly number[]): number | null {
	if (values.length === 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}
```

Run: `npx vitest run src/lib/domain/stats.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/domain/types.ts src/lib/domain/types.spec.ts src/lib/domain/stats.ts src/lib/domain/stats.spec.ts
git commit -m "feat: add domain types, card keys and median"
```

---

### Task 4: Ports

**Files:**
- Create: `src/lib/application/ports/AudioClockPort.ts`, `MetronomePort.ts`, `NoteDetectorPort.ts`, `CalibrationPort.ts`, `SoundCuePort.ts`, `repositories.ts`, `index.ts`

**Interfaces:**
- Consumes: types de Task 2 et Task 3.
- Produces: `SoundCuePort`, `AudioClockPort`, `BeatEvent`, `MetronomePort`, `NoteOnset`, `AudioInputDevice`, `NoteDetectorPort`, `CalibrationProgress`, `CalibrationOutcome`, `CalibrationPort`, `AttemptRepositoryPort`, `CardStateRepositoryPort`, `SessionRepositoryPort`, `SettingsRepositoryPort`, `BackupPort`.

Règle de temps partagée : l'horloge, le métronome et le détecteur utilisent le même `AudioContext` (créé une seule fois par la composition, plan K). Tous les temps des ports audio sont en secondes de cette horloge.

- [ ] **Step 1: Écrire `AudioClockPort.ts`**

```ts
/** The shared audio clock. All times are AudioContext seconds. */
export interface AudioClockPort {
	/** Creates or resumes the shared AudioContext. Call from a user gesture. */
	resume(): Promise<void>;
	/** AudioContext.currentTime, in seconds. */
	now(): number;
	/** Converts an audio time to epoch ms, for storage only. */
	toEpochMs(audioTime: number): number;
}
```

- [ ] **Step 2: Écrire `MetronomePort.ts`**

```ts
export interface BeatEvent {
	/** 0 = the first beat after start(). */
	index: number;
	/** Scheduled audio time of the beat, in seconds. */
	time: number;
	isDownbeat: boolean;
}

/** Audible click track scheduled on the audio clock. */
export interface MetronomePort {
	setTempo(bpm: number): void;
	getTempo(): number;
	secondsPerBeat(): number;
	/** Starts clicking; beat 0 sounds at `firstBeatTime` (audio seconds). */
	start(firstBeatTime: number): void;
	stop(): void;
	isRunning(): boolean;
	/** Audio time of beat `index`. Throws when not running. */
	beatTime(index: number): number;
	/** Called once per beat, slightly ahead of its audio time. Returns an unsubscribe function. */
	onBeat(callback: (beat: BeatEvent) => void): () => void;
}
```

- [ ] **Step 3: Écrire `NoteDetectorPort.ts`**

```ts
import type { Midi } from '$lib/domain/music/types';

export interface NoteOnset {
	/** Attack time on the audio clock, in seconds, before latency correction. */
	time: number;
	/** Nearest MIDI note, octave included. */
	midi: Midi;
	frequencyHz: number;
	/** Pitch clarity from 0 to 1. */
	clarity: number;
}

export interface AudioInputDevice {
	id: string;
	label: string;
}

/** Single-note detection from the guitar input. */
export interface NoteDetectorPort {
	listInputs(): Promise<AudioInputDevice[]>;
	/** Opens the input (null = default device) and starts detecting. */
	start(deviceId: string | null): Promise<void>;
	stop(): void;
	/** One event per note attack. Returns an unsubscribe function. */
	onNote(callback: (onset: NoteOnset) => void): () => void;
	/** Input level (RMS, 0 to 1), for meters. Returns an unsubscribe function. */
	onLevel(callback: (rms: number) => void): () => void;
}
```

- [ ] **Step 4: Écrire `CalibrationPort.ts`**

```ts
export interface CalibrationProgress {
	hits: number;
	needed: number;
	lastOffsetMs: number | null;
}

export type CalibrationOutcome =
	| { ok: true; offsetMs: number; spreadMs: number }
	| { ok: false; reason: 'no-sound' | 'inconsistent' | 'cancelled' };

/** Measures detection latency by having the guitarist play on a click. */
export interface CalibrationPort {
	run(onProgress: (progress: CalibrationProgress) => void): Promise<CalibrationOutcome>;
	cancel(): void;
}
```

- [ ] **Step 5: Écrire `SoundCuePort.ts`**

Chaque verdict a un son réservé ; l'orchestration le déclenche, l'infrastructure audio le produit.

```ts
import type { Verdict } from '$lib/domain/types';

/** Short sounds reserved for the verdicts, played on the shared audio clock. */
export interface SoundCuePort {
	/** Plays the verdict's cue at `time` (audio seconds), or immediately when omitted. */
	play(verdict: Verdict, time?: number): void;
}
```

- [ ] **Step 6: Écrire `repositories.ts`**

```ts
import type {
	Attempt,
	BackupFile,
	CardKey,
	CardState,
	SessionRecord,
	Settings
} from '$lib/domain/types';

export interface AttemptRepositoryPort {
	/** Stores the attempt and returns its id. */
	add(attempt: Attempt): Promise<number>;
	/** Oldest first. */
	listByCard(key: CardKey): Promise<Attempt[]>;
	/** Oldest first. */
	listBySession(sessionId: string): Promise<Attempt[]>;
	/** Attempts prompted at or after `epochMs`, oldest first. */
	listSince(epochMs: number): Promise<Attempt[]>;
	/** Oldest first. */
	all(): Promise<Attempt[]>;
}

export interface CardStateRepositoryPort {
	get(key: CardKey): Promise<CardState | undefined>;
	put(state: CardState): Promise<void>;
	putMany(states: CardState[]): Promise<void>;
	all(): Promise<CardState[]>;
}

export interface SessionRepositoryPort {
	put(record: SessionRecord): Promise<void>;
	get(id: string): Promise<SessionRecord | undefined>;
	/** Oldest first. */
	list(): Promise<SessionRecord[]>;
}

export interface SettingsRepositoryPort {
	/** Returns DEFAULT_SETTINGS merged with stored values. */
	get(): Promise<Settings>;
	update(patch: Partial<Settings>): Promise<Settings>;
}

export interface BackupPort {
	exportAll(): Promise<BackupFile>;
	/** Validates the file, then replaces all stored data. Throws on an invalid file. */
	importAll(file: unknown): Promise<void>;
}
```

- [ ] **Step 7: Écrire `index.ts`**

```ts
export type { SoundCuePort } from './SoundCuePort';
export type { AudioClockPort } from './AudioClockPort';
export type { BeatEvent, MetronomePort } from './MetronomePort';
export type { AudioInputDevice, NoteDetectorPort, NoteOnset } from './NoteDetectorPort';
export type { CalibrationOutcome, CalibrationPort, CalibrationProgress } from './CalibrationPort';
export type {
	AttemptRepositoryPort,
	BackupPort,
	CardStateRepositoryPort,
	SessionRepositoryPort,
	SettingsRepositoryPort
} from './repositories';
```

- [ ] **Step 8: Vérifier les types**

Run: `npm run check`
Expected: `svelte-check found 0 errors`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/application/ports
git commit -m "feat: add application ports"
```

---

### Task 5: Contrat de session, services de l'application et langue

**Files:**
- Create: `src/lib/application/session/contract.ts`
- Create: `src/lib/application/app.ts`
- Create: `src/lib/i18n/index.svelte.ts`
- Test: `src/lib/i18n/i18n.spec.ts`

**Interfaces:**
- Consumes: types de Task 2 et 3, ports de Task 4.
- Produces:
  - `PlayStatus`, `PromptView`, `VerdictView`, `LaneEntry`, `AnswerChoice`, `PlayView`, `PlayTimeline`, `PlaySessionController` (implémenté par J, affiché par H et I2).
  - `AppServices`, `provideAppServices(services: AppServices): void`, `useAppServices(): AppServices` (implémenté par J, câblé par K, utilisé par les écrans).
  - `i18n` (`{ locale: Locale }`, réactif), `defineMessages<T>(messages: Record<Locale, T>): () => T`.

Règles du contrat de jeu :
- `view` est un objet profondément réactif (`$state`) : l'interface le lit dans des `$derived`, sans jamais l'écrire.
- Les chaînes de `PromptView` et `VerdictView` sont déjà traduites et prêtes à afficher. La consigne du mode 1 est `primary: 'F'`, `secondary: 'corde de B'`, `aid: 'case 6'` ou `null`. Celle du mode 2 est `primary: 'case 8'`, `secondary: 'corde de A'`, `aid: null`.
- La piste de tuiles se calcule côté interface à partir de `timeline.nowBeat()` (lu à chaque image), `beatsPerBar`, `promptBeatIndex`, `targetBeatIndex` et `history`.
- Le mode 2 n'a pas de temps cible : `targetBeatIndex` et `promptBeatIndex` valent `null`, et `answerChoices` contient les douze notes.

- [ ] **Step 1: Écrire `contract.ts`**

```ts
import type { PitchName } from '$lib/domain/music/types';
import type { Direction, LeadBeats, Verdict } from '$lib/domain/types';

export type PlayStatus = 'idle' | 'count-in' | 'awaiting' | 'verdict' | 'paused' | 'finished';

/** Localized prompt, ready to display. */
export interface PromptView {
	direction: Direction;
	/** Mode 1: the note ("F", "Gb"). Mode 2: the fret ("case 8"). */
	primary: string;
	/** The string ("corde de B"). */
	secondary: string;
	/** Mode 1 learning aid ("case 6"), or null. */
	aid: string | null;
}

export interface VerdictView {
	verdict: Verdict;
	/** Mode 1: onset minus target beat, ms. */
	offsetMs: number | null;
	reactionMs: number | null;
	/** What was answered, localized ("F#", "Gb"), or null without an answer. */
	answerLabel: string | null;
}

/** A played target on the lane, at the beat it was due. */
export interface LaneEntry {
	beatIndex: number;
	verdict: Verdict;
}

export interface AnswerChoice {
	pitch: PitchName;
	/** "F", or "F# / Gb" for altered notes. */
	label: string;
}

export interface PlayView {
	status: PlayStatus;
	prompt: PromptView | null;
	lastVerdict: VerdictView | null;
	tempoBpm: number;
	beatsPerBar: 4;
	/** Mode 1: beat on which the prompt appeared. */
	promptBeatIndex: number | null;
	/** Mode 1: beat on which the note is due. */
	targetBeatIndex: number | null;
	leadBeats: LeadBeats | null;
	/** Targets already played in this series, oldest first. */
	history: LaneEntry[];
	/** Mode 2: the twelve answer buttons. */
	answerChoices: AnswerChoice[] | null;
	fatigueDetected: boolean;
}

export interface PlayTimeline {
	/** Fractional beat index at the current audio time; beat 0 starts the series. */
	nowBeat(): number;
}

/** Runs one session. Implemented by the session orchestration, displayed by the play screen. */
export interface PlaySessionController {
	readonly sessionId: string;
	/** Deeply reactive ($state). Read-only for the UI. */
	readonly view: PlayView;
	readonly timeline: PlayTimeline;
	/** Starts audio and the series. Call from a user gesture. */
	start(): Promise<void>;
	pause(): void;
	resume(): void;
	/** Mode 2 answer. Ignored in mode 1 and outside `awaiting`. */
	answer(pitch: PitchName): void;
	/** Ends the session and stops audio. */
	quit(): void;
}
```

- [ ] **Step 2: Écrire `app.ts`**

```ts
import { getContext, setContext } from 'svelte';
import type { HomeStats, NeckMapCell, SessionKind, SessionSummary } from '$lib/domain/types';
import type {
	BackupPort,
	CalibrationPort,
	NoteDetectorPort,
	SettingsRepositoryPort
} from './ports';
import type { PlaySessionController } from './session/contract';

/** Everything the screens need. Implemented by the application layer, wired by the composition root. */
export interface AppServices {
	settings: SettingsRepositoryPort;
	backup: BackupPort;
	detector: NoteDetectorPort;
	calibration: CalibrationPort;
	homeStats(): Promise<HomeStats>;
	sessionSummary(sessionId: string): Promise<SessionSummary>;
	neckMap(): Promise<NeckMapCell[]>;
	/** Plans the session and returns its controller, not yet started. */
	startSession(kind: SessionKind): Promise<PlaySessionController>;
}

const APP_SERVICES = Symbol('app-services');

export function provideAppServices(services: AppServices): void {
	setContext(APP_SERVICES, services);
}

export function useAppServices(): AppServices {
	const services = getContext<AppServices | undefined>(APP_SERVICES);
	if (!services) throw new Error('AppServices not provided');
	return services;
}
```

- [ ] **Step 3: Écrire le test de langue**

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { defineMessages, i18n } from './index.svelte';

const messages = defineMessages({
	fr: { string: (name: string) => `corde de ${name}`, start: 'Commencer' },
	en: { string: (name: string) => `${name} string`, start: 'Start' }
});

describe('defineMessages', () => {
	afterEach(() => {
		i18n.locale = 'fr';
	});

	it('uses French by default', () => {
		expect(messages().start).toBe('Commencer');
		expect(messages().string('B')).toBe('corde de B');
	});

	it('follows the current locale', () => {
		i18n.locale = 'en';
		expect(messages().start).toBe('Start');
		expect(messages().string('B')).toBe('B string');
	});
});
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/i18n/i18n.spec.ts`
Expected: FAIL, « Failed to resolve import "./index.svelte" ».

- [ ] **Step 5: Écrire `index.svelte.ts`**

Chaque plan d'écran déclare ses propres messages dans son dossier avec `defineMessages` ; aucun fichier de messages n'est partagé.

```ts
import type { Locale } from '$lib/domain/types';

export const i18n = $state<{ locale: Locale }>({ locale: 'fr' });

/** Declares one screen's messages; call the returned function to read them in the current locale. */
export function defineMessages<T>(messages: Record<Locale, T>): () => T {
	return () => messages[i18n.locale];
}
```

- [ ] **Step 6: Lancer les tests et la vérification de types**

Run: `npx vitest run src/lib/i18n/i18n.spec.ts && npm run check`
Expected: PASS (2 tests), `svelte-check found 0 errors`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/application/session/contract.ts src/lib/application/app.ts src/lib/i18n
git commit -m "feat: add play session contract, app services and i18n"
```

---

### Task 6: Doublures de test partagées

**Files:**
- Create: `src/lib/testing/fakes.ts`
- Test: `src/lib/testing/fakes.spec.ts`

**Interfaces:**
- Consumes: ports de Task 4, types de Task 3.
- Produces:
  - `FakeClock implements AudioClockPort` : `time` (s), `epochAtZero` (ms), `advance(seconds: number): void`.
  - `FakeMetronome implements MetronomePort` : `constructor(clock: FakeClock, beatsPerBar = 4)`, `flush(): void` émet tous les temps dont l'heure audio est passée.
  - `FakeNoteDetector implements NoteDetectorPort` : `running`, `deviceId`, `emitNote(onset: NoteOnset): void`, `emitLevel(rms: number): void`.
  - `FakeSoundCues implements SoundCuePort` : `played: { verdict: Verdict; time: number | undefined }[]`.
  - `InMemoryAttemptRepository`, `InMemoryCardStateRepository`, `InMemorySessionRepository`, `InMemorySettingsRepository` qui implémentent les ports de dépôt.

- [ ] **Step 1: Écrire le test**

```ts
import { describe, expect, it } from 'vitest';
import type { Attempt, CardState } from '$lib/domain/types';
import type { BeatEvent } from '$lib/application/ports';
import {
	FakeClock,
	FakeMetronome,
	FakeNoteDetector,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository,
	InMemorySettingsRepository
} from './fakes';

function attempt(overrides: Partial<Attempt>): Attempt {
	return {
		sessionId: 's1',
		cardKey: 'locate:2:F',
		target: { direction: 'locate', string: 2, pitch: 'F' },
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: 2,
		promptedAt: 1000,
		answer: { kind: 'note', midi: 65 },
		correct: true,
		verdict: 'perfect',
		timingOffsetMs: 10,
		reactionMs: 900,
		confusion: null,
		...overrides
	};
}

describe('FakeMetronome', () => {
	it('emits beats as the clock advances', () => {
		const clock = new FakeClock();
		const metronome = new FakeMetronome(clock);
		const beats: BeatEvent[] = [];
		metronome.onBeat((beat) => beats.push(beat));
		metronome.setTempo(120);
		metronome.start(1);

		clock.advance(1.6);
		metronome.flush();

		expect(beats.map((b) => b.index)).toEqual([0, 1]);
		expect(beats[1].time).toBeCloseTo(1.5);
		expect(beats[0].isDownbeat).toBe(true);
		expect(metronome.beatTime(4)).toBeCloseTo(3);
	});
});

describe('FakeNoteDetector', () => {
	it('only emits while running', async () => {
		const detector = new FakeNoteDetector();
		const seen: number[] = [];
		detector.onNote((onset) => seen.push(onset.midi));
		detector.emitNote({ time: 1, midi: 60, frequencyHz: 261.6, clarity: 0.95 });
		await detector.start(null);
		detector.emitNote({ time: 2, midi: 62, frequencyHz: 293.7, clarity: 0.95 });
		expect(seen).toEqual([62]);
	});
});

describe('in-memory repositories', () => {
	it('stores attempts with ids, oldest first', async () => {
		const repo = new InMemoryAttemptRepository();
		const first = await repo.add(attempt({ promptedAt: 2000 }));
		await repo.add(attempt({ promptedAt: 1000, sessionId: 's2' }));
		expect(first).toBe(1);
		expect((await repo.all()).map((a) => a.promptedAt)).toEqual([1000, 2000]);
		expect(await repo.listBySession('s2')).toHaveLength(1);
		expect(await repo.listSince(1500)).toHaveLength(1);
	});

	it('stores card states by key', async () => {
		const repo = new InMemoryCardStateRepository();
		const state = { key: 'locate:2:F' } as CardState;
		await repo.put(state);
		expect(await repo.get('locate:2:F')).toEqual(state);
	});

	it('merges settings over defaults', async () => {
		const repo = new InMemorySettingsRepository();
		expect((await repo.get()).tempoBpm).toBe(80);
		expect((await repo.update({ tempoBpm: 96 })).tempoBpm).toBe(96);
		expect((await repo.get()).locale).toBe('fr');
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/testing/fakes.spec.ts`
Expected: FAIL, « Failed to resolve import "./fakes" ».

- [ ] **Step 3: Écrire les doublures**

```ts
import {
	DEFAULT_SETTINGS,
	type Attempt,
	type CardKey,
	type CardState,
	type SessionRecord,
	type Settings,
	type Verdict
} from '$lib/domain/types';
import type {
	AttemptRepositoryPort,
	AudioClockPort,
	AudioInputDevice,
	BeatEvent,
	CardStateRepositoryPort,
	MetronomePort,
	NoteDetectorPort,
	NoteOnset,
	SessionRepositoryPort,
	SettingsRepositoryPort,
	SoundCuePort
} from '$lib/application/ports';

export class FakeSoundCues implements SoundCuePort {
	readonly played: { verdict: Verdict; time: number | undefined }[] = [];

	play(verdict: Verdict, time?: number): void {
		this.played.push({ verdict, time });
	}
}

export class FakeClock implements AudioClockPort {
	time = 0;
	epochAtZero = Date.UTC(2026, 0, 1);

	async resume(): Promise<void> {}

	now(): number {
		return this.time;
	}

	toEpochMs(audioTime: number): number {
		return this.epochAtZero + audioTime * 1000;
	}

	advance(seconds: number): void {
		this.time += seconds;
	}
}

export class FakeMetronome implements MetronomePort {
	private bpm = 80;
	private firstBeatTime: number | null = null;
	private lastEmitted = -1;
	private readonly listeners = new Set<(beat: BeatEvent) => void>();

	constructor(
		private readonly clock: FakeClock,
		private readonly beatsPerBar = 4
	) {}

	setTempo(bpm: number): void {
		this.bpm = bpm;
	}

	getTempo(): number {
		return this.bpm;
	}

	secondsPerBeat(): number {
		return 60 / this.bpm;
	}

	start(firstBeatTime: number): void {
		this.firstBeatTime = firstBeatTime;
		this.lastEmitted = -1;
	}

	stop(): void {
		this.firstBeatTime = null;
	}

	isRunning(): boolean {
		return this.firstBeatTime !== null;
	}

	beatTime(index: number): number {
		if (this.firstBeatTime === null) throw new Error('Metronome not running');
		return this.firstBeatTime + index * this.secondsPerBeat();
	}

	onBeat(callback: (beat: BeatEvent) => void): () => void {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	/** Emits every beat whose audio time has passed. */
	flush(): void {
		if (this.firstBeatTime === null) return;
		while (this.beatTime(this.lastEmitted + 1) <= this.clock.now()) {
			this.lastEmitted++;
			const beat: BeatEvent = {
				index: this.lastEmitted,
				time: this.beatTime(this.lastEmitted),
				isDownbeat: this.lastEmitted % this.beatsPerBar === 0
			};
			this.listeners.forEach((listener) => listener(beat));
		}
	}
}

export class FakeNoteDetector implements NoteDetectorPort {
	running = false;
	deviceId: string | null = null;
	private readonly noteListeners = new Set<(onset: NoteOnset) => void>();
	private readonly levelListeners = new Set<(rms: number) => void>();

	async listInputs(): Promise<AudioInputDevice[]> {
		return [{ id: 'fake-input', label: 'Fake input' }];
	}

	async start(deviceId: string | null): Promise<void> {
		this.running = true;
		this.deviceId = deviceId;
	}

	stop(): void {
		this.running = false;
	}

	onNote(callback: (onset: NoteOnset) => void): () => void {
		this.noteListeners.add(callback);
		return () => this.noteListeners.delete(callback);
	}

	onLevel(callback: (rms: number) => void): () => void {
		this.levelListeners.add(callback);
		return () => this.levelListeners.delete(callback);
	}

	emitNote(onset: NoteOnset): void {
		if (!this.running) return;
		this.noteListeners.forEach((listener) => listener(onset));
	}

	emitLevel(rms: number): void {
		if (!this.running) return;
		this.levelListeners.forEach((listener) => listener(rms));
	}
}

function byPromptedAt(a: Attempt, b: Attempt): number {
	return a.promptedAt - b.promptedAt;
}

export class InMemoryAttemptRepository implements AttemptRepositoryPort {
	private readonly attempts: Attempt[] = [];

	async add(attempt: Attempt): Promise<number> {
		const id = this.attempts.length + 1;
		this.attempts.push({ ...attempt, id });
		return id;
	}

	async listByCard(key: CardKey): Promise<Attempt[]> {
		return this.attempts.filter((a) => a.cardKey === key).sort(byPromptedAt);
	}

	async listBySession(sessionId: string): Promise<Attempt[]> {
		return this.attempts.filter((a) => a.sessionId === sessionId).sort(byPromptedAt);
	}

	async listSince(epochMs: number): Promise<Attempt[]> {
		return this.attempts.filter((a) => a.promptedAt >= epochMs).sort(byPromptedAt);
	}

	async all(): Promise<Attempt[]> {
		return [...this.attempts].sort(byPromptedAt);
	}
}

export class InMemoryCardStateRepository implements CardStateRepositoryPort {
	private readonly states = new Map<CardKey, CardState>();

	async get(key: CardKey): Promise<CardState | undefined> {
		return this.states.get(key);
	}

	async put(state: CardState): Promise<void> {
		this.states.set(state.key, state);
	}

	async putMany(states: CardState[]): Promise<void> {
		states.forEach((state) => this.states.set(state.key, state));
	}

	async all(): Promise<CardState[]> {
		return [...this.states.values()];
	}
}

export class InMemorySessionRepository implements SessionRepositoryPort {
	private readonly records = new Map<string, SessionRecord>();

	async put(record: SessionRecord): Promise<void> {
		this.records.set(record.id, record);
	}

	async get(id: string): Promise<SessionRecord | undefined> {
		return this.records.get(id);
	}

	async list(): Promise<SessionRecord[]> {
		return [...this.records.values()].sort((a, b) => a.startedAt - b.startedAt);
	}
}

export class InMemorySettingsRepository implements SettingsRepositoryPort {
	private stored: Partial<Settings> = {};

	async get(): Promise<Settings> {
		return { ...DEFAULT_SETTINGS, ...this.stored };
	}

	async update(patch: Partial<Settings>): Promise<Settings> {
		this.stored = { ...this.stored, ...patch };
		return this.get();
	}
}
```

- [ ] **Step 4: Lancer tous les tests et la vérification de types**

Run: `npm test && npm run check`
Expected: tous les tests PASS, `svelte-check found 0 errors`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/testing
git commit -m "test: add shared fakes for ports"
```

---

## Fin du plan

À la fin de ce plan, `main` porte le socle. Les plans de la vague 1 partent de ce commit, chacun dans sa propre branche (voir `docs/superpowers/plans/README.md`).
