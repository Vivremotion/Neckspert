# La procédure d’apprentissage (plan H2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Une seule procédure d’apprentissage des items à retenir, paramétrée par l’exercice en données, qui remplace en double emploi `learnSelector` (notes) et `triadSelector` (triades), avec l’avance et l’aide en niveaux par item ; l’interface des sources d’items et `choose` au-dessus. Construite à côté de l’existant ; la bascule est H3.

**Architecture:** Un module pur `src/lib/domain/learning/` : la procédure (`createLearningProcedure`) ne connaît qu’un `LearningSubject`, les données d’un exercice (ses cartes, l’ordre d’introduction, la relation « voisin », l’échelle de niveaux, la règle du rappel direct, l’item d’une consigne). Elle sert les catégories (retests, révisions à froid, reprises, nouveaux, consolidation, rattrapage), tient l’ensemble de travail et un `LevelState` par item, et implémente `ItemSource`, le nouveau nom de `SessionSelector`. Les notes (localiser et identifier ensemble) et les triades (ancrage ou zone) en sont deux sujets. Le cycle de vie d’une carte (FSRS, acquise, maîtrisée) ne dépend plus d’une relation temporelle mais d’une règle de rappel direct.

**Tech Stack:** TypeScript, Vitest (node : `*.spec.ts`).

**Spec:** `docs/superpowers/specs/2026-10-14-temps-musical-et-sequences-design.md`, « Amendement (2026-10-23) », sous-sections « Le principe » et « 3. La procédure d’apprentissage, les sources d’items, `choose` » ; les règles pédagogiques de référence : `docs/superpowers/specs/2026-10-02-apprentissage-design.md`, `2026-10-03-sondage-avant-apprentissage-design.md`, `2026-10-08-voie-memoire-triades-design.md` (section 2).

## Global Constraints

- Branche `plan/temps-musical-h2`, dans `.worktrees/temps-musical-h2`, partie de `main` (H1 fusionné : `7551937`). `npm test && npm run check` vert à chaque commit ; tests avant le code ; chaque test affirme.
- **`domain/learning/` ne nomme aucune mécanique ni aucun exercice** (`locate`, `identify`, `triad-anchor`, `triad-zone`, `chord-grid`, aucun identifiant de catalogue) et n’importe ni `domain/music`, ni `domain/triads`, ni `domain/gesture`, ni `domain/mechanics`, ni `domain/timing`, ni `application/` (test de frontière, Task 5). Les sujets vivent avec leur domaine : `domain/progress/neckSubject.ts`, `domain/triads/triadSubject.ts`.
- **On teste les règles, pas l’ancienne suite** : aucun test ne compare la procédure aux sélecteurs actuels ; les invariants pédagogiques sont la spécification. L’ordre exact des items est libre.
- **L’ancien chemin ne change pas de comportement** : `learnSelector`, `triadSelector`, `gestureSelector`, `SessionController` et `AttemptRecorder` restent ; ils ne changent que par le renommage `SessionSelector` → `ItemSource` (Task 8) et par la séparation de l’avance dans `progress/cards.ts` (Task 2), sans effet.
- **La procédure ne finit jamais une séance par le temps** : la durée appartient à la séance (`SESSION_MS`, amendement 2026-10-17) ; elle ne rend `null` que quand elle n’a rien à servir. `LEARN_SESSION_MS` reste pour l’ancien chemin jusqu’à H3.
- Constantes réutilisées telles quelles, sans copie, depuis `domain/progress/constants.ts` : `LEARN_COLD_CAP = 20`, `LEARNING_SLOTS = 3`, `MAX_UNCONSOLIDATED = 10`, `LEARN_RETEST_GAPS = [2, 4]`, `LEARN_SUCCESSES = 2`, `SUCCESS_WINDOW = 10`, `NEW_NOTE_MIN_CARD_SUCCESS = 0.8`, `NEW_NOTE_CARD_WINDOW = 5`, `NEW_NOTE_MIN_SESSION_SUCCESS = 0.7`, `RECOVERY_AFTER_MISSES = 1`, `MAX_WORKING_SET = 6`, `STRING_AID_FADE_SUCCESSES = 1`, `CONSOLIDATION_POOL = 3`, `CONSOLIDATION_SKIP_RECENT = 2`, `CONFUSION_LOOKBACK = 3`, `MIN_COLD_DELAY_MS`. `domain/learning/` les importe de `domain/progress/constants.ts` (un fichier de constantes, pas de logique de mécanique : l’import est permis et le test de frontière l’autorise nommément).
- Un nom par concept : « source d’items » / `ItemSource`, « procédure d’apprentissage » / `LearningProcedure`, « sujet » / `LearningSubject`, « niveau » / `level`, « voisin » / `neighbours`. « Séquence » n’apparaît dans aucun nom neuf.
- Commits : Conventional Commits en minuscules, impératif, orientés comportement ; terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Ce que la procédure garde, change et retire (à trancher par l’auteur à la relecture du plan)

