# C — Progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Écrire la logique de progression pure du prototype : température à froid/chaud, paliers d'annonce, FSRS (`ts-fsrs`), cartes (introduction, positionnement, acquis, maîtrisé), déblocage du curriculum, plans de session et statistiques d'accueil, avec exactement les signatures du plan C de `docs/superpowers/plans/README.md`.

**Architecture:** Module de domaine pur `src/lib/domain/progress/`, sans Svelte, sans IndexedDB, sans dépendance aux plans A (musique) ni B (scoring). Les curriculum de test sont des fixtures locales. Le rappel direct est re-dérivé ici (durée d'annonce en mode 1, `reactionMs` en mode 2). `ts-fsrs` 5.4.2 convertit vers `SchedulingState` ; les dates FSRS sont des `Date`, les dates du domaine des epoch ms.

**Tech Stack:** TypeScript, Vitest (projet `server`, Node), `ts-fsrs@5.4.2` (déjà installé par P0).

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

### Contraintes propres au plan C

- Branche `plan/c-progression`, dans son propre worktree, créée depuis `main` après la fusion de P0.
- Le plan ne crée ou ne modifie que des fichiers sous `src/lib/domain/progress/`. Jamais `package.json`, `package-lock.json`, `vite.config.ts` ni un autre fichier du socle.
- Imports autorisés : `$lib/domain/types`, `$lib/domain/music/types` (types seulement : `PitchName`, `StringNumber`), `$lib/domain/stats` (`median`), `ts-fsrs`, et les modules du plan lui-même. Rien de `$lib/domain/music/**` hors `types.ts` (plan A), rien de `$lib/domain/scoring/**` (plan B), rien de `$lib/application`, `$lib/infrastructure`, `$lib/i18n` ni de `svelte`.
- API publique : exactement les signatures du plan C du README. Les helpers FSRS, `isDirectRecall` et le mélange restent privés au paquet (exportés entre modules si besoin, **non** réexportés par `index.ts`).
- Fonctions pures : pas d'`AudioContext`. Les horodatages arrivent en epoch ms via les paramètres `now`. Le seul aléa est `random`, injectable, `Math.random` par défaut.
- Chaque nombre de règle est une constante nommée commentée « To calibrate ».
- Curriculum de test : fixtures locales dans les `*.spec.ts`, jamais `buildCurriculum` du plan A.

---

## Règles de progression

Règles fixées par le README (section « Décisions de produit fixées pour les plans ») :

- **Température** : à froid si la carte n'a pas encore été tentée dans la session **et** que la tentative précédente date d'au moins `MIN_COLD_DELAY_MS` (ou qu'il n'y en a pas). Sinon à chaud.
- **Rappel direct** (re-dérivé, sans importer B) : mode 1 (`leadBeats` renseigné) → réponse juste dont `leadBeats * 60_000 / tempoBpm ≤ RECALL_THRESHOLD_MS` ; mode 2 (`leadBeats` null) → réponse juste dont `reactionMs ≤ RECALL_THRESHOLD_MS`. Une réponse fausse n'est jamais un rappel direct. Sans `reactionMs` en mode 2 → pas de rappel direct.
- **Annonce** : paliers `LEAD_STEPS = [8, 4, 2, 1]`. `leadForThreshold(tempo)` = le plus long palier dont la durée ≤ `RECALL_THRESHOLD_MS`, au moins `1`. Réussite à froid → un palier plus court ; échec à froid → un palier plus long. Cartes `identify` : `leadBeats` reste `1`.
- **FSRS** : `enable_fuzz: false`, `relearning_steps: ['1h']`. Notes : faux → `Again`, juste sans rappel direct → `Hard`, rappel direct → `Good`, jamais `Easy` sur une tentative. (Le positionnement utilise `Easy` en interne uniquement pour graduuer une carte déjà connue vers `Review` — ce n'est pas une note de tentative.)
- **Introduction** : état `New`, `due = now + MIN_COLD_DELAY_MS`, `leadBeats` 8 (locate) ou 1 (identify).
- **Positionnement** : réussite en rappel direct → carte en `Review`, `acquiredAt = now`. Échec → `null` (rien créé).
- **Acquis** : au moins une réussite en rappel direct, à froid, dans une session postérieure à l'introduction (ou dès le positionnement).
- **Maîtrisé** : sur les tentatives à froid, ≥ 90 % en rappel direct ; ≥ 3 sessions distinctes avec une réussite en rappel direct ; ≥ 72 h entre les deux dernières de ces sessions.
- **Curriculum** : un ensemble s'ouvre quand `UNLOCK_RATIO` (80 %) des cartes de l'ensemble exigé sont acquises (`acquiredAt !== null`). `requires: null` → toujours ouvert.
- **Session du jour** : révisions à froid dues (`due ≤ now`), au plus `DAILY_COLD_CAP`, locate avant identify ; puis `NEW_PER_SESSION` nouvelles cibles en apprentissage à chaud (sautables), `repeatUntilCorrect: true`.
- **Tendance accueil** : médiane des réactions à froid des 7 derniers jours contre les 7 précédents ; amélioration si ≥ 5 % plus rapide, dégradation si ≥ 5 % plus lente ; `null` si une des deux fenêtres est vide.

### Sous-décisions tranchées par ce plan

1. **`tempoBpm` sur `applyColdAttempt`, `isAcquired` et `isMastered`** : le rappel direct du mode 1 dépend du tempo. Ces trois fonctions le reçoivent en dernier argument. Les tests passent 80.
2. **`applyColdAttempt`** ignore une tentative dont `temperature !== 'cold'` (retourne `state` inchangé).
3. **Raccourci / allongement d'annonce** : toute réussite à froid (juste) raccourcit d'un palier ; tout échec à froid allonge d'un palier — indépendamment du rappel direct. Déjà au bord (`8` ou `1`) → inchangé. `identify` → toujours `1`.
4. **Graduation positionnement** : un seul `Rating.Easy` interne après `createEmptyCard`, pour obtenir `State.Review` immédiatement ; jamais utilisé dans `applyColdAttempt`.
5. **`isAcquired`** : `true` si `state.acquiredAt !== null`, sinon parcours de `history` (tentative à froid, rappel direct au `tempoBpm` reçu, `sessionId !== introducedInSession`).
6. **`isMastered(history)`** : uniquement tentatives `temperature === 'cold'`. Ratio = rappels directs / nombre de tentatives à froid. Sessions « réussies » = sessions ayant ≥ 1 rappel direct à froid ; horodatage de session = dernier `promptedAt` de ces rappels ; écart = différence des deux derniers horodatages de session réussie.
7. **`unlockedSets`** : juge l'acquis via `acquiredAt !== null` seulement (pas d'historique). Dénominateur = `set.targets.length` ; cartes absentes = non acquises. Retourne tous les ensembles ouverts, dans l'ordre du curriculum.
8. **`nextNewTargets`** : parcourt les ensembles ouverts dans l'ordre ; cibles sans `CardState` correspondant ; s'arrête à `count`.
9. **Révisions dues** : `scheduling.due <= now`, tri par `due` croissant, puis locate avant identify (`direction`), puis `key` lexicographique. Plafond `DAILY_COLD_CAP` sur le total.
10. **Apprentissage planifié** : `temperature: 'hot'`, `aid: 'show-position'` (locate) ou `'none'` (identify), `leadBeats: 8` (locate) ou `null` (identify — pas de temps cible en mode 2), `repeatUntilCorrect: true`. `introduceCard` n'est **pas** appelé par le planificateur — J l'appelle à l'exécution. Sur `CardState`, les cartes identify gardent `leadBeats: 1`.
11. **`buildFreePlan`** : `count` par défaut = `DAILY_COLD_CAP` ; sous-échantillon aléatoire des cartes existantes ; `phase: 'free'`, `temperature: 'hot'`, `aid: 'none'`, `repeatUntilCorrect: false` ; locate → `leadBeats` de la carte ; identify → `null`.
12. **`nextSuggestedAt`** : `min(scheduling.due)` parmi les cartes, ou `null` si aucune carte. Peut être ≤ `now`.
13. **`summarizeSession.nextSuggestedAt`** : si aucune carte, `now + NEXT_SESSION_GAP_MS` ; sinon `Math.max(nextSuggestedAt(cards, now)!, now + NEXT_SESSION_GAP_MS)`.
14. **`computeHomeStats.nextAction`** : `placement` si `settings.placementDoneAt === null` ; sinon `session` s'il reste une révision due **ou** une nouvelle cible débloquée ; sinon `wait` avec `nextReviewAt = nextSuggestedAt(...)`.
15. **Médiane d'accueil** : toutes les tentatives à froid avec `reactionMs !== null` (justes ou fausses).
16. **Tendance** : fenêtres `[now - 14d, now - 7d)` et `[now - 7d, now]` ; comparaison des médianes ; seuil relatif `TREND_RATIO = 0.05` (`recent <= previous * 0.95` → improving ; `recent >= previous * 1.05` → worsening ; sinon stable). Une fenêtre sans valeur → `trend: null`.
17. **`learnedCount`** : nombre de cartes dont `introducedInSession === record.id`.
18. **`buildNeckMap`** : 72 cellules, cordes `1..6` puis cases `0..11`. Statuts locate/identify via `cardStatus`. `medianColdReactionMs` et `coldAccuracy` agrègent les tentatives à froid des deux clés de la case ; précision = justes / total à froid ; `null` si aucune tentative à froid.
19. **Mélange** : Fisher–Yates avec `random()` injectable.
20. **Helpers FSRS** : `fromScheduling` / `toScheduling` ; scheduler unique créé avec `generatorParameters({ enable_fuzz: false, relearning_steps: ['1h'] })`.

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `src/lib/domain/progress/constants.ts` | Constantes de progression nommées |
| `src/lib/domain/progress/temperature.ts` | `classifyTemperature` |
| `src/lib/domain/progress/lead.ts` | `leadForThreshold`, `isDirectRecall` (interne paquet), `adjustLeadBeats` (interne) |
| `src/lib/domain/progress/scheduling.ts` | Conversion FSRS ↔ `SchedulingState`, notes, introduction, graduation |
| `src/lib/domain/progress/cards.ts` | `introduceCard`, `applyColdAttempt`, `placementCard`, `isAcquired`, `isMastered`, `cardStatus` |
| `src/lib/domain/progress/curriculum.ts` | `unlockedSets`, `nextNewTargets` |
| `src/lib/domain/progress/plans.ts` | `buildDailyPlan`, `buildPlacementPlan`, `buildFreePlan`, `nextSuggestedAt` |
| `src/lib/domain/progress/stats.ts` | `computeHomeStats`, `summarizeSession`, `buildNeckMap` |
| `src/lib/domain/progress/index.ts` | Réexporte l'API publique du README |
| `src/lib/domain/progress/*.spec.ts` | Un fichier de test par module public |

---

### Task 1: Constantes

**Files:**
- Create: `src/lib/domain/progress/constants.ts`
- Test: `src/lib/domain/progress/constants.spec.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `MIN_COLD_DELAY_MS`, `DAILY_COLD_CAP`, `NEW_PER_SESSION`, `UNLOCK_RATIO`, `MASTERY_ACCURACY`, `MASTERY_SESSIONS`, `MASTERY_MIN_GAP_MS`, `NEXT_SESSION_GAP_MS`, `TREND_WINDOW_MS`, `TREND_RATIO`.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/domain/progress/constants.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import {
	DAILY_COLD_CAP,
	MASTERY_ACCURACY,
	MASTERY_MIN_GAP_MS,
	MASTERY_SESSIONS,
	MIN_COLD_DELAY_MS,
	NEW_PER_SESSION,
	NEXT_SESSION_GAP_MS,
	TREND_RATIO,
	TREND_WINDOW_MS,
	UNLOCK_RATIO
} from './constants';

describe('progress constants', () => {
	it('matches the README starting values', () => {
		expect(MIN_COLD_DELAY_MS).toBe(60 * 60 * 1000);
		expect(DAILY_COLD_CAP).toBe(20);
		expect(NEW_PER_SESSION).toBe(3);
		expect(UNLOCK_RATIO).toBe(0.8);
		expect(MASTERY_ACCURACY).toBe(0.9);
		expect(MASTERY_SESSIONS).toBe(3);
		expect(MASTERY_MIN_GAP_MS).toBe(72 * 60 * 60 * 1000);
		expect(NEXT_SESSION_GAP_MS).toBe(2 * 60 * 60 * 1000);
		expect(TREND_WINDOW_MS).toBe(7 * 24 * 60 * 60 * 1000);
		expect(TREND_RATIO).toBe(0.05);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/domain/progress/constants.spec.ts`
Expected: FAIL, « Failed to resolve import "./constants" ».

- [ ] **Step 3: Écrire les constantes**

Créer `src/lib/domain/progress/constants.ts` :

```ts
/** Minimum gap after the previous attempt before the next one counts as cold. To calibrate. */
export const MIN_COLD_DELAY_MS = 60 * 60 * 1000;

/** Max cold review prompts in one daily session. To calibrate. */
export const DAILY_COLD_CAP = 20;

/** New targets introduced per daily session (warm learning). To calibrate. */
export const NEW_PER_SESSION = 3;

/** Fraction of a required set that must be acquired to unlock the next. To calibrate. */
export const UNLOCK_RATIO = 0.8;

/** Minimum share of cold attempts that must be direct recalls for mastery. To calibrate. */
export const MASTERY_ACCURACY = 0.9;

/** Distinct sessions with a cold direct-recall success required for mastery. To calibrate. */
export const MASTERY_SESSIONS = 3;

/** Minimum gap between the two latest successful mastery sessions. To calibrate. */
export const MASTERY_MIN_GAP_MS = 72 * 60 * 60 * 1000;

/** Suggested rest before the next session after a summary. To calibrate. */
export const NEXT_SESSION_GAP_MS = 2 * 60 * 60 * 1000;

/** Home-stats trend window length (7 days). To calibrate. */
export const TREND_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Relative change that counts as improving / worsening. To calibrate. */
export const TREND_RATIO = 0.05;
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/domain/progress/constants.spec.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/progress/constants.ts src/lib/domain/progress/constants.spec.ts
git commit -m "feat(progress): add progression constants"
```

---

### Task 2: Température

**Files:**
- Create: `src/lib/domain/progress/temperature.ts`
- Test: `src/lib/domain/progress/temperature.spec.ts`

**Interfaces:**
- Consumes: `MIN_COLD_DELAY_MS` (Task 1) ; `Temperature` de `$lib/domain/types`.
- Produces: `classifyTemperature(input: { lastAttemptAt: number | null; attemptedInSession: boolean; now: number }): Temperature`.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/domain/progress/temperature.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { MIN_COLD_DELAY_MS } from './constants';
import { classifyTemperature } from './temperature';

const NOW = 1_000_000;

describe('classifyTemperature', () => {
	it('is cold when never attempted and not yet tried this session', () => {
		expect(
			classifyTemperature({ lastAttemptAt: null, attemptedInSession: false, now: NOW })
		).toBe('cold');
	});

	it('is hot once the card was already tried in this session', () => {
		expect(
			classifyTemperature({
				lastAttemptAt: NOW - MIN_COLD_DELAY_MS * 2,
				attemptedInSession: true,
				now: NOW
			})
		).toBe('hot');
	});

	it('is hot when the previous attempt is still inside the cold delay', () => {
		expect(
			classifyTemperature({
				lastAttemptAt: NOW - MIN_COLD_DELAY_MS + 1,
				attemptedInSession: false,
				now: NOW
			})
		).toBe('hot');
	});

	it('is cold when the previous attempt is at least MIN_COLD_DELAY_MS ago', () => {
		expect(
			classifyTemperature({
				lastAttemptAt: NOW - MIN_COLD_DELAY_MS,
				attemptedInSession: false,
				now: NOW
			})
		).toBe('cold');
		expect(
			classifyTemperature({
				lastAttemptAt: NOW - MIN_COLD_DELAY_MS - 1,
				attemptedInSession: false,
				now: NOW
			})
		).toBe('cold');
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/domain/progress/temperature.spec.ts`
Expected: FAIL, « Failed to resolve import "./temperature" ».

- [ ] **Step 3: Écrire `classifyTemperature`**

Créer `src/lib/domain/progress/temperature.ts` :

```ts
import type { Temperature } from '$lib/domain/types';
import { MIN_COLD_DELAY_MS } from './constants';

export function classifyTemperature(input: {
	lastAttemptAt: number | null;
	attemptedInSession: boolean;
	now: number;
}): Temperature {
	if (input.attemptedInSession) return 'hot';
	if (input.lastAttemptAt === null) return 'cold';
	return input.now - input.lastAttemptAt >= MIN_COLD_DELAY_MS ? 'cold' : 'hot';
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/domain/progress/temperature.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/progress/temperature.ts src/lib/domain/progress/temperature.spec.ts
git commit -m "feat(progress): classify cold vs hot temperature"
```

---

### Task 3: Annonce et rappel direct

**Files:**
- Create: `src/lib/domain/progress/lead.ts`
- Test: `src/lib/domain/progress/lead.spec.ts`

**Interfaces:**
- Consumes: `LEAD_STEPS`, `LeadBeats`, `RECALL_THRESHOLD_MS`, `Attempt` de `$lib/domain/types`.
- Produces:
  - `leadForThreshold(tempoBpm: number): LeadBeats`
  - `isDirectRecall(attempt: Pick<Attempt, 'correct' | 'reactionMs' | 'leadBeats'>, tempoBpm: number): boolean` — **interne au paquet**, non réexporté par `index.ts`
  - `adjustLeadBeats(current: LeadBeats, correct: boolean, direction: 'locate' | 'identify'): LeadBeats` — interne

- [ ] **Step 1: Écrire le test**

Créer `src/lib/domain/progress/lead.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { RECALL_THRESHOLD_MS } from '$lib/domain/types';
import { adjustLeadBeats, isDirectRecall, leadForThreshold } from './lead';

describe('leadForThreshold', () => {
	it('picks the longest step that still fits in RECALL_THRESHOLD_MS', () => {
		// 80 bpm: 2 beats = 1500 ms, 4 beats = 3000 ms
		expect(leadForThreshold(80)).toBe(2);
		// 60 bpm: 1 beat = 1000 ms, 2 beats = 2000 ms
		expect(leadForThreshold(60)).toBe(1);
		// 120 bpm: 2 beats = 1000 ms, 4 beats = 2000 ms
		expect(leadForThreshold(120)).toBe(2);
		// 40 bpm: even 1 beat = 1500 ms
		expect(leadForThreshold(40)).toBe(1);
	});

	it('never returns a step longer than the threshold allows', () => {
		for (const bpm of [60, 80, 100, 140]) {
			const beats = leadForThreshold(bpm);
			expect((beats * 60_000) / bpm).toBeLessThanOrEqual(RECALL_THRESHOLD_MS);
		}
	});
});

describe('isDirectRecall', () => {
	const TEMPO = 80;

	it('mode 2: uses reactionMs against the threshold', () => {
		expect(isDirectRecall({ correct: true, reactionMs: 0, leadBeats: null }, TEMPO)).toBe(true);
		expect(
			isDirectRecall({ correct: true, reactionMs: RECALL_THRESHOLD_MS, leadBeats: null }, TEMPO)
		).toBe(true);
		expect(
			isDirectRecall(
				{ correct: true, reactionMs: RECALL_THRESHOLD_MS + 1, leadBeats: null },
				TEMPO
			)
		).toBe(false);
		expect(isDirectRecall({ correct: false, reactionMs: 400, leadBeats: null }, TEMPO)).toBe(
			false
		);
		expect(isDirectRecall({ correct: true, reactionMs: null, leadBeats: null }, TEMPO)).toBe(
			false
		);
	});

	it('mode 1: uses lead duration, not reactionMs', () => {
		// 2 beats at 80 bpm = 1500 ms → direct even if reaction is slow
		expect(isDirectRecall({ correct: true, reactionMs: 1510, leadBeats: 2 }, TEMPO)).toBe(true);
		// 4 beats at 80 bpm = 3000 ms → not direct even if reaction looks fast
		expect(isDirectRecall({ correct: true, reactionMs: 100, leadBeats: 4 }, TEMPO)).toBe(false);
		expect(isDirectRecall({ correct: false, reactionMs: 1510, leadBeats: 2 }, TEMPO)).toBe(false);
	});
});

describe('adjustLeadBeats', () => {
	it('shortens one step on success and lengthens one on failure for locate', () => {
		expect(adjustLeadBeats(8, true, 'locate')).toBe(4);
		expect(adjustLeadBeats(4, true, 'locate')).toBe(2);
		expect(adjustLeadBeats(2, true, 'locate')).toBe(1);
		expect(adjustLeadBeats(1, true, 'locate')).toBe(1);
		expect(adjustLeadBeats(1, false, 'locate')).toBe(2);
		expect(adjustLeadBeats(2, false, 'locate')).toBe(4);
		expect(adjustLeadBeats(4, false, 'locate')).toBe(8);
		expect(adjustLeadBeats(8, false, 'locate')).toBe(8);
	});

	it('keeps identify cards at 1', () => {
		expect(adjustLeadBeats(1, true, 'identify')).toBe(1);
		expect(adjustLeadBeats(1, false, 'identify')).toBe(1);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/domain/progress/lead.spec.ts`
Expected: FAIL, « Failed to resolve import "./lead" ».

- [ ] **Step 3: Écrire `lead.ts`**

Créer `src/lib/domain/progress/lead.ts` :

```ts
import {
	LEAD_STEPS,
	RECALL_THRESHOLD_MS,
	type Attempt,
	type Direction,
	type LeadBeats
} from '$lib/domain/types';

/** Longest lead step whose duration at `tempoBpm` fits in RECALL_THRESHOLD_MS; at least 1. */
export function leadForThreshold(tempoBpm: number): LeadBeats {
	let best: LeadBeats = 1;
	for (const step of LEAD_STEPS) {
		if ((step * 60_000) / tempoBpm <= RECALL_THRESHOLD_MS) {
			best = step;
		}
	}
	return best;
}

/**
 * Mode 1 (`leadBeats` set): correct and lead duration ≤ RECALL_THRESHOLD_MS.
 * Mode 2 (`leadBeats` null): correct and reactionMs ≤ RECALL_THRESHOLD_MS.
 * Package-internal — not part of the public C API (plan B owns the scoring export).
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

/** One LEAD_STEPS step shorter on success, one longer on failure; identify stays at 1. */
export function adjustLeadBeats(
	current: LeadBeats,
	correct: boolean,
	direction: Direction
): LeadBeats {
	if (direction === 'identify') return 1;
	const index = LEAD_STEPS.indexOf(current);
	const nextIndex = correct ? Math.min(index + 1, LEAD_STEPS.length - 1) : Math.max(index - 1, 0);
	return LEAD_STEPS[nextIndex];
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/domain/progress/lead.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/progress/lead.ts src/lib/domain/progress/lead.spec.ts
git commit -m "feat(progress): lead steps and direct-recall helper"
```

---

### Task 4: Ordonnancement FSRS

**Files:**
- Create: `src/lib/domain/progress/scheduling.ts`
- Test: `src/lib/domain/progress/scheduling.spec.ts`

**Interfaces:**
- Consumes: `SchedulingState` de `$lib/domain/types` ; `ts-fsrs` (`fsrs`, `createEmptyCard`, `generatorParameters`, `Rating`, `State`, `Card`).
- Produces (internes au paquet) :
  - `toScheduling(card: Card): SchedulingState`
  - `fromScheduling(state: SchedulingState): Card`
  - `introScheduling(now: number): SchedulingState` — `New`, `due = now + MIN_COLD_DELAY_MS`
  - `graduateToReview(now: number): SchedulingState` — `Easy` une fois depuis une carte vide
  - `reviewScheduling(state: SchedulingState, grade: Rating, now: number): SchedulingState`
  - réexport type `Rating` usage via import dans cards

- [ ] **Step 1: Écrire le test**

Créer `src/lib/domain/progress/scheduling.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { Rating, State } from 'ts-fsrs';
import { MIN_COLD_DELAY_MS } from './constants';
import {
	fromScheduling,
	graduateToReview,
	introScheduling,
	reviewScheduling,
	toScheduling
} from './scheduling';

const NOW = Date.parse('2026-03-01T12:00:00.000Z');

describe('introScheduling', () => {
	it('starts in New with due after the cold delay', () => {
		const state = introScheduling(NOW);
		expect(state.state).toBe(State.New);
		expect(state.due).toBe(NOW + MIN_COLD_DELAY_MS);
		expect(state.reps).toBe(0);
		expect(state.lastReview).toBeNull();
	});
});

describe('graduateToReview', () => {
	it('lands in Review via an internal Easy grade', () => {
		const state = graduateToReview(NOW);
		expect(state.state).toBe(State.Review);
		expect(state.reps).toBe(1);
		expect(state.due).toBeGreaterThan(NOW);
	});
});

describe('reviewScheduling', () => {
	it('sends a missed Review card into Relearning due about one hour later', () => {
		const review = graduateToReview(NOW);
		const missed = reviewScheduling(review, Rating.Again, NOW + 8 * 24 * 60 * 60 * 1000);
		expect(missed.state).toBe(State.Relearning);
		expect(missed.lapses).toBe(1);
		expect(missed.due - (NOW + 8 * 24 * 60 * 60 * 1000)).toBe(60 * 60 * 1000);
	});

	it('round-trips through fromScheduling / toScheduling', () => {
		const state = graduateToReview(NOW);
		expect(toScheduling(fromScheduling(state))).toEqual(state);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/domain/progress/scheduling.spec.ts`
Expected: FAIL, « Failed to resolve import "./scheduling" ».

- [ ] **Step 3: Écrire `scheduling.ts`**

Créer `src/lib/domain/progress/scheduling.ts` :

```ts
import {
	createEmptyCard,
	fsrs,
	generatorParameters,
	Rating,
	type Card
} from 'ts-fsrs';
import type { SchedulingState } from '$lib/domain/types';
import { MIN_COLD_DELAY_MS } from './constants';

const scheduler = fsrs(
	generatorParameters({
		enable_fuzz: false,
		relearning_steps: ['1h']
	})
);

export { Rating };

export function toScheduling(card: Card): SchedulingState {
	return {
		due: card.due.getTime(),
		stability: card.stability,
		difficulty: card.difficulty,
		elapsedDays: card.elapsed_days,
		scheduledDays: card.scheduled_days,
		learningSteps: card.learning_steps,
		reps: card.reps,
		lapses: card.lapses,
		state: card.state as SchedulingState['state'],
		lastReview: card.last_review ? card.last_review.getTime() : null
	};
}

export function fromScheduling(state: SchedulingState): Card {
	return {
		due: new Date(state.due),
		stability: state.stability,
		difficulty: state.difficulty,
		elapsed_days: state.elapsedDays,
		scheduled_days: state.scheduledDays,
		learning_steps: state.learningSteps,
		reps: state.reps,
		lapses: state.lapses,
		state: state.state,
		last_review: state.lastReview === null ? undefined : new Date(state.lastReview)
	};
}

/** New card whose first cold review is due after MIN_COLD_DELAY_MS. */
export function introScheduling(now: number): SchedulingState {
	const card = createEmptyCard(new Date(now));
	const state = toScheduling(card);
	return { ...state, due: now + MIN_COLD_DELAY_MS };
}

/** Placement shortcut: one internal Easy grade to enter Review immediately. */
export function graduateToReview(now: number): SchedulingState {
	const empty = createEmptyCard(new Date(now));
	const { card } = scheduler.next(empty, new Date(now), Rating.Easy);
	return toScheduling(card);
}

export function reviewScheduling(
	state: SchedulingState,
	grade: (typeof Rating)[keyof typeof Rating],
	now: number
): SchedulingState {
	const { card } = scheduler.next(fromScheduling(state), new Date(now), grade);
	return toScheduling(card);
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/domain/progress/scheduling.spec.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/progress/scheduling.ts src/lib/domain/progress/scheduling.spec.ts
git commit -m "feat(progress): wrap ts-fsrs scheduling conversions"
```

---

### Task 5: Cartes — cycle de vie

**Files:**
- Create: `src/lib/domain/progress/cards.ts`
- Test: `src/lib/domain/progress/cards.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–4 ; `cardKey` et les types de `$lib/domain/types`.
- Produces:
  - `introduceCard(target: Target, now: number, sessionId: string): CardState`
  - `placementCard(target: LocateTarget, attempt: Attempt, now: number, sessionId: string, tempoBpm: number): CardState | null`
  - `applyColdAttempt(state: CardState, attempt: Attempt, history: readonly Attempt[], now: number, tempoBpm: number): CardState`
  - `isAcquired(state: CardState, history: readonly Attempt[], tempoBpm: number): boolean`
  - `isMastered(history: readonly Attempt[], tempoBpm: number): boolean`
  - `cardStatus(state: CardState | undefined): CardStatus`

`history` pour `applyColdAttempt` : toutes les tentatives de la carte, plus ancienne d'abord, **y compris** `attempt`. `tempoBpm` est celui de la session.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/domain/progress/cards.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import {
	cardKey,
	type Attempt,
	type CardState,
	type LocateTarget
} from '$lib/domain/types';
import { State } from 'ts-fsrs';
import { MIN_COLD_DELAY_MS } from './constants';
import {
	applyColdAttempt,
	cardStatus,
	introduceCard,
	isAcquired,
	isMastered,
	placementCard
} from './cards';

const NOW = Date.parse('2026-04-01T10:00:00.000Z');
const TEMPO = 80;
const LOCATE: LocateTarget = { direction: 'locate', string: 6, pitch: 'G' };
const IDENTIFY = { direction: 'identify' as const, string: 6, fret: 3 };

function attempt(overrides: Partial<Attempt>): Attempt {
	return {
		sessionId: 's-review',
		cardKey: cardKey(LOCATE),
		target: LOCATE,
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: 2,
		promptedAt: NOW,
		answer: { kind: 'note', midi: 43 },
		correct: true,
		verdict: 'perfect',
		timingOffsetMs: 0,
		reactionMs: 1600,
		confusion: null,
		...overrides
	};
}

describe('introduceCard', () => {
	it('creates a New locate card due after the cold delay with lead 8', () => {
		const card = introduceCard(LOCATE, NOW, 's-learn');
		expect(card.key).toBe('locate:6:G');
		expect(card.introducedAt).toBe(NOW);
		expect(card.introducedInSession).toBe('s-learn');
		expect(card.leadBeats).toBe(8);
		expect(card.scheduling.state).toBe(State.New);
		expect(card.scheduling.due).toBe(NOW + MIN_COLD_DELAY_MS);
		expect(card.acquiredAt).toBeNull();
		expect(card.masteredAt).toBeNull();
	});

	it('creates identify cards with lead 1', () => {
		expect(introduceCard(IDENTIFY, NOW, 's-learn').leadBeats).toBe(1);
	});
});

describe('placementCard', () => {
	it('returns null when the answer is wrong or not direct recall', () => {
		expect(
			placementCard(LOCATE, attempt({ correct: false, leadBeats: 2 }), NOW, 's-p', 80)
		).toBeNull();
		expect(
			placementCard(LOCATE, attempt({ correct: true, leadBeats: 4 }), NOW, 's-p', 80)
		).toBeNull();
	});

	it('creates an acquired Review card on direct-recall success', () => {
		const card = placementCard(
			LOCATE,
			attempt({ correct: true, leadBeats: 2, sessionId: 's-p' }),
			NOW,
			's-p',
			80
		);
		expect(card).not.toBeNull();
		expect(card!.scheduling.state).toBe(State.Review);
		expect(card!.acquiredAt).toBe(NOW);
		expect(card!.introducedInSession).toBe('s-p');
		expect(card!.leadBeats).toBe(2);
	});
});

describe('applyColdAttempt', () => {
	it('ignores hot attempts', () => {
		const state = introduceCard(LOCATE, NOW - MIN_COLD_DELAY_MS, 's0');
		const hot = attempt({ temperature: 'hot', leadBeats: 8 });
		expect(applyColdAttempt(state, hot, [hot], NOW, TEMPO)).toEqual(state);
	});

	it('shortens lead and grades Good on cold direct recall in a later session', () => {
		const introduced = NOW - MIN_COLD_DELAY_MS;
		const state = introduceCard(LOCATE, introduced, 's-learn');
		const due = { ...state, scheduling: { ...state.scheduling, due: NOW } };
		const cold = attempt({
			sessionId: 's-review',
			leadBeats: 8,
			correct: true,
			promptedAt: NOW
		});
		// lead 8 at 80 bpm is not direct recall → Hard, but still shortens lead
		const afterHard = applyColdAttempt(due, cold, [cold], NOW, TEMPO);
		expect(afterHard.leadBeats).toBe(4);
		expect(afterHard.acquiredAt).toBeNull();
		expect(afterHard.scheduling.reps).toBe(1);

		const direct = attempt({
			sessionId: 's-review-2',
			leadBeats: 2,
			correct: true,
			promptedAt: NOW + 60_000
		});
		const history = [cold, direct];
		const afterGood = applyColdAttempt(afterHard, direct, history, NOW + 60_000, TEMPO);
		expect(afterGood.leadBeats).toBe(2);
		expect(afterGood.acquiredAt).toBe(NOW + 60_000);
	});

	it('lengthens lead and grades Again on a miss', () => {
		const state: CardState = {
			...introduceCard(LOCATE, NOW - MIN_COLD_DELAY_MS, 's0'),
			leadBeats: 2
		};
		const miss = attempt({ correct: false, leadBeats: 2, verdict: 'wrong' });
		const after = applyColdAttempt(state, miss, [miss], NOW, TEMPO);
		expect(after.leadBeats).toBe(4);
		expect(after.scheduling.reps).toBeGreaterThanOrEqual(1);
	});
});

describe('isAcquired / isMastered / cardStatus', () => {
	it('cardStatus walks unseen → learning → acquired → mastered', () => {
		expect(cardStatus(undefined)).toBe('unseen');
		const learning = introduceCard(LOCATE, NOW, 's0');
		expect(cardStatus(learning)).toBe('learning');
		expect(cardStatus({ ...learning, acquiredAt: NOW })).toBe('acquired');
		expect(cardStatus({ ...learning, acquiredAt: NOW, masteredAt: NOW })).toBe('mastered');
	});

	it('isAcquired is true once acquiredAt is set, or from a later-session direct recall', () => {
		const state = introduceCard(LOCATE, NOW, 's-learn');
		expect(isAcquired(state, [], TEMPO)).toBe(false);
		const later = attempt({
			sessionId: 's-later',
			leadBeats: 2,
			correct: true,
			temperature: 'cold',
			promptedAt: NOW + MIN_COLD_DELAY_MS
		});
		expect(isAcquired(state, [later], TEMPO)).toBe(true);
		expect(isAcquired({ ...state, acquiredAt: NOW }, [], TEMPO)).toBe(true);
	});

	it('isMastered requires accuracy, three successful sessions, and a 72h gap', () => {
		const day = 24 * 60 * 60 * 1000;
		const sessions = ['a', 'b', 'c'] as const;
		const times = [NOW, NOW + day, NOW + 4 * day];
		const history: Attempt[] = [];
		for (let i = 0; i < 3; i++) {
			history.push(
				attempt({
					sessionId: sessions[i],
					leadBeats: 2,
					correct: true,
					temperature: 'cold',
					promptedAt: times[i]
				})
			);
		}
		expect(isMastered(history, TEMPO)).toBe(true);

		// 10% miss breaks accuracy (need ≥ 90 %)
		const withMiss = [
			...history,
			attempt({
				sessionId: 'd',
				leadBeats: 2,
				correct: false,
				temperature: 'cold',
				promptedAt: NOW + 5 * day
			})
		];
		// 3/4 = 0.75 < 0.9
		expect(isMastered(withMiss, TEMPO)).toBe(false);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/domain/progress/cards.spec.ts`
Expected: FAIL, « Failed to resolve import "./cards" ».

- [ ] **Step 3: Écrire `cards.ts`**

Créer `src/lib/domain/progress/cards.ts` :

```ts
import {
	cardKey,
	type Attempt,
	type CardState,
	type CardStatus,
	type LocateTarget,
	type Target
} from '$lib/domain/types';
import { MASTERY_ACCURACY, MASTERY_MIN_GAP_MS, MASTERY_SESSIONS } from './constants';
import { adjustLeadBeats, isDirectRecall } from './lead';
import {
	Rating,
	graduateToReview,
	introScheduling,
	reviewScheduling
} from './scheduling';

function gradeFor(attempt: Attempt, tempoBpm: number): (typeof Rating)[keyof typeof Rating] {
	if (!attempt.correct) return Rating.Again;
	if (isDirectRecall(attempt, tempoBpm)) return Rating.Good;
	return Rating.Hard;
}

function qualifiesAsAcquired(state: CardState, attempt: Attempt, tempoBpm: number): boolean {
	if (attempt.temperature !== 'cold') return false;
	if (!isDirectRecall(attempt, tempoBpm)) return false;
	return attempt.sessionId !== state.introducedInSession;
}

/** New card after warm learning; first cold check is due after MIN_COLD_DELAY_MS. */
export function introduceCard(target: Target, now: number, sessionId: string): CardState {
	return {
		key: cardKey(target),
		target,
		introducedAt: now,
		introducedInSession: sessionId,
		leadBeats: target.direction === 'locate' ? 8 : 1,
		scheduling: introScheduling(now),
		acquiredAt: null,
		masteredAt: null
	};
}

/**
 * Placement success → Review + acquired. Failure or non-direct → null.
 * Uses the real session tempo for the direct-recall check.
 */
export function placementCard(
	target: LocateTarget,
	attempt: Attempt,
	now: number,
	sessionId: string,
	tempoBpm: number
): CardState | null {
	if (!isDirectRecall(attempt, tempoBpm)) return null;
	return {
		key: cardKey(target),
		target,
		introducedAt: now,
		introducedInSession: sessionId,
		leadBeats: attempt.leadBeats ?? 1,
		scheduling: graduateToReview(now),
		acquiredAt: now,
		masteredAt: null
	};
}

/**
 * Updates FSRS, lead, acquiredAt and masteredAt for a cold attempt.
 * `history` is every attempt of this card, oldest first, including `attempt`.
 */
export function applyColdAttempt(
	state: CardState,
	attempt: Attempt,
	history: readonly Attempt[],
	now: number,
	tempoBpm: number
): CardState {
	if (attempt.temperature !== 'cold') return state;

	const scheduling = reviewScheduling(state.scheduling, gradeFor(attempt, tempoBpm), now);
	const leadBeats = adjustLeadBeats(
		state.leadBeats,
		attempt.correct,
		state.target.direction
	);
	const acquiredAt =
		state.acquiredAt ?? (qualifiesAsAcquired(state, attempt, tempoBpm) ? now : null);
	const next: CardState = {
		...state,
		scheduling,
		leadBeats,
		acquiredAt
	};
	const masteredAt = next.masteredAt ?? (isMastered(history, tempoBpm) ? now : null);
	return { ...next, masteredAt };
}

export function isAcquired(
	state: CardState,
	history: readonly Attempt[],
	tempoBpm: number
): boolean {
	if (state.acquiredAt !== null) return true;
	return history.some((attempt) => qualifiesAsAcquired(state, attempt, tempoBpm));
}

export function isMastered(history: readonly Attempt[], tempoBpm: number): boolean {
	const cold = history.filter((attempt) => attempt.temperature === 'cold');
	if (cold.length === 0) return false;

	const directCount = cold.filter((attempt) => isDirectRecall(attempt, tempoBpm)).length;
	if (directCount / cold.length < MASTERY_ACCURACY) return false;

	const successBySession = new Map<string, number>();
	for (const attempt of cold) {
		if (!isDirectRecall(attempt, tempoBpm)) continue;
		const previous = successBySession.get(attempt.sessionId);
		if (previous === undefined || attempt.promptedAt > previous) {
			successBySession.set(attempt.sessionId, attempt.promptedAt);
		}
	}
	if (successBySession.size < MASTERY_SESSIONS) return false;

	const successTimes = [...successBySession.values()].sort((a, b) => a - b);
	const latest = successTimes[successTimes.length - 1];
	const previous = successTimes[successTimes.length - 2];
	return latest - previous >= MASTERY_MIN_GAP_MS;
}

export function cardStatus(state: CardState | undefined): CardStatus {
	if (!state) return 'unseen';
	if (state.masteredAt !== null) return 'mastered';
	if (state.acquiredAt !== null) return 'acquired';
	return 'learning';
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/domain/progress/cards.spec.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/progress/cards.ts src/lib/domain/progress/cards.spec.ts
git commit -m "feat(progress): introduce, place and update cards"
```

---

### Task 6: Déblocage du curriculum

**Files:**
- Create: `src/lib/domain/progress/curriculum.ts`
- Test: `src/lib/domain/progress/curriculum.spec.ts`

**Interfaces:**
- Consumes: `UNLOCK_RATIO` ; `cardKey`, `Curriculum`, `CardState`, `CurriculumSet`, `Target` de `$lib/domain/types` ; `card` acquis via `acquiredAt`.
- Produces: `unlockedSets(curriculum, cards)`, `nextNewTargets(curriculum, cards, count)`.

Les tests utilisent une **fixture** à trois ensembles, pas le curriculum du plan A.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/domain/progress/curriculum.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import {
	cardKey,
	type CardState,
	type Curriculum,
	type Target
} from '$lib/domain/types';
import { introduceCard } from './cards';
import { nextNewTargets, unlockedSets } from './curriculum';

const T1: Target = { direction: 'locate', string: 6, pitch: 'G' };
const T2: Target = { direction: 'locate', string: 6, pitch: 'A' };
const T3: Target = { direction: 'locate', string: 6, pitch: 'B' };
const T4: Target = { direction: 'locate', string: 6, pitch: 'E' };
const T5: Target = { direction: 'identify', string: 6, fret: 3 };

const FIXTURE: Curriculum = [
	{ id: 'locate-s6-a', direction: 'locate', requires: null, targets: [T1, T2, T3] },
	{ id: 'identify-s6-a', direction: 'identify', requires: 'locate-s6-a', targets: [T5] },
	{ id: 'locate-s6-b', direction: 'locate', requires: 'locate-s6-a', targets: [T4] }
];

function acquired(target: Target, now = 1): CardState {
	return { ...introduceCard(target, now, 's0'), acquiredAt: now };
}

describe('unlockedSets', () => {
	it('always unlocks sets with requires null', () => {
		expect(unlockedSets(FIXTURE, []).map((set) => set.id)).toEqual(['locate-s6-a']);
	});

	it('unlocks dependents at 80 % acquired of the required set', () => {
		// 2/3 ≈ 0.666 < 0.8
		expect(
			unlockedSets(FIXTURE, [acquired(T1), acquired(T2)]).map((set) => set.id)
		).toEqual(['locate-s6-a']);
		// 3/3 = 1 ≥ 0.8
		const open = unlockedSets(FIXTURE, [acquired(T1), acquired(T2), acquired(T3)]);
		expect(open.map((set) => set.id)).toEqual([
			'locate-s6-a',
			'identify-s6-a',
			'locate-s6-b'
		]);
	});
});

describe('nextNewTargets', () => {
	it('walks unlocked sets in order and skips existing cards', () => {
		const cards = [introduceCard(T1, 1, 's0')];
		expect(nextNewTargets(FIXTURE, cards, 2)).toEqual([T2, T3]);
	});

	it('does not reach locked sets', () => {
		expect(nextNewTargets(FIXTURE, [], 10)).toEqual([T1, T2, T3]);
	});

	it('offers identify targets once their locate set is acquired', () => {
		const cards = [acquired(T1), acquired(T2), acquired(T3)];
		expect(nextNewTargets(FIXTURE, cards, 2).map((t) => cardKey(t))).toEqual([
			cardKey(T5),
			cardKey(T4)
		]);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/domain/progress/curriculum.spec.ts`
Expected: FAIL, « Failed to resolve import "./curriculum" ».

- [ ] **Step 3: Écrire `curriculum.ts`**

Créer `src/lib/domain/progress/curriculum.ts` :

```ts
import {
	cardKey,
	type CardState,
	type Curriculum,
	type CurriculumSet,
	type Target
} from '$lib/domain/types';
import { UNLOCK_RATIO } from './constants';

function acquiredKeys(cards: readonly CardState[]): Set<string> {
	return new Set(cards.filter((card) => card.acquiredAt !== null).map((card) => card.key));
}

function isSetAcquiredEnough(
	set: CurriculumSet,
	acquired: ReadonlySet<string>
): boolean {
	if (set.targets.length === 0) return true;
	let count = 0;
	for (const target of set.targets) {
		if (acquired.has(cardKey(target))) count++;
	}
	return count / set.targets.length >= UNLOCK_RATIO;
}

export function unlockedSets(
	curriculum: Curriculum,
	cards: readonly CardState[]
): CurriculumSet[] {
	const acquired = acquiredKeys(cards);
	const byId = new Map(curriculum.map((set) => [set.id, set]));
	const unlocked: CurriculumSet[] = [];

	for (const set of curriculum) {
		if (set.requires === null) {
			unlocked.push(set);
			continue;
		}
		const required = byId.get(set.requires);
		if (required && isSetAcquiredEnough(required, acquired)) {
			unlocked.push(set);
		}
	}
	return unlocked;
}

export function nextNewTargets(
	curriculum: Curriculum,
	cards: readonly CardState[],
	count: number
): Target[] {
	const existing = new Set(cards.map((card) => card.key));
	const result: Target[] = [];
	for (const set of unlockedSets(curriculum, cards)) {
		for (const target of set.targets) {
			if (existing.has(cardKey(target))) continue;
			result.push(target);
			if (result.length >= count) return result;
		}
	}
	return result;
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/domain/progress/curriculum.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/progress/curriculum.ts src/lib/domain/progress/curriculum.spec.ts
git commit -m "feat(progress): unlock curriculum sets and pick new targets"
```

---

### Task 7: Plans de session

**Files:**
- Create: `src/lib/domain/progress/plans.ts`
- Test: `src/lib/domain/progress/plans.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–6 ; types de session de `$lib/domain/types`.
- Produces: `buildDailyPlan`, `buildPlacementPlan`, `buildFreePlan`, `nextSuggestedAt`.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/domain/progress/plans.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type {
	CardState,
	Curriculum,
	LocateTarget,
	Target
} from '$lib/domain/types';
import { DAILY_COLD_CAP, MIN_COLD_DELAY_MS, NEW_PER_SESSION } from './constants';
import { introduceCard } from './cards';
import {
	buildDailyPlan,
	buildFreePlan,
	buildPlacementPlan,
	nextSuggestedAt
} from './plans';

const NOW = Date.parse('2026-05-01T12:00:00.000Z');

const L1: Target = { direction: 'locate', string: 6, pitch: 'G' };
const L2: Target = { direction: 'locate', string: 6, pitch: 'A' };
const L3: Target = { direction: 'locate', string: 6, pitch: 'B' };
const L4: Target = { direction: 'locate', string: 6, pitch: 'E' };
const I1: Target = { direction: 'identify', string: 6, fret: 3 };

const FIXTURE: Curriculum = [
	{ id: 'locate-s6-a', direction: 'locate', requires: null, targets: [L1, L2, L3] },
	{ id: 'identify-s6-a', direction: 'identify', requires: 'locate-s6-a', targets: [I1] },
	{ id: 'locate-s6-b', direction: 'locate', requires: 'locate-s6-a', targets: [L4] }
];

function dueCard(target: Target, due: number, session = 's0'): CardState {
	const card = introduceCard(target, due - MIN_COLD_DELAY_MS, session);
	return { ...card, scheduling: { ...card.scheduling, due } };
}

describe('buildDailyPlan', () => {
	it('puts locate before identify when dues are equal, then learning', () => {
		// L1 and I1 due at the same time → locate first. L2 already introduced. L3 unseen → learning.
		const plan = buildDailyPlan({
			cards: [
				dueCard(L1, NOW - 500),
				dueCard(I1, NOW - 500),
				introduceCard(L2, NOW - MIN_COLD_DELAY_MS * 2, 'old')
			],
			curriculum: FIXTURE,
			now: NOW,
			sessionId: 'daily-1'
		});

		expect(plan.kind).toBe('daily');
		expect(plan.id).toBe('daily-1');
		expect(plan.items[0]).toMatchObject({
			target: L1,
			phase: 'review',
			temperature: 'cold',
			aid: 'none',
			repeatUntilCorrect: false,
			leadBeats: 8
		});
		expect(plan.items[1]).toMatchObject({
			target: I1,
			phase: 'review',
			temperature: 'cold',
			leadBeats: null
		});
		const learning = plan.items.filter((item) => item.phase === 'learning');
		expect(learning.length).toBeLessThanOrEqual(NEW_PER_SESSION);
		expect(learning[0]).toMatchObject({
			target: L3,
			phase: 'learning',
			temperature: 'hot',
			aid: 'show-position',
			leadBeats: 8,
			repeatUntilCorrect: true
		});
	});

	it('skips learning when asked and caps cold reviews', () => {
		const many = Array.from({ length: DAILY_COLD_CAP + 5 }, (_, i) => {
			const pitch = (['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const)[
				i % 12
			];
			const string = ((i % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6;
			return dueCard(
				{ direction: 'locate', string, pitch },
				NOW - (DAILY_COLD_CAP + 5 - i)
			);
		});
		const plan = buildDailyPlan({
			cards: many,
			curriculum: FIXTURE,
			now: NOW,
			sessionId: 'daily-2',
			skipLearning: true
		});
		expect(plan.items).toHaveLength(DAILY_COLD_CAP);
		expect(plan.items.every((item) => item.phase === 'review')).toBe(true);
	});
});

describe('buildPlacementPlan', () => {
	it('plans every target cold, unaided, at the threshold lead, shuffled', () => {
		const targets: LocateTarget[] = [
			{ direction: 'locate', string: 6, pitch: 'E' },
			{ direction: 'locate', string: 6, pitch: 'F' },
			{ direction: 'locate', string: 5, pitch: 'A' }
		];
		const seq = [0.9, 0.1, 0.5];
		let i = 0;
		const plan = buildPlacementPlan({
			targets,
			now: NOW,
			sessionId: 'place-1',
			tempoBpm: 80,
			random: () => seq[i++] ?? 0
		});
		expect(plan.kind).toBe('placement');
		expect(plan.items).toHaveLength(3);
		expect(plan.items.every((item) => item.phase === 'placement')).toBe(true);
		expect(plan.items.every((item) => item.temperature === 'cold')).toBe(true);
		expect(plan.items.every((item) => item.aid === 'none')).toBe(true);
		expect(plan.items.every((item) => item.leadBeats === 2)).toBe(true);
		expect(plan.items.every((item) => item.repeatUntilCorrect === false)).toBe(true);
		expect(new Set(plan.items.map((item) => JSON.stringify(item.target))).size).toBe(3);
	});
});

describe('buildFreePlan', () => {
	it('samples existing cards as hot free items', () => {
		const cards = [introduceCard(L1, NOW, 's0'), introduceCard(I1, NOW, 's0')];
		const plan = buildFreePlan({
			cards,
			now: NOW,
			sessionId: 'free-1',
			count: 2,
			random: () => 0
		});
		expect(plan.kind).toBe('free');
		expect(plan.items).toHaveLength(2);
		expect(plan.items.every((item) => item.phase === 'free')).toBe(true);
		expect(plan.items.every((item) => item.temperature === 'hot')).toBe(true);
		const identify = plan.items.find((item) => item.target.direction === 'identify');
		expect(identify?.leadBeats).toBeNull();
	});
});

describe('nextSuggestedAt', () => {
	it('returns the earliest due, or null without cards', () => {
		expect(nextSuggestedAt([], NOW)).toBeNull();
		const cards = [dueCard(L1, NOW + 5000), dueCard(L2, NOW + 1000)];
		expect(nextSuggestedAt(cards, NOW)).toBe(NOW + 1000);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/domain/progress/plans.spec.ts`
Expected: FAIL, « Failed to resolve import "./plans" ».

- [ ] **Step 3: Écrire `plans.ts`**

Créer `src/lib/domain/progress/plans.ts` :

```ts
import {
	type CardState,
	type Curriculum,
	type LocateTarget,
	type PlannedItem,
	type SessionPlan,
	type Target
} from '$lib/domain/types';
import { DAILY_COLD_CAP, NEW_PER_SESSION } from './constants';
import { nextNewTargets } from './curriculum';
import { leadForThreshold } from './lead';

function shuffle<T>(items: readonly T[], random: () => number): T[] {
	const result = [...items];
	for (let i = result.length - 1; i > 0; i--) {
		const j = Math.floor(random() * (i + 1));
		[result[i], result[j]] = [result[j], result[i]];
	}
	return result;
}

function directionRank(target: Target): number {
	return target.direction === 'locate' ? 0 : 1;
}

function dueCards(cards: readonly CardState[], now: number): CardState[] {
	return cards
		.filter((card) => card.scheduling.due <= now)
		.sort((a, b) => {
			if (a.scheduling.due !== b.scheduling.due) return a.scheduling.due - b.scheduling.due;
			const byDirection = directionRank(a.target) - directionRank(b.target);
			if (byDirection !== 0) return byDirection;
			return a.key.localeCompare(b.key);
		});
}

function reviewItem(card: CardState): PlannedItem {
	return {
		target: card.target,
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: card.target.direction === 'locate' ? card.leadBeats : null,
		repeatUntilCorrect: false
	};
}

function learningItem(target: Target): PlannedItem {
	return {
		target,
		phase: 'learning',
		temperature: 'hot',
		aid: target.direction === 'locate' ? 'show-position' : 'none',
		leadBeats: target.direction === 'locate' ? 8 : null,
		repeatUntilCorrect: true
	};
}

export function buildDailyPlan(input: {
	cards: readonly CardState[];
	curriculum: Curriculum;
	now: number;
	sessionId: string;
	skipLearning?: boolean;
}): SessionPlan {
	const reviews = dueCards(input.cards, input.now)
		.slice(0, DAILY_COLD_CAP)
		.map(reviewItem);
	const learning = input.skipLearning
		? []
		: nextNewTargets(input.curriculum, input.cards, NEW_PER_SESSION).map(learningItem);
	return {
		id: input.sessionId,
		kind: 'daily',
		createdAt: input.now,
		items: [...reviews, ...learning]
	};
}

export function buildPlacementPlan(input: {
	targets: readonly LocateTarget[];
	now: number;
	sessionId: string;
	tempoBpm: number;
	random?: () => number;
}): SessionPlan {
	const random = input.random ?? Math.random;
	const leadBeats = leadForThreshold(input.tempoBpm);
	const items = shuffle(input.targets, random).map(
		(target): PlannedItem => ({
			target,
			phase: 'placement',
			temperature: 'cold',
			aid: 'none',
			leadBeats,
			repeatUntilCorrect: false
		})
	);
	return {
		id: input.sessionId,
		kind: 'placement',
		createdAt: input.now,
		items
	};
}

export function buildFreePlan(input: {
	cards: readonly CardState[];
	now: number;
	sessionId: string;
	count?: number;
	random?: () => number;
}): SessionPlan {
	const random = input.random ?? Math.random;
	const count = input.count ?? DAILY_COLD_CAP;
	const picked = shuffle(input.cards, random).slice(0, count);
	const items = picked.map(
		(card): PlannedItem => ({
			target: card.target,
			phase: 'free',
			temperature: 'hot',
			aid: 'none',
			leadBeats: card.target.direction === 'locate' ? card.leadBeats : null,
			repeatUntilCorrect: false
		})
	);
	return {
		id: input.sessionId,
		kind: 'free',
		createdAt: input.now,
		items
	};
}

export function nextSuggestedAt(cards: readonly CardState[], now: number): number | null {
	void now;
	if (cards.length === 0) return null;
	return Math.min(...cards.map((card) => card.scheduling.due));
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/domain/progress/plans.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/progress/plans.ts src/lib/domain/progress/plans.spec.ts
git commit -m "feat(progress): build daily, placement and free plans"
```

---

### Task 8: Statistiques

**Files:**
- Create: `src/lib/domain/progress/stats.ts`
- Test: `src/lib/domain/progress/stats.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–7 ; `median` de `$lib/domain/stats` ; types stats de `$lib/domain/types`.
- Produces: `computeHomeStats`, `summarizeSession`, `buildNeckMap`.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/domain/progress/stats.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	cardKey,
	type Attempt,
	type CardState,
	type Curriculum,
	type SessionRecord,
	type Target
} from '$lib/domain/types';
import type { PitchName, StringNumber } from '$lib/domain/music/types';
import {
	MIN_COLD_DELAY_MS,
	NEXT_SESSION_GAP_MS,
	TREND_WINDOW_MS
} from './constants';
import { introduceCard } from './cards';
import { buildNeckMap, computeHomeStats, summarizeSession } from './stats';

const NOW = Date.parse('2026-06-15T12:00:00.000Z');

const L1: Target = { direction: 'locate', string: 1, pitch: 'E' };
const L2: Target = { direction: 'locate', string: 1, pitch: 'F' };
const L3: Target = { direction: 'locate', string: 1, pitch: 'F#' };

const FIXTURE: Curriculum = [
	{ id: 'locate-s1-a', direction: 'locate', requires: null, targets: [L1, L2, L3] }
];

function coldAttempt(overrides: Partial<Attempt>): Attempt {
	return {
		sessionId: 's1',
		cardKey: cardKey(L1),
		target: L1,
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: 2,
		promptedAt: NOW,
		answer: { kind: 'note', midi: 64 },
		correct: true,
		verdict: 'perfect',
		timingOffsetMs: 0,
		reactionMs: 1000,
		confusion: null,
		...overrides
	};
}

describe('computeHomeStats', () => {
	it('asks for placement until placementDoneAt is set', () => {
		const stats = computeHomeStats({
			cards: [],
			attempts: [],
			settings: { ...DEFAULT_SETTINGS, placementDoneAt: null },
			curriculum: FIXTURE,
			now: NOW
		});
		expect(stats.nextAction).toBe('placement');
		expect(stats.nextReviewAt).toBeNull();
	});

	it('suggests a session when reviews are due or new targets exist', () => {
		const due: CardState = {
			...introduceCard(L1, NOW - MIN_COLD_DELAY_MS, 's0'),
			scheduling: {
				...introduceCard(L1, NOW - MIN_COLD_DELAY_MS, 's0').scheduling,
				due: NOW - 1
			}
		};
		expect(
			computeHomeStats({
				cards: [due],
				attempts: [],
				settings: { ...DEFAULT_SETTINGS, placementDoneAt: NOW - 1 },
				curriculum: FIXTURE,
				now: NOW
			}).nextAction
		).toBe('session');
	});

	it('waits with the next review time when nothing is due and nothing new', () => {
		const cards = [L1, L2, L3].map((target) => {
			const card = introduceCard(target, NOW - MIN_COLD_DELAY_MS, 's0');
			return {
				...card,
				acquiredAt: NOW - MIN_COLD_DELAY_MS,
				scheduling: { ...card.scheduling, due: NOW + 10_000 }
			};
		});
		const stats = computeHomeStats({
			cards,
			attempts: [],
			settings: { ...DEFAULT_SETTINGS, placementDoneAt: NOW - 1 },
			curriculum: FIXTURE,
			now: NOW
		});
		expect(stats.nextAction).toBe('wait');
		expect(stats.nextReviewAt).toBe(NOW + 10_000);
	});

	it('computes median cold reaction and a 7-day trend', () => {
		const recent = [
			coldAttempt({ promptedAt: NOW - 1000, reactionMs: 800 }),
			coldAttempt({ promptedAt: NOW - 2000, reactionMs: 900 })
		];
		const previous = [
			coldAttempt({
				promptedAt: NOW - TREND_WINDOW_MS - 1000,
				reactionMs: 1200
			}),
			coldAttempt({
				promptedAt: NOW - TREND_WINDOW_MS - 2000,
				reactionMs: 1300
			})
		];
		const stats = computeHomeStats({
			cards: [],
			attempts: [...previous, ...recent],
			settings: { ...DEFAULT_SETTINGS, placementDoneAt: NOW },
			curriculum: FIXTURE,
			now: NOW
		});
		expect(stats.medianColdReactionMs).toBe(1050);
		expect(stats.trend).toBe('improving');
	});

	it('returns a null trend when either window is empty', () => {
		const stats = computeHomeStats({
			cards: [],
			attempts: [coldAttempt({ promptedAt: NOW - 1000, reactionMs: 900 })],
			settings: { ...DEFAULT_SETTINGS, placementDoneAt: NOW },
			curriculum: FIXTURE,
			now: NOW
		});
		expect(stats.trend).toBeNull();
	});
});

describe('summarizeSession', () => {
	it('summarizes cold accuracy, learning and the suggested next time', () => {
		const record: SessionRecord = {
			id: 'sess',
			kind: 'daily',
			startedAt: NOW - 60_000,
			endedAt: NOW,
			fatigueDetected: true
		};
		const attempts = [
			coldAttempt({
				sessionId: 'sess',
				correct: true,
				reactionMs: 900,
				promptedAt: NOW - 30_000
			}),
			coldAttempt({
				sessionId: 'sess',
				correct: false,
				reactionMs: 1100,
				promptedAt: NOW - 20_000,
				verdict: 'wrong'
			}),
			coldAttempt({
				sessionId: 'sess',
				temperature: 'hot',
				reactionMs: 500,
				promptedAt: NOW - 10_000
			})
		];
		const cards = [
			introduceCard(L1, NOW - 30_000, 'sess'),
			{
				...introduceCard(L2, NOW - MIN_COLD_DELAY_MS * 2, 'older'),
				scheduling: {
					...introduceCard(L2, NOW - MIN_COLD_DELAY_MS * 2, 'older').scheduling,
					due: NOW + 1000
				}
			}
		];
		const summary = summarizeSession({ record, attempts, cards, now: NOW });
		expect(summary).toEqual({
			sessionId: 'sess',
			coldCount: 2,
			coldCorrect: 1,
			medianColdReactionMs: 1000,
			learnedCount: 1,
			fatigueDetected: true,
			nextSuggestedAt: NOW + NEXT_SESSION_GAP_MS
		});
	});
});

describe('buildNeckMap', () => {
	it('builds 72 cells with injected pitches and per-sense status', () => {
		const locate = {
			...introduceCard(
				{ direction: 'locate', string: 2, pitch: 'C' },
				NOW,
				's0'
			),
			acquiredAt: NOW
		};
		const identify = introduceCard(
			{ direction: 'identify', string: 2, fret: 1 },
			NOW,
			's0'
		);
		const attempts = [
			coldAttempt({
				cardKey: locate.key,
				target: locate.target,
				reactionMs: 700,
				correct: true,
				promptedAt: NOW - 1
			}),
			coldAttempt({
				cardKey: identify.key,
				target: identify.target,
				leadBeats: null,
				reactionMs: 900,
				correct: false,
				promptedAt: NOW - 2
			})
		];
		const cells = buildNeckMap({
			cards: [locate, identify],
			attempts,
			pitchAt: (string: StringNumber, fret: number): PitchName => {
				void string;
				const names: PitchName[] = [
					'E',
					'F',
					'F#',
					'G',
					'G#',
					'A',
					'A#',
					'B',
					'C',
					'C#',
					'D',
					'D#'
				];
				return names[fret]!;
			}
		});
		expect(cells).toHaveLength(72);
		expect(cells[0]).toMatchObject({ string: 1, fret: 0, pitch: 'E' });
		const identifyCell = cells.find((c) => c.string === 2 && c.fret === 1);
		expect(identifyCell?.pitch).toBe('F');
		expect(identifyCell?.locate).toBe('unseen');
		expect(identifyCell?.identify).toBe('learning');
		// Fake pitchAt: fret 8 on any string is C
		const locateCell = cells.find((c) => c.string === 2 && c.fret === 8);
		expect(locateCell?.pitch).toBe('C');
		expect(locateCell?.locate).toBe('acquired');
		expect(locateCell?.medianColdReactionMs).toBe(700);
		expect(locateCell?.coldAccuracy).toBe(1);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/domain/progress/stats.spec.ts`
Expected: FAIL, « Failed to resolve import "./stats" ».

- [ ] **Step 3: Écrire `stats.ts`**

Créer `src/lib/domain/progress/stats.ts` :

```ts
import { median } from '$lib/domain/stats';
import type { PitchName, StringNumber } from '$lib/domain/music/types';
import {
	cardKey,
	type Attempt,
	type CardState,
	type Curriculum,
	type HomeStats,
	type NeckMapCell,
	type SessionRecord,
	type SessionSummary,
	type Settings
} from '$lib/domain/types';
import { NEXT_SESSION_GAP_MS, TREND_RATIO, TREND_WINDOW_MS } from './constants';
import { cardStatus } from './cards';
import { nextNewTargets } from './curriculum';
import { nextSuggestedAt } from './plans';

function coldWithReaction(attempts: readonly Attempt[]): Attempt[] {
	return attempts.filter(
		(attempt) => attempt.temperature === 'cold' && attempt.reactionMs !== null
	);
}

function medianReaction(attempts: readonly Attempt[]): number | null {
	return median(coldWithReaction(attempts).map((attempt) => attempt.reactionMs!));
}

function trendFor(attempts: readonly Attempt[], now: number): HomeStats['trend'] {
	const recentStart = now - TREND_WINDOW_MS;
	const previousStart = now - 2 * TREND_WINDOW_MS;
	const recent = medianReaction(
		attempts.filter((a) => a.promptedAt >= recentStart && a.promptedAt <= now)
	);
	const previous = medianReaction(
		attempts.filter((a) => a.promptedAt >= previousStart && a.promptedAt < recentStart)
	);
	if (recent === null || previous === null) return null;
	if (recent <= previous * (1 - TREND_RATIO)) return 'improving';
	if (recent >= previous * (1 + TREND_RATIO)) return 'worsening';
	return 'stable';
}

export function computeHomeStats(input: {
	cards: readonly CardState[];
	attempts: readonly Attempt[];
	settings: Settings;
	curriculum: Curriculum;
	now: number;
}): HomeStats {
	const medianColdReactionMs = medianReaction(input.attempts);
	const trend = trendFor(input.attempts, input.now);

	if (input.settings.placementDoneAt === null) {
		return {
			nextAction: 'placement',
			nextReviewAt: null,
			medianColdReactionMs,
			trend
		};
	}

	const hasDue = input.cards.some((card) => card.scheduling.due <= input.now);
	const hasNew = nextNewTargets(input.curriculum, input.cards, 1).length > 0;
	if (hasDue || hasNew) {
		return {
			nextAction: 'session',
			nextReviewAt: null,
			medianColdReactionMs,
			trend
		};
	}

	return {
		nextAction: 'wait',
		nextReviewAt: nextSuggestedAt(input.cards, input.now),
		medianColdReactionMs,
		trend
	};
}

export function summarizeSession(input: {
	record: SessionRecord;
	attempts: readonly Attempt[];
	cards: readonly CardState[];
	now: number;
}): SessionSummary {
	const cold = input.attempts.filter((attempt) => attempt.temperature === 'cold');
	const earliest = nextSuggestedAt(input.cards, input.now);
	return {
		sessionId: input.record.id,
		coldCount: cold.length,
		coldCorrect: cold.filter((attempt) => attempt.correct).length,
		medianColdReactionMs: medianReaction(input.attempts),
		learnedCount: input.cards.filter((card) => card.introducedInSession === input.record.id)
			.length,
		fatigueDetected: input.record.fatigueDetected,
		nextSuggestedAt:
			earliest === null
				? input.now + NEXT_SESSION_GAP_MS
				: Math.max(earliest, input.now + NEXT_SESSION_GAP_MS)
	};
}

export function buildNeckMap(input: {
	cards: readonly CardState[];
	attempts: readonly Attempt[];
	pitchAt: (string: StringNumber, fret: number) => PitchName;
}): NeckMapCell[] {
	const byKey = new Map(input.cards.map((card) => [card.key, card]));
	const cells: NeckMapCell[] = [];

	for (let string = 1 as StringNumber; string <= 6; string = (string + 1) as StringNumber) {
		for (let fret = 0; fret <= 11; fret++) {
			const pitch = input.pitchAt(string, fret);
			const locateKey = cardKey({ direction: 'locate', string, pitch });
			const identifyKey = cardKey({ direction: 'identify', string, fret });
			const cold = input.attempts.filter(
				(attempt) =>
					attempt.temperature === 'cold' &&
					(attempt.cardKey === locateKey || attempt.cardKey === identifyKey)
			);
			const withReaction = cold.filter((attempt) => attempt.reactionMs !== null);
			cells.push({
				string,
				fret,
				pitch,
				locate: cardStatus(byKey.get(locateKey)),
				identify: cardStatus(byKey.get(identifyKey)),
				medianColdReactionMs: median(withReaction.map((a) => a.reactionMs!)),
				coldAccuracy:
					cold.length === 0
						? null
						: cold.filter((attempt) => attempt.correct).length / cold.length
			});
		}
	}
	return cells;
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/domain/progress/stats.spec.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/progress/stats.ts src/lib/domain/progress/stats.spec.ts
git commit -m "feat(progress): home stats, session summary and neck map"
```

---

### Task 9: Point d'entrée public

**Files:**
- Create: `src/lib/domain/progress/index.ts`
- Test: `src/lib/domain/progress/index.spec.ts`

**Interfaces:**
- Consumes: toutes les tâches précédentes.
- Produces: `$lib/domain/progress` avec exactement l'API publique du README (constantes + fonctions listées). `isDirectRecall`, `adjustLeadBeats` et les helpers FSRS ne sont **pas** exportés.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/domain/progress/index.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import * as progress from './index';

describe('progress index', () => {
	it('exports the README public API and nothing else essential from internals', () => {
		expect(progress.MIN_COLD_DELAY_MS).toBe(60 * 60 * 1000);
		expect(progress.DAILY_COLD_CAP).toBe(20);
		expect(progress.NEW_PER_SESSION).toBe(3);
		expect(progress.UNLOCK_RATIO).toBe(0.8);
		expect(progress.MASTERY_ACCURACY).toBe(0.9);
		expect(progress.MASTERY_SESSIONS).toBe(3);
		expect(progress.MASTERY_MIN_GAP_MS).toBe(72 * 60 * 60 * 1000);
		expect(progress.NEXT_SESSION_GAP_MS).toBe(2 * 60 * 60 * 1000);

		for (const name of [
			'classifyTemperature',
			'leadForThreshold',
			'introduceCard',
			'applyColdAttempt',
			'placementCard',
			'isAcquired',
			'isMastered',
			'cardStatus',
			'unlockedSets',
			'nextNewTargets',
			'buildDailyPlan',
			'buildPlacementPlan',
			'buildFreePlan',
			'nextSuggestedAt',
			'computeHomeStats',
			'summarizeSession',
			'buildNeckMap'
		] as const) {
			expect(typeof progress[name]).toBe('function');
		}

		expect(progress).not.toHaveProperty('isDirectRecall');
		expect(progress).not.toHaveProperty('adjustLeadBeats');
		expect(progress).not.toHaveProperty('introScheduling');
		expect(progress).not.toHaveProperty('TREND_WINDOW_MS');
		expect(progress).not.toHaveProperty('TREND_RATIO');
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/domain/progress/index.spec.ts`
Expected: FAIL, « Failed to resolve import "./index" ».

- [ ] **Step 3: Écrire `index.ts`**

Créer `src/lib/domain/progress/index.ts` :

```ts
export {
	MIN_COLD_DELAY_MS,
	DAILY_COLD_CAP,
	NEW_PER_SESSION,
	UNLOCK_RATIO,
	MASTERY_ACCURACY,
	MASTERY_SESSIONS,
	MASTERY_MIN_GAP_MS,
	NEXT_SESSION_GAP_MS
} from './constants';

export { classifyTemperature } from './temperature';
export { leadForThreshold } from './lead';
export {
	introduceCard,
	applyColdAttempt,
	placementCard,
	isAcquired,
	isMastered,
	cardStatus
} from './cards';
export { unlockedSets, nextNewTargets } from './curriculum';
export {
	buildDailyPlan,
	buildPlacementPlan,
	buildFreePlan,
	nextSuggestedAt
} from './plans';
export { computeHomeStats, summarizeSession, buildNeckMap } from './stats';
```

- [ ] **Step 4: Lancer toute la suite progress et la vérification de types**

Run: `npx vitest run src/lib/domain/progress && npm run check`
Expected: tous les tests PASS, `svelte-check found 0 errors`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/progress
git commit -m "feat(progress): export public progression API"
```

---

## Fin du plan

À la fin de ce plan, `src/lib/domain/progress/` fournit toute l'API C du README. Les plans de la vague 2 (I1, J) consomment `$lib/domain/progress` après fusion de la vague 1. Le curriculum réel vient du plan A (`buildCurriculum` / `placementTargets`) au câblage (J/K) ; ce plan ne l'importe jamais.

### Écart relevé

- **`tempoBpm` est le dernier argument** de `applyColdAttempt`, `isAcquired` et `isMastered`. J le passe depuis `settings.tempoBpm`.
