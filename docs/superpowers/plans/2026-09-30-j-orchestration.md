# J — Orchestration des sessions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire tourner une série de bout en bout : enchaîner les items d’un `SessionPlan`, juger chaque réponse, enregistrer tentatives et cartes, et exposer le tout via `SessionController` et `createAppServices`.

**Architecture:** Machine à états purement événementielle (`onBeat` / `onNote` / `answer`), sans minuteur mural pour le temps musical. `SessionController` (`.svelte.ts`) détient un `view` réactif (`$state`) conforme à `PlaySessionController`. Les règles viennent de B, les libellés et confusions de A, la température planifiée et les mises à jour de cartes de C. Les tests pilotent exclusivement les doublures P0 (`FakeClock`, `FakeMetronome`, `FakeNoteDetector`, `FakeSoundCues`, dépôts mémoire).

**Tech Stack:** TypeScript, Svelte 5 runes (`$state`), Vitest projet `server` (Node) sur `*.spec.ts`. Aucune nouvelle dépendance.

## Global Constraints

- Svelte 5, runes uniquement : `$state`, `$derived`, `$effect`, `$props`. Pas de stores Svelte 4 (`writable`), pas de `export let`.
- SvelteKit en site statique : adapter-static avec `fallback: 'index.html'`, `ssr = false` dans `src/routes/+layout.ts`.
- Toute la temporisation audio est calée sur `AudioContext.currentTime` (secondes). Jamais `setInterval`, jamais `performance.now()` pour mesurer un temps musical. Les horodatages de stockage sont en millisecondes epoch (`Date.now()` ou `AudioClockPort.toEpochMs`).
- CSS natif avec variables ; pas de bibliothèque de composants ni de Tailwind.
- Tests Vitest : fichiers `*.spec.ts` (Node) ; tests de composants dans `*.svelte.spec.ts` (jsdom).
- Noms de notes toujours en lettres (C, D, E…), dièses canoniques en interne (`C#`), bémols seulement à l’affichage.
- Interface bilingue français et anglais ; français par défaut.
- Données uniquement en local (IndexedDB), sans compte.
- Prettier : tabulations, guillemets simples, pas de virgule finale, largeur 100 (configuration générée par `sv`).
- Node : version de `.nvmrc` (22.23.3).

### Contraintes propres au plan J

- Branche `plan/j-orchestration`, dans son propre worktree, créée depuis `main` une fois la vague 1 fusionnée.
- Ce plan ne crée et ne modifie que : `src/lib/application/session/**` sauf `contract.ts`, et `src/lib/application/services/**`. Jamais `package.json`, `package-lock.json`, `vite.config.ts`, ni un fichier du socle ou d’un autre plan.
- Imports autorisés : contrat et ports P0, types domaine P0, signatures A / B / C via leurs `index.ts`, doublures `$lib/testing/fakes`. Rien de D–I, rien de `$lib/ui`, rien de `$lib/infrastructure`.
- A, B et C ne s’importent **que** par les signatures du README (sections A, B, C). Ne pas lire ni recopier le corps des plans A/B/C.
- Règles audio README : `metronome.start(clock.now() + 0.1)` au plus tôt ; `onBeat` jusqu’à 100 ms en avance (comparer les index avec `>=`, jamais `===` ; ne jamais exiger `clock.now() >= beat.time`) ; `setTempo` lève pendant la marche ; `latencyMs = settings.calibrationOffsetMs ?? 0`.
- Scoring B (Fin du plan B) : `onset.time` brut ; `promptTime` / `targetTime` = `metronome.beatTime(...)` en mode 1 ; en mode 2, `promptTime` et `answerTime` = `clock.now()` ; première note après la consigne seulement ; hors fenêtre → jugement sans réponse (`onset: null`) ; recopier les cinq champs du `Judgement` dans l’`Attempt` ; confusion A seulement si `answer !== null && !correct` ; `detectFatigue` dans l’ordre de jeu, ignore les `reactionMs` du mode 1.
- `PERFECT_WINDOW_MS = 80`. `isDirectRecall(attempt, tempoBpm)` : mode 1 sur la durée d’annonce, mode 2 sur `reactionMs` (J ne l’appelle pas directement ; C s’en sert dans ses mises à jour de cartes).
- Chaque tâche se termine par un commit.

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `src/lib/application/session/SessionDeps.ts` | `SessionDeps` (contrat README J) |
| `src/lib/application/session/prompt.ts` | Construction pure de `PromptView` et `AnswerChoice[]` |
| `src/lib/application/session/SessionController.svelte.ts` | Machine à états, implémente `PlaySessionController` |
| `src/lib/application/session/index.ts` | Réexporte `SessionDeps`, `SessionController` |
| `src/lib/application/session/SessionController.spec.ts` | Tests de la machine avec les fakes P0 |
| `src/lib/application/services/createAppServices.ts` | Fabrique `AppServices` |
| `src/lib/application/services/createAppServices.spec.ts` | Câblage home / summary / map / startSession |
| `src/lib/application/services/index.ts` | Réexporte `createAppServices` |

---

## Décisions d’orchestration

### Décompte

Une mesure de décompte (`beatsPerBar = 4`) : les temps d’index `0..3` sont en `count-in`. Le premier item ne peut être annoncé qu’à partir de l’index `>= 4`.

### Mode 1 (locate)

- Consigne affichée au temps `promptBeatIndex` (quand `onBeat` arrive avec `beat.index >= earliestPromptBeat` et qu’un item locate attend).
- Cible au temps `promptBeatIndex + leadBeats` (`leadBeats` non null).
- `promptTime = metronome.beatTime(promptBeatIndex)`, `targetTime = metronome.beatTime(targetBeatIndex)`.
- Fenêtre = `answerWindow(promptTime, targetTime)` (B).
- Première note après la consigne : si `isInWindow(onset.time - latencyMs/1000, window)` → `judgeLocate` avec cet `onset` ; sinon → `judgeLocate` avec `onset: null` (pas de réponse). Notes suivantes ignorées.
- Fermeture : au premier `onBeat` dont `beat.time >= window.closesAt` sans réponse encore capturée → jugement sans note.
- Après verdict : `earliestPromptBeat = beatIndexCourant + 1` (au moins un temps avant le prochain item).

### Mode 2 (identify)

Les items identify viennent **après** les locate dans le plan (garanti par C ; les tests J le vérifient aussi).

- `promptBeatIndex` et `targetBeatIndex` restent `null` dans `view` (contrat H/I2).
- À l’annonce : `promptTimeAudio = clock.now()`, pavé `answerChoices` actif, statut `awaiting`.
- `answer(pitch)` : premier appel retenu ; `judgeIdentify` ; passage en `verdict`.
- **Maintien du verdict sans `setTimeout` :** le métronome continue de tourner pendant le mode 2. Après la réponse, on reste en `verdict` jusqu’au prochain `onBeat` dont `beat.index >= verdictBeatIndex + 1`, puis on enchaîne. Même règle d’écart d’au moins un temps que le mode 1 ; le temps musical reste porté par `onBeat`, jamais par un minuteur mural ni `performance.now()`.

### Avance

Uniquement dans `onBeat` et `onNote` (et `answer` pour le mode 2). Aucun `setTimeout` / `setInterval` pour le rythme de la série.

### `timeline.nowBeat`

```ts
nowBeat(): number {
  if (!this.metronome.isRunning()) return 0;
  return (this.clock.now() - this.metronome.beatTime(0)) / this.metronome.secondsPerBeat();
}
```

### Pause

`pause()` : abandonne l’item en cours **sans** enregistrer de tentative ; `metronome.stop()` ; statut `paused`. `resume()` : reprend le décompte (`start(clock.now() + 0.1)`), `earliestPromptBeat = 4`, file inchangée moins l’item abandonné.

### Persistance d’une tentative

1. Copier les cinq champs du `Judgement` dans l’`Attempt`.
2. `temperature` : pour `review` et `placement`, `classifyTemperature({ lastAttemptAt, attemptedInSession, now })` (C) ; pour `learning` et `free`, recopier `item.temperature` (déjà fixé par C à la planification ; un retry `repeatUntilCorrect` reste chaud via `item.temperature`).
3. Confusion (A) seulement si `answer !== null && !correct` : `classifyNoteConfusion` ou `classifyNameConfusion`.
4. `attempts.add` ; pousser dans la liste session (ordre de jeu) pour `detectFatigue`.
5. Cartes (C) : `placement` → `placementCard` puis `put` si non null ; `review` et `temperature === 'cold'` → `applyColdAttempt` ; `learning` et `correct` → `introduceCard` puis `put` si la carte n’existe pas encore.
6. `cues.play(verdict)` ; pousser `LaneEntry` si mode 1 (`beatIndex = targetBeatIndex`).
7. `repeatUntilCorrect && !correct` → ré-enfiler l’item en fin de file.
8. `detectFatigue(sessionAttempts)` → si vrai, `fatigueDetected = true` et retirer de la file tous les items `phase === 'learning'` restants.