**Gardé** (chaque règle a son invariant, Task 4 et Task 5) : les catégories dans l’ordre (retests dus, révisions à froid sous `LEARN_COLD_CAP`, reprises, nouveaux sous les seuils, consolidation), puis le dernier recours (un retest en avance, une consolidation récente, un nouveau hors seuils) ; le sondage sans aide d’un item nouveau, la présentation aidée juste après un sondage raté, les retests espacés (`LEARN_RETEST_GAPS` : court après la présentation ou un raté, long sinon) ; `LEARNING_SLOTS`, `MAX_UNCONSOLIDATED`, `MAX_WORKING_SET` ; les seuils de réussite (`NEW_NOTE_MIN_CARD_SUCCESS` par item en cours, `NEW_NOTE_MIN_SESSION_SUCCESS` glissant) ; le rattrapage après `RECOVERY_AFTER_MISSES` raté(s) par un item solide ; la consolidation parmi les `CONSOLIDATION_POOL` plus faibles (confus d’abord, puis les moins servis, puis la stabilité FSRS), hors des `CONSOLIDATION_SKIP_RECENT` derniers ; jamais l’item précédent ni son voisin, une préférence du sujet (une autre corde) ; l’aide qui s’efface (corde dessinée) ; un sondage abandonné (pause) oublié ; la fatigue qui ne sert plus que retests et dernier recours ; froid et chaud inchangés (`probeTemperature`).

**Changé, pour simplifier** :

- **C1. Un seul niveau par item.** Aujourd’hui deux échelles d’avance coexistent : celle de l’apprentissage en séance (8 → 4 → avance de rappel, perdue d’une séance à l’autre) et l’avance stockée de la carte (ajustée par les essais à froid). Elles deviennent un seul `LevelState` par item, déplacé par `nextLevelState` à chaque essai jugé de l’item, chaud ou froid (une réussite raccourcit d’un cran, un raté rallonge d’un cran). Conséquence : un item repris commence à son niveau, et n’est présenté aidé que s’il est au niveau le plus long ; un item en consolidation qui rate voit son avance s’allonger aussi.
- **C2. Le haut de l’échelle, pour tous** : le cran le plus long dont la durée tient dans le seuil de rappel direct au tempo de l’exécution (la règle de localiser aujourd’hui). Les triades, qui finissaient toujours au cran le plus court, finissent à 4 temps au-dessus de 150 bpm.
- **C3. La réussite glissante de séance** compte tous les essais de la procédure hors sondages, pas seulement ceux de localiser (identifier y entre aussi ; les triades le faisaient déjà).

**Retiré** : les séquences (`sequence.ts`, `SEQUENCES_ENABLED`, `SEQUENCE_LENGTH`, `SEQUENCE_MAX_DELAY`, la mesure comptée au changement d’avance, l’avance de consolidation empruntée à la séquence, le retest qui attend sa séquence), décidé le 2026-10-23 ; supprimés à H3 avec l’ancien chemin.

## Décisions prises par ce plan (à reporter dans « Réalisation »)

- **Le niveau d’un item vit dans `LevelState`** (`exerciseId`, `scope: ''`, `item` = la clé d’item), reçu à la construction et rendu à chaque changement ; la procédure ne lit pas `CardState.leadBeats`. H3 charge et écrit `levelStates` et migre l’avance des cartes (Dexie 9).
- **`Level` devient générique** (`Level<P>`), pour que l’échelle d’un item (`{ leadBeats, aided }`) et les niveaux du rythme (`LevelParams`) partagent `nextLevelState`. Le haut de l’échelle porte `pass = { successes: learnedAfter }` : sa passe complète marque l’item appris (`passesTop`).
- **Au haut de l’échelle, une réussite ne compte que si c’est un rappel direct** ; plus bas, c’est `Attempt.success`. Identifier a deux niveaux (nom montré, puis sans aide) ; localiser et les triades ont leurs crans d’avance, le plus long aidé pendant l’apprentissage.
- **Le rappel direct est une règle de données** (`directRecallOf(attempt, thresholdMs)`), qui lit l’enveloppe `response` (H1) ou, pour les essais anciens, les champs enregistrés (avance × tempo, ou réaction en temps libre). `progress/cards.ts` la reçoit au lieu d’une `TimingRelation`.
- **`ItemSource.record` rend `{ card?: CardState; level?: LevelState } | null`** : une carte changée, un niveau changé, ou les deux.
- **Préparer le plan de tour d’un item** (H1, `roundPlans.ts`) est laissé à H3, qui branche le contrôleur : H2 rend un `PlannedItem` dont le niveau donne l’avance et l’aide.

## Review Focus

- **Un sondage servi puis abandonné par une pause** : l’item n’existe plus comme carte, peut être sondé de nouveau, et ne compte pas comme l’item précédent (Task 4).
- **Un niveau stocké au-delà du haut de l’échelle au tempo du jour** (appris à 80 bpm à 2 temps, rejoué à 160 bpm où le haut est 4 temps) : ramené au haut, jamais une erreur (Task 3, Task 4).
- **Plus rien à servir** (tout appris et révisé, ensemble de travail plein) : `next` rend `null` au lieu de répéter l’item précédent (Task 4).
- **Un rattrapage qui rate** n’appelle pas un autre rattrapage (Task 5).
- **Un essai d’un autre exercice** passé à `record` (une triade dans la procédure des notes) : ignoré, rien ne change (Task 5).

