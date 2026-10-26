# Un langage d’exercices ouvert (plan L) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Faire passer dans les données de l’exercice ce que le moteur décide encore à sa place pour les exercices à une réponse — tempo, échelle des items, fenêtres de réponse, respiration, aperçu, scène, fin du compte, place de la cible, réglages de la procédure, durée de séance — et retirer les règles pédagogiques écrites dans le moteur (C2, la tolérance de D2, la cible forcée sur le temps 1, l’aide forcée en bas d’échelle), pour que H5 porte les triades directement sur ce modèle.

**Architecture:** Chaque paramètre appartient à la pièce qui le lit (amendement du 2026-10-26, tableau « Les paramètres appartiennent aux pièces qui les lisent »). L’exercice les écrit dans sa définition (`ExerciseDefinition`), avec les valeurs d’aujourd’hui comme défauts ; les pièces les lisent par des accesseurs uniques (`tempoOf`, `ladderOf`, `windowsOf`, `learningParamsOf`, `presentationOf`), jamais par une constante. Le moteur ne refuse que ce qu’il ne sait pas exécuter. Le comportement des exercices existants ne change pas, sauf localiser et les triades, passés à 80 bpm fixes (décision de l’auteur, 2026-10-26).

**Tech Stack:** TypeScript, Svelte 5 (runes), Vitest (node : `*.spec.ts` ; jsdom : `*.svelte.spec.ts`), Dexie.

**Spec:** `docs/superpowers/specs/2026-10-14-temps-musical-et-sequences-design.md`, « Amendement (2026-10-26) : un langage d’exercices ouvert » (le principe, le tableau des pièces, l’inventaire, le cas de localiser), et « Réalisation du plan H4 ».

## Global Constraints

- **Préalable** : H4 fusionné dans `main`. Branche `plan/langage-ouvert`, worktree `.worktrees/langage-ouvert`, partie de `main` après cette fusion. `npm test && npm run check` vert à chaque commit ; tests avant le code ; chaque test affirme.
- **Le principe** : l’application fait n’importe quel exercice ; aucune règle utile à certains exercices n’en empêche d’autres. Le moteur refuse seulement l’inexécutable (tempo non positif, avance non positive, échelle vide, vue ou mode inconnus, plan invalide), avec une erreur qui nomme l’exercice et le champ. Il ne refuse jamais une combinaison sans valeur pédagogique.
- **Défauts = comportement d’aujourd’hui** : toute valeur absente des données prend la valeur que le code utilise aujourd’hui (les constantes actuelles deviennent des défauts, nommés `DEFAULT_*`, lus en un seul endroit).
- **Comportement inchangé** pour identifier, le geste, le rythme et les triades sur l’ancien chemin, à une exception près : localiser et les triades jouent à **80 bpm fixes** (sans progression de tempo). Les specs existantes restent vertes ; une attente qui change n’est admise que pour ce tempo fixe.
- **Les triades restent sur l’ancien chemin** (`SessionController`, `triadSelector`, `domain/timing/`) jusqu’à H5 ; ce plan ne leur ajoute que des données lues par l’ancien chemin au travers d’adaptateurs marqués « until H5 ».
- **Aucun changement de schéma Dexie** : les index de niveau de localiser gardent leur sens (l’échelle écrite est celle qu’avait C2 à 80 bpm : 8 aidé, 4, 2). Les progressions enregistrées de localiser et des triades restent en base, ignorées par un tempo fixe.
- `application/session/series/` ne nomme ni mécanique, ni exercice, ni capteur (test de frontière existant).
- Un nom par concept : « niveau » / `level`, « échelle » / `ladder`, « avance » / `lead`, « respiration » / `breath`, « mesure comptée » / `count-in`, « scène » / `scene`.
- Commits : Conventional Commits en minuscules, impératif, orientés comportement ; terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Décisions prises par ce plan (à relire par l’auteur)