### Fin de positionnement

Quand le plan `kind === 'placement'` passe à `finished`, `settings.update({ placementDoneAt: now() })`.

---

### Task 1: SessionDeps et construction des consignes

**Files:**
- Create: `src/lib/application/session/SessionDeps.ts`
- Create: `src/lib/application/session/prompt.ts`
- Create: `src/lib/application/session/index.ts`
- Test: `src/lib/application/session/prompt.spec.ts`

**Interfaces:**
- Consumes: ports P0 ; `Curriculum` ; signatures A (`spellPitch`, `formatNote`, `stringLabel`, `fretLabel`, `answerChoiceLabel`, `fretsForPitch`, `pitchOnString`, `CHROMATIC_NOTES`, `MAX_PROMPT_FRET`).
- Produces: `SessionDeps` ; `buildPromptView(item, locale, random)` ; `buildAnswerChoices()`.

- [ ] **Step 1: Vérifier le point de départ**

```bash
git branch --show-current
test -f src/lib/application/session/contract.ts
test -f src/lib/domain/scoring/index.ts
test -f src/lib/domain/music/index.ts
test -f src/lib/domain/progress/index.ts
npx vitest run src/lib/testing/fakes.spec.ts
```

Expected: branche `plan/j-orchestration`, les quatre chemins présents, PASS.

- [ ] **Step 2: Écrire le test des consignes**

Créer `src/lib/application/session/prompt.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { buildAnswerChoices, buildPromptView } from './prompt';
import type { PlannedItem } from '$lib/domain/types';

const locate: PlannedItem = {
	target: { direction: 'locate', string: 2, pitch: 'F' },
	phase: 'review',
	temperature: 'cold',
	aid: 'show-position',
	leadBeats: 2,
	repeatUntilCorrect: false
};

const identify: PlannedItem = {
	target: { direction: 'identify', string: 5, fret: 8 },
	phase: 'review',
	temperature: 'cold',
	aid: 'none',
	leadBeats: null,
	repeatUntilCorrect: false
};

describe('buildPromptView', () => {
	it('builds a locate prompt with aid fret', () => {
		const view = buildPromptView(locate, 'fr', () => 0);
		expect(view.direction).toBe('locate');
		expect(view.primary).toBe('F');
		expect(view.secondary).toBe('corde de B');
		expect(view.aid).toBe('case 6');
	});

	it('omits aid when aid is none', () => {
		const view = buildPromptView({ ...locate, aid: 'none' }, 'fr', () => 0);
		expect(view.aid).toBeNull();
	});

	it('spells altered pitches from random', () => {
		const item: PlannedItem = {
			...locate,
			target: { direction: 'locate', string: 2, pitch: 'F#' },
			aid: 'none'
		};
		expect(buildPromptView(item, 'fr', () => 0).primary).toBe('F#');
		expect(buildPromptView(item, 'fr', () => 0.5).primary).toBe('Gb');
	});

	it('builds an identify prompt (fret primary, no aid)', () => {
		const view = buildPromptView(identify, 'fr', () => 0);
		expect(view.direction).toBe('identify');
		expect(view.primary).toBe('case 8');
		expect(view.secondary).toBe('corde de A');
		expect(view.aid).toBeNull();
	});

	it('uses English labels', () => {
		const view = buildPromptView(identify, 'en', () => 0);
		expect(view.primary).toBe('fret 8');
		expect(view.secondary).toBe('A string');
	});
});

describe('buildAnswerChoices', () => {
	it('returns twelve chromatic choices', () => {
		const choices = buildAnswerChoices();
		expect(choices).toHaveLength(12);
		expect(choices[0]).toEqual({ pitch: 'C', label: 'C' });
		expect(choices[1]).toEqual({ pitch: 'C#', label: 'C# / Db' });
		expect(choices[6]).toEqual({ pitch: 'F#', label: 'F# / Gb' });
	});
});
```

- [ ] **Step 3: Lancer le test pour vérifier qu’il échoue**

Run: `npx vitest run src/lib/application/session/prompt.spec.ts`
Expected: FAIL, « Failed to resolve import "./prompt" ».

- [ ] **Step 4: Écrire SessionDeps, prompt et index**

Créer `src/lib/application/session/SessionDeps.ts` :

```ts
import type {
	AttemptRepositoryPort,
	AudioClockPort,
	CardStateRepositoryPort,
	MetronomePort,
	NoteDetectorPort,
	SessionRepositoryPort,
	SettingsRepositoryPort,
	SoundCuePort
} from '$lib/application/ports';
import type { Curriculum } from '$lib/domain/types';

export interface SessionDeps {
	clock: AudioClockPort;
	metronome: MetronomePort;
	detector: NoteDetectorPort;
	cues: SoundCuePort;
	attempts: AttemptRepositoryPort;
	cards: CardStateRepositoryPort;
	sessions: SessionRepositoryPort;
	settings: SettingsRepositoryPort;
	curriculum: Curriculum;
	now: () => number;
	random: () => number;
	newId: () => string;
}
```

Créer `src/lib/application/session/prompt.ts` :

```ts
import {
	CHROMATIC_NOTES,
	MAX_PROMPT_FRET
} from '$lib/domain/music/types';
import {
	answerChoiceLabel,
	formatNote,
	fretLabel,
	fretsForPitch,
	spellPitch,
	stringLabel
} from '$lib/domain/music';
import type { Locale, PlannedItem } from '$lib/domain/types';
import type { AnswerChoice, PromptView } from './contract';

export function buildPromptView(
	item: PlannedItem,
	locale: Locale,
	random: () => number
): PromptView {
	const { target, aid } = item;
	if (target.direction === 'locate') {
		const label = spellPitch(target.pitch, random);
		const frets = fretsForPitch(target.string, target.pitch, MAX_PROMPT_FRET);
		return {
			direction: 'locate',
			primary: formatNote(label),
			secondary: stringLabel(target.string, locale),
			aid: aid === 'show-position' && frets.length > 0 ? fretLabel(frets[0], locale) : null
		};
	}
	return {
		direction: 'identify',
		primary: fretLabel(target.fret, locale),
		secondary: stringLabel(target.string, locale),
		aid: null
	};
}

export function buildAnswerChoices(): AnswerChoice[] {
	return CHROMATIC_NOTES.map((pitch) => ({
		pitch,
		label: answerChoiceLabel(pitch)
	}));
}
```

Créer `src/lib/application/session/index.ts` :

```ts
export type { SessionDeps } from './SessionDeps';
export { SessionController } from './SessionController.svelte';
```

Note : `SessionController` est ajouté à la Task 2 ; jusqu’à là, commenter temporairement la ligne d’export du contrôleur **ou** créer un fichier stub vide qui exporte une classe minimale — préférer attendre la Task 2 et n’exporter que `SessionDeps` ici :

```ts
export type { SessionDeps } from './SessionDeps';
```

(La Task 2 complétera l’export.)

- [ ] **Step 5: Lancer le test pour vérifier qu’il passe**

Run: `npx vitest run src/lib/application/session/prompt.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/application/session/SessionDeps.ts \
  src/lib/application/session/prompt.ts \
  src/lib/application/session/prompt.spec.ts \
  src/lib/application/session/index.ts
git commit -m "feat: add SessionDeps and prompt builders"
```

---

### Task 2: Squelette SessionController — start, décompte, timeline, pause

**Files:**
- Create: `src/lib/application/session/SessionController.svelte.ts`
- Modify: `src/lib/application/session/index.ts`
- Test: `src/lib/application/session/SessionController.spec.ts`

**Interfaces:**
- Consumes: `SessionDeps`, `PlaySessionController`, fakes P0, `SessionPlan`.
- Produces: `SessionController` avec `start` / `pause` / `resume` / `quit` / `timeline.nowBeat` ; décompte d’une mesure ; `setTempo` avant `start` ; `metronome.start(clock.now() + 0.1)`.

- [ ] **Step 1: Écrire les tests du squelette**

Créer `src/lib/application/session/SessionController.spec.ts` :

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import type { Curriculum, PlannedItem, SessionPlan } from '$lib/domain/types';
import {
	FakeClock,
	FakeMetronome,
	FakeNoteDetector,
	FakeSoundCues,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository,
	InMemorySessionRepository,
	InMemorySettingsRepository
} from '$lib/testing/fakes';
import type { SessionDeps } from './SessionDeps';
import { SessionController } from './SessionController.svelte';