---

## File Structure

**Domaine, procédure (pure, sans mécanique)**

- `src/lib/domain/learning/subject.ts` — `CardRef`, `LearningSubject`, `Ladder`, `LadderParams`.
- `src/lib/domain/learning/ladder.ts` — `leadLadder`, `aidLadder`, `ladderLevel`, `passesTop`.
- `src/lib/domain/learning/recall.ts` — `directRecallOf`.
- `src/lib/domain/learning/procedure.ts` — `LearningProcedure`, `createLearningProcedure`.
- `src/lib/domain/learning/index.ts` — réexports.
- `src/lib/domain/learning/testing/fakeSubject.ts` — un sujet factice à items numérotés, pour les specs.
- `src/lib/domain/learning/boundaries.spec.ts`.

**Domaine, sujets**

- `src/lib/domain/progress/neckSubject.ts` — `neckSubject(input): LearningSubject` (localiser et identifier).
- `src/lib/domain/triads/triadSubject.ts` — `triadSubject(input): LearningSubject` (ancrage ou zone).

**Domaine, modifiés**

- `src/lib/domain/time/levels.ts` — `Level<P = LevelParams>`, `nextLevelState` générique.
- `src/lib/domain/progress/cards.ts` — la règle de rappel direct en paramètre ; l’avance séparée.
- `src/lib/domain/progress/selector.ts` — `ItemSource`, `SelectorContext`, `RecordOutcome`, `createListSource` ; `src/lib/domain/session/choose.ts` (neuf) — `SeriesCandidate`, `choose`.

---

### Task 1: Des niveaux pour tout, et la passe du haut

**Files:**

- Modify: `src/lib/domain/time/levels.ts`
- Create: `src/lib/domain/learning/ladder.ts`, `src/lib/domain/learning/subject.ts` (types `Ladder`, `LadderParams` seulement)
- Test: `src/lib/domain/time/levels.spec.ts`, `src/lib/domain/learning/ladder.spec.ts`

**Interfaces:**

- Produces (dans `levels.ts`) : `interface Level<P = LevelParams> { params: Partial<P>; pass?; drop?; aid? }` ; `levelRange(levels: readonly Level<unknown>[])` et `nextLevelState(state, levels: readonly Level<unknown>[], cycle)` acceptent toute échelle ; `resolveLevel` reste sur `LevelParams`.
- Produces (dans `subject.ts`) :

```ts
export interface LadderParams {
	leadBeats: LeadBeats | null;
	aided: boolean;
}
export type Ladder = readonly Level<LadderParams>[];
```

- Produces (dans `ladder.ts`) :

```ts
/** Lead steps (longest first) down to the longest one whose duration at `tempoBpm` fits `recallThresholdMs`, at least the shortest; the longest step is aided; `pass = 1`, `drop = 1`, the top's `pass = learnedAfter`. */
export function leadLadder(input: {
	steps: readonly LeadBeats[];
	tempoBpm: number;
	recallThresholdMs: number;
	learnedAfter: number;
}): Ladder;
/** Two levels: the answer shown, then unaided; the top's `pass = learnedAfter`. */
export function aidLadder(learnedAfter: number): Ladder;
/** A stored level brought into the ladder: above its top → the top; below 0 → 0. */
export function ladderLevel(state: LevelState, ladder: Ladder): LevelState;
/** This success completes the top level's pass: the item is learned. */
export function passesTop(state: LevelState, ladder: Ladder, success: boolean): boolean;
```

- [ ] **Step 1: Write the failing tests**

`levels.spec.ts` : `it('moves any ladder of levels, not only the rhythm’s')` → une échelle `Level<{ leadBeats: number }>` de trois niveaux à `pass: { successes: 1 }`, `drop: { failures: 1 }` : une réussite au niveau 0 → niveau 1 (`changed: 'up'`), un raté au niveau 1 → niveau 0.

`ladder.spec.ts` :

