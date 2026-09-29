# B — Règles de jeu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Écrire les règles de jugement du prototype : fenêtre de réponse et verdict du mode 1, verdict du mode 2, rappel direct et détection de la fatigue, en fonctions pures testées.

**Architecture:** Module de domaine pur `src/lib/domain/scoring/`, sans état, sans horloge, sans hasard. Les fonctions reçoivent des temps en secondes de l'horloge audio et rendent un `Judgement` en millisecondes entières, que l'orchestration (plan J) recopie dans l'`Attempt`. Le module ne dépend que du socle P0 (`$lib/domain/types`, `$lib/domain/music/types`, `$lib/domain/stats`).

**Tech Stack:** TypeScript, Vitest (projet `server`, Node).

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

Contraintes propres à ce plan :

- Branche `plan/b-regles-de-jeu`, dans son propre worktree, créée depuis `main` une fois P0 fusionné.
- Ce plan ne crée et ne modifie que des fichiers sous `src/lib/domain/scoring/`. Il ne touche ni `package.json`, ni `package-lock.json`, ni `vite.config.ts`, ni les fichiers du socle.
- Imports autorisés : `$lib/domain/types` (dont `RECALL_THRESHOLD_MS`, `Attempt`, `Answer`, `Verdict`), `$lib/domain/music/types` (types `Midi` et `PitchName` seulement), `$lib/domain/stats` (`median`). Rien d'autre de `$lib/domain/music/**` (plan A), rien de `$lib/domain/progress/**` (plan C).
- Fonctions pures : ni `Date.now()`, ni `AudioContext`, ni `Math.random()`. Les temps d'entrée sont en secondes audio ; les durées de sortie (`timingOffsetMs`, `reactionMs`) sont en millisecondes entières.
- Chaque nombre de règle est une constante nommée commentée « To calibrate ».
- `index.ts` réexporte exactement les signatures du README (section « B — Règles de jeu ») et les quatre constantes de fatigue ; les utilitaires internes (`unanswered`, `secondsToMs`) restent privés au module.

---

## Règles de jugement

Règles fixées par le README (section « Décisions de produit fixées pour les plans ») :

- **Fenêtre du mode 1** : de l'affichage de la consigne (`promptTime`) au temps cible + `LATE_LIMIT_MS` (400 ms). La première note détectée dans la fenêtre est la réponse (l'orchestration J ne transmet que celle-là).
- **Correction de latence** : `corrigé = onset.time − latencyMs / 1000`. `reactionMs = corrigé − promptTime`, `timingOffsetMs = corrigé − targetTime`, en ms arrondies à l'entier.
- **Verdict du mode 1** : pas de note dans la fenêtre ou mauvaise hauteur → `wrong`. Hauteur juste : `|écart| ≤ PERFECT_WINDOW_MS` (80 ms) → `perfect`, en avance au-delà → `early`, en retard au-delà → `late`.
- **Verdict du mode 2** : nom juste et `reactionMs ≤ RECALL_THRESHOLD_MS` → `perfect` ; nom juste mais plus lent → `late` ; nom faux ou pas de réponse → `wrong`. Jamais `early`.
- **Sans réponse** : `answer: null`, `correct: false`, `verdict: 'wrong'`, `timingOffsetMs: null`, `reactionMs: null`.
- **Rappel direct** : réponse juste et `reactionMs ≤ RECALL_THRESHOLD_MS`.
- **Fatigue** : au moins 12 réponses dans la session ; entre les 6 premières et les 6 dernières, baisse de précision d'au moins 20 points ou hausse du temps de réaction médian d'au moins 25 %.

Précisions tranchées par ce plan (le README ne les fixe pas) :