- **L1 — Le tempo reste une progression de fin de séance, réglée par l’exercice**, dans ce plan. Le passage du tempo dans les niveaux d’exercice (le mécanisme `Level` du rythme) se fait à la fusion des contrôleurs en H5, qui donne seule aux séries de réponses des niveaux d’exercice ; `Progression` et `nextTempo` disparaissent alors. Ici : `ExerciseTempo` = `{ fixed: number }` ou `{ start, min, max, step, raiseAt, lowerAt, minPrompts }` ; plus d’arrondi à l’entier.
- **L2 — L’échelle d’un item est écrite dans l’exercice**, niveau par niveau (`Level<LadderParams>` : avance, aide, passage, descente) ; C2 (`leadLadder`), `aidLadder`, « le haut n’est jamais aidé », « un seul cran est doublé » et `pacing.leadSteps`/`learnedAfter` disparaissent. Les échelles d’aujourd’hui à 80 bpm sont écrites telles quelles dans le catalogue.
- **L3 — « Au haut de l’échelle, seul un rappel direct compte comme réussite » devient une donnée du niveau** : `Level.success?: 'any' | 'direct-recall'` (défaut `'any'`) ; le catalogue la pose sur le haut de l’échelle de localiser, d’identifier et des triades.
- **L4 — La fin du compte et la place de la cible sont des données du plan** : `RoundPlan.countEndsOn?: 'prompt' | 'target'` (défaut `'prompt'`) et `RoundPlan.barOffset?: Fraction` (place du début du tour dans sa mesure, défaut 0). `timedStart` devient : le premier instant `start ≥ earliest` avec `start ≡ barOffset` (modulo la mesure) et, si le compte finit sur la consigne, `start + prompt ≥ earliest`. `PROMPT_BEFORE_EARLIEST_BEATS` disparaît ; `gridChangePlan` pose `countEndsOn: 'target'`. Même placement qu’aujourd’hui en 4/4 pour les avances 8, 4, 2 et le geste ; en 3/4 à l’avance 4, la respiration redevient entière.
- **L5 — La présentation d’un exercice surcharge celle de sa mécanique** : `ExerciseDefinition.presentation?: { scene?, previewBeats?, contestable? }` ; le présentateur donne les défauts.
- **L6 — Les réglages de la procédure d’apprentissage sont des données** : `LearningParams` (les constantes de `progress/constants.ts` qu’elle lit, et l’ordre des catégories) ; défauts `DEFAULT_LEARNING_PARAMS` ; le sujet les tient de la définition de son exercice principal (`neckSubject` : localiser).
- **L7 — La durée d’une séance est rendue par sa préparation** (`prepare` rend `durationMs`, défaut `SESSION_MS`).
- **L8 — Hors de ce plan** (inventaire de l’amendement, à faire quand le code est touché ou par un plan suivant) : les réglages de la mémoire (`MIN_COLD_DELAY_MS`, FSRS, maîtrise), la fatigue, l’anti-blocage et les constantes du rythme non surchargeables (`BREATH_MIN_MS`, `SETTLE_AFTER_BARS`, `PLAIN_WORDS_SESSIONS`), le générateur du geste, le temps libre comme cas des fenêtres, le guide d’écriture.

## Review Focus

- **Une base réelle après H4** : une carte de localiser au niveau 2 (avance 2) avec une progression enregistrée à 120 bpm est servie à 80 bpm, avance 2, sans perte de niveau ; une carte au niveau 1 à l’avance 4 (Task 1, Task 2).
- **Une donnée absente ou inexécutable** : un exercice sans `tempo` garde le comportement d’aujourd’hui ; une échelle vide, une avance nulle ou un tempo fixe négatif lèvent une erreur qui nomme l’exercice, au chargement du catalogue et non en jeu (Task 1, Task 2, Task 7).
- **Le geste après L4** : chaque changement garde sa cible sur le temps qui suit le compte, et ses enchaînements par passage de main sont inchangés (`gestureSession.spec.ts` vert sans changer ses attentes) (Task 4).
- **Une session de localiser commencée sur l’ancien tempo** (progression à 140 bpm) : elle joue à 80 et n’écrit aucune progression en fin de séance (Task 1).
- **Les triades sur l’ancien chemin** lisent leur échelle écrite au travers de l’adaptateur et jouent comme aujourd’hui, à 80 bpm (Task 1, Task 2).

---

## File Structure