- `it('climbs from 8 to the longest lead that fits the recall threshold')` : `leadLadder({ steps: [8, 4, 2], tempoBpm: 80, recallThresholdMs: 1500, learnedAfter: 2 })` → avances `[8, 4, 2]`, `aided` `[true, false, false]`, `pass` `[1, 1, 2]`, `drop` `[1, 1, 1]` ; à 160 bpm → `[8, 4]`.
- `it('gives identify the name shown, then unaided')` : `aidLadder(2)` → `[{ leadBeats: null, aided: true }, { leadBeats: null, aided: false }]`, haut `pass: 2`.
- `it('brings a stored level back into the ladder')` : niveau 2 sur une échelle de deux niveaux → 1, `successes` et `failures` remis à 0.
- `it('marks the item learned when the top level’s pass completes')` : au haut, `successes: 1`, `pass` 2 → `passesTop(…, true)` vrai, `passesTop(…, false)` faux ; sous le haut → faux.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/domain/time/levels.spec.ts src/lib/domain/learning`
Expected: FAIL.

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/domain/time src/lib/domain/learning && npm run check`
Expected: PASS ; le rythme (`domain/session/policy.ts`) compile sans changement.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/time/levels.ts src/lib/domain/time/levels.spec.ts src/lib/domain/learning
git commit -m "feat: give an item its ladder of levels, the lead and the aid"
```

---

### Task 2: Le cycle de vie d’une carte sans relation temporelle

**Files:**

- Create: `src/lib/domain/learning/recall.ts`
- Modify: `src/lib/domain/progress/cards.ts` et ses appelants (`learnSelector.ts`, `triadSelector.ts`, `stats.ts`, `application/session/AttemptRecorder.ts`, tout autre importeur trouvé par `grep`)
- Test: `src/lib/domain/learning/recall.spec.ts`, `src/lib/domain/progress/cards.spec.ts`

**Interfaces:**

- Produces (dans `recall.ts`) :

```ts
export type DirectRecall = (
	attempt: Pick<Attempt, 'success' | 'verdict' | 'reactionMs' | 'leadBeats' | 'tempoBpm'>
) => boolean;
/** Direct recall of an attempt against `thresholdMs`: a `response` envelope by `isDirectRecall` (H1); an older one by its fields — success, and lead × beat ≤ threshold, or, without lead (free time), reaction ≤ threshold. `thresholdMs` null: never. */
export function directRecallOf(thresholdMs: number | null): DirectRecall;
```

- Produces (dans `cards.ts`) : `introduceCard(card, now, sessionId)`, `markLearned(card, now)`, `probeCard(card, attempt, now, sessionId, recall: DirectRecall)`, `probeTemperature(attempt, recall)`, `applyColdAttempt(state, attempt, history, now, recall)`, `isAcquired(state, history, recall)`, `isMastered(history, recall)` ; l’avance sort de ces fonctions et passe dans `cardLeadAfter(state, timing, event)` (`event` : `'introduced' | 'learned' | { probe: Attempt } | { cold: Attempt }`), que seul l’ancien chemin appelle, avec le même résultat qu’aujourd’hui (H3 la supprime avec `CardState.leadBeats`).

- [ ] **Step 1: Write the failing tests**

`recall.spec.ts`, avec des valeurs écrites en dur :

- `it('reads a response envelope by its lead or its reaction')` : `{ relation: 'response', value: { leadMs: 1500, reactionMs: 3030, … } }` réussi, seuil 1500 → vrai ; `leadMs: 1501` → faux ; temps libre `leadMs: null`, `reactionMs: 2900`, seuil 3000 → vrai.
- `it('reads older attempts by their lead and tempo, or their reaction')` : `leadBeats: 4, tempoBpm: 160`, réussi, seuil 1500 → vrai ; à 80 bpm → faux ; `leadBeats: null`, `reactionMs: 2900`, seuil 3000 → vrai ; raté → faux.
- `it('never counts direct recall without a threshold')` : seuil `null` → faux (le geste).

`cards.spec.ts` : les tests existants passent en donnant `directRecallOf(RECALL_THRESHOLD_MS)` (ou `IDENTIFY_RECALL_THRESHOLD_MS`) là où ils donnaient une relation ; `it('moves the stored lead apart, as before')` → `cardLeadAfter` redonne, sur les cas des tests actuels (introduction, appris à 80 et 160 bpm, sondage à 4 temps et à 1 temps, essai froid réussi et raté), les avances que donnaient `introduceCard`, `markLearned`, `probeCard` et `applyColdAttempt`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/domain/learning/recall.spec.ts src/lib/domain/progress/cards.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement, then move every caller** : un appelant qui passait `timing` passe `(attempt) => timing.isDirectRecall(attempt)` (même résultat) et appelle `cardLeadAfter` là où l’avance était posée.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test && npm run check`
Expected: PASS, aucune spec existante modifiée hors des signatures.

- [ ] **Step 5: Commit**

```bash
git add src/lib
git commit -m "refactor: judge a card's life by a direct-recall rule, its lead apart"
```

---

### Task 3: Le contrat du sujet et le sujet factice

**Files:**

- Modify: `src/lib/domain/learning/subject.ts`
- Create: `src/lib/domain/learning/testing/fakeSubject.ts`
- Test: `src/lib/domain/learning/testing/fakeSubject.spec.ts`

**Interfaces:**

- Produces (dans `subject.ts`) :