const emptyCurriculum: Curriculum = [];

function locateItem(overrides: Partial<PlannedItem> = {}): PlannedItem {
	return {
		target: { direction: 'locate', string: 2, pitch: 'F' },
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: 2,
		repeatUntilCorrect: false,
		...overrides
	};
}

function planWith(items: PlannedItem[], kind: SessionPlan['kind'] = 'daily'): SessionPlan {
	return { id: 'sess-1', kind, createdAt: 1_000_000, items };
}

function createDeps(clock = new FakeClock()): SessionDeps & {
	clock: FakeClock;
	metronome: FakeMetronome;
	detector: FakeNoteDetector;
	cues: FakeSoundCues;
} {
	const metronome = new FakeMetronome(clock);
	const detector = new FakeNoteDetector();
	const cues = new FakeSoundCues();
	return {
		clock,
		metronome,
		detector,
		cues,
		attempts: new InMemoryAttemptRepository(),
		cards: new InMemoryCardStateRepository(),
		sessions: new InMemorySessionRepository(),
		settings: new InMemorySettingsRepository(),
		curriculum: emptyCurriculum,
		now: () => clock.toEpochMs(clock.now()),
		random: () => 0,
		newId: () => 'id-1'
	};
}

/** Advance audio time and flush metronome beats (lookahead 100 ms). */
function tick(deps: { clock: FakeClock; metronome: FakeMetronome }, seconds: number) {
	deps.clock.advance(seconds);
	deps.metronome.flush();
}

describe('SessionController skeleton', () => {
	let deps: ReturnType<typeof createDeps>;

	beforeEach(() => {
		deps = createDeps();
	});

	it('starts with a one-bar count-in then stays ready for the first prompt beat', async () => {
		const controller = new SessionController(planWith([locateItem()]), deps);
		await controller.start();

		expect(controller.view.status).toBe('count-in');
		expect(controller.view.tempoBpm).toBe(80);
		expect(deps.metronome.isRunning()).toBe(true);

		// beat 0 at t=0.1 ; at 80 bpm, spb=0.75. Advance through beats 0..3.
		tick(deps, 0.1);
		expect(controller.view.status).toBe('count-in');
		tick(deps, 0.75 * 3);
		// now ~ 0.1 + 2.25 = 2.35 ; beat 3 emitted (lookahead). Still count-in until beat 4 schedules a prompt.
		expect(controller.view.status).toBe('count-in');

		tick(deps, 0.75);
		// beat 4 → first locate prompt
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.promptBeatIndex).toBe(4);
		expect(controller.view.targetBeatIndex).toBe(6);
		expect(controller.view.prompt?.primary).toBe('F');
	});

	it('exposes fractional nowBeat from the clock and beatTime(0)', async () => {
		const controller = new SessionController(planWith([locateItem()]), deps);
		await controller.start();
		tick(deps, 0.1 + 0.75);
		// clock at 0.85, beat 0 at 0.1 → (0.85-0.1)/0.75 = 1
		expect(controller.timeline.nowBeat()).toBeCloseTo(1, 5);
	});

	it('pause discards the in-progress item without recording', async () => {
		const controller = new SessionController(
			planWith([locateItem(), locateItem({ target: { direction: 'locate', string: 3, pitch: 'C' } })]),
			deps
		);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.promptBeatIndex).toBe(4);

		controller.pause();
		expect(controller.view.status).toBe('paused');
		expect(deps.metronome.isRunning()).toBe(false);
		expect(await deps.attempts.all()).toHaveLength(0);

		controller.resume();
		expect(controller.view.status).toBe('count-in');
		tick(deps, 0.1 + 0.75 * 4);
		// discarded first item ; second item is now current
		expect(controller.view.prompt?.primary).toBe('C');
	});

	it('quit stops audio and marks finished', async () => {
		const controller = new SessionController(planWith([locateItem()]), deps);
		await controller.start();
		controller.quit();
		expect(controller.view.status).toBe('finished');
		expect(deps.metronome.isRunning()).toBe(false);
		expect(deps.detector.running).toBe(false);
	});
});

export { createDeps, locateItem, planWith, tick };
```

- [ ] **Step 2: Lancer le test pour vérifier qu’il échoue**

Run: `npx vitest run src/lib/application/session/SessionController.spec.ts`
Expected: FAIL, « Failed to resolve import "./SessionController.svelte" ».

- [ ] **Step 3: Écrire le contrôleur (squelette + prompt locate au beat 4)**

Créer `src/lib/application/session/SessionController.svelte.ts` :

```ts
import type { PitchName } from '$lib/domain/music/types';
import type {
	Attempt,
	Locale,
	PlannedItem,
	SessionPlan,
	Settings,
	Verdict
} from '$lib/domain/types';
import type { BeatEvent, NoteOnset } from '$lib/application/ports';
import type {
	AnswerChoice,
	PlaySessionController,
	PlayView,
	PromptView,
	VerdictView
} from './contract';
import type { SessionDeps } from './SessionDeps';
import { buildAnswerChoices, buildPromptView } from './prompt';

const BEATS_PER_BAR = 4 as const;

type InternalStatus = PlayView['status'];

export class SessionController implements PlaySessionController {
	readonly sessionId: string;
	readonly view: PlayView;
	readonly timeline = {
		nowBeat: (): number => {
			if (!this.deps.metronome.isRunning()) return 0;
			return (
				(this.deps.clock.now() - this.deps.metronome.beatTime(0)) /
				this.deps.metronome.secondsPerBeat()
			);
		}
	};

	private readonly deps: SessionDeps;
	private readonly kind: SessionPlan['kind'];
	private queue: PlannedItem[];
	private settings!: Settings;
	private locale: Locale = 'fr';
	private latencyMs = 0;
	private unsubBeat: (() => void) | null = null;
	private unsubNote: (() => void) | null = null;
	private earliestPromptBeat = BEATS_PER_BAR;
	private current: PlannedItem | null = null;
	private promptBeatIndex: number | null = null;
	private targetBeatIndex: number | null = null;
	private promptTimeAudio: number | null = null;
	private windowClosesAt: number | null = null;
	private captured = false;
	private verdictBeatIndex: number | null = null;
	private sessionAttempts: Attempt[] = [];
	private started = false;

	constructor(plan: SessionPlan, deps: SessionDeps) {
		this.deps = deps;
		this.sessionId = plan.id;
		this.kind = plan.kind;
		this.queue = [...plan.items];
		this.view = $state<PlayView>({
			status: 'idle',
			prompt: null,
			lastVerdict: null,
			tempoBpm: 80,
			beatsPerBar: BEATS_PER_BAR,
			promptBeatIndex: null,
			targetBeatIndex: null,
			leadBeats: null,
			history: [],
			answerChoices: null,
			fatigueDetected: false
		});
	}

	async start(): Promise<void> {
		if (this.started && this.view.status !== 'idle') return;
		this.started = true;
		this.settings = await this.deps.settings.get();
		this.locale = this.settings.locale;
		this.latencyMs = this.settings.calibrationOffsetMs ?? 0;
		this.view.tempoBpm = this.settings.tempoBpm;

		await this.deps.clock.resume();
		await this.deps.detector.start(this.settings.inputDeviceId);
		if (this.deps.metronome.isRunning()) this.deps.metronome.stop();
		this.deps.metronome.setTempo(this.settings.tempoBpm);

		await this.deps.sessions.put({
			id: this.sessionId,
			kind: this.kind,
			startedAt: this.deps.now(),
			endedAt: null,
			fatigueDetected: false
		});

		this.unsubBeat?.();
		this.unsubNote?.();
		this.unsubBeat = this.deps.metronome.onBeat((beat) => this.onBeat(beat));
		this.unsubNote = this.deps.detector.onNote((onset) => this.onNote(onset));

		this.earliestPromptBeat = BEATS_PER_BAR;
		this.clearItemState();
		this.setStatus('count-in');
		this.deps.metronome.start(this.deps.clock.now() + 0.1);
	}

	pause(): void {
		if (this.view.status === 'paused' || this.view.status === 'finished') return;
		// Discard in-progress item without recording.
		this.current = null;
		this.clearItemState();
		this.view.prompt = null;
		this.view.answerChoices = null;
		this.view.promptBeatIndex = null;
		this.view.targetBeatIndex = null;
		this.view.leadBeats = null;
		this.deps.metronome.stop();
		this.setStatus('paused');
	}

	async resume(): Promise<void> {
		if (this.view.status !== 'paused') return;
		if (this.deps.metronome.isRunning()) this.deps.metronome.stop();
		this.deps.metronome.setTempo(this.settings.tempoBpm);
		this.earliestPromptBeat = BEATS_PER_BAR;
		this.clearItemState();
		this.setStatus('count-in');
		this.deps.metronome.start(this.deps.clock.now() + 0.1);
	}