- `src/lib/domain/exercise/types.ts` — `ExerciseTempo`, `ExercisePresentation`, champs `tempo?`, `presentation?`, `params.ladder`, `params.windows`, `params.learning` ; `ExercisePacing` réduit à `respirationBars`.
- `src/lib/domain/exercise/tempo.ts` — `tempoOf(definition)`, `startTempo`, `nextTempo(definition, tempoBpm, attempts)`, `DEFAULT_TEMPO`.
- `src/lib/domain/exercise/ladder.ts` (nouveau) — `ladderOf(definition, mechanic?)`, `validateLadder`.
- `src/lib/domain/exercise/windows.ts` (nouveau) — `ResponseWindows`, `DEFAULT_RESPONSE_WINDOWS`, `windowsOf(definition)`.
- `src/lib/domain/exercise/validate.ts` (nouveau) — `validateExercise(definition): string | null`, testé sur tout le catalogue.
- `src/lib/domain/exercise/catalog.ts` — localiser, identifier, triades : tempo fixe, échelles écrites, `success: 'direct-recall'` au haut.
- `src/lib/domain/exercise/roundPlans.ts` — les constructeurs prennent `windows` et `respirationBars` ; `gridChangePlan` pose `countEndsOn: 'target'`.
- `src/lib/domain/time/plan.ts`, `levels.ts` — `RoundPlan.countEndsOn?`, `RoundPlan.barOffset?`, `Level.success?`.
- `src/lib/domain/learning/` — `ladder.ts` réduit à `ladderLevel`, `passesTop` ; `subject.ts` (`ladder(mechanic)` sans tempo, `params`) ; `params.ts` (nouveau : `LearningParams`, `DEFAULT_LEARNING_PARAMS`) ; `procedure.ts` lit `params` et `Level.success`.
- `src/lib/domain/progress/` — `neckSubject.ts`, `neckPlans.ts`, `plans.ts` (`freeLeadOf` sans tempo), `constants.ts` (les constantes de la procédure deviennent les défauts), `triadSelector.ts` (adaptateur « until H5 »).
- `src/lib/domain/triads/triadSubject.ts`, `src/lib/domain/types.ts` (`LeadBeats` = nombre).
- `src/lib/application/session/series/` — `placement.ts` (L4), `seriesItems.ts` (`presentationOf`), `ResponseSeriesController.svelte.ts`, `seriesEnd.ts`.
- `src/lib/application/services/createAppServices.ts` — préparations (`durationMs`, tempos).
- Tests d’acceptation : `src/lib/application/session/series/dataOnlyExercise.spec.ts` (nouveau).

---

### Task 1: Le tempo est une donnée de l’exercice

**Files:**

- Modify: `src/lib/domain/exercise/types.ts`, `tempo.ts`, `catalog.ts`, `src/lib/application/session/series/seriesEnd.ts`, `src/lib/application/session/SessionController.svelte.ts` (appel de `nextTempo`), `src/lib/domain/gesture/summary.ts` (appel de `nextTempo`), `src/lib/infrastructure/storage/legacy/v1.ts` (garder son propre arrondi figé)
- Test: `src/lib/domain/exercise/tempo.spec.ts`, `catalog.spec.ts`, `src/lib/application/session/series/seriesEnd.spec.ts`

**Interfaces:**

- Produces :

```ts
export type ExerciseTempo =
	| { fixed: number }
	| {
			start: number;
			min: number;
			max: number;
			step: number;
			raiseAt: number;
			lowerAt: number;
			minPrompts: number;
	  };
/** Today's values: start 80, 80–160, step 5, raise above 0.9, lower under 0.7, 10 prompts. */
export const DEFAULT_TEMPO: Extract<ExerciseTempo, { start: number }>;
/** The exercise's tempo data, `DEFAULT_TEMPO` when absent (`startTempoBpm` overrides its start). */
export function tempoOf(definition: ExerciseDefinition): ExerciseTempo;
export function startTempo(definition, progressions, scope?): number; // fixed → that tempo, progressions ignored
export function nextTempo(definition: ExerciseDefinition, tempoBpm: number, attempts): number; // fixed → unchanged
```

`ExerciseDefinition.tempo?: ExerciseTempo` ; `startTempoBpm` reste (geste) et devient `start` d’une plage. `clampTempo` borne par la plage de l’exercice, sans arrondi. Localiser et les deux triades : `tempo: { fixed: 80 }`. `nextProgressions` (série) et l’ancien bloc de fin passent la définition et n’écrivent rien pour un tempo fixe.