```ts
/** A card as the procedure sees it: its mechanic and its item (the card key is `cardKey(mechanic, itemKey(item))`). */
export interface CardRef {
	mechanic: MechanicId;
	item: unknown;
}

/** What an exercise gives the learning procedure, as data and pure functions. */
export interface LearningSubject {
	/** The cards this procedure serves, among those of the store (the others are only read, e.g. the anchor's for the zone). */
	owns(card: { mechanic: MechanicId }): boolean;
	itemKey(card: CardRef): string;
	exerciseOf(mechanic: MechanicId): ExerciseId;
	/** The next item to introduce, ready (its prerequisites met), or null. `cards` and `history`: the whole store's, owned or not. `blocked`: may not be served now. */
	nextNew(
		cards: readonly CardState[],
		history: ReadonlyMap<CardKey, readonly Attempt[]>,
		blocked: (card: CardRef) => boolean
	): CardRef | null;
	/** Never served right after each other (the same item, its mirror, the same voicing). */
	neighbours(a: CardRef, b: CardRef): boolean;
	/** Preferred after `previous` when such a candidate exists (another string). Absent: none. */
	prefers?(candidate: CardRef, previous: CardRef): boolean;
	/** The ladder of a mechanic at the execution's tempo. */
	ladder(mechanic: MechanicId, tempoBpm: number): Ladder;
	/** The direct-recall rule of a mechanic. */
	recall(mechanic: MechanicId): DirectRecall;
	/** A confusion recorded in the attempt (consolidation favours the confused). */
	confused(attempt: Attempt): boolean;
	/** A mechanic whose prompt may draw a fading aid (the string). */
	fadingAid(mechanic: MechanicId): boolean;
	/** The item a prompt asks (a zone card draws its position here); absent: the card's item. */
	promptItem?(card: CardRef, random: () => number): unknown;
}
```

- Produces (dans `fakeSubject.ts`) : `fakeSubject(input?: { items?: number; mechanics?: readonly MechanicId[]; neighbours?: (a: number, b: number) => boolean; ladderSteps?: readonly LeadBeats[]; learnedAfter?: number }): LearningSubject` — items `0..items−1` (défaut 12) d’une mécanique `'fake'` (ou de celles données), introduits dans l’ordre, voisins par défaut `a === b`, échelle `leadLadder({ steps: [8, 4, 2], tempoBpm: 80, recallThresholdMs: 1500, learnedAfter: 2 })`, rappel direct `directRecallOf(1500)`, confusion lue dans `attempt.data.confused`, aide qui s’efface pour `'fake'` ; plus `attemptOf(planned, { success, at, … })` qui fabrique un `Attempt` complet pour un `PlannedItem`.

- [ ] **Step 1: Write the failing test** : `it('introduces its items in order and keeps neighbours apart')` → `nextNew` rend 0, puis 1 quand 0 a une carte ; `blocked` sur 1 → 2 ; `neighbours({ item: 3 }, { item: 3 })` vrai.
- [ ] **Step 2: Run** `npx vitest run src/lib/domain/learning/testing` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: say what an exercise gives the learning procedure"`

---

### Task 4: La procédure sert : catégories, sondage, voisins, ensemble de travail

**Files:**

- Create: `src/lib/domain/learning/procedure.ts`
- Test: `src/lib/domain/learning/procedure.serve.spec.ts`

**Interfaces:**

- Consumes: `LearningSubject`, `fakeSubject` (Task 3), `leadLadder`, `ladderLevel` (Task 1), `introduceCard` (Task 2), `reviewableCards`, `lastAttemptByCard` (`progress/review.ts`), `cardSuccessRate`, `successRate` (`progress/success.ts`).
- Produces :

```ts
export interface LearningProcedure extends ItemSource {
	/** The level an item holds now (as given, or as moved this session). */
	levelOf(card: CardRef): LevelState;
}
export function createLearningProcedure(input: {
	subject: LearningSubject;
	cards: readonly CardState[];
	attempts: readonly Attempt[];
	levels: readonly LevelState[];
	sessionId: string;
	/** Tempo of each exercise's execution in this session. */
	tempos: Readonly<Record<ExerciseId, number>>;
	random?: () => number;
}): LearningProcedure;
```

`ItemSource`, `SelectorContext`, `RecordOutcome` : voir Task 8 ; dans cette tâche, implémenter `next(context)` contre l’interface actuelle `SessionSelector` (même forme), `record` en Task 5.

Règles de `next` (chacune a son test) :