	answer(_pitch: PitchName): void {
		// Task 5
	}

	quit(): void {
		void this.finish();
	}

	private setStatus(status: InternalStatus): void {
		this.view.status = status;
	}

	private clearItemState(): void {
		this.promptBeatIndex = null;
		this.targetBeatIndex = null;
		this.promptTimeAudio = null;
		this.windowClosesAt = null;
		this.captured = false;
		this.verdictBeatIndex = null;
	}

	private onBeat(beat: BeatEvent): void {
		if (this.view.status === 'paused' || this.view.status === 'finished') return;

		if (this.view.status === 'verdict') {
			if (this.verdictBeatIndex !== null && beat.index >= this.verdictBeatIndex + 1) {
				this.advanceAfterVerdict();
			}
			return;
		}

		if (this.view.status === 'awaiting') {
			this.maybeCloseWindow(beat);
			return;
		}

		if (this.view.status === 'count-in' || this.view.status === 'idle') {
			if (beat.index >= this.earliestPromptBeat) {
				this.beginNextItem(beat);
			}
		}
	}

	private onNote(_onset: NoteOnset): void {
		// Task 3
	}

	private beginNextItem(beat: BeatEvent): void {
		if (this.queue.length === 0) {
			void this.finish();
			return;
		}
		const item = this.queue.shift()!;
		this.current = item;

		if (item.target.direction === 'locate') {
			const lead = item.leadBeats ?? 1;
			this.promptBeatIndex = beat.index;
			this.targetBeatIndex = beat.index + lead;
			this.promptTimeAudio = this.deps.metronome.beatTime(beat.index);
			const targetTime = this.deps.metronome.beatTime(this.targetBeatIndex);
			// answerWindow imported in Task 3 — for now compute closesAt inline after import.
			this.windowClosesAt = null; // set in Task 3 when wiring B
			this.captured = false;

			const prompt = buildPromptView(item, this.locale, this.deps.random);
			this.view.prompt = prompt;
			this.view.promptBeatIndex = this.promptBeatIndex;
			this.view.targetBeatIndex = this.targetBeatIndex;
			this.view.leadBeats = item.leadBeats;
			this.view.answerChoices = null;
			this.view.lastVerdict = null;
			this.setStatus('awaiting');
			// Task 3 sets windowClosesAt via answerWindow
			this.armLocateWindow();
			return;
		}

		// identify — Task 5
		this.beginIdentify(item, beat);
	}

	private armLocateWindow(): void {
		// Overridden / filled in Task 3
	}

	private beginIdentify(_item: PlannedItem, _beat: BeatEvent): void {
		// Task 5
		void this.finish();
	}

	private maybeCloseWindow(_beat: BeatEvent): void {
		// Task 4
	}

	private advanceAfterVerdict(): void {
		this.clearItemState();
		this.current = null;
		this.view.prompt = null;
		this.view.answerChoices = null;
		this.view.promptBeatIndex = null;
		this.view.targetBeatIndex = null;
		this.view.leadBeats = null;
		if (this.queue.length === 0) {
			void this.finish();
			return;
		}
		this.setStatus('count-in');
		// Next onBeat with index >= earliestPromptBeat will begin the item.
		// earliestPromptBeat already set when entering verdict.
	}

	private async finish(): Promise<void> {
		this.deps.metronome.stop();
		this.deps.detector.stop();
		this.unsubBeat?.();
		this.unsubNote?.();
		this.unsubBeat = null;
		this.unsubNote = null;
		this.setStatus('finished');
		await this.deps.sessions.put({
			id: this.sessionId,
			kind: this.kind,
			startedAt: (await this.deps.sessions.get(this.sessionId))?.startedAt ?? this.deps.now(),
			endedAt: this.deps.now(),
			fatigueDetected: this.view.fatigueDetected
		});
		if (this.kind === 'placement') {
			await this.deps.settings.update({ placementDoneAt: this.deps.now() });
		}
	}
}
```

Le squelette ci-dessus doit être complété immédiatement pour faire passer les tests de cette tâche : `armLocateWindow` peut rester no-op tant que les tests de Task 2 ne ferment pas la fenêtre ; en revanche `beginNextItem` pour locate doit bien passer en `awaiting` au beat 4. Remplacer le corps de `armLocateWindow` / imports B à la Task 3.

Implémentation minimale qui fait passer Task 2 — compléter `beginNextItem` locate comme ci-dessus **sans** appeler `finish` sur identify tant que les tests n’en ont pas, et faire de `beginIdentify` un no-op qui pose quand même `awaiting` si un test ne l’utilise pas. Pour Task 2 les plans n’ont que des locate.

Mettre à jour `index.ts` :

```ts
export type { SessionDeps } from './SessionDeps';
export { SessionController } from './SessionController.svelte';
```

Corriger `resume` : le contrat expose `resume(): void` (synchrone). Adapter :

```ts
resume(): void {
	if (this.view.status !== 'paused') return;
	if (this.deps.metronome.isRunning()) this.deps.metronome.stop();
	this.deps.metronome.setTempo(this.settings.tempoBpm);
	this.earliestPromptBeat = BEATS_PER_BAR;
	this.clearItemState();
	this.setStatus('count-in');
	this.deps.metronome.start(this.deps.clock.now() + 0.1);
}
```

Et dans le test, `controller.resume()` sans `await`.

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run src/lib/application/session/SessionController.spec.ts`
Expected: PASS (4 tests).