- **Le verdict se décide sur l'écart arrondi**, pas sur l'écart brut. Une soustraction de temps audio donne par exemple `15.395 − 15.345 = 0.049999999999998934` s ; sans arrondi préalable, un écart stocké à 80 ms pourrait être jugé `late`. Avec l'arrondi, un écart stocké de 80 ms est toujours `perfect`, 81 ms toujours `late`.
- **Arrondi symétrique** (moitié vers l'extérieur de zéro) : `Math.round(-50.5)` vaut `-50` en JavaScript alors que `Math.round(50.5)` vaut `51`, ce qui rendrait l'avance plus tolérante que le retard. Jamais `-0`.
- **Les deux bords de la fenêtre sont inclus**, avec une tolérance d'une microseconde pour absorber l'erreur flottante (`1.453 − 0.025` dépasse `1.028 + 0.4` d'un ulp).
- **Mode 1, mauvaise hauteur dans la fenêtre** : la réponse, l'écart et le temps de réaction sont conservés (le plan A en tire la confusion).
- **Mode 2** : `timingOffsetMs` vaut toujours `null`. Un toucher avant la consigne, ou une réponse à moitié remplie (`answerTime` sans `answered`, ou l'inverse), compte comme pas de réponse.
- **Fatigue** : les tentatives sans réponse sont écartées avant tout calcul (elles ne comptent ni dans les 12, ni dans les tranches de 6). Le temps de réaction médian porte sur toutes les réponses, justes ou fausses. La baisse de précision se calcule sur la différence des nombres de réponses justes, pour rester exacte si la taille de tranche est recalibrée (`1 − 4/5` vaut `0.19999999999999996`).

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `src/lib/domain/scoring/judgement.ts` | Type `Judgement`, jugement sans réponse, conversion secondes → ms entières (privés au module sauf le type) |
| `src/lib/domain/scoring/timing.ts` | `PERFECT_WINDOW_MS`, `LATE_LIMIT_MS`, `answerWindow`, `isInWindow`, `judgeLocate` (mode 1) |
| `src/lib/domain/scoring/identify.ts` | `judgeIdentify` (mode 2) |
| `src/lib/domain/scoring/recall.ts` | `isDirectRecall` |
| `src/lib/domain/scoring/fatigue.ts` | Constantes de fatigue et `detectFatigue` |
| `src/lib/domain/scoring/index.ts` | Point d'entrée `$lib/domain/scoring` |
| `src/lib/domain/scoring/*.spec.ts` | Un fichier de test par module |

---

### Task 1: Jugement commun et fenêtre de réponse

**Files:**
- Create: `src/lib/domain/scoring/judgement.ts`
- Create: `src/lib/domain/scoring/timing.ts`
- Test: `src/lib/domain/scoring/judgement.spec.ts`
- Test: `src/lib/domain/scoring/timing.spec.ts`

**Interfaces:**
- Consumes: `Answer`, `Verdict` de `$lib/domain/types` (P0).
- Produces:
  - `interface Judgement { answer: Answer | null; correct: boolean; verdict: Verdict; timingOffsetMs: number | null; reactionMs: number | null }` dans `judgement.ts`.
  - `unanswered(): Judgement` et `secondsToMs(seconds: number): number` dans `judgement.ts`, utilisés par les Tasks 2 et 3, non réexportés.
  - `PERFECT_WINDOW_MS = 80`, `LATE_LIMIT_MS = 400`, `answerWindow(promptTime: number, targetTime: number): { opensAt: number; closesAt: number }`, `isInWindow(correctedTime: number, window: { opensAt: number; closesAt: number }): boolean` dans `timing.ts`.

- [ ] **Step 1: Écrire le test du jugement commun**

Créer `src/lib/domain/scoring/judgement.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { secondsToMs, unanswered } from './judgement';

describe('unanswered', () => {
	it('is a wrong judgement with no answer and no timing', () => {
		expect(unanswered()).toEqual({
			answer: null,
			correct: false,
			verdict: 'wrong',
			timingOffsetMs: null,
			reactionMs: null
		});
	});
});

describe('secondsToMs', () => {
	it('rounds to whole milliseconds', () => {
		expect(secondsToMs(0.75)).toBe(750);
		expect(secondsToMs(0.0504)).toBe(50);
		expect(secondsToMs(0.0506)).toBe(51);
	});

	it('absorbs floating-point error from audio-time subtraction', () => {
		expect(secondsToMs(15.395 - 15.345)).toBe(50);
		expect(secondsToMs(15.295 - 15.345)).toBe(-50);
	});

	it('rounds early and late offsets symmetrically', () => {
		expect(secondsToMs(-0.0504)).toBe(-50);
		expect(secondsToMs(-0.0506)).toBe(-51);
		expect(secondsToMs(-0.0005)).toBe(-1);
		expect(secondsToMs(0.0005)).toBe(1);
	});

	it('never returns negative zero', () => {
		expect(Object.is(secondsToMs(-0.0001), 0)).toBe(true);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/domain/scoring/judgement.spec.ts`
Expected: FAIL, module introuvable (« Failed to resolve import "./judgement" », ou « Cannot find module './judgement' » selon la version de Vitest).

- [ ] **Step 3: Écrire le jugement commun**

Créer `src/lib/domain/scoring/judgement.ts` :

```ts
import type { Answer, Verdict } from '$lib/domain/types';

/** Outcome of one prompt; J copies these fields into the Attempt. */
export interface Judgement {
	answer: Answer | null;
	correct: boolean;
	verdict: Verdict;
	timingOffsetMs: number | null;
	reactionMs: number | null;
}

export function unanswered(): Judgement {
	return { answer: null, correct: false, verdict: 'wrong', timingOffsetMs: null, reactionMs: null };
}

/** Whole milliseconds, rounded half away from zero so early and late stay symmetric; never -0. */
export function secondsToMs(seconds: number): number {
	const ms = Math.round(Math.abs(seconds) * 1000);
	return seconds < 0 && ms !== 0 ? -ms : ms;
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/domain/scoring/judgement.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Écrire le test de la fenêtre**

Créer `src/lib/domain/scoring/timing.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { LATE_LIMIT_MS, PERFECT_WINDOW_MS, answerWindow, isInWindow } from './timing';

describe('timing constants', () => {
	it('starts with an 80 ms perfect window and a 400 ms late limit', () => {
		expect(PERFECT_WINDOW_MS).toBe(80);
		expect(LATE_LIMIT_MS).toBe(400);
	});
});

describe('answerWindow', () => {
	it('opens with the prompt and closes LATE_LIMIT_MS after the target beat', () => {
		const window = answerWindow(12.345, 15.345);
		expect(window.opensAt).toBe(12.345);
		expect(window.closesAt).toBeCloseTo(15.745, 9);
	});
});

describe('isInWindow', () => {
	const window = answerWindow(12.345, 15.345);

	it('includes both edges', () => {
		expect(isInWindow(12.345, window)).toBe(true);
		expect(isInWindow(15.745, window)).toBe(true);
	});

	it('includes times between the edges', () => {
		expect(isInWindow(13, window)).toBe(true);
		expect(isInWindow(15.345, window)).toBe(true);
	});

	it('excludes times a millisecond outside', () => {
		expect(isInWindow(12.344, window)).toBe(false);
		expect(isInWindow(15.746, window)).toBe(false);
	});

	it('tolerates floating-point error on the edges', () => {
		const edge = answerWindow(1, 1.028);
		expect(1.453 - 25 / 1000).toBeGreaterThan(edge.closesAt);
		expect(isInWindow(1.453 - 25 / 1000, edge)).toBe(true);
		expect(isInWindow(12.345 - 1e-9, window)).toBe(true);
	});
});
```

- [ ] **Step 6: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/domain/scoring/timing.spec.ts`
Expected: FAIL, module introuvable (« Failed to resolve import "./timing" », ou « Cannot find module './timing' »).

- [ ] **Step 7: Écrire la fenêtre**

Créer `src/lib/domain/scoring/timing.ts` :

```ts
/** Largest |offset| from the target beat still judged perfect. To calibrate. */
export const PERFECT_WINDOW_MS = 80;

/** How long after the target beat a note is still taken as the answer. To calibrate. */
export const LATE_LIMIT_MS = 400;

/** Far below a millisecond: only absorbs floating-point error on the window edges. */
const EDGE_TOLERANCE_S = 1e-6;

type AnswerWindow = { opensAt: number; closesAt: number };

/** Times in audio seconds. */
export function answerWindow(promptTime: number, targetTime: number): AnswerWindow {
	return { opensAt: promptTime, closesAt: targetTime + LATE_LIMIT_MS / 1000 };
}

/** Both edges are inside. */
export function isInWindow(correctedTime: number, window: AnswerWindow): boolean {
	return (
		correctedTime >= window.opensAt - EDGE_TOLERANCE_S &&
		correctedTime <= window.closesAt + EDGE_TOLERANCE_S
	);
}
```

- [ ] **Step 8: Lancer les tests et la vérification de types**

Run: `npx vitest run src/lib/domain/scoring/judgement.spec.ts src/lib/domain/scoring/timing.spec.ts && npm run check`
Expected: PASS (2 fichiers, 11 tests), `svelte-check found 0 errors`.

- [ ] **Step 9: Commit**

```bash
git add src/lib/domain/scoring/judgement.ts src/lib/domain/scoring/judgement.spec.ts src/lib/domain/scoring/timing.ts src/lib/domain/scoring/timing.spec.ts
git commit -m "feat(scoring): add judgement type and mode 1 answer window"
```

---

### Task 2: Jugement du mode 1

**Files:**
- Modify: `src/lib/domain/scoring/timing.ts` (contenu entier remplacé)
- Test: `src/lib/domain/scoring/timing.spec.ts` (ligne d'import remplacée, tests ajoutés à la fin)

**Interfaces:**
- Consumes: `Judgement`, `unanswered()`, `secondsToMs()` (`./judgement`, Task 1) ; `answerWindow`, `isInWindow`, `PERFECT_WINDOW_MS`, `LATE_LIMIT_MS` (Task 1) ; `Midi` de `$lib/domain/music/types` et `Verdict` de `$lib/domain/types` (P0).
- Produces: `judgeLocate(input: { acceptable: readonly Midi[]; promptTime: number; targetTime: number; onset: { time: number; midi: Midi } | null; latencyMs: number }): Judgement`.

Règles à respecter, rappelées depuis « Règles de jugement » : l'onset est corrigé de la latence avant tout ; un onset hors fenêtre vaut pas de réponse ; le verdict se décide sur l'écart arrondi.

- [ ] **Step 1: Écrire les tests de `judgeLocate`**

Dans `src/lib/domain/scoring/timing.spec.ts`, remplacer la ligne :

```ts
import { LATE_LIMIT_MS, PERFECT_WINDOW_MS, answerWindow, isInWindow } from './timing';
```

par :

```ts
import { LATE_LIMIT_MS, PERFECT_WINDOW_MS, answerWindow, isInWindow, judgeLocate } from './timing';
```

puis ajouter à la fin du fichier :

```ts
/** F on the B string: fret 6 (MIDI 65) and fret 18 (MIDI 77). */
const F_ON_B = [65, 77];

/** Prompt at 12.345 s, target beat 3 s later (4 beats at 80 bpm). */
function locate(onset: { time: number; midi: number } | null, latencyMs = 0) {
	return judgeLocate({
		acceptable: F_ON_B,
		promptTime: 12.345,
		targetTime: 15.345,
		onset,
		latencyMs
	});
}

describe('judgeLocate', () => {
	it('judges a missing onset as wrong, with no answer and no timing', () => {
		expect(locate(null)).toEqual({
			answer: null,
			correct: false,
			verdict: 'wrong',
			timingOffsetMs: null,
			reactionMs: null
		});
	});

	it('judges the right note on the beat as perfect', () => {
		expect(locate({ time: 15.345, midi: 65 })).toEqual({
			answer: { kind: 'note', midi: 65 },
			correct: true,
			verdict: 'perfect',
			timingOffsetMs: 0,
			reactionMs: 3000
		});
	});

	it('accepts every acceptable octave', () => {
		expect(locate({ time: 15.345, midi: 77 }).verdict).toBe('perfect');
	});

	it('keeps exactly PERFECT_WINDOW_MS on either side perfect', () => {
		const late = locate({ time: 15.425, midi: 65 });
		expect(late.verdict).toBe('perfect');
		expect(late.timingOffsetMs).toBe(80);
		const early = locate({ time: 15.265, midi: 65 });
		expect(early.verdict).toBe('perfect');
		expect(early.timingOffsetMs).toBe(-80);
	});

	it('judges one millisecond beyond the perfect window as late or early', () => {
		expect(locate({ time: 15.426, midi: 65 })).toMatchObject({
			correct: true,
			verdict: 'late',
			timingOffsetMs: 81,
			reactionMs: 3081
		});
		expect(locate({ time: 15.264, midi: 65 })).toMatchObject({
			correct: true,
			verdict: 'early',
			timingOffsetMs: -81,
			reactionMs: 2919
		});
	});

	it('decides the verdict on the rounded offset', () => {
		expect(locate({ time: 15.4254, midi: 65 })).toMatchObject({
			verdict: 'perfect',
			timingOffsetMs: 80
		});
		expect(locate({ time: 15.4256, midi: 65 })).toMatchObject({
			verdict: 'late',
			timingOffsetMs: 81
		});
	});

	it('judges a right note just after the prompt as early', () => {
		expect(locate({ time: 12.5, midi: 65 })).toMatchObject({
			verdict: 'early',
			timingOffsetMs: -2845,
			reactionMs: 155
		});
	});

	it('takes the last instant of the window as late', () => {
		expect(locate({ time: 15.745, midi: 65 })).toMatchObject({
			verdict: 'late',
			timingOffsetMs: LATE_LIMIT_MS,
			reactionMs: 3400
		});
	});

	it('treats an onset outside the window as no answer', () => {
		expect(locate({ time: 15.746, midi: 65 })).toEqual(locate(null));
		expect(locate({ time: 12.344, midi: 65 })).toEqual(locate(null));
	});

	it('judges a wrong pitch as wrong but keeps its answer and timing', () => {
		expect(locate({ time: 15.345, midi: 66 })).toEqual({
			answer: { kind: 'note', midi: 66 },
			correct: false,
			verdict: 'wrong',
			timingOffsetMs: 0,
			reactionMs: 3000
		});
	});

	it('subtracts the latency before judging', () => {
		expect(locate({ time: 15.415, midi: 65 }, 70)).toMatchObject({
			verdict: 'perfect',
			timingOffsetMs: 0,
			reactionMs: 3000
		});
		expect(locate({ time: 15.325, midi: 65 }, -20)).toMatchObject({
			verdict: 'perfect',
			timingOffsetMs: 0
		});
	});

	it('uses the corrected time to decide whether the onset is in the window', () => {
		expect(locate({ time: 15.8, midi: 65 }, 60)).toMatchObject({
			verdict: 'late',
			timingOffsetMs: 395
		});
		expect(locate({ time: 12.36, midi: 65 }, 20)).toEqual(locate(null));
	});

	it('accepts an onset that lands on the closing edge after latency correction', () => {
		const judgement = judgeLocate({
			acceptable: F_ON_B,
			promptTime: 0.028,
			targetTime: 1.028,
			onset: { time: 1.453, midi: 65 },
			latencyMs: 25
		});
		expect(judgement).toMatchObject({ verdict: 'late', timingOffsetMs: 400, reactionMs: 1400 });
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/domain/scoring/timing.spec.ts`
Expected: FAIL, 13 tests en échec avec « TypeError: judgeLocate is not a function », les 6 tests de la Task 1 passent.

- [ ] **Step 3: Écrire `judgeLocate`**

Remplacer le contenu de `src/lib/domain/scoring/timing.ts` par :

```ts
import type { Midi } from '$lib/domain/music/types';
import type { Verdict } from '$lib/domain/types';
import { secondsToMs, unanswered, type Judgement } from './judgement';

/** Largest |offset| from the target beat still judged perfect. To calibrate. */
export const PERFECT_WINDOW_MS = 80;

/** How long after the target beat a note is still taken as the answer. To calibrate. */
export const LATE_LIMIT_MS = 400;

/** Far below a millisecond: only absorbs floating-point error on the window edges. */
const EDGE_TOLERANCE_S = 1e-6;

type AnswerWindow = { opensAt: number; closesAt: number };

/** Times in audio seconds. */
export function answerWindow(promptTime: number, targetTime: number): AnswerWindow {
	return { opensAt: promptTime, closesAt: targetTime + LATE_LIMIT_MS / 1000 };
}

/** Both edges are inside. */
export function isInWindow(correctedTime: number, window: AnswerWindow): boolean {
	return (
		correctedTime >= window.opensAt - EDGE_TOLERANCE_S &&
		correctedTime <= window.closesAt + EDGE_TOLERANCE_S
	);
}

/**
 * Times in audio seconds. `onset.time` is raw; latencyMs is subtracted.
 * An onset outside the window counts as no answer.
 */
export function judgeLocate(input: {
	acceptable: readonly Midi[];
	promptTime: number;
	targetTime: number;
	onset: { time: number; midi: Midi } | null;
	latencyMs: number;
}): Judgement {
	const { acceptable, promptTime, targetTime, onset, latencyMs } = input;
	if (onset === null) return unanswered();
	const corrected = onset.time - latencyMs / 1000;
	if (!isInWindow(corrected, answerWindow(promptTime, targetTime))) return unanswered();
	const correct = acceptable.includes(onset.midi);
	const timingOffsetMs = secondsToMs(corrected - targetTime);
	return {
		answer: { kind: 'note', midi: onset.midi },
		correct,
		verdict: correct ? timingVerdict(timingOffsetMs) : 'wrong',
		timingOffsetMs,
		reactionMs: secondsToMs(corrected - promptTime)
	};
}

function timingVerdict(offsetMs: number): Verdict {
	if (Math.abs(offsetMs) <= PERFECT_WINDOW_MS) return 'perfect';
	return offsetMs < 0 ? 'early' : 'late';
}
```

- [ ] **Step 4: Lancer les tests et la vérification de types**

Run: `npx vitest run src/lib/domain/scoring/timing.spec.ts && npm run check`
Expected: PASS (19 tests), `svelte-check found 0 errors`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/scoring/timing.ts src/lib/domain/scoring/timing.spec.ts
git commit -m "feat(scoring): judge mode 1 notes against the beat"
```

---

### Task 3: Jugement du mode 2

**Files:**
- Create: `src/lib/domain/scoring/identify.ts`
- Test: `src/lib/domain/scoring/identify.spec.ts`

**Interfaces:**
- Consumes: `Judgement`, `unanswered()`, `secondsToMs()` (`./judgement`, Task 1) ; `PitchName` de `$lib/domain/music/types`, `RECALL_THRESHOLD_MS` et `Verdict` de `$lib/domain/types` (P0).
- Produces: `judgeIdentify(input: { expected: PitchName; promptTime: number; answerTime: number | null; answered: PitchName | null }): Judgement`.

Les temps sont en secondes audio : l'orchestration (J) lit `clock.now()` au toucher. `timingOffsetMs` vaut toujours `null` en mode 2.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/domain/scoring/identify.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { PitchName } from '$lib/domain/music/types';
import { RECALL_THRESHOLD_MS } from '$lib/domain/types';
import { judgeIdentify } from './identify';

/** "corde de A, case 8" is F; the prompt appears at 12.345 s. */
function identify(answerTime: number | null, answered: PitchName | null) {
	return judgeIdentify({ expected: 'F', promptTime: 12.345, answerTime, answered });
}

const NO_ANSWER = {
	answer: null,
	correct: false,
	verdict: 'wrong',
	timingOffsetMs: null,
	reactionMs: null
};

describe('judgeIdentify', () => {
	it('judges no answer as wrong, with no timing', () => {
		expect(identify(null, null)).toEqual(NO_ANSWER);
	});

	it('treats a half-filled answer as no answer', () => {
		expect(identify(13, null)).toEqual(NO_ANSWER);
		expect(identify(null, 'F')).toEqual(NO_ANSWER);
	});

	it('judges the right name within the threshold as perfect', () => {
		expect(identify(12.985, 'F')).toEqual({
			answer: { kind: 'name', pitch: 'F' },
			correct: true,
			verdict: 'perfect',
			timingOffsetMs: null,
			reactionMs: 640
		});
	});

	it('keeps exactly RECALL_THRESHOLD_MS perfect and one millisecond more late', () => {
		expect(identify(13.845, 'F')).toMatchObject({
			verdict: 'perfect',
			reactionMs: RECALL_THRESHOLD_MS
		});
		expect(identify(13.846, 'F')).toMatchObject({
			correct: true,
			verdict: 'late',
			reactionMs: RECALL_THRESHOLD_MS + 1
		});
	});

	it('decides the verdict on the rounded reaction time', () => {
		expect(identify(13.8454, 'F')).toMatchObject({ verdict: 'perfect', reactionMs: 1500 });
		expect(identify(13.8456, 'F')).toMatchObject({ verdict: 'late', reactionMs: 1501 });
	});

	it('judges a wrong name as wrong, however fast, and keeps it', () => {
		expect(identify(12.645, 'F#')).toEqual({
			answer: { kind: 'name', pitch: 'F#' },
			correct: false,
			verdict: 'wrong',
			timingOffsetMs: null,
			reactionMs: 300
		});
	});

	it('treats a tap before the prompt as no answer', () => {
		expect(identify(12.3, 'F')).toEqual(NO_ANSWER);
		expect(identify(12.345, 'F')).toMatchObject({ verdict: 'perfect', reactionMs: 0 });
	});

	it('never judges early', () => {
		for (let ms = 0; ms <= 5000; ms += 250) {
			expect(identify(12.345 + ms / 1000, 'F').verdict).not.toBe('early');
		}
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/domain/scoring/identify.spec.ts`
Expected: FAIL, module introuvable (« Failed to resolve import "./identify" », ou « Cannot find module './identify' »).

- [ ] **Step 3: Écrire `judgeIdentify`**

Créer `src/lib/domain/scoring/identify.ts` :

```ts
import type { PitchName } from '$lib/domain/music/types';
import { RECALL_THRESHOLD_MS, type Verdict } from '$lib/domain/types';
import { secondsToMs, unanswered, type Judgement } from './judgement';

/**
 * Times in audio seconds; `answerTime` null means no answer.
 * A tap before the prompt, or a time without a name, also counts as no answer.
 */
export function judgeIdentify(input: {
	expected: PitchName;
	promptTime: number;
	answerTime: number | null;
	answered: PitchName | null;
}): Judgement {
	const { expected, promptTime, answerTime, answered } = input;
	if (answerTime === null || answered === null) return unanswered();
	const reactionMs = secondsToMs(answerTime - promptTime);
	if (reactionMs < 0) return unanswered();
	const correct = answered === expected;
	return {
		answer: { kind: 'name', pitch: answered },
		correct,
		verdict: correct ? speedVerdict(reactionMs) : 'wrong',
		timingOffsetMs: null,
		reactionMs
	};
}

function speedVerdict(reactionMs: number): Verdict {
	return reactionMs <= RECALL_THRESHOLD_MS ? 'perfect' : 'late';
}
```

- [ ] **Step 4: Lancer les tests et la vérification de types**

Run: `npx vitest run src/lib/domain/scoring/identify.spec.ts && npm run check`
Expected: PASS (8 tests), `svelte-check found 0 errors`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/scoring/identify.ts src/lib/domain/scoring/identify.spec.ts
git commit -m "feat(scoring): judge mode 2 names against the recall threshold"
```

---

### Task 4: Rappel direct

**Files:**
- Create: `src/lib/domain/scoring/recall.ts`
- Test: `src/lib/domain/scoring/recall.spec.ts`

**Interfaces:**
- Consumes: `RECALL_THRESHOLD_MS`, `Attempt` de `$lib/domain/types` (P0) ; `judgeLocate` (Task 2), dans le test seulement.
- Produces: `isDirectRecall(attempt: Pick<Attempt, 'correct' | 'reactionMs' | 'leadBeats'>, tempoBpm: number): boolean`.

En mode 1 (`leadBeats` renseigné), le rappel se juge sur la durée de l'annonce, `leadBeats × 60 000 / tempoBpm`, pas sur `reactionMs` : celui-ci inclut l'annonce. À 80 bpm, 2 temps font 1 500 ms (rappel direct) et 4 temps font 3 000 ms (calcul). En mode 2 (`leadBeats` null), le rappel se juge sur `reactionMs`. Une réponse fausse n'est jamais un rappel direct.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/domain/scoring/recall.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { RECALL_THRESHOLD_MS } from '$lib/domain/types';
import { isDirectRecall } from './recall';

const TEMPO = 80;

describe('isDirectRecall', () => {
	it('judges mode 2 on the reaction time', () => {
		expect(isDirectRecall({ correct: true, reactionMs: 0, leadBeats: null }, TEMPO)).toBe(true);
		expect(
			isDirectRecall({ correct: true, reactionMs: RECALL_THRESHOLD_MS, leadBeats: null }, TEMPO)
		).toBe(true);
		expect(
			isDirectRecall({ correct: true, reactionMs: RECALL_THRESHOLD_MS + 1, leadBeats: null }, TEMPO)
		).toBe(false);
	});

	it('rejects a wrong name, however fast', () => {
		expect(isDirectRecall({ correct: false, reactionMs: 400, leadBeats: null }, TEMPO)).toBe(false);
	});

	it('rejects a mode 2 attempt without a reaction time', () => {
		expect(isDirectRecall({ correct: true, reactionMs: null, leadBeats: null }, TEMPO)).toBe(false);
	});

	it('judges mode 1 on the lead duration, not the reaction time', () => {
		expect(isDirectRecall({ correct: true, reactionMs: 1510, leadBeats: 2 }, TEMPO)).toBe(true);
		expect(isDirectRecall({ correct: true, reactionMs: 100, leadBeats: 4 }, TEMPO)).toBe(false);
		expect(isDirectRecall({ correct: false, reactionMs: 1510, leadBeats: 2 }, TEMPO)).toBe(false);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/domain/scoring/recall.spec.ts`
Expected: FAIL, module introuvable (« Failed to resolve import "./recall" », ou « Cannot find module './recall' »).

- [ ] **Step 3: Écrire `isDirectRecall`**

Créer `src/lib/domain/scoring/recall.ts` :

```ts
import { RECALL_THRESHOLD_MS, type Attempt } from '$lib/domain/types';

/**
 * Mode 1: a right answer whose lead fits in RECALL_THRESHOLD_MS.
 * Mode 2 (`leadBeats` null): a right answer whose reaction does.
 */
export function isDirectRecall(
	attempt: Pick<Attempt, 'correct' | 'reactionMs' | 'leadBeats'>,
	tempoBpm: number
): boolean {
	if (!attempt.correct) return false;
	if (attempt.leadBeats === null) {
		return attempt.reactionMs !== null && attempt.reactionMs <= RECALL_THRESHOLD_MS;
	}
	return (attempt.leadBeats * 60_000) / tempoBpm <= RECALL_THRESHOLD_MS;
}
```

- [ ] **Step 4: Lancer les tests et la vérification de types**

Run: `npx vitest run src/lib/domain/scoring/recall.spec.ts && npm run check`
Expected: PASS (4 tests), `svelte-check found 0 errors`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/scoring/recall.ts src/lib/domain/scoring/recall.spec.ts
git commit -m "feat(scoring): add direct recall rule"
```

---

### Task 5: Détection de la fatigue

**Files:**
- Create: `src/lib/domain/scoring/fatigue.ts`
- Test: `src/lib/domain/scoring/fatigue.spec.ts`

**Interfaces:**
- Consumes: `median(values: readonly number[]): number | null` de `$lib/domain/stats`, `Attempt` de `$lib/domain/types` (P0).
- Produces: `FATIGUE_MIN_ANSWERS = 12`, `FATIGUE_WINDOW = 6`, `FATIGUE_ACCURACY_DROP = 0.2`, `FATIGUE_REACTION_INCREASE = 0.25`, `detectFatigue(attempts: readonly Attempt[]): boolean` (tentatives d'une session, de la plus ancienne à la plus récente ; l'ordre reçu fait foi, la fonction ne trie pas).

Une réponse est une tentative dont `answer` n'est pas `null`. Avec des tranches de 6, une réponse juste de moins vaut 16,7 points (pas de fatigue), deux de moins valent 33,3 points (fatigue). La hausse de 25 % se compare par multiplication (`après ≥ avant × 1,25`), exacte pour des médianes entières comme 800 → 1000.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/domain/scoring/fatigue.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { Attempt } from '$lib/domain/types';
import {
	FATIGUE_ACCURACY_DROP,
	FATIGUE_MIN_ANSWERS,
	FATIGUE_REACTION_INCREASE,
	FATIGUE_WINDOW,
	detectFatigue
} from './fatigue';

function answered(correct: boolean, reactionMs = 1000): Attempt {
	return {
		sessionId: 's1',
		cardKey: 'locate:2:F',
		target: { direction: 'locate', string: 2, pitch: 'F' },
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: null,
		promptedAt: 0,
		answer: { kind: 'note', midi: correct ? 65 : 66 },
		correct,
		verdict: correct ? 'perfect' : 'wrong',
		timingOffsetMs: 0,
		reactionMs,
		confusion: null
	};
}

function unanswered(): Attempt {
	return { ...answered(false), answer: null, timingOffsetMs: null, reactionMs: null };
}

function times(count: number, make: () => Attempt): Attempt[] {
	return Array.from({ length: count }, make);
}

const right = (reactionMs?: number) => answered(true, reactionMs);
const wrong = (reactionMs?: number) => answered(false, reactionMs);

describe('fatigue constants', () => {
	it('starts with 12 answers, slices of 6, a 20-point drop and a 25 % slowdown', () => {
		expect(FATIGUE_MIN_ANSWERS).toBe(12);
		expect(FATIGUE_WINDOW).toBe(6);
		expect(FATIGUE_ACCURACY_DROP).toBe(0.2);
		expect(FATIGUE_REACTION_INCREASE).toBe(0.25);
	});
});

describe('detectFatigue', () => {
	it('needs at least 12 answered attempts', () => {
		expect(detectFatigue([])).toBe(false);
		expect(detectFatigue([...times(6, () => right()), ...times(5, () => wrong())])).toBe(false);
		expect(detectFatigue([...times(6, () => right()), ...times(6, () => wrong())])).toBe(true);
	});

	it('does not count unanswered attempts towards the 12', () => {
		const attempts = [
			...times(6, () => right()),
			...times(5, () => wrong()),
			...times(5, unanswered)
		];
		expect(detectFatigue(attempts)).toBe(false);
	});

	it('flags two more errors in the last six (33 points)', () => {
		const attempts = [
			...times(6, () => right()),
			...times(4, () => right()),
			...times(2, () => wrong())
		];
		expect(detectFatigue(attempts)).toBe(true);
	});

	it('does not flag one more error in the last six (17 points)', () => {
		const attempts = [...times(6, () => right()), ...times(5, () => right()), wrong()];
		expect(detectFatigue(attempts)).toBe(false);
	});

	it('does not flag improving accuracy', () => {
		const attempts = [...times(6, () => wrong()), ...times(6, () => right())];
		expect(detectFatigue(attempts)).toBe(false);
	});

	it('flags a median reaction exactly 25 % slower', () => {
		const attempts = [...times(6, () => right(800)), ...times(6, () => right(1000))];
		expect(detectFatigue(attempts)).toBe(true);
	});

	it('does not flag a median reaction just under 25 % slower', () => {
		const attempts = [...times(6, () => right(800)), ...times(6, () => right(999))];
		expect(detectFatigue(attempts)).toBe(false);
	});

	it('does not flag getting faster', () => {
		const attempts = [...times(6, () => right(1200)), ...times(6, () => right(600))];
		expect(detectFatigue(attempts)).toBe(false);
	});

	it('compares medians, not means', () => {
		const attempts = [
			...times(6, () => right(1000)),
			...[900, 900, 900, 1300, 5000, 5000].map((ms) => right(ms))
		];
		expect(detectFatigue(attempts)).toBe(false);
	});

	it('ignores the attempts between the first six and the last six', () => {
		const attempts = [
			...times(6, () => right(800)),
			...times(8, () => wrong(5000)),
			...times(6, () => right(800))
		];
		expect(detectFatigue(attempts)).toBe(false);
	});

	it('skips unanswered attempts at the end of the session', () => {
		const attempts = [...times(12, () => right()), ...times(3, unanswered)];
		expect(detectFatigue(attempts)).toBe(false);
	});

	it('ignores mode 1 reaction times, which mostly measure the lead', () => {
		const locate = (reactionMs: number) => ({ ...right(reactionMs), leadBeats: 8 as const });
		const attempts = [...times(6, () => locate(800)), ...times(6, () => locate(6000))];
		expect(detectFatigue(attempts)).toBe(false);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/domain/scoring/fatigue.spec.ts`
Expected: FAIL, module introuvable (« Failed to resolve import "./fatigue" », ou « Cannot find module './fatigue' »).

- [ ] **Step 3: Écrire `detectFatigue`**

Créer `src/lib/domain/scoring/fatigue.ts` :

```ts
import { median } from '$lib/domain/stats';
import type { Attempt } from '$lib/domain/types';

/** Answered attempts needed before fatigue can be detected. To calibrate. */
export const FATIGUE_MIN_ANSWERS = 12;

/** Size of the opening and closing slices that are compared. To calibrate. */
export const FATIGUE_WINDOW = 6;

/** Accuracy drop between the slices, as a fraction (0.2 = 20 points). To calibrate. */
export const FATIGUE_ACCURACY_DROP = 0.2;

/** Median reaction time increase between the slices, as a fraction (0.25 = 25 %). To calibrate. */
export const FATIGUE_REACTION_INCREASE = 0.25;

/** `attempts` of one session, oldest first. Unanswered attempts are left out. */
export function detectFatigue(attempts: readonly Attempt[]): boolean {
	const answered = attempts.filter((attempt) => attempt.answer !== null);
	if (answered.length < FATIGUE_MIN_ANSWERS) return false;
	const first = answered.slice(0, FATIGUE_WINDOW);
	const last = answered.slice(-FATIGUE_WINDOW);
	return accuracyDropped(first, last) || reactionSlowed(first, last);
}

function correctCount(attempts: readonly Attempt[]): number {
	return attempts.filter((attempt) => attempt.correct).length;
}

/** Counts are subtracted before dividing: 1 − 4/5 in floating point falls just under 0.2. */
function accuracyDropped(first: readonly Attempt[], last: readonly Attempt[]): boolean {
	return (correctCount(first) - correctCount(last)) / first.length >= FATIGUE_ACCURACY_DROP;
}

function reactionSlowed(first: readonly Attempt[], last: readonly Attempt[]): boolean {
	const before = median(reactionTimes(first));
	const after = median(reactionTimes(last));
	if (before === null || after === null) return false;
	return after >= before * (1 + FATIGUE_REACTION_INCREASE);
}

/** Mode 2 only: a mode 1 reaction time is mostly the lead, not the player slowing down. */
function reactionTimes(attempts: readonly Attempt[]): number[] {
	return attempts.flatMap((attempt) =>
		attempt.leadBeats === null && attempt.reactionMs !== null ? [attempt.reactionMs] : []
	);
}
```

- [ ] **Step 4: Lancer les tests et la vérification de types**

Run: `npx vitest run src/lib/domain/scoring/fatigue.spec.ts && npm run check`
Expected: PASS (12 tests), `svelte-check found 0 errors`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/scoring/fatigue.ts src/lib/domain/scoring/fatigue.spec.ts
git commit -m "feat(scoring): detect fatigue from accuracy and reaction time"
```

---

### Task 6: Point d'entrée du module

**Files:**
- Create: `src/lib/domain/scoring/index.ts`
- Test: `src/lib/domain/scoring/index.spec.ts`

**Interfaces:**
- Consumes: tout ce que produisent les Tasks 1 à 5.
- Produces: `$lib/domain/scoring`, qui exporte `PERFECT_WINDOW_MS`, `LATE_LIMIT_MS`, le type `Judgement`, `answerWindow`, `isInWindow`, `judgeLocate`, `judgeIdentify`, `isDirectRecall`, `detectFatigue`, `FATIGUE_MIN_ANSWERS`, `FATIGUE_WINDOW`, `FATIGUE_ACCURACY_DROP`, `FATIGUE_REACTION_INCREASE`. `unanswered` et `secondsToMs` ne sont pas exportés. Le plan J (orchestration, vague 2) importe depuis `$lib/domain/scoring`, jamais depuis un fichier interne.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/domain/scoring/index.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import * as scoring from '$lib/domain/scoring';
import type { Judgement } from '$lib/domain/scoring';

describe('scoring entry point', () => {
	it('exposes the constants of the README contract and the fatigue thresholds', () => {
		expect(scoring.PERFECT_WINDOW_MS).toBe(80);
		expect(scoring.LATE_LIMIT_MS).toBe(400);
		expect(scoring.FATIGUE_MIN_ANSWERS).toBe(12);
		expect(scoring.FATIGUE_WINDOW).toBe(6);
		expect(scoring.FATIGUE_ACCURACY_DROP).toBe(0.2);
		expect(scoring.FATIGUE_REACTION_INCREASE).toBe(0.25);
	});

	it('exposes every rule of the README contract', () => {
		const exported = scoring as Record<string, unknown>;
		for (const name of [
			'answerWindow',
			'isInWindow',
			'judgeLocate',
			'judgeIdentify',
			'isDirectRecall',
			'detectFatigue'
		]) {
			expect(typeof exported[name]).toBe('function');
		}
	});

	it('keeps internal helpers private', () => {
		expect('unanswered' in scoring).toBe(false);
		expect('secondsToMs' in scoring).toBe(false);
	});

	it('exports the Judgement type', () => {
		const judgement: Judgement = scoring.judgeIdentify({
			expected: 'F',
			promptTime: 0,
			answerTime: 0.5,
			answered: 'F'
		});
		expect(judgement.verdict).toBe('perfect');
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/domain/scoring/index.spec.ts`
Expected: FAIL, module introuvable (« Failed to resolve import "$lib/domain/scoring" », ou « Cannot find module '$lib/domain/scoring' »).

- [ ] **Step 3: Écrire `index.ts`**

Créer `src/lib/domain/scoring/index.ts` :

```ts
export type { Judgement } from './judgement';
export { LATE_LIMIT_MS, PERFECT_WINDOW_MS, answerWindow, isInWindow, judgeLocate } from './timing';
export { judgeIdentify } from './identify';
export { isDirectRecall } from './recall';
export {
	FATIGUE_ACCURACY_DROP,
	FATIGUE_MIN_ANSWERS,
	FATIGUE_REACTION_INCREASE,
	FATIGUE_WINDOW,
	detectFatigue
} from './fatigue';
```

- [ ] **Step 4: Lancer tout le module, la suite complète et la vérification de types**

Run: `npx vitest run src/lib/domain/scoring && npm test && npm run check`
Expected: le module passe (6 fichiers, 53 tests), toute la suite PASS, `svelte-check found 0 errors`.

- [ ] **Step 5: Vérifier le formatage et le périmètre**

Run: `npx prettier --check src/lib/domain/scoring && git status --porcelain`
Expected: « All matched files use Prettier code style! » ; `git status` ne liste que `src/lib/domain/scoring/index.ts` et `src/lib/domain/scoring/index.spec.ts` (les autres fichiers du module sont déjà commités, aucun fichier hors de `src/lib/domain/scoring/`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/scoring/index.ts src/lib/domain/scoring/index.spec.ts
git commit -m "feat(scoring): expose scoring rules from the module entry point"
```

---

## Fin du plan

La branche `plan/b-regles-de-jeu` porte `src/lib/domain/scoring/`, prêt à être fusionné dans `main` en fin de vague 1 (`npm test && npm run check` après la fusion). Ce que l'orchestration (plan J) doit savoir pour l'utiliser :

- `latencyMs` vaut `settings.calibrationOffsetMs ?? 0` (le réglage est `null` tant que la calibration n'est pas faite). Un écart négatif est accepté.
- `onset.time` est l'heure audio brute du `NoteOnset` ; `promptTime` et `targetTime` sont des heures audio (`metronome.beatTime(promptBeatIndex)` et `metronome.beatTime(promptBeatIndex + leadBeats)`). En mode 2, `promptTime` et `answerTime` viennent de `clock.now()`.
- J ne transmet à `judgeLocate` que la première note reçue après la consigne ; si elle tombe hors fenêtre, le jugement vaut pas de réponse.
- Les cinq champs du `Judgement` se recopient tels quels dans l'`Attempt`. La confusion (plan A) ne se calcule que si `answer` n'est pas `null` et `correct` est `false`.
- `isDirectRecall` reçoit le tempo de la session. En mode 1 il juge la durée de l'annonce, en mode 2 le temps de réaction.
- `detectFatigue` reçoit les tentatives de la session dans l'ordre où elles ont été jouées. La comparaison des temps de réaction ignore les tentatives du mode 1.