1. Catégories dans l’ordre : un retest dû (le plus tôt la présentation aidée qui suit un sondage raté), une révision à froid (au plus `LEARN_COLD_CAP` par séance, une carte révisable non encore servie dans la séance), une reprise (un item en cours d’apprentissage d’une séance passée, non servi), un nouveau (sous `LEARNING_SLOTS`, `MAX_UNCONSOLIDATED`, l’ensemble de travail et les seuils), une consolidation (parmi les `CONSOLIDATION_POOL` plus faibles hors des `CONSOLIDATION_SKIP_RECENT` derniers servis). Fatigué : retests seulement, puis le dernier recours.
2. Dernier recours, dans l’ordre : le retest le plus proche en avance, une consolidation sans exclure les récents, un nouveau hors seuils (pas fatigué), puis `null`.
3. Dans une catégorie : tirage au hasard injecté parmi les candidats qui ne sont ni l’item précédent ni son voisin, en préférant ceux que `subject.prefers` désigne quand il y en a.
4. Un nouveau est servi en sondage : phase `'probe'`, froid, sans aide, au haut de l’échelle (`aided: false`) ; sa carte est créée (`introduceCard`), et un sondage pas encore enregistré au `next` suivant est abandonné (carte oubliée, ni précédent ni compté).
5. Seules les cartes que `subject.owns` désigne sont servies et comptées (`LEARNING_SLOTS`, `MAX_UNCONSOLIDATED`, ensemble de travail) ; `nextNew` reçoit toutes les cartes et tout l’historique. Le tempo d’une mécanique est `tempos[subject.exerciseOf(mechanic)]`, `DEFAULT_TEMPO_BPM` à défaut. Le niveau d’un item est `ladderLevel(levelOf(item), ladder)` ; l’avance du `PlannedItem` est celle du niveau ; l’aide `'show-position'` seulement en phase `'learning'` au niveau aidé ; `stringAid` vrai quand l’aide qui s’efface est due (Task 5) ; `exerciseId` par `subject.exerciseOf`, `item` par `subject.promptItem` s’il existe.
6. Phases et températures : retest et reprise → `'learning'`, chaud ; révision → `'review'`, froid ; consolidation et rattrapage → `'consolidation'`, chaud ; un item servi chaud entre dans l’ensemble de travail (au plus `MAX_WORKING_SET`).

- [ ] **Step 1: Write the failing tests** (sujet factice, `random` fixé) :

- `it('probes a new item first, unaided and cold, at the top of its ladder')`.
- `it('serves the categories in their order')` : un retest dû passe avant une révision, une révision avant une reprise, une reprise avant un nouveau, un nouveau avant une consolidation.
- `it('caps the cold reviews of a session')` : après `LEARN_COLD_CAP` révisions, plus de révision.
- `it('never serves the previous item nor its neighbour, and prefers what the subject prefers')` : 200 tirages.
- `it('keeps new items out while one being learned is weak or the session’s success is low')` : réussite d’un item en cours à 0,6 → pas de nouveau ; glissante à 0,6 → pas de nouveau ; 0,8 et 0,7 → un nouveau.
- `it('never holds more than MAX_WORKING_SET items hot in a session')`.
- `it('serves only retests when the player is tired')`.
- `it('forgets a probe abandoned by a pause')` : `next` (sondage) puis `next` sans `record` → le même item peut être sondé de nouveau et n’a pas compté comme précédent.
- `it('serves an item at its stored level, brought into today’s ladder')` : niveau 2 stocké, tempo 160 → avance 4.
- `it('serves nothing rather than the previous item again')` : un seul item, déjà servi → `null`.

- [ ] **Step 2: Run** `npx vitest run src/lib/domain/learning/procedure.serve.spec.ts` → FAIL.
- [ ] **Step 3: Implement `createLearningProcedure` (`next`, `levelOf`, `cardChanged`)**, `record` laissé à `null` jusqu’à la Task 5.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: serve what an item needs next, whatever the exercise"`

---

### Task 5: La procédure apprend : niveaux, appris, rattrapage, aide qui s’efface

**Files:**

- Modify: `src/lib/domain/learning/procedure.ts`
- Create: `src/lib/domain/learning/boundaries.spec.ts`
- Test: `src/lib/domain/learning/procedure.learn.spec.ts`

**Interfaces:**

- Consumes: Tasks 1 à 4 ; `probeCard`, `markLearned`, `applyColdAttempt` (Task 2) — `applyColdAttempt` reste à l’enregistreur de l’ancien chemin ; la procédure n’applique que ce qu’elle décide (sondage, appris), et prend la carte froide mise à jour par `cardChanged`.
- Produces: `record(attempt, now): { card?: CardState; level?: LevelState } | null`.

Règles de `record` (chacune a son test) :

1. Un essai d’une carte que le sujet ne possède pas → `null`, rien ne change.
2. Sondage réussi en rappel direct → carte en révision (`probeCard`), niveau = celui servi, rendu `{ card, level }` ; raté → la présentation aidée vient au `next` suivant, niveau 0, rendu `{ card, level }`.
3. Un essai jugé d’un item (chaud ou froid, sondage exclu) déplace son niveau par `nextLevelState` sur son échelle, avec la réussite du niveau : au haut, un rappel direct (`subject.recall`) ; plus bas, `Attempt.success` ; l’aide du niveau ne compte pas comme aidée.
4. En phase `'learning'`, la passe complète du haut (`passesTop`) rend l’item appris (`markLearned`), rendu `{ card, level }` ; sinon le retest suivant est dû après `LEARN_RETEST_GAPS[0]` (après la présentation aidée ou un raté) ou `LEARN_RETEST_GAPS[1]`.
5. Un raté (sondage et rattrapage exclus) appelle un rattrapage après `RECOVERY_AFTER_MISSES` : au `next` suivant, un item solide de la même mécanique (acquis, sans raté dans ses `CONFUSION_LOOKBACK` derniers essais, pas en attente de révision), en consolidation chaude ; un rattrapage raté n’en appelle pas d’autre ; une réussite efface la demande.
6. L’aide qui s’efface (mécanique où `subject.fadingAid`) : la présentation aidée et un raté la ramènent sur les consignes chaudes suivantes de l’item ; `STRING_AID_FADE_SUCCESSES` réussites depuis la retirent ; jamais en révision ni en sondage.
7. La réussite glissante de séance compte les `SUCCESS_WINDOW` derniers essais de la procédure, sondages exclus (C3).