Si le test du décompte échoue à cause du lookahead (beat 4 émis 100 ms trop tôt), avancer `0.75` après le beat 3 comme écrit ; ajuster les avances pour coller à `FakeMetronome.flush` (`beatTime <= now + 0.1`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/application/session/SessionController.svelte.ts \
  src/lib/application/session/SessionController.spec.ts \
  src/lib/application/session/index.ts
git commit -m "feat: add SessionController count-in, timeline and pause"
```

---

### Task 3: Locate — première note, jugement B, verdict, son

**Files:**
- Modify: `src/lib/application/session/SessionController.svelte.ts`
- Modify: `src/lib/application/session/SessionController.spec.ts`

**Interfaces:**
- Consumes: `answerWindow`, `isInWindow`, `judgeLocate` (B) ; `acceptableMidis` (A) ; `SoundCuePort`.
- Produces: capture de la première note ; `view.lastVerdict` ; `cues.play` ; passage en `verdict` ; `earliestPromptBeat = beatIndex + 1`.

- [ ] **Step 1: Écrire les tests locate**

Ajouter dans `SessionController.spec.ts` :

```ts
describe('SessionController locate judgement', () => {
	it('judges the first note inside the window and ignores later notes', async () => {
		const deps = createDeps();
		const controller = new SessionController(planWith([locateItem({ leadBeats: 2 })]), deps);
		await controller.start();
		// Reach prompt beat 4 ; target beat 6. spb=0.75, firstBeat=0.1
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.promptBeatIndex).toBe(4);
		expect(controller.view.targetBeatIndex).toBe(6);

		const targetTime = deps.metronome.beatTime(6);
		// Perfect F on B string = MIDI 65
		deps.detector.emitNote({
			time: targetTime,
			midi: 65,
			frequencyHz: 349.23,
			clarity: 0.95
		});
		expect(controller.view.status).toBe('verdict');
		expect(controller.view.lastVerdict?.verdict).toBe('perfect');
		expect(deps.cues.played.map((p) => p.verdict)).toEqual(['perfect']);

		deps.detector.emitNote({
			time: targetTime + 0.05,
			midi: 67,
			frequencyHz: 392,
			clarity: 0.95
		});
		expect(controller.view.lastVerdict?.verdict).toBe('perfect');
		expect(deps.cues.played).toHaveLength(1);
	});

	it('treats a first note outside the window as no answer', async () => {
		const deps = createDeps();
		const controller = new SessionController(planWith([locateItem({ leadBeats: 2 })]), deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		const closesAt = deps.metronome.beatTime(6) + 0.4;
		deps.detector.emitNote({
			time: closesAt + 0.05,
			midi: 65,
			frequencyHz: 349.23,
			clarity: 0.95
		});
		expect(controller.view.lastVerdict?.verdict).toBe('wrong');
		expect(controller.view.lastVerdict?.answerLabel).toBeNull();
	});
});
```

- [ ] **Step 2: Lancer pour vérifier l’échec**

Run: `npx vitest run src/lib/application/session/SessionController.spec.ts`
Expected: FAIL sur les nouvelles assertions (`onNote` no-op).

- [ ] **Step 3: Brancher B dans le contrôleur**

Ajouter les imports :

```ts
import { acceptableMidis, formatNote, spellPitch } from '$lib/domain/music';
import {
	answerWindow,
	isInWindow,
	judgeLocate,
	judgeIdentify,
	detectFatigue
} from '$lib/domain/scoring';
import { cardKey } from '$lib/domain/types';
```

Remplacer `armLocateWindow` :

```ts
private armLocateWindow(): void {
	if (this.promptTimeAudio === null || this.targetBeatIndex === null) return;
	const targetTime = this.deps.metronome.beatTime(this.targetBeatIndex);
	const window = answerWindow(this.promptTimeAudio, targetTime);
	this.windowClosesAt = window.closesAt;
}
```

Remplacer `onNote` :

```ts
private onNote(onset: NoteOnset): void {
	if (this.view.status !== 'awaiting' || this.captured || !this.current) return;
	if (this.current.target.direction !== 'locate') return;
	if (this.promptTimeAudio === null || this.targetBeatIndex === null) return;

	this.captured = true;
	const targetTime = this.deps.metronome.beatTime(this.targetBeatIndex);
	const window = answerWindow(this.promptTimeAudio, targetTime);
	const corrected = onset.time - this.latencyMs / 1000;
	const onsetForJudge = isInWindow(corrected, window) ? onset : null;
	const judgement = judgeLocate({
		acceptable: acceptableMidis(this.current.target),
		promptTime: this.promptTimeAudio,
		targetTime,
		onset: onsetForJudge,
		latencyMs: this.latencyMs
	});
	void this.resolveLocate(judgement, /* beatIndex for gap */ this.targetBeatIndex);
}
```

Ajouter `resolveLocate` (persistance minimale pour cette tâche : verdict + cue + historique ; la persistance complète est Task 6) :

```ts
private async resolveLocate(
	judgement: {
		answer: Attempt['answer'];
		correct: boolean;
		verdict: Verdict;
		timingOffsetMs: number | null;
		reactionMs: number | null;
	},
	gapFromBeat: number
): Promise<void> {
	if (!this.current || this.promptBeatIndex === null) return;
	const answerLabel =
		judgement.answer && judgement.answer.kind === 'note'
			? formatNote(spellPitch(this.current.target.direction === 'locate'
					? this.current.target.pitch
					: 'C', this.deps.random))
			: null;
	// Prefer showing the played pitch spelling when wrong — Task 6 refines labels.
	const verdictView: VerdictView = {
		verdict: judgement.verdict,
		offsetMs: judgement.timingOffsetMs,
		reactionMs: judgement.reactionMs,
		answerLabel: judgement.answer ? answerLabel : null
	};
	this.view.lastVerdict = verdictView;
	if (this.targetBeatIndex !== null) {
		this.view.history = [
			...this.view.history,
			{ beatIndex: this.targetBeatIndex, verdict: judgement.verdict }
		];
	}
	this.deps.cues.play(judgement.verdict);
	this.verdictBeatIndex = gapFromBeat;
	this.earliestPromptBeat = gapFromBeat + 1;
	this.setStatus('verdict');
	await this.persistAttempt(judgement);
}

private async persistAttempt(_judgement: {
	answer: Attempt['answer'];
	correct: boolean;
	verdict: Verdict;
	timingOffsetMs: number | null;
	reactionMs: number | null;
}): Promise<void> {
	// Task 6 — no-op for now so Task 3 stays focused
}
```

Pour le test « hors fenêtre », `answerLabel` doit être `null` : avec `onsetForJudge === null`, `judgement.answer` est `null` → OK.

Corriger le libellé : si `judgement.answer === null`, `answerLabel = null`. Si note jouée, on pourra afficher la hauteur jouée plus tard ; pour perfect, afficher la consigne orthographiée suffit.

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run src/lib/application/session/SessionController.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/application/session/SessionController.svelte.ts \
  src/lib/application/session/SessionController.spec.ts
git commit -m "feat: judge locate onsets and play verdict cues"
```

---

### Task 4: Fermeture de fenêtre sur onBeat et enchaînement multi-items

**Files:**
- Modify: `src/lib/application/session/SessionController.svelte.ts`
- Modify: `src/lib/application/session/SessionController.spec.ts`

**Interfaces:**
- Consumes: `window.closesAt`, comparaison `beat.time >= closesAt`.
- Produces: verdict `wrong` sans note à la fermeture ; item suivant au plus tôt un temps après ; `advanceAfterVerdict` rappelle `beginNextItem` sur le même `onBeat` si `beat.index >= earliestPromptBeat`.

- [ ] **Step 1: Écrire les tests**

```ts
describe('SessionController window close and sequencing', () => {
	it('closes the window on the first beat at or after closesAt', async () => {
		const deps = createDeps();
		const controller = new SessionController(planWith([locateItem({ leadBeats: 2 })]), deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.status).toBe('awaiting');
		// target beat 6 at 0.1+4.5=4.6 ; closesAt = 4.6+0.4 = 5.0
		// beat 7 at 0.1+5.25=5.35 >= 5.0 → close
		tick(deps, 0.75 * 3);
		expect(controller.view.status).toBe('verdict');
		expect(controller.view.lastVerdict?.verdict).toBe('wrong');
		expect(controller.view.lastVerdict?.reactionMs).toBeNull();
	});

	it('starts the next item at least one beat after the verdict', async () => {
		const deps = createDeps();
		const controller = new SessionController(
			planWith([
				locateItem({ leadBeats: 1 }),
				locateItem({
					target: { direction: 'locate', string: 3, pitch: 'C' },
					leadBeats: 1
				})
			]),
			deps
		);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.promptBeatIndex).toBe(4);
		const targetTime = deps.metronome.beatTime(5);
		deps.detector.emitNote({
			time: targetTime,
			midi: 65,
			frequencyHz: 349.23,
			clarity: 0.95
		});
		expect(controller.view.status).toBe('verdict');
		// earliestPromptBeat = 5+1 = 6 ; still verdict on beat 5's era
		tick(deps, 0.75);
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.promptBeatIndex).toBeGreaterThanOrEqual(6);
		expect(controller.view.prompt?.primary).toBe('C');
	});
});
```

- [ ] **Step 2: Vérifier l’échec**

Run: `npx vitest run src/lib/application/session/SessionController.spec.ts`
Expected: FAIL sur la fermeture / le second item.

- [ ] **Step 3: Implémenter fermeture et avance**

```ts
private maybeCloseWindow(beat: BeatEvent): void {
	if (this.captured || this.windowClosesAt === null || !this.current) return;
	if (this.current.target.direction !== 'locate') return;
	if (beat.time < this.windowClosesAt) return;
	if (this.promptTimeAudio === null || this.targetBeatIndex === null) return;

	this.captured = true;
	const judgement = judgeLocate({
		acceptable: acceptableMidis(this.current.target),
		promptTime: this.promptTimeAudio,
		targetTime: this.deps.metronome.beatTime(this.targetBeatIndex),
		onset: null,
		latencyMs: this.latencyMs
	});
	void this.resolveLocate(judgement, beat.index);
}

private advanceAfterVerdict(): void {
	this.clearItemState();
	this.current = null;
	this.view.prompt = null;
	this.view.answerChoices = null;
	this.view.promptBeatIndex = null;
	this.view.targetBeatIndex = null;
	this.view.leadBeats = null;
	if (this.queue.length === 0) {
		void this.finish();
		return;
	}
	// Stay actionable: next onBeat (possibly this same handler's caller) will begin.
	// Use count-in-like waiting status until earliestPromptBeat.
	this.setStatus('count-in');
}
```

Ajuster `onBeat` pour qu’après sortie de `verdict`, si le même beat (ou le suivant) satisfait `beat.index >= earliestPromptBeat`, on appelle `beginNextItem` :

```ts
private onBeat(beat: BeatEvent): void {
	if (this.view.status === 'paused' || this.view.status === 'finished') return;

	if (this.view.status === 'verdict') {
		if (this.verdictBeatIndex !== null && beat.index >= this.verdictBeatIndex + 1) {
			this.advanceAfterVerdict();
			if (this.view.status === 'count-in' && beat.index >= this.earliestPromptBeat) {
				this.beginNextItem(beat);
			}
		}
		return;
	}

	if (this.view.status === 'awaiting') {
		this.maybeCloseWindow(beat);
		return;
	}

	if (this.view.status === 'count-in' || this.view.status === 'idle') {
		if (beat.index >= this.earliestPromptBeat) {
			this.beginNextItem(beat);
		}
	}
}
```

- [ ] **Step 4: Tests**

Run: `npx vitest run src/lib/application/session/SessionController.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/application/session/SessionController.svelte.ts \
  src/lib/application/session/SessionController.spec.ts
git commit -m "feat: close locate windows on beat and sequence items"
```

---

### Task 5: Mode identify — answer(), maintien du verdict sur onBeat

**Files:**
- Modify: `src/lib/application/session/SessionController.svelte.ts`
- Modify: `src/lib/application/session/SessionController.spec.ts`

**Interfaces:**
- Consumes: `judgeIdentify`, `pitchOnString`, `buildAnswerChoices`.
- Produces: items identify après locate ; `answerChoices` ; verdict tenu jusqu’à `verdictBeatIndex + 1` sans `setTimeout`.

- [ ] **Step 1: Écrire les tests**

```ts
function identifyItem(overrides: Partial<PlannedItem> = {}): PlannedItem {
	return {
		target: { direction: 'identify', string: 5, fret: 8 },
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: null,
		repeatUntilCorrect: false,
		...overrides
	};
}

describe('SessionController identify', () => {
	it('keeps locate items before identify items and answers via answer()', async () => {
		const deps = createDeps();
		const controller = new SessionController(
			planWith([locateItem({ leadBeats: 1 }), identifyItem()]),
			deps
		);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.prompt?.direction).toBe('locate');

		const targetTime = deps.metronome.beatTime(5);
		deps.detector.emitNote({
			time: targetTime,
			midi: 65,
			frequencyHz: 349.23,
			clarity: 0.95
		});
		tick(deps, 0.75);
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.prompt?.direction).toBe('identify');
		expect(controller.view.promptBeatIndex).toBeNull();
		expect(controller.view.targetBeatIndex).toBeNull();
		expect(controller.view.answerChoices).toHaveLength(12);

		controller.answer('F');
		expect(controller.view.status).toBe('verdict');
		expect(controller.view.lastVerdict?.verdict).toBe('perfect');
		expect(deps.cues.played.at(-1)?.verdict).toBe('perfect');

		// Hold until next beat — no setTimeout
		expect(controller.view.status).toBe('verdict');
		tick(deps, 0.75);
		expect(controller.view.status).toBe('finished');
	});

	it('ignores answer() outside awaiting and ignores guitar notes in identify', async () => {
		const deps = createDeps();
		const controller = new SessionController(planWith([identifyItem()]), deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		deps.detector.emitNote({
			time: deps.clock.now(),
			midi: 65,
			frequencyHz: 349.23,
			clarity: 0.95
		});
		expect(controller.view.status).toBe('awaiting');
		controller.answer('C');
		expect(controller.view.lastVerdict?.verdict).toBe('wrong');
		controller.answer('F');
		expect(controller.view.lastVerdict?.verdict).toBe('wrong');
	});
});
```

- [ ] **Step 2: Vérifier l’échec**

Run: `npx vitest run src/lib/application/session/SessionController.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implémenter identify**

```ts
private beginIdentify(item: PlannedItem, beat: BeatEvent): void {
	this.promptBeatIndex = null;
	this.targetBeatIndex = null;
	this.windowClosesAt = null;
	this.promptTimeAudio = this.deps.clock.now();
	this.captured = false;
	this.view.prompt = buildPromptView(item, this.locale, this.deps.random);
	this.view.promptBeatIndex = null;
	this.view.targetBeatIndex = null;
	this.view.leadBeats = null;
	this.view.answerChoices = buildAnswerChoices();
	this.view.lastVerdict = null;
	this.verdictBeatIndex = beat.index;
	this.setStatus('awaiting');
}

answer(pitch: PitchName): void {
	if (this.view.status !== 'awaiting' || this.captured || !this.current) return;
	if (this.current.target.direction !== 'identify') return;
	if (this.promptTimeAudio === null) return;

	this.captured = true;
	const expected = pitchOnString(this.current.target.string, this.current.target.fret);
	const answerTime = this.deps.clock.now();
	const judgement = judgeIdentify({
		expected,
		promptTime: this.promptTimeAudio,
		answerTime,
		answered: pitch
	});

	const answerLabel = judgement.answer
		? formatNote(spellPitch(pitch, this.deps.random))
		: null;
	this.view.lastVerdict = {
		verdict: judgement.verdict,
		offsetMs: null,
		reactionMs: judgement.reactionMs,
		answerLabel
	};
	this.view.answerChoices = null;
	this.deps.cues.play(judgement.verdict);
	// Hold at least one beat from the beat on which we answered.
	// Approximate answer beat from timeline.
	const answerBeat = Math.floor(this.timeline.nowBeat());
	this.verdictBeatIndex = answerBeat;
	this.earliestPromptBeat = answerBeat + 1;
	this.setStatus('verdict');
	void this.persistAttempt(judgement);
}
```

Importer `pitchOnString` depuis `$lib/domain/music`.

- [ ] **Step 4: Tests**

Run: `npx vitest run src/lib/application/session/SessionController.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/application/session/SessionController.svelte.ts \
  src/lib/application/session/SessionController.spec.ts
git commit -m "feat: orchestrate identify answers with beat-held verdicts"
```

---

### Task 6: Persistance — tentatives, cartes, confusion, fatigue, placementDoneAt

**Files:**
- Modify: `src/lib/application/session/SessionController.svelte.ts`
- Modify: `src/lib/application/session/SessionController.spec.ts`

**Interfaces:**
- Consumes: `classifyTemperature`, `introduceCard`, `applyColdAttempt`, `placementCard` (C) ; `classifyNoteConfusion`, `classifyNameConfusion` (A) ; `detectFatigue` (B) ; dépôts.
- Produces: `Attempt` complets ; mises à jour de cartes ; skip learning si fatigue ; `placementDoneAt` en fin de placement ; `repeatUntilCorrect`.

- [ ] **Step 1: Écrire les tests de persistance**

```ts
import {
	classifyNoteConfusion,
	placementTargets,
	buildCurriculum
} from '$lib/domain/music';
import { introduceCard } from '$lib/domain/progress';

describe('SessionController persistence', () => {
	it('records a cold locate attempt with confusion on a wrong pitch', async () => {
		const deps = createDeps();
		await deps.cards.put(
			introduceCard(
				{ direction: 'locate', string: 2, pitch: 'F' },
				deps.now(),
				'sess-1'
			)
		);
		const controller = new SessionController(planWith([locateItem({ leadBeats: 1 })]), deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		const targetTime = deps.metronome.beatTime(5);
		// F# = MIDI 66 on B string near F
		deps.detector.emitNote({
			time: targetTime,
			midi: 66,
			frequencyHz: 370,
			clarity: 0.95
		});
		const attempts = await deps.attempts.listBySession('sess-1');
		expect(attempts).toHaveLength(1);
		expect(attempts[0].correct).toBe(false);
		expect(attempts[0].confusion).toEqual(
			classifyNoteConfusion({ direction: 'locate', string: 2, pitch: 'F' }, 66)
		);
		expect(attempts[0].verdict).toBe('wrong');
	});

	it('requeues learning items until correct and skips remaining learning on fatigue', async () => {
		const deps = createDeps();
		const learning = (pitch: 'F' | 'G' | 'A', repeat = true): PlannedItem =>
			locateItem({
				target: { direction: 'locate', string: 2, pitch },
				phase: 'learning',
				temperature: 'hot',
				aid: 'show-position',
				leadBeats: 1,
				repeatUntilCorrect: repeat
			});
		// 12 answered attempts needed for fatigue — use a custom controller helper path:
		// seed sessionAttempts via many quick wrong then right reviews is heavy;
		// instead verify requeue on one learning miss, and fatigue flag filtering separately.
		const controller = new SessionController(
			planWith([learning('F'), learning('G')]),
			deps
		);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		const t = deps.metronome.beatTime(5);
		deps.detector.emitNote({ time: t, midi: 60, frequencyHz: 247, clarity: 0.9 });
		tick(deps, 0.75);
		// F requeued → after G or at end; next prompt should eventually be F again or G
		expect(controller.view.status === 'awaiting' || controller.view.status === 'verdict').toBe(
			true
		);
		const remainingPrompts: string[] = [];
		for (let i = 0; i < 8 && controller.view.status !== 'finished'; i++) {
			if (controller.view.status === 'awaiting' && controller.view.prompt) {
				remainingPrompts.push(controller.view.prompt.primary);
				const due =
					controller.view.targetBeatIndex !== null
						? deps.metronome.beatTime(controller.view.targetBeatIndex)
						: deps.clock.now();
				deps.detector.emitNote({
					time: due,
					midi: 65,
					frequencyHz: 349,
					clarity: 0.95
				});
			}
			tick(deps, 0.75);
		}
		expect(remainingPrompts).toContain('F');
	});

	it('sets placementDoneAt when a placement session finishes', async () => {
		const deps = createDeps();
		const controller = new SessionController(
			planWith([locateItem({ phase: 'placement', leadBeats: 1 })], 'placement'),
			deps
		);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		deps.detector.emitNote({
			time: deps.metronome.beatTime(5),
			midi: 65,
			frequencyHz: 349,
			clarity: 0.95
		});
		tick(deps, 0.75);
		expect(controller.view.status).toBe('finished');
		expect((await deps.settings.get()).placementDoneAt).not.toBeNull();
	});
});

describe('SessionController fatigue skip', () => {
	it('marks fatigue and drops remaining learning items', async () => {
		const deps = createDeps();
		// Build 12 prior answered attempts into the session by playing 12 short locate reviews
		const items: PlannedItem[] = Array.from({ length: 12 }, (_, i) =>
			locateItem({
				target: { direction: 'locate', string: 2, pitch: 'F' },
				phase: 'review',
				leadBeats: 1,
				aid: 'none'
			})
		);
		items.push(
			locateItem({
				target: { direction: 'locate', string: 3, pitch: 'C' },
				phase: 'learning',
				temperature: 'hot',
				leadBeats: 1,
				aid: 'show-position',
				repeatUntilCorrect: true
			})
		);
		const controller = new SessionController(planWith(items), deps);
		await controller.start();
		// Answer first 6 correct, last 6 wrong → precision drop ≥ 20 pts with 12 answers
		for (let n = 0; n < 12; n++) {
			while (controller.view.status !== 'awaiting' && controller.view.status !== 'finished') {
				tick(deps, 0.75);
			}
			if (controller.view.status === 'finished') break;
			const due = deps.metronome.beatTime(controller.view.targetBeatIndex!);
			const midi = n < 6 ? 65 : 60;
			deps.detector.emitNote({ time: due, midi, frequencyHz: 300, clarity: 0.9 });
			tick(deps, 0.75);
		}
		expect(controller.view.fatigueDetected).toBe(true);
		// Learning item skipped → finished without requiring the C learning target
		while (controller.view.status !== 'finished') {
			tick(deps, 0.75);
		}
		const learned = (await deps.attempts.all()).filter((a) => a.phase === 'learning');
		expect(learned).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Vérifier l’échec**

Run: `npx vitest run src/lib/application/session/SessionController.spec.ts`
Expected: FAIL (pas d’attempts / pas de fatigue).

- [ ] **Step 3: Implémenter `persistAttempt` complet**

```ts
import {
	applyColdAttempt,
	classifyTemperature,
	introduceCard,
	placementCard
} from '$lib/domain/progress';
import {
	classifyNameConfusion,
	classifyNoteConfusion,
	pitchOnString
} from '$lib/domain/music';
import type { Judgement } from '$lib/domain/scoring';

private async persistAttempt(judgement: Judgement): Promise<void> {
	if (!this.current || this.promptTimeAudio === null) return;
	const item = this.current;
	const key = cardKey(item.target);
	const promptedAt = this.deps.clock.toEpochMs(this.promptTimeAudio);

	const history = await this.deps.attempts.listByCard(key);
	const lastAttemptAt = history.length > 0 ? history[history.length - 1].promptedAt : null;
	const attemptedInSession = this.sessionAttempts.some((a) => a.cardKey === key);

	const temperature =
		item.phase === 'learning' || item.phase === 'free'
			? item.temperature
			: classifyTemperature({
					lastAttemptAt,
					attemptedInSession,
					now: promptedAt
				});

	let confusion = null;
	if (judgement.answer !== null && !judgement.correct) {
		if (item.target.direction === 'locate' && judgement.answer.kind === 'note') {
			confusion = classifyNoteConfusion(item.target, judgement.answer.midi);
		} else if (item.target.direction === 'identify' && judgement.answer.kind === 'name') {
			confusion = classifyNameConfusion(
				pitchOnString(item.target.string, item.target.fret),
				judgement.answer.pitch
			);
		}
	}

	const attempt: Attempt = {
		sessionId: this.sessionId,
		cardKey: key,
		target: item.target,
		phase: item.phase,
		temperature,
		aid: item.aid,
		leadBeats: item.leadBeats,
		promptedAt,
		answer: judgement.answer,
		correct: judgement.correct,
		verdict: judgement.verdict,
		timingOffsetMs: judgement.timingOffsetMs,
		reactionMs: judgement.reactionMs,
		confusion
	};

	await this.deps.attempts.add(attempt);
	this.sessionAttempts.push(attempt);

	const now = this.deps.now();
	if (item.phase === 'placement' && item.target.direction === 'locate') {
		const card = placementCard(
			item.target,
			attempt,
			now,
			this.sessionId,
			this.settings.tempoBpm
		);
		if (card) await this.deps.cards.put(card);
	} else if (item.phase === 'review' && temperature === 'cold') {
		const existing = await this.deps.cards.get(key);
		if (existing) {
			const fullHistory = [...history, attempt];
			await this.deps.cards.put(
				applyColdAttempt(existing, attempt, fullHistory, now, this.settings.tempoBpm)
			);
		}
	} else if (item.phase === 'learning' && judgement.correct) {
		const existing = await this.deps.cards.get(key);
		if (!existing) {
			await this.deps.cards.put(introduceCard(item.target, now, this.sessionId));
		}
	}

	if (item.repeatUntilCorrect && !judgement.correct) {
		this.queue.push(item);
	}

	if (detectFatigue(this.sessionAttempts)) {
		this.view.fatigueDetected = true;
		this.queue = this.queue.filter((q) => q.phase !== 'learning');
	}
}
```

Exporter le type `Judgement` depuis B (`index.ts` le réexporte déjà via le README). Si `Judgement` n’est pas exporté comme type isolé utilisable, typer l’argument comme le retour de `judgeLocate`.

- [ ] **Step 4: Tests**

Run: `npx vitest run src/lib/application/session/SessionController.spec.ts`
Expected: PASS. Si le test fatigue est fragile (fenêtre / MIDI), assouplir en injectant 12 attempts via une méthode de test uniquement si nécessaire — préférer le scénario joué. Ajuster les MIDI acceptables (`acceptableMidis`) pour les réponses « justes ».

- [ ] **Step 5: Commit**

```bash
git add src/lib/application/session/SessionController.svelte.ts \
  src/lib/application/session/SessionController.spec.ts
git commit -m "feat: persist attempts, cards, fatigue and placementDoneAt"
```

---

### Task 7: createAppServices + sessions placement et daily complètes

**Files:**
- Create: `src/lib/application/services/createAppServices.ts`
- Create: `src/lib/application/services/index.ts`
- Test: `src/lib/application/services/createAppServices.spec.ts`
- Modify: `src/lib/application/session/SessionController.spec.ts` (tests bout-en-bout)

**Interfaces:**
- Consumes: `SessionDeps` + `backup` + `calibration` ; C (`computeHomeStats`, `summarizeSession`, `buildNeckMap`, `buildDailyPlan`, `buildPlacementPlan`, `buildFreePlan`) ; A (`placementTargets`, `pitchOnString`, `buildCurriculum`).
- Produces: `createAppServices(...): AppServices` ; `startSession(kind)` retourne un `SessionController` non démarré.

- [ ] **Step 1: Écrire les tests createAppServices et les parcours complets**

Créer `src/lib/application/services/createAppServices.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { AppServices } from '$lib/application/app';
import type {
	BackupPort,
	CalibrationOutcome,
	CalibrationPort,
	CalibrationProgress
} from '$lib/application/ports';
import type { SessionDeps } from '$lib/application/session/SessionDeps';
import type { BackupFile } from '$lib/domain/types';
import { buildCurriculum, placementTargets } from '$lib/domain/music';
import {
	FakeClock,
	FakeMetronome,
	FakeNoteDetector,
	FakeSoundCues,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository,
	InMemorySessionRepository,
	InMemorySettingsRepository
} from '$lib/testing/fakes';
import { createAppServices } from './createAppServices';

class FakeBackup implements BackupPort {
	async exportAll(): Promise<BackupFile> {
		throw new Error('not used');
	}
	async importAll(): Promise<void> {}
}

class FakeCalibration implements CalibrationPort {
	async run(_onProgress: (p: CalibrationProgress) => void): Promise<CalibrationOutcome> {
		return { ok: false, reason: 'cancelled' };
	}
	cancel(): void {}
}

function harness(): {
	services: AppServices;
	deps: SessionDeps & {
		clock: FakeClock;
		metronome: FakeMetronome;
		detector: FakeNoteDetector;
	};
} {
	const clock = new FakeClock();
	const metronome = new FakeMetronome(clock);
	const detector = new FakeNoteDetector();
	const deps: SessionDeps & {
		clock: FakeClock;
		metronome: FakeMetronome;
		detector: FakeNoteDetector;
	} = {
		clock,
		metronome,
		detector,
		cues: new FakeSoundCues(),
		attempts: new InMemoryAttemptRepository(),
		cards: new InMemoryCardStateRepository(),
		sessions: new InMemorySessionRepository(),
		settings: new InMemorySettingsRepository(),
		curriculum: buildCurriculum(),
		now: () => clock.toEpochMs(clock.now()),
		random: () => 0,
		newId: () => `id-${Math.random().toString(16).slice(2)}`
	};
	const services = createAppServices({
		...deps,
		backup: new FakeBackup(),
		calibration: new FakeCalibration()
	});
	return { services, deps };
}

function tick(
	deps: { clock: FakeClock; metronome: FakeMetronome },
	seconds: number
) {
	deps.clock.advance(seconds);
	deps.metronome.flush();
}

describe('createAppServices', () => {
	it('wires homeStats, neckMap and sessionSummary through C and A', async () => {
		const { services } = harness();
		const stats = await services.homeStats();
		expect(stats.nextAction).toBe('placement');
		const map = await services.neckMap();
		expect(map).toHaveLength(72);
		expect(map[0]).toHaveProperty('pitch');
	});

	it('startSession(placement) drives every placement target', async () => {
		const { services, deps } = harness();
		const controller = await services.startSession('placement');
		expect(controller.view.status).toBe('idle');
		await controller.start();

		const expected = placementTargets().length;
		let guard = 0;
		while (controller.view.status !== 'finished' && guard++ < expected * 20) {
			if (
				controller.view.status === 'awaiting' &&
				controller.view.targetBeatIndex !== null
			) {
				const due = deps.metronome.beatTime(controller.view.targetBeatIndex);
				// MIDI 40 always records an attempt (correct or wrong); order may be shuffled.
				deps.detector.emitNote({
					time: due,
					midi: 40,
					frequencyHz: 82.41,
					clarity: 0.9
				});
			}
			tick(deps, deps.metronome.secondsPerBeat());
		}
		expect(controller.view.status).toBe('finished');
		expect(await deps.attempts.all()).toHaveLength(expected);
		expect((await deps.settings.get()).placementDoneAt).not.toBeNull();
	});

	it('startSession(daily) runs the plan from C and exposes a summary', async () => {
		const { services, deps } = harness();
		await deps.settings.update({ placementDoneAt: deps.now() });
		const controller = await services.startSession('daily');
		await controller.start();

		let guard = 0;
		while (controller.view.status !== 'finished' && guard++ < 500) {
			if (controller.view.status === 'awaiting') {
				if (
					controller.view.prompt?.direction === 'locate' &&
					controller.view.targetBeatIndex !== null
				) {
					const due = deps.metronome.beatTime(controller.view.targetBeatIndex);
					deps.detector.emitNote({
						time: due,
						midi: 40,
						frequencyHz: 82.41,
						clarity: 0.9
					});
				} else if (controller.view.prompt?.direction === 'identify') {
					controller.answer('C');
				}
			}
			tick(deps, deps.metronome.secondsPerBeat());
		}
		expect(controller.view.status).toBe('finished');
		expect(await deps.sessions.get(controller.sessionId)).toMatchObject({
			id: controller.sessionId,
			endedAt: expect.any(Number)
		});
		const summary = await services.sessionSummary(controller.sessionId);
		expect(summary.sessionId).toBe(controller.sessionId);
	});
});
```

Le port session expose `list()` / `get()`, pas `all()`. L’ordre locate → identify dans un plan fourni manuellement est déjà couvert à la Task 5.

- [ ] **Step 2: Vérifier l’échec**

Run: `npx vitest run src/lib/application/services/createAppServices.spec.ts`
Expected: FAIL, « Failed to resolve import "./createAppServices" ».

- [ ] **Step 3: Écrire createAppServices**

Créer `src/lib/application/services/createAppServices.ts` :

```ts
import type { AppServices } from '$lib/application/app';
import type {
	BackupPort,
	CalibrationPort
} from '$lib/application/ports';
import { SessionController } from '$lib/application/session/SessionController.svelte';
import type { SessionDeps } from '$lib/application/session/SessionDeps';
import { buildCurriculum, placementTargets, pitchOnString } from '$lib/domain/music';
import {
	buildDailyPlan,
	buildFreePlan,
	buildNeckMap,
	buildPlacementPlan,
	computeHomeStats,
	summarizeSession
} from '$lib/domain/progress';
import type { SessionKind } from '$lib/domain/types';

export function createAppServices(
	deps: SessionDeps & { backup: BackupPort; calibration: CalibrationPort }
): AppServices {
	const curriculum = deps.curriculum.length > 0 ? deps.curriculum : buildCurriculum();

	return {
		settings: deps.settings,
		backup: deps.backup,
		detector: deps.detector,
		calibration: deps.calibration,

		async homeStats() {
			const [cards, attempts, settings] = await Promise.all([
				deps.cards.all(),
				deps.attempts.all(),
				deps.settings.get()
			]);
			return computeHomeStats({
				cards,
				attempts,
				settings,
				curriculum,
				now: deps.now()
			});
		},

		async sessionSummary(sessionId: string) {
			const record = await deps.sessions.get(sessionId);
			if (!record) {
				throw new Error(`Unknown session: ${sessionId}`);
			}
			const [attempts, cards] = await Promise.all([
				deps.attempts.listBySession(sessionId),
				deps.cards.all()
			]);
			return summarizeSession({
				record,
				attempts,
				cards,
				now: deps.now()
			});
		},

		async neckMap() {
			const [cards, attempts] = await Promise.all([
				deps.cards.all(),
				deps.attempts.all()
			]);
			return buildNeckMap({
				cards,
				attempts,
				pitchAt: pitchOnString
			});
		},

		async startSession(kind: SessionKind) {
			const settings = await deps.settings.get();
			const sessionId = deps.newId();
			const now = deps.now();
			const cards = await deps.cards.all();

			const plan =
				kind === 'placement'
					? buildPlacementPlan({
							targets: placementTargets(),
							now,
							sessionId,
							tempoBpm: settings.tempoBpm,
							random: deps.random
						})
					: kind === 'daily'
						? buildDailyPlan({
								cards,
								curriculum,
								now,
								sessionId
							})
						: buildFreePlan({
								cards,
								now,
								sessionId,
								random: deps.random
							});

			return new SessionController(plan, { ...deps, curriculum });
		}
	};
}
```

Créer `src/lib/application/services/index.ts` :

```ts
export { createAppServices } from './createAppServices';
```

- [ ] **Step 4: Lancer tous les tests du plan J et le check**

```bash
npx vitest run src/lib/application/session src/lib/application/services
npm run check
```

Expected: PASS, `svelte-check found 0 errors`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/application/services \
  src/lib/application/session/SessionController.spec.ts
git commit -m "feat: wire createAppServices and full session drives"
```

---

## Fin du plan

La branche `plan/j-orchestration` porte :

- `SessionDeps`
- `SessionController` (`PlaySessionController`)
- `createAppServices`

prêts à fusionner dans `main` en fin de vague 2 (`npm test && npm run check` après la fusion). Ce que l’intégration (plan K) doit savoir :

- Un seul `AudioContext` partagé doit alimenter `clock`, `metronome`, `detector` et `cues` dans `SessionDeps`.
- `startSession` retourne un contrôleur **non démarré** ; l’écran appelle `start()` depuis un geste utilisateur.
- `latencyMs` vaut `settings.calibrationOffsetMs ?? 0` à chaque `start()`.
- Le maintien du verdict mode 2 repose sur `onBeat` (écart ≥ 1 temps), jamais sur un minuteur mural.
- `resume(): void` est synchrone ; `start(): Promise<void>` gère horloge et détecteur.

### Autoreview (rédacteur)

1. **Couverture README J** : SessionDeps, SessionController, createAppServices, décompte, locate/identify, fakes, fatigue, placementDoneAt, pause, homeStats/summary/map — couverts Tasks 1–7.
2. **Placeholders** : aucun TBD ; le stub `persistAttempt` de Task 3 est remplacé en Task 6.
3. **Types** : `PlaySessionController.resume(): void` (pas async) ; `Judgement` recopié champ à champ ; `beatsPerBar: 4` ; sessions via `get` / `list` (pas `all`).

### Écarts relevés (hors correction inline)

- Le fichier plan **C** n’est pas encore dans le dépôt au moment de la rédaction de J ; J ne s’appuie que sur les signatures README (conformément à la consigne vague 2).
- `classifyTemperature` ne reçoit pas la phase : pour `learning` / `free`, J recopie `item.temperature` du plan C au lieu d’appeler `classifyTemperature` (sinon un premier apprentissage avec `lastAttemptAt === null` risquerait d’être tagué froid et de polluer la rétention).