- [ ] **Step 1: Write the failing tests** :
  - `it('plays a fixed tempo whatever was stored, and never moves it')`.
  - `it('keeps today's range and steps when an exercise gives none')` (les cas actuels de `tempo.spec.ts` sur une définition sans `tempo`).
  - `it('moves within the exercise's own range and step, decimals kept')` (`{ start: 92.5, min: 90, max: 100, step: 2.5, … }`).
  - `seriesEnd.spec.ts` : `it('writes no progression for an exercise at a fixed tempo')`.
  - `catalog.spec.ts` : `it('plays locate and the triads at 80 bpm, fixed')`.
- [ ] **Step 2: Run** `npx vitest run src/lib/domain/exercise src/lib/application/session/series/seriesEnd.spec.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run check` → PASS ; les specs des triades et du geste vertes (les attentes de tempo des triades qui supposaient une progression passent à 80 fixe).
- [ ] **Step 5: Commit** `git commit -m "feat: let each exercise set its tempo, fixed or within its own range"`

---

### Task 2: L’échelle d’un item est écrite dans l’exercice

**Files:**

- Create: `src/lib/domain/exercise/ladder.ts`, `ladder.spec.ts`
- Modify: `src/lib/domain/types.ts` (`LeadBeats`), `src/lib/domain/time/levels.ts` (`Level.success?`), `src/lib/domain/exercise/types.ts`, `pacing.ts`, `catalog.ts`, `src/lib/domain/learning/ladder.ts`, `subject.ts`, `procedure.ts`, `testing/fakeSubject.ts`, `src/lib/domain/progress/neckSubject.ts`, `plans.ts` (`freeLeadOf`), `triadSelector.ts`, `src/lib/domain/triads/triadSubject.ts`, `src/lib/application/services/createAppServices.ts`
- Test: `ladder.spec.ts`, `src/lib/domain/learning/procedure.*.spec.ts`, `src/lib/domain/progress/neckSubject.spec.ts`, `plans.spec.ts`, `src/lib/domain/triads/triadSubject.spec.ts`

**Interfaces:**

- Produces :

```ts
// domain/types.ts
/** A lead in beats of the meter: any positive number. */
export type LeadBeats = number;
// domain/time/levels.ts — Level<P> gains
/** What counts as a success at this level: any success (default), or a direct recall only. */
success?: 'any' | 'direct-recall';
// domain/exercise/ladder.ts
/** The ladder an exercise writes for the items of `mechanic` (`params.ladder`, or `params.ladders[mechanic]` for an exercise of several mechanics); throws when it has none. */
export function ladderOf(definition: ExerciseDefinition, mechanic?: MechanicId): Ladder;
/** Null when the ladder can be run, else why not: empty, a lead neither null (no lead) nor positive, a pass or drop not a positive integer. */
export function validateLadder(ladder: Ladder): string | null;
// domain/learning/subject.ts
ladder(mechanic: MechanicId): Ladder; // no tempo
```

Échelles écrites dans le catalogue (les valeurs d’aujourd’hui à 80 bpm) :

- localiser : `[{ leadBeats: 8, aided: true }, pass 1, drop 1]`, `[{ leadBeats: 4 }, pass 1, drop 1]`, `[{ leadBeats: 2 }, pass learnedAfter (2), drop 1, success: 'direct-recall']` ;
- identifier : `[{ leadBeats: null, aided: true }, pass 1, drop 1]`, `[{ leadBeats: null }, pass learnedAfter, drop 1, success: 'direct-recall']` ;
- triades : leur pacing actuel écrit de même.

`leadLadder` et `aidLadder` sont supprimés ; `ExercisePacing` ne garde que `respirationBars`. La procédure lit `success` du niveau (au lieu de « haut de l’échelle → rappel direct »). `freeLeadOf` ne prend plus de tempo. L’ancien `triadSelector` lit ses crans par un adaptateur `leadStepsOf(definition)` (les avances de son échelle, dans l’ordre), commenté « until H5 ».