- [ ] **Step 1: Write the failing tests** :

- `it('sends a probe recalled directly to review, and presents a missed one aided next, before any other retest')`.
- `it('climbs a level on a success and falls one on a miss, hot or cold')` (C1).
- `it('counts a success at the top only when it is a direct recall')`.
- `it('learns an item when the top level’s pass completes, retesting it at the short gap after the presentation or a miss and the long one otherwise')`.
- `it('calls a solid item after a miss, never after a missed recovery')`.
- `it('draws the fading aid after the presentation and a miss, and drops it after its successes')`.
- `it('ignores an attempt of another exercise')`.
- `it('counts every attempt of the procedure in the session’s success, probes left out')` (C3).

`boundaries.spec.ts` (sur le modèle de `domain/time/boundaries.spec.ts`) : `it('names no mechanic nor exercise and imports no music')` → aucun fichier non-spec de `domain/learning/` ne contient `'locate'`, `'identify'`, `'triad-anchor'`, `'triad-zone'`, `'chord-grid'`, `$lib/domain/music`, `$lib/domain/triads`, `$lib/domain/gesture`, `$lib/domain/mechanics`, `$lib/domain/timing`, `$lib/application`, ni un import relatif qui en sort vers eux ; `$lib/domain/progress/constants` et `$lib/domain/progress/review`, `success`, `cards` sont permis ; et `it('actually scans the learning module')`.

- [ ] **Step 2: Run** `npx vitest run src/lib/domain/learning` → FAIL.
- [ ] **Step 3: Implement `record`.**
- [ ] **Step 4: Run** `npx vitest run src/lib/domain/learning && npm run check` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: move an item's level, learn it and bring a solid one after a miss"`

---

### Task 6: Le sujet des notes

**Files:**

- Create: `src/lib/domain/progress/neckSubject.ts`
- Test: `src/lib/domain/progress/neckSubject.spec.ts`

**Interfaces:**

- Consumes: `LearningSubject` (Task 3), `leadLadder`, `aidLadder` (Task 1), `directRecallOf` (Task 2) ; `nextNewCard`, `introductionOrder` (`progress/introduction.ts`), `isMirrorPair`, `asNeckCard`, `neckCardKey` (`domain/music`), `neckExerciseId` (`progress/neck.ts`), `LEAD_STEPS`, `RECALL_THRESHOLD_MS`, `IDENTIFY_RECALL_THRESHOLD_MS`, `LEARN_SUCCESSES`.
- Produces: `neckSubject(input?: { priority?: readonly LocateItem[] }): LearningSubject` — possède `locate` et `identify` ; `nextNew` = `nextNewCard(cards, priority)` hors `blocked` (une note attend que son miroir soit acquis : déjà dans `nextNewCard`) ; voisins = même carte ou paire miroir ; préfère une autre corde ; échelle de localiser `leadLadder({ steps: LEAD_STEPS, tempoBpm, recallThresholdMs: RECALL_THRESHOLD_MS, learnedAfter: LEARN_SUCCESSES })`, d’identifier `aidLadder(LEARN_SUCCESSES)` ; rappel direct `directRecallOf(RECALL_THRESHOLD_MS)` / `directRecallOf(IDENTIFY_RECALL_THRESHOLD_MS)` ; confusion = `data.confusion !== null` ; aide qui s’efface pour localiser.

- [ ] **Step 1: Write the failing tests** :

- `it('introduces the notes in the order of the neck, the triads’ notes first')`.
- `it('keeps a note and its mirror apart, and prefers another string')`.
- `it('learns locate over its leads and identify over the name shown')`.
- `it('plays a learn session end to end on the procedure')` : procédure + sujet des notes, 40 consignes jouées avec un joueur scripté (juste aux crans courts sauf pour deux notes), vérifie les invariants des Tasks 4 et 5 à chaque pas (jamais le précédent ni son miroir, catégories, ensemble de travail, aucun sondage chaud, aucune révision aidée).

- [ ] **Step 2: Run** `npx vitest run src/lib/domain/progress/neckSubject.spec.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: learn the neck's notes through the learning procedure"`

---

### Task 7: Le sujet des triades

**Files:**

- Create: `src/lib/domain/triads/triadSubject.ts`
- Test: `src/lib/domain/triads/triadSubject.spec.ts`

**Interfaces:**

- Consumes: `LearningSubject`, `leadLadder`, `directRecallOf` ; `triadIntroductionOrder`, `triadParams`, `voicingOccurrences`, `occurrencePosition`, `cueFrets`, `parseVoicingKey`, `voicingKey` (comme `triadSelector.ts` les importe) ; `pacingOf` ; `isAcquired` (Task 2).
- Produces: `triadSubject(input: { mechanic: 'triad-anchor' | 'triad-zone'; definitions: { anchor: ExerciseDefinition; zone: ExerciseDefinition }; acquiredPositions: ReadonlySet<string> }): LearningSubject` — possède les deux mécaniques de triades (la zone lit les cartes d’ancrage) mais n’introduit que celles de son exercice : en ancrage, la tête de la file `triadIntroductionOrder` ; en zone, une triade acquise en ancrage (`isAcquired` avec `directRecallOf(RECALL_THRESHOLD_MS)`) ; voisins = même voicing (l’accord précédent sonne encore) ; aucune préférence ; échelle `leadLadder` sur `pacingOf(definition).leadSteps` et `learnedAfter` (C2) ; aucune aide qui s’efface ; `promptItem` : en zone, une position parmi les formes du voicing autre que la dernière demandée à cette carte et une case qu’elle couvre (la règle de `triadSelector.zoneItem` et `drawPosition`), la dernière position lue dans `attempt.data.item.position` et tenue par le sujet.

- [ ] **Step 1: Write the failing tests** :

- `it('introduces anchor triads in their queue, the acquired notes’ triads first')`.
- `it('opens a zone triad only once it is acquired in anchor')`.
- `it('serves only its own exercise’s cards')` : un sujet de zone ne sert aucune carte d’ancrage, un sujet d’ancrage aucune carte de zone, en révision, reprise ou consolidation.
- `it('never asks the voicing still ringing')`.
- `it('asks a zone triad at another position than the last')`.
- `it('plays a triads session end to end on the procedure')` : comme la Task 6, 30 consignes d’ancrage.

- [ ] **Step 2: Run** `npx vitest run src/lib/domain/triads/triadSubject.spec.ts` → FAIL.
- [ ] **Step 3: Implement** (si la dernière position doit être tenue d’une consigne à l’autre, le sujet la tient dans une fermeture créée par `triadSubject`, une instance par séance).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: learn the triads through the learning procedure"`

---

### Task 8: Les sources d’items et `choose`

**Files:**

- Modify: `src/lib/domain/progress/selector.ts` (et tous les importeurs de `SessionSelector`, `createListSelector`, `RecordOutcome` : `progress/index.ts`, `learnSelector.ts`, `triadSelector.ts`, `gestureSelector.ts`, `application/session/SessionController.svelte.ts`, `application/session/AttemptRecorder.ts`, `application/services/createAppServices.ts`, et leurs specs)
- Create: `src/lib/domain/session/choose.ts`
- Test: `src/lib/domain/progress/selector.spec.ts` (ou le spec existant de la liste), `src/lib/domain/session/choose.spec.ts`

**Interfaces:**

- Produces (dans `selector.ts`) :

```ts
/** Gives a series its items, one at a time: the learning procedure, a fixed list, the gesture's passages. */
export interface ItemSource {
	next(context: SelectorContext): PlannedItem | null;
	record(attempt: Attempt, now: number): RecordOutcome;
	cardChanged(card: CardState): void;
}
export type RecordOutcome = { card?: CardState; level?: LevelState } | null;
export function createListSource(items: readonly PlannedItem[]): ItemSource;
```

`SessionSelector` et `createListSelector` disparaissent (renommés partout). Les lecteurs de `RecordOutcome` lisent `outcome?.card` comme avant ; `level` est ignoré par l’ancien chemin.

- Produces (dans `choose.ts`) :

```ts
export interface SeriesCandidate {
	exerciseId: ExerciseId;
	source: ItemSource;
}
/** The series to play next among the candidates. H2: one candidate, the session's; the score comes with chantier 5. */
export function choose(candidates: readonly SeriesCandidate[]): SeriesCandidate | null;
```

- [ ] **Step 1: Write the failing tests** : `it('serves a fixed list in order')` (le test actuel de la liste, renommé) ; `it('chooses the one candidate of a session, and none from none')`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Rename and implement**, puis faire implémenter `ItemSource` par `createLearningProcedure` (Task 4 visait déjà la même forme).
- [ ] **Step 4: Run** `npm test && npm run check` → PASS, l’ancien chemin inchangé.
- [ ] **Step 5: Commit** `git commit -m "refactor: name the item sources and choose a session's series"`

---

### Task 9: La doc suit

**Files:**

- Modify: `docs/superpowers/specs/2026-10-14-temps-musical-et-sequences-design.md` (« Réalisation du plan H2 »), `CLAUDE.md` (puce « Sessions » : la procédure d’apprentissage, les sujets, `ItemSource`, `choose`, les niveaux par item ; ce qui reste à H3)

- [ ] **Step 1: Write « Réalisation du plan H2 »** : les décisions de ce plan, les changements C1 à C3 tels que l’auteur les a tranchés, et tout écart accepté en relecture.
- [ ] **Step 2: Update `CLAUDE.md`** : une à trois phrases dans la puce « Sessions », au style de la puce.
- [ ] **Step 3: Verify** : `npx prettier --check` sur les deux fichiers, `npm test && npm run check` → PASS.
- [ ] **Step 4: Commit** `git commit -m "docs: describe the learning procedure and the item sources"`