- [ ] **Step 1: Write the failing tests** :
  - `ladder.spec.ts` : `it('reads the ladder an exercise writes, level by level')` ; `it('refuses an empty ladder, a lead that is not positive, a pass that is not a positive integer')` ; `it('takes a ladder of any leads, 6 and 3 in 3/4')`.
  - `procedure.learn.spec.ts` : `it('counts only a direct recall as a success on a level that asks for it, wherever it stands')` ; `it('learns an item at the top of a ladder whose top asks any success')`.
  - `neckSubject.spec.ts` : `it('serves the ladder the catalog writes, the same at every tempo')`.
  - `plans.spec.ts` : `freeLeadOf` sans tempo, niveau 2 → avance 2, sans niveau → 8.
  - les invariants pédagogiques de H2 restent verts sur les échelles écrites.
- [ ] **Step 2: Run** `npx vitest run src/lib/domain` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run check` → PASS (`notesSession.spec.ts` : le scénario à ♩ = 160 devient un scénario à 80 fixe, l’échelle étant la même à tout tempo).
- [ ] **Step 5: Commit** `git commit -m "feat: write each item's ladder in its exercise, and drop the tempo fit"`

---

### Task 3: Les fenêtres de réponse, la respiration et l’ancrage sont des données

**Files:**

- Create: `src/lib/domain/exercise/windows.ts`, `windows.spec.ts`
- Modify: `src/lib/domain/exercise/roundPlans.ts`, `src/lib/domain/progress/neckPlans.ts`, `src/lib/domain/gesture/plans.ts`, `src/lib/domain/exercise/types.ts`
- Test: `windows.spec.ts`, `roundPlans.spec.ts`, `src/lib/domain/progress/neckPlans.spec.ts`, `src/lib/domain/gesture/plans.spec.ts`

**Interfaces:**

- Produces :

```ts
export interface ResponseWindows {
	perfectMs: number;
	lateMs: number;
	lateCaptureMs: number;
	minResponseMs: number;
	gridEarlyMs: number;
	gridEarlyMaxBeats: number;
	anchorChordFromBeats: number;
}
/** Today's values: PERFECT_WINDOW_MS, LATE_LIMIT_MS, LATE_CAPTURE_MS, MIN_RESPONSE_MS, GRID_EARLY_MS, GRID_EARLY_MAX_BEATS, ANCHOR_CHORD_FROM_BEATS. */
export const DEFAULT_RESPONSE_WINDOWS: ResponseWindows;
/** `params.windows` over the defaults, field by field. */
export function windowsOf(definition: ExerciseDefinition): ResponseWindows;
```

`beatPlan`, `anchorPlan`, `gridChangePlan`, `freePlan` reçoivent `windows: ResponseWindows` (et `respirationBars` de `pacingOf(definition)`) au lieu de lire les constantes ; `neckPlan(item, meter, definition)` et `gesturePlan(item, meter, definition)` les tirent de la définition de l’exercice de l’item (le `PlanSource` reçoit la définition : `(item, meter, definition) => RoundPlan`, la série la passe par `SeriesItems.definitionOf`). `neckPlan` cesse d’importer `RESPIRATION_BARS` (l’écart relevé par l’amendement).

- [ ] **Step 1: Write the failing tests** : `it('builds a plan with the windows its exercise writes')` (une fenêtre `perfect` de 120 ms, une capture tardive de 1 s) ; `it('builds today's plans when the exercise writes none')` (les plans actuels, égalité stricte) ; `neckPlans.spec.ts` : `it('takes the breath its exercise writes')` (2 mesures).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run check` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: build round plans from the windows and breath their exercise writes"`

---

### Task 4: Le plan dit où finit le compte et où tombe la cible

**Files:**

- Modify: `src/lib/domain/time/plan.ts`, `src/lib/domain/exercise/roundPlans.ts` (`gridChangePlan`), `src/lib/application/session/series/placement.ts`, `recordResponse.ts` (`roundPlanRecord`), `ResponseSeriesController.svelte.ts`
- Test: `src/lib/application/session/series/placement.spec.ts`, `src/lib/domain/time/plan.spec.ts`, `recordResponse.spec.ts`

**Interfaces:**

- Produces (`RoundPlan`) :

```ts
/** Where a counted bar or a breath ends: on the prompt (default) or on the target (a grid opens a beat before its change). */
countEndsOn?: 'prompt' | 'target';
/** Where the round's start (its target) falls in its bar, as a fraction of a whole note; default 0, the downbeat. */
barOffset?: Fraction;
```

`timedStart(earliest, plan, meter)` : le premier `start ≥ earliest` tel que `start − barOffset` soit un nombre entier de mesures et, si `countEndsOn` vaut `'prompt'`, `start + prompt ≥ earliest`. `PROMPT_BEFORE_EARLIEST_BEATS` est supprimé. Un `barOffset` négatif ou d’au moins une mesure lève `RangeError('barOffset must lie within its bar')` dans `timedStart` (seul à connaître le mètre). `roundPlanRecord` garde les deux champs.

- [ ] **Step 1: Write the failing tests** (`placement.spec.ts`) : les cas actuels (avances 8, 4, 2 en 4/4, changement de grille à −1 temps) donnent les mêmes positions ; `it('keeps a whole breath at lead 4 in 3/4')` ; `it('places a target on beat 3 when the plan says so')` (`barOffset` = 1/2 en 4/4) ; `it('ends a count on the target for a grid change')`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** ; le contrôleur lit `timedStart` comme aujourd’hui (seule la fonction change).
- [ ] **Step 4: Run** `npm test && npm run check` → PASS, `gestureSession.spec.ts` et `notesSession.spec.ts` sans changement d’attentes.
- [ ] **Step 5: Commit** `git commit -m "feat: let a plan say where its count ends and where its target falls in the bar"`

---

### Task 5: La présentation de l’exercice surcharge celle de sa mécanique

**Files:**

- Modify: `src/lib/domain/exercise/types.ts`, `src/lib/application/session/series/seriesItems.ts`, `ResponseSeriesController.svelte.ts`
- Test: `src/lib/application/session/series/ResponseSeriesController.svelte.spec.ts`, `seriesItems.spec.ts` (nouveau)

**Interfaces:**

- Produces :

```ts
export interface ExercisePresentation { scene?: Scene; previewBeats?: number; contestable?: boolean }
// ExerciseDefinition gains presentation?: ExercisePresentation
// SeriesItems gains
/** The item's scene, preview and contest: its exercise's, else its mechanic's presenter's. */
presentationOf(item: PlannedItem): { scene: Scene; previewBeats: number | null; contestable: boolean };
```

Le contrôleur lit `presentationOf` partout où il lisait `presenter.scene`, `presenter.previewBeats` et `presenter.contestable` (le type `Scene` passe dans `domain/exercise/types.ts` ou y est réexporté, pour que le domaine ne dépende pas de l’application).

- [ ] **Step 1: Write the failing tests** : `it('plays an exercise of a guitar mechanic on the screen when the exercise says so: no click')` ; `it('announces the next prompt as many beats early as its exercise says')` ; `it('takes the mechanic's presentation when the exercise says nothing')`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/lib/application/session && npm run check` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: let an exercise set its scene, its preview and whether it is contested"`

---

### Task 6: Les réglages de la procédure et la durée de la séance sont des données

**Files:**

- Create: `src/lib/domain/learning/params.ts`, `params.spec.ts`
- Modify: `src/lib/domain/learning/procedure.ts`, `subject.ts`, `testing/fakeSubject.ts`, `src/lib/domain/progress/constants.ts`, `neckSubject.ts`, `src/lib/domain/triads/triadSubject.ts`, `src/lib/application/session/series/ResponseSeriesController.svelte.ts`, `src/lib/application/services/createAppServices.ts`
- Test: `params.spec.ts`, `procedure.serve.spec.ts`, `ResponseSeriesController.svelte.spec.ts`

**Interfaces:**

- Produces :

```ts
export interface LearningParams {
	learningSlots: number;
	maxWorkingSet: number;
	maxUnconsolidated: number;
	coldCap: number;
	retestGaps: readonly [number, number];
	newItemMinCardSuccess: number;
	newItemCardWindow: number;
	newItemMinSessionSuccess: number;
	successWindow: number;
	recoveryAfterMisses: number;
	aidFadeSuccesses: number;
	consolidationPool: number;
	consolidationSkipRecent: number;
	confusionLookback: number;
	/** The order categories are served in. */
	order: readonly ('retest' | 'cold-review' | 'resumed' | 'new' | 'consolidation')[];
}
/** Today's constants of progress/constants.ts, and today's order. */
export const DEFAULT_LEARNING_PARAMS: LearningParams;
/** `params.learning` of an exercise over the defaults. */
export function learningParamsOf(definition: ExerciseDefinition): LearningParams;
// LearningSubject gains: readonly params: LearningParams
// PrepareResponseSeries returns { source, executions, durationMs? } — default SESSION_MS
```

Les constantes de `progress/constants.ts` lues par la procédure sont retirées de ses imports : elle ne lit que `subject.params`. Les triades sur l’ancien chemin gardent leurs constantes jusqu’à H5. `ResponseSeriesController` lit la durée rendue par `prepare`.

- [ ] **Step 1: Write the failing tests** : `it('serves with the settings its exercise writes')` (un ensemble de travail de 2, des retests à 1 et 3) ; `it('serves today's way when the exercise writes none')` (les specs actuelles de la procédure sur `DEFAULT_LEARNING_PARAMS`) ; `it('serves new items before retests when the order says so')` ; série : `it('ends after the duration its preparation gives')`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run check` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: let an exercise set its learning procedure and a session its length"`

---

### Task 7: Un exercice écrit en données seulement, et la validation du catalogue

**Files:**

- Create: `src/lib/domain/exercise/validate.ts`, `validate.spec.ts`, `src/lib/application/session/series/dataOnlyExercise.spec.ts`
- Modify: `src/lib/testing/notesSeries.ts` (accepter un catalogue de test)

**Interfaces:**

- Produces : `validateExercise(definition: ExerciseDefinition): string | null` — tempo positif (fixe ou plage cohérente : `min ≤ start ≤ max`, `step > 0`), échelle valide (`validateLadder`), fenêtres positives, `presentation.previewBeats ≥ 0`, mètre valide. Un test parcourt `EXERCISES` et attend `null` partout.

- [ ] **Step 1: Write the tests** :
  - `validate.spec.ts` : `it('accepts every exercise of the catalog')` ; `it('names the exercise and the field it cannot run')` (tempo fixe à 0, échelle vide, avance négative) ; `it('accepts an exercise without pedagogical value')` (tempo 300, une échelle 1 → 16 temps qui monte, une fenêtre `perfect` de 5 s).
  - `dataOnlyExercise.spec.ts` : un exercice de test qui n’existe que dans le spec — localiser en 3/4 (`meter`), tempo fixe 90, échelle 6 (aidé) → 3 (`direct-recall`), respiration 2 mesures, fenêtre `perfect` 120 ms, aperçu 2 temps, cible sur le temps 2 (`barOffset` 1/4) — joué de bout en bout par le banc des notes, sans code de plus : `it('plays an exercise written only in data')` (cibles au temps 2 de mesures de 3 temps, respiration de 2 mesures, aperçu 2 temps avant la consigne, avance 6 puis 3 après une réussite, rappel direct exigé au haut, clic à 90 bpm).
- [ ] **Step 2: Run** → PASS ; un écart se corrige dans la tâche qui possède le code.
- [ ] **Step 3: Commit** `git commit -m "test: play an exercise written only in data, and check the catalog can run"`

---

### Task 8: La doc suit

**Files:**

- Modify: `docs/superpowers/specs/2026-10-14-temps-musical-et-sequences-design.md` (« Réalisation du plan L » ; dans l’inventaire de l’amendement, ce qui est fait ; « Reprise » : H5 porte les triades sur ce modèle, ce que L laisse), `CLAUDE.md` (puces « Sessions », « Bar grid », « Musical time », « Mechanics and exercises » : le tempo, l’échelle, les fenêtres, la présentation et la procédure en données ; la règle de placement L4)

- [ ] **Step 1: Update the spec** : décisions L1–L8, écarts acceptés, points mineurs.
- [ ] **Step 2: Update `CLAUDE.md`** : une à trois phrases par puce, au style des puces ; retirer C2, `leadLadder`, `PROMPT_BEFORE_EARLIEST_BEATS`, `LEAD_STEPS = [8, 4, 2] (never 1)`.
- [ ] **Step 3: Verify** : `npx prettier --check` sur les fichiers touchés, `npm test && npm run check` → PASS.
- [ ] **Step 4: Commit** `git commit -m "docs: describe exercises written in data, and what the engine no longer decides"`
