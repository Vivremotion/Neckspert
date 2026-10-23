# Le moteur de tour (plan H1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un seul moteur de tour qui juge n’importe quel `RoundPlan` : tours à une réponse (localiser, triades, geste, identifier) comme cycles de rythme, par des modes nommés branchés dans des registres, construit à côté des relations actuelles et prouvé équivalent à elles.

**Architecture:** `PlanRound` (`domain/time/round.ts`) ne fait que router : il date le tour (`roundTimes`), donne chaque observation au mode d’**appariement** du plan (`first-answer` ou `alignment`), celui-ci au **juge de contenu** de l’attente (registre `domain/judges/`, injecté), et le résultat au mode de **verdict** (`response` ou `cycle`) ; il émet les événements du direct (`pending`, `provisional`, `settled`). Les modes vivent dans `domain/time/modes/`, chacun derrière une interface ; le moteur ne connaît qu’elles. Les quatre relations deviennent des plans écrits par des constructeurs (`domain/exercise/roundPlans.ts`), et un banc de comparaison les fait jouer côte à côte avec les anciennes relations. Rien de l’ancien chemin n’est supprimé (c’est H3).

**Tech Stack:** TypeScript, Vitest (node : `*.spec.ts`), Svelte 5 pour le seul contrôleur de plan touché.

**Spec:** `docs/superpowers/specs/2026-10-14-temps-musical-et-sequences-design.md`, section « Amendement (2026-10-23) : la migration (H) comme généralisation », sous-sections « Le principe », « Décisions » et « 2. Le moteur de tour » ; sections 3 (plan d’attentes) et 4 (juge) pour le contrat existant.

## Global Constraints

- Branche `plan/temps-musical-h1`, dans `.worktrees/temps-musical-h1`. `npm test && npm run check` vert à chaque commit ; tests avant le code ; chaque test affirme (`expect.requireAssertions`).
- **`domain/time/` reste pur et sans musique** : il n’importe rien de `domain/music`, `domain/mechanics`, `domain/judges`, `domain/triads`, `domain/gesture`, `domain/timing`, `domain/scoring`, ni de `application/` (test de frontière, Task 7). Les juges de contenu lui sont injectés.
- **Le moteur ne nomme aucun mode** : `PlanRound` lit `plan.policy.pairing.mode` et `plan.policy.verdict` dans un registre (`RoundModes`) ; aucun `if` sur un nom de mode hors des modes eux-mêmes. Un mode factice injecté se branche sans toucher au moteur (Task 7).
- **Aucun comportement de l’ancien chemin ne change** : `SessionController`, `domain/timing/`, les sélecteurs et `PlayScreen` restent tels quels ; seuls changent `PlanSessionController` (appels au moteur) et les `judge` des mécaniques (qui délèguent aux juges de contenu, même résultat).
- Constantes reprises telles quelles, sans les dupliquer : `MIN_RESPONSE_MS = 300`, `PERFECT_WINDOW_MS = 80`, `LATE_LIMIT_MS = 400`, `LATE_CAPTURE_MS = 2000` (`domain/scoring/timing.ts`) ; `STRING_PREVIEW_BEATS = 1`, `RESPIRATION_BARS = 1` (`domain/timing/grid.ts`) ; `ANCHOR_CHORD_FROM_BEATS = 1` (`domain/timing/anchor.ts`) ; `GRID_EARLY_MS = 200`, `GRID_EARLY_MAX_BEATS = 0.4` (`domain/timing/gridChange.ts`) ; `IDENTIFY_RECALL_THRESHOLD_MS = 3000`, `RECALL_THRESHOLD_MS = 1500` (`domain/types.ts`). Les constructeurs de plans les importent de là où elles sont ; H3 les déplace quand il supprime `domain/timing/`.
- Une seule tolérance de bord : `EDGE_TOLERANCE_S = 1e-6`, exportée par `domain/time/modes/zones.ts`, la même que celle des relations.
- Un nom par concept : « tour » / `round`, « attente » / `expectation`, « appariement » / `pairing`, « verdict » / `verdict`, « juge de contenu » / `ContentJudge`. « Séquence » n’apparaît dans aucun nom neuf.
- Commits : Conventional Commits en minuscules, impératif, orientés comportement ; terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Décisions prises par ce plan (à reporter dans « Réalisation »)

- **La correction ne vaut que pour une attente étendue** (`span: { until }`) dont les attentes précédentes sont justes : la bande où l’on peut rejouer. Une attente ponctuelle se joue une fois. C’est ce que fait l’ancrage aujourd’hui.
- **Le tour écoute jusqu’à `listenUntil` les lectures de sa dernière attente** ; une attente qui n’est pas la dernière est décidée dès la fin de sa zone : manquée sans réponse, jugée telle qu’elle est avec une lecture en attente. Un tour perdu (une réponse fausse et définitive) se règle dès que toutes ses zones sont passées, sans attendre de lecture. C’est le comportement actuel de `beat`, `anchor` et `gridChange`, écrit une fois.
- **Le direct montre un raté provisoire** dans deux cas seulement : une attente ponctuelle dont la zone « à temps » s’est fermée sans réponse ni lecture en attente, et une première réponse fausse d’une attente étendue encore corrigeable. Un même cas n’est montré qu’une fois.
- **Un plan en temps libre** (identifier) a toutes ses attentes à `at: null` et une longueur sans signification (`Fraction.of(1)`) ; sa fenêtre `{ ms }` est le seuil de réaction d’un `perfect`.
- **`ResponseVerdict` et `RESPONSE_VERDICTS` déménagent** dans le mode de verdict `response` ; `domain/types.ts` les réexporte. L’enveloppe d’un tour à une réponse devient `{ relation: 'response', version: RESPONSE_VERDICT_VERSION, value: ResponseValue }` ; `responseVerdictOf` lit l’ancienne forme et la nouvelle.
- **Le rappel direct est une règle du verdict** : réussi, et la consigne précédait la cible d’au plus le seuil de l’exercice (`leadMs`), ou, en temps libre, la réaction est sous le seuil. Le geste n’a pas de seuil : jamais de rappel direct.

## Review Focus

- **Une lecture en attente quand la fenêtre se ferme** (accord ou note lus non définitifs, `final: false` et faux) : aucun raté provisoire n’est montré, et la lecture est jugée telle quelle à `listenUntil` (Task 4).
- **Une attaque exactement sur un bord** (ouverture `MIN_RESPONSE_MS` après la consigne, fin de la zone à temps, passage de main) : elle tombe du même côté qu’avec les relations actuelles, à `EDGE_TOLERANCE_S` près (Task 3, Task 9).
- **Une deuxième attaque pendant que la première attend une meilleure lecture**, même juste : ignorée (`settled`), la première reste la réponse (Task 4).
- **Une pause avant la fin de la zone à temps, rien entendu** : le tour est abandonné sans tentative (`close` rend `null`) ; après, il est réglé sans réponse (Task 4, Task 7).
- **Un tour de geste enchaîné** : sa consigne se montre à son ouverture, et une attaque exactement au passage de main appartient au tour suivant (`after-capture` dans celui-ci) (Task 3, Task 9).

---

## File Structure

**Domaine, temps (pur, sans musique)**

- `src/lib/domain/time/plan.ts` — modifié : `ExpectedContent`, `Expectation.at: Fraction | null`, `Expectation.content: ExpectedContent | null`, `Opening`, `LateCapture`, `PairingPolicy`, `VerdictModeId`, `RoundPolicy` (nouvelle forme), `RoundPlan.listenUntil?`, `Judged`, `ContentJudge`, `ContentJudges`, `validateRoundPlan` étendu ; `compileCyclePlan` écrit la nouvelle politique.
- `src/lib/domain/time/tempoMap.ts` — modifié : `segmentAt`, `secondsOf`, `beatSecondsAt` exportés (sortis de `judge/align.ts`).
- `src/lib/domain/time/modes/types.ts` — `RoundClock`, `Attack`, `IgnoreReason`, `ObservationFate`, `PairedAnswer`, `PairingResult`, `PairingContext`, `Pairing`, `PairingMode`, `VerdictContext`, `VerdictMode`, `RoundModes`.
- `src/lib/domain/time/modes/zones.ts` — `EDGE_TOLERANCE_S`, `ResponseZone`, `RoundTimes`, `roundTimes`.
- `src/lib/domain/time/modes/firstAnswer.ts` — `firstAnswerPairing: PairingMode`.
- `src/lib/domain/time/modes/alignment.ts` — `alignmentPairing: PairingMode`.
- `src/lib/domain/time/modes/responseVerdict.ts` — `RESPONSE_VERDICTS`, `ResponseVerdict`, `RESPONSE_VERDICT_VERSION`, `ResponseValue`, `ExpectationResult`, `responseVerdict: VerdictMode`, `isDirectRecall`.
- `src/lib/domain/time/modes/cycleVerdict.ts` — `CYCLE_VERDICT_VERSION` (déplacé), `cycleVerdictMode: VerdictMode`.
- `src/lib/domain/time/modes/index.ts` — `ROUND_MODES: RoundModes` et les réexports.
- `src/lib/domain/time/round.ts` — réécrit : `PlanRound`, `RoundEvent`, `Observed` ; `RHYTHM_SENSOR`, `AIDS`, `Aid`, `VerdictEnvelope`, `RoundOutcome`, `PlanObservation` (gagne `final?`) restent.
- `src/lib/domain/time/boundaries.spec.ts` — neuf.
- `src/lib/domain/time/index.ts` — réexporte `modes/`.

**Domaine, juges et plans**

- `src/lib/domain/judges/index.ts` — `NOTE_CONTENT`, `NAME_CONTENT`, `CHORD_VOICING_CONTENT`, `CHORD_GRID_CONTENT`, `CONTENT_JUDGES`, `contentJudges`, et les types de valeur `ChordVoicingContent`.
- `src/lib/domain/mechanics/{locate,identify,triadAnchor,triadZone,chordGrid}.ts` — modifiés : leur `judge` délègue au juge de contenu ; `chordGrid.ts` exporte `classify` sous le nom `classifyGridChord`.
- `src/lib/domain/exercise/roundPlans.ts` — `beatPlan`, `anchorPlan`, `gridChangePlan`, `freePlan`.
- `src/lib/domain/types.ts` — modifié : réexporte `ResponseVerdict`, `RESPONSE_VERDICTS` ; `responseVerdictOf` lit l’enveloppe `response`.

**Application**

- `src/lib/application/session/plan/PlanSessionController.svelte.ts` — modifié : `observe(…).fate`, `close(now)` au lieu de `settle()`.

**Tests de comparaison**

- `src/lib/domain/time/legacyParity.spec.ts` — le banc : les anciennes relations et le moteur sur les mêmes scénarios (supprimé à H3 avec `domain/timing/`).

---

### Task 1: Le contrat du plan nomme ses modes

**Files:**

- Modify: `src/lib/domain/time/plan.ts`, `src/lib/domain/time/tempoMap.ts`, `src/lib/domain/time/judge/align.ts` (importe les aides de `tempoMap.ts`), `src/lib/domain/time/round.ts` (`PlanObservation.final?: boolean` seulement)
- Test: `src/lib/domain/time/plan.spec.ts`, `src/lib/domain/time/tempoMap.spec.ts`, `src/lib/domain/time/paperPlans.spec.ts`

**Interfaces:**

- Produces (dans `plan.ts`) :

```ts
/** What must be played at an expectation, judged by the content judge of its `kind`. */
export interface ExpectedContent {
	kind: string;
	value: unknown;
}
/** Where an answer may start: a delay after the prompt, or a tolerance before the expectation (capped in beats). */
export type Opening = { afterPromptMs: number } | { beforeMs: number; maxBeats: number };
/** After the in-time zone: a capture of `ms` (off the beat), up to the end of listening, or none. */
export type LateCapture = { ms: number } | 'to-end' | null;
export type PairingPolicy =
	| { mode: 'first-answer'; opens: Opening; lateMs: number; lateCapture: LateCapture }
	| { mode: 'alignment' };
export type VerdictModeId = 'response' | 'cycle';
export interface RoundPolicy {
	unit: 'response' | 'cycle';
	pairing: PairingPolicy;
	verdict: VerdictModeId;
	/** A wrong first answer of a span may be put right later in the span (`corrected`). */
	correction: boolean;
}
export interface Judged {
	correct: boolean;
	answer: unknown;
	confusion: unknown | null;
}
export interface ContentJudge {
	judge(value: unknown, payload: unknown): Judged;
}
/** The judge of a content kind; throws on a kind it does not know. */
export type ContentJudges = (kind: string) => ContentJudge;
```

`Expectation.at: Fraction | null` (`null` : temps libre), `Expectation.content: ExpectedContent | null`, `RoundPlan.listenUntil?: Fraction` (dernière position où le tour écoute ; absente : `handover`, sinon `length`).

- Produces (dans `tempoMap.ts`) : `segmentAt(map: TempoMap, position: Fraction): TempoSegment`, `secondsOf(map: TempoMap, position: Fraction, length: Fraction): number` (déplacés tels quels depuis `align.ts`), `beatSecondsAt(map: TempoMap, position: Fraction): number` (= `secondsOf(map, position, segmentAt(map, position).unit)`).

- [ ] **Step 1: Write the failing tests**

Dans `plan.spec.ts`, `describe('validateRoundPlan')` :

- `it('accepts a free-time plan whose expectations all have no position')` : une attente `at: null`, `opens: { afterPromptMs: 0 }` → `null`.
- `it('refuses a plan that mixes timed and free-time expectations')` → message contenant `free-time`.
- `it('refuses a first-answer free-time plan that opens before its expectation')` : `at: null` avec `opens: { beforeMs: 200, maxBeats: 0.4 }` → message contenant `afterPromptMs`.
- `it('refuses listenUntil outside (0, length]')` : `listenUntil` à `0` et à `length + 1/4` → message contenant `listenUntil`.
- `it('refuses a content without kind')` : `content: { kind: '', value: 1 }` → message contenant `kind`.

Dans `plan.spec.ts`, `describe('compileCyclePlan')` : `it('writes the cycle policy by its modes')` → `plan.policy` vaut `{ unit: 'cycle', pairing: { mode: 'alignment' }, verdict: 'cycle', correction: false }`.

Dans `tempoMap.spec.ts` : `it('gives the seconds of a beat where it stands')` → sur `createTempoMap(0, [{ at: Fraction.ZERO, bpm: 120, unit: Fraction.of(1, 4) }])`, `beatSecondsAt(map, Fraction.of(1))` vaut `0.5`.

Dans `paperPlans.spec.ts` : réécrire les quatre plans sur papier avec la nouvelle politique et `content: { kind, value }` (`beat` : `first-answer`, `opens: { afterPromptMs: 300 }`, `lateMs: 400`, `lateCapture: { ms: 2000 }`, `verdict: 'response'`, `correction: false` ; `anchor` : la même avec `correction: true` ; `gridChange` : `opens: { beforeMs: 200, maxBeats: 0.4 }`, `lateCapture: 'to-end'` ; ajouter `free` : `at: null`, `opens: { afterPromptMs: 0 }`, `lateCapture: null`) ; chacun valide (`toBeNull()`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/domain/time`
Expected: FAIL (types et règles absents).

- [ ] **Step 3: Implement the contract in `plan.ts` and `tempoMap.ts`**

`validateRoundPlan` ajoute, dans cet ordre : contenu sans `kind` ; mélange de `at` nuls et non nuls ; `at: null` avec une ouverture autre que `afterPromptMs` ; `listenUntil` hors de `(0, length]`. Les règles de position (ordre, bornes, étendue) ne s’appliquent qu’aux attentes datées. `compileCyclePlan` écrit la politique du test.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/domain/time && npm run check`
Expected: PASS ; `svelte-check` sans erreur (les appels existants à `policy` n’utilisent que `compileCyclePlan`).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/time
git commit -m "feat: let a round plan name its pairing and verdict modes"
```

---

### Task 2: Les juges de contenu, par sorte de contenu

**Files:**

- Create: `src/lib/domain/judges/index.ts`
- Modify: `src/lib/domain/mechanics/locate.ts`, `identify.ts`, `triadAnchor.ts`, `triadZone.ts`, `chordGrid.ts`
- Test: `src/lib/domain/judges/judges.spec.ts`

**Interfaces:**

- Consumes: `Judged`, `ContentJudge`, `ContentJudges` (Task 1).
- Produces :

```ts
export const NOTE_CONTENT = 'note'; // value: LocateItem { string, pitch }; payload { midi }
export const NAME_CONTENT = 'name'; // value: IdentifyItem { string, fret }; payload PitchName
export const CHORD_VOICING_CONTENT = 'chord-voicing'; // value: ChordVoicingContent; payload ChordReading
export const CHORD_GRID_CONTENT = 'chord-grid'; // value: ChordGridItem; payload ChordReading
export interface ChordVoicingContent {
	voicingKey: string;
	position: number | 'open' | null;
}
export const CONTENT_JUDGES: Readonly<Record<string, ContentJudge>>;
export const contentJudges: ContentJudges; // throws `unknown content kind: ${kind}`
```

Les réponses (`answer`) sont celles des mécaniques aujourd’hui : `{ midi }`, `{ pitch }`, `{ decided }`.

- [ ] **Step 1: Write the failing tests**

`judges.spec.ts` :

- `it('judges a note on its string as locate does')` : pour `{ string: 2, pitch: 'F' }`, une `midi` juste et une fausse → `contentJudges('note').judge(value, payload)` égale `locateRules.judge(value, payload)`.
- `it('judges a tapped name as identify does')` : un nom juste, un faux → égal à `identifyRules.judge`.
- `it('judges a chord voicing anywhere, or at its position, as the triads do')` : `position: null` égal au juge de chord de l’ancrage (sans `part: 'root'`, qui reste à la mécanique), `position: 5` égal à `triadZoneRules.judge` ; une lecture `decided: null` → `{ correct: false, confusion: { kind: 'none', part: 'chord' } }`.
- `it('judges a grid change by its rule as the gesture does')` : un `ChordGridItem` `link` juste et faux → égal à `chordGridRules.judge`.
- `it('refuses a content kind it does not know')` : `contentJudges('kazoo')` lève `unknown content kind: kazoo`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/domain/judges`
Expected: FAIL (module absent).

- [ ] **Step 3: Implement `domain/judges/index.ts`, then make the mechanics delegate**

Chaque juge reprend le corps du `judge` de sa mécanique. Les mécaniques appellent ensuite le juge de contenu : `locateRules.judge = (item, payload) => CONTENT_JUDGES.note.judge(item, payload)` ; l’ancrage garde son ajout `part: 'root'` sur la confusion de la fondamentale ; `chordGrid.ts` exporte sa fonction `classify` sous le nom `classifyGridChord`, que le juge `chord-grid` appelle.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/domain/judges src/lib/domain/mechanics src/lib/application/mechanics`
Expected: PASS, specs des mécaniques inchangées comprises.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/judges src/lib/domain/mechanics
git commit -m "feat: judge what is played by its kind of content, for any exercise"
```

---

### Task 3: Les instants d’un tour

**Files:**

- Create: `src/lib/domain/time/modes/types.ts`, `src/lib/domain/time/modes/zones.ts`
- Test: `src/lib/domain/time/modes/zones.spec.ts`

**Interfaces:**

- Consumes: `RoundPlan`, `Opening`, `LateCapture` (Task 1) ; `beatSecondsAt` (Task 1).
- Produces (dans `types.ts`, utilisés par toutes les tâches suivantes) :

```ts
/** A round on the tempo map, from `start`; or in free time, from the instant of its prompt. */
export type RoundClock = { map: TempoMap; start: Fraction } | { promptS: number };
```

- Produces (dans `zones.ts`) :

```ts
export const EDGE_TOLERANCE_S = 1e-6;
export interface ResponseZone {
	index: number; // in the plan
	sensor: string;
	span: 'point' | 'span';
	atS: number | null; // null in free time
	opensS: number; // an attack from here may answer
	inTimeEndS: number; // after it, a right answer is off the beat (point) or none (span)
	captureEndS: number; // after it, no attack answers this expectation
}
export interface RoundTimes {
	promptS: number;
	startS: number;
	endS: number;
	listenUntilS: number;
	handoverS: number | null;
	/** One per expectation, for a first-answer plan; empty otherwise. */
	zones: ResponseZone[];
}
export function roundTimes(plan: RoundPlan, clock: RoundClock, chained: boolean): RoundTimes;
```

Règles (chaque ligne est vérifiée par un test) :

- `startS` / `endS` : `start` et `start + length` sur la carte ; en temps libre `startS = endS = promptS`, `listenUntilS = Infinity`, `handoverS = null`.
- `promptS` : `start + plan.prompt` ; enchaîné (`chained`), l’ouverture de la première zone ; en temps libre, celui de l’horloge.
- Avance d’ouverture `earlyS` d’une attente ponctuelle avec `opens: { beforeMs, maxBeats }` : `min(beforeMs / 1000, maxBeats × beatSecondsAt(map, at))`.
- `handoverS` : `start + handover − earlyS` de la première attente quand l’ouverture est `beforeMs`, sinon `start + handover` ; `null` sans `handover`.
- `listenUntilS` : `start + listenUntil` s’il est donné, sinon `handoverS`, sinon `endS`.
- Ponctuelle, `afterPromptMs` : `opensS = promptS + ms/1000`, `inTimeEndS = atS + lateMs/1000`.
- Ponctuelle, `beforeMs` : `opensS = atS − earlyS`, `inTimeEndS = min(atS + lateMs/1000, handoverS ?? Infinity)`.
- Étendue `[at, until)` : `opensS = atS`, `inTimeEndS = captureEndS = start + until`.
- `captureEndS` d’une ponctuelle : `null` → `inTimeEndS` ; `{ ms }` → `min(inTimeEndS + ms/1000, prochaine ouverture, listenUntilS)` ; `'to-end'` → `min(listenUntilS, prochaine ouverture)`. La « prochaine ouverture » est `opensS` de l’attente suivante dans le plan (`Infinity` pour la dernière).
- Temps libre : `opensS = promptS + afterPromptMs/1000`, `inTimeEndS = captureEndS = Infinity`.
- Un plan `alignment` a `zones: []`.

- [ ] **Step 1: Write the failing tests**

Horloge des specs actuelles : `createTempoMap(0.1, [{ at: Fraction.ZERO, bpm: 80, unit: Fraction.of(1, 4) }])` (un temps = 0,75 s, `beatTime(i) = 0.1 + 0.75 i`).

- `it('times a located note as the beat relation does')` : `beatPlan`-équivalent écrit à la main (avance 4, cible au temps 8 : `start = Fraction.of(2)`) → `promptS ≈ 3.1`, zone `opensS ≈ 3.4`, `inTimeEndS ≈ 6.5`, `captureEndS ≈ 8.35`, `listenUntilS ≈ 8.35` (`toBeCloseTo(…, 9)`).
- `it('ends the root’s late capture where the chord’s span opens')` : plan d’ancrage (cible au temps 8) → fondamentale `captureEndS ≈ 6.85` ; accord `opensS ≈ 6.85`, `inTimeEndS = captureEndS ≈ 9.1` ; `listenUntilS ≈ 11.35`.
- `it('opens a grid change early by its tolerance, capped in beats')` : à 120 bpm, changement de 4 temps en `start` → `earlyS = 0.2`, `opensS = start − 0.2`, `inTimeEndS = start + 0.4`, `handoverS = listenUntilS = captureEndS = start + 2 − 0.2` ; à 160 bpm → `earlyS = 0.15`.
- `it('shows a chained grid change at its opening')` : `chained: true` → `promptS = opensS` ; sinon `promptS = start − 1 temps`.
- `it('opens a free-time expectation at the prompt and never closes it')` : `{ promptS: 10 }` → `opensS = 10`, `inTimeEndS = captureEndS = listenUntilS = Infinity`, `handoverS = null`.
- `it('gives no zones to an aligned plan')` : `compileCyclePlan(…)` → `zones` vide, `startS`/`endS` sur la carte.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/domain/time/modes/zones.spec.ts`
Expected: FAIL (module absent).

- [ ] **Step 3: Implement `roundTimes` in `zones.ts`, and `RoundClock` in `types.ts`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/domain/time/modes/zones.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/time/modes
git commit -m "feat: time a round's answer zones from its plan"
```

---

### Task 4: L’appariement « la première est la réponse »

**Files:**

- Modify: `src/lib/domain/time/modes/types.ts`
- Create: `src/lib/domain/time/modes/firstAnswer.ts`
- Test: `src/lib/domain/time/modes/firstAnswer.spec.ts`

**Interfaces:**

- Consumes: `RoundTimes`, `ResponseZone`, `EDGE_TOLERANCE_S` (Task 3) ; `Judged` (Task 1).
- Produces (dans `types.ts`) :

```ts
export interface Attack {
	time: number;
	sensor: string;
	final: boolean;
	payload: unknown;
}
export type IgnoreReason = 'settled' | 'before-window' | 'after-capture';
export type ObservationFate = 'answer' | IgnoreReason | 'other-sensor' | 'unreadable';
export interface PairedAnswer {
	expectation: number;
	time: number;
	judged: Judged | null; // null for an expectation without content
	/** After the in-time zone: off the beat. */
	late: boolean;
	/** A reading that a better one of the same attack may still replace. */
	pending: boolean;
	correction: { time: number; judged: Judged } | null;
	/** Filled by the alignment; null from the first answer. */
	timing: 'on-time' | 'early' | 'late' | null;
	offsetMs: number | null;
}
export interface PairingResult {
	pairs: PairedAnswer[];
	missed: number[];
	dropped: number[];
	/** Times of the attacks that answer nothing, kept by the alignment only. */
	extra: number[];
	shift: { bar: number; byS: number } | null;
	clampedWindows: number;
	/** Every attack kept, in time order (the cycle verdict reads it). */
	attacks: number[];
}
export interface PairingContext {
	plan: RoundPlan;
	times: RoundTimes;
	clock: RoundClock;
	/** Judges a payload against the content of expectation `index`; null without content. */
	judge(index: number, payload: unknown): Judged | null;
}
export interface Pairing {
	offer(attack: Attack): { fate: 'answer' | IgnoreReason; judged: Judged | null };
	advance(now: number): void;
	/** Every expectation decided: nothing heard later can change the result. */
	done(now: number): boolean;
	/** No new attack can answer any expectation (readings of attacks heard may still come). */
	zonesOver(now: number): boolean;
	/** A reading may still change a pair: a pending reading, or a span still correctable. */
	awaiting(): boolean;
	/** Closing now drops the round: nothing heard and its first in-time zone still open. */
	droppable(now: number): boolean;
	/** Expectations shown as missed so far (see « Le direct »). */
	shownMisses(now: number): number[];
	/** As of now; pending readings are in it as they stand. */
	result(): PairingResult;
}
export interface PairingMode {
	id: string;
	create(context: PairingContext): Pairing;
}
```

- Produces (dans `firstAnswer.ts`) : `firstAnswerPairing: PairingMode` (`id: 'first-answer'`).

Règles de `offer` (dans cet ordre, à `EDGE_TOLERANCE_S` près) :

1. Les candidates sont les attentes du capteur de l’attaque, dans l’ordre du plan. Parmi celles sans réponse, la première dont la zone `[opensS, captureEndS]` contient l’instant reçoit l’attaque ; une attente étendue exclut sa borne de fin, et une ponctuelle `'to-end'` exclut `captureEndS` (passage de main).
2. Aucune zone de candidate sans réponse ne contient l’instant : `before-window` s’il précède l’ouverture de la première, sinon `after-capture`.
3. L’attente choisie attend déjà une meilleure lecture d’une **autre** attaque (instant différent) : `settled`.
4. Lecture non définitive (`final: false`) et fausse : elle est gardée en attente (une lecture suivante de la même attaque la remplace) ; fate `answer`.
5. Sinon la réponse est prise : `late` si l’instant dépasse `inTimeEndS` ; fate `answer`.
6. Une attaque dans la zone d’une attente déjà répondue : `settled`, sauf la correction : attente étendue, politique `correction`, première réponse définitive et fausse, toutes les attentes précédentes justes, attaque d’un autre instant, lecture définitive et juste → `correction`, fate `answer`.

Décisions (`done`, `zonesOver`, `awaiting`, `droppable`, `shownMisses`) :

- Une attente est **décidée** quand sa réponse est définitive (et, si elle est corrigeable, quand la correction est venue ou que `now ≥ listenUntilS`) ; ou, si elle n’est **pas la dernière**, dès que sa zone est passée (`now ≥ captureEndS`) : sans réponse elle est manquée, et sa lecture en attente devient définitive telle qu’elle est ; ou quand `now ≥ listenUntilS`, où toute lecture en attente devient définitive.
- `done(now)` : toutes décidées. `zonesOver(now)` : `now ≥ captureEndS` de toutes. `awaiting()` : une lecture en attente ou une attente corrigeable.
- `droppable(now)` : rien entendu (ni réponse ni lecture en attente) et `now < inTimeEndS` de la première attente.
- `shownMisses(now)` : les attentes ponctuelles sans réponse ni lecture en attente avec `now ≥ inTimeEndS`, et les attentes étendues corrigeables dont la première réponse est définitive et fausse.
- `result()` : une paire par attente répondue (`timing: null`, `offsetMs: null`), les autres dans `missed`, `dropped: []`, `extra: []`, `shift: null`, `clampedWindows: 0`, `attacks` = les instants des réponses.

- [ ] **Step 1: Write the failing tests**

Avec l’horloge et les zones des tests de la Task 3 (localiser, cible 6,1 s ; ancrage ; geste ; temps libre) et un juge factice `judge: (_, p) => p as Judged` :

- `it('takes the first attack in the window and ignores the next')` : `offer(6.13)` → `answer` ; `offer(6.2)` → `settled` ; `done(6.13)` vrai.
- `it('gives an attack before the opening to the previous prompt')` : `offer(3.39)` → `before-window` ; `offer(3.4)` → `answer`.
- `it('keeps a right note after the in-time zone as off the beat')` : `offer(7.0)` juste → paire `late: true`.
- `it('ignores an attack past the late capture')` : `offer(8.36)` → `after-capture`.
- `it('waits for a better reading of the same attack and ignores another one meanwhile')` : `offer({ time: 6.13, final: false, faux })` → `answer`, `awaiting()` vrai ; `offer({ time: 6.4, juste })` → `settled` ; `offer({ time: 6.13, final: true, juste })` → `answer`, `done` vrai, paire juste.
- `it('shows a miss once the in-time zone closes unanswered, not while a reading waits')` : sans attaque, `shownMisses(6.49)` vide, `shownMisses(6.5)` = `[0]` ; avec une lecture en attente, `shownMisses(6.5)` vide.
- `it('drops a round closed before its in-time zone ends with nothing heard')` : `droppable(6.0)` vrai, `droppable(6.5)` faux ; après `offer(6.13)`, `droppable(6.0)` faux.
- `it('misses a root nobody played once its zone is over, and waits for the last expectation until listenUntil')` (ancrage) : sans attaque, `done(9.1)` faux ; `done(11.35)` vrai ; `zonesOver(9.1)` vrai ; `shownMisses(9.1)` ne contient pas l’accord (`1`).
- `it('takes a root reading still waiting as it stands once the chord’s span opens')` (ancrage) : fondamentale `final: false` fausse à 6,13 ; à `6.85`, la paire 0 n’est plus `pending` et reste fausse.
- `it('puts a wrong first chord right with a later right one in the span')` (ancrage, `correction: true`) : fondamentale juste à 6,1 ; accord faux à 7,0 → `shownMisses` contient `1`, `awaiting()` vrai ; accord juste à 8,0 → paire 1 `correction` non nulle ; un deuxième essai juste à 8,5 → `settled`.
- `it('never corrects a point, nor a chord after a wrong root')` : `correction: true`, fondamentale fausse puis accord faux puis accord juste → `settled`, aucune `correction`.
- `it('hands over at the next change: an attack on the handover is not this round’s')` (geste, `'to-end'`) : `offer(handoverS)` → `after-capture` ; `offer(handoverS − 0.001)` juste → `late: true`.
- `it('answers in free time at any moment after the prompt')` : `offer(9.99)` → `before-window` ; `offer(14)` → `answer`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/domain/time/modes/firstAnswer.spec.ts`
Expected: FAIL (module absent).

- [ ] **Step 3: Implement `firstAnswerPairing` in `firstAnswer.ts`, and the types in `types.ts`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/domain/time/modes`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/time/modes
git commit -m "feat: pair the first attack with each expectation, readings and corrections included"
```

---

### Task 5: Les verdicts « réponse » et « cycle »

**Files:**

- Create: `src/lib/domain/time/modes/responseVerdict.ts`, `src/lib/domain/time/modes/cycleVerdict.ts`
- Modify: `src/lib/domain/time/modes/types.ts`, `src/lib/domain/types.ts` (réexports, `responseVerdictOf`)
- Test: `src/lib/domain/time/modes/responseVerdict.spec.ts`, `src/lib/domain/time/modes/cycleVerdict.spec.ts`, `src/lib/domain/types.spec.ts` (ou le spec existant de `responseVerdictOf`)

**Interfaces:**

- Consumes: `PairingResult`, `RoundTimes`, `RoundClock` (Tasks 3–4) ; `cycleReport`, `cycleVerdict`, `timeExpectations` (`judge/`) ; `RoundOutcome`, `Aid` (`round.ts`).
- Produces (dans `types.ts`) :

```ts
export interface VerdictContext {
	plan: RoundPlan;
	times: RoundTimes;
	clock: RoundClock;
	latency: CycleReport['latency'];
	thresholds: LevelParams['thresholds'] | null; // null for a response plan
	aids: Aid[];
}
export interface VerdictMode {
	id: string;
	outcome(result: PairingResult, context: VerdictContext): RoundOutcome;
	/** No answer still to come can make the round pass. */
	lost(result: PairingResult): boolean;
}
export interface RoundModes {
	pairings: Readonly<Record<string, PairingMode>>;
	verdicts: Readonly<Record<string, VerdictMode>>;
}
```

- Produces (dans `responseVerdict.ts`) :

```ts
export const RESPONSE_VERDICTS = [
	'perfect',
	'early',
	'late',
	'offbeat',
	'corrected',
	'wrong'
] as const;
export type ResponseVerdict = (typeof RESPONSE_VERDICTS)[number];
export const RESPONSE_VERDICT_VERSION = 1;
export interface ExpectationResult {
	index: number;
	answer: unknown | null;
	correct: boolean | null; // null: unanswered
	confusion: unknown | null;
	correction: unknown | null;
	late: boolean;
}
export interface ResponseValue {
	verdict: ResponseVerdict;
	timingOffsetMs: number | null;
	reactionMs: number | null;
	/** From the prompt to the first timed expectation; null in free time. */
	leadMs: number | null;
	expectations: ExpectationResult[];
}
export const responseVerdict: VerdictMode; // id 'response'
export function isDirectRecall(
	value: ResponseValue,
	success: boolean,
	thresholdMs: number | null
): boolean;
```

- Produces (dans `cycleVerdict.ts`) : `CYCLE_VERDICT_VERSION = 1` (déplacé de `round.ts`, réexporté par lui), `cycleVerdictMode: VerdictMode` (id `'cycle'`).

Règles du verdict `response` :

- L’attente **chronométrée** est la première attente ponctuelle ; son instant de réponse donne `timingOffsetMs = secondsToMs(time − atS)` (`null` en temps libre ou sans réponse) et `reactionMs = secondsToMs(time − promptS)` (`null` sans réponse). `secondsToMs` arrondit comme celui de `domain/scoring/timing.ts` : le copier dans `responseVerdict.ts` (`domain/time/` ne l’importe pas), H3 supprimera l’original.
- Son verdict en temps : fausse ou sans réponse → `wrong` ; `late` → `offbeat` ; temps libre → `perfect` si `reactionMs ≤ window.ms`, sinon `late` ; sinon `|offset| ≤ window.ms` → `perfect`, négatif → `early`, positif → `late`.
- `correct` : toutes les attentes répondues et justes (une lecture en attente compte telle qu’elle est). Verdict du tour : `correct` → celui de l’attente chronométrée ; sinon, une `correction` existe sur une attente dont toutes les précédentes sont justes → `corrected` ; sinon `wrong`.
- `success = correct && verdict !== 'offbeat'`. `RoundOutcome` : `{ success, correct, verdict: { relation: 'response', version: 1, value }, measures: {}, aids, detail: result }`.
- `leadMs = secondsToMs(atS − promptS)` de l’attente chronométrée.
- `lost(result)` : une paire définitive (`pending: false`) fausse.
- `isDirectRecall` : `success`, un seuil non nul, et `leadMs ≤ seuil` (ou, `leadMs` nul, `reactionMs ≤ seuil`).

Le verdict `cycle` reprend le corps de l’actuel `PlanRound.settle()` : `timeExpectations(plan, map, start)`, l’alignement reconstruit depuis `result` (`pairs` avec `attack` = indice dans `result.attacks`, `offsetMs`, `verdict` = `timing`), `cycleReport`, `cycleVerdict(report, thresholds)` ; `lost` rend toujours faux.

- [ ] **Step 1: Write the failing tests**

`responseVerdict.spec.ts` (des `PairingResult` écrits à la main sur les zones de la Task 3) :

- `it('judges a located note in time, early, late and perfect within its window')` : réponse à 6,13 → `perfect`, `timingOffsetMs: 30`, `reactionMs: 3030` ; à 6,0 → `early`, `−100` ; à 6,18 → `perfect`, `80`.
- `it('keeps a right note off the beat a miss')` : paire `late` juste → verdict `offbeat`, `correct: true`, `success: false`.
- `it('takes the root’s verdict for a right anchor, corrected for a chord put right, wrong otherwise')`.
- `it('judges free time by reaction')` : réaction 2 999 ms → `perfect` ; 3 001 → `late` (`window: { ms: 3000 }`), `success: true` dans les deux cas.
- `it('wraps its value in a response envelope')` : `verdict.relation === 'response'`, `version === 1`.
- `it('reads direct recall from the lead, or the reaction in free time')` : avance de 4 temps à 160 bpm (1 500 ms) → vrai avec un seuil de 1 500, faux à 80 bpm ; temps libre 2 900 ms sous 3 000 → vrai ; seuil `null` → faux.
- `it('is lost once a final answer is wrong, not while a reading waits')`.

`cycleVerdict.spec.ts` : `it('judges a cycle as the plan round did')` → sur un cycle de `round.spec.ts` (copié), le `RoundOutcome` est égal à celui de l’actuel `PlanRound.settle()`.

Spec de `responseVerdictOf` : `it('reads the verdict of a response envelope')` → `{ relation: 'response', version: 1, value: { verdict: 'late', … } }` donne `'late'` ; l’ancienne forme `{ relation: 'beat', value: 'perfect' }` donne toujours `'perfect'`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/domain/time/modes src/lib/domain/types.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement both verdict modes; move `ResponseVerdict` and `RESPONSE_VERDICTS`, re-exported by `domain/types.ts`; extend `responseVerdictOf` (`RESPONSE_RELATIONS` gains `'response'`, the value read from `value.verdict` when it is an object)**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib && npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain
git commit -m "feat: judge a round by its verdict mode, one answer or a whole cycle"
```

---

### Task 6: L’appariement par alignement

**Files:**

- Create: `src/lib/domain/time/modes/alignment.ts`
- Test: `src/lib/domain/time/modes/alignment.spec.ts`

**Interfaces:**

- Consumes: `Pairing`, `PairingMode`, `PairingContext`, `PairingResult` (Task 4) ; `alignAttacks`, `alignContext`, `captureLeadIn`, `timeExpectations` (`judge/align.ts`).
- Produces: `alignmentPairing: PairingMode` (`id: 'alignment'`).

Règles : la fenêtre de capture est celle de l’actuel `PlanRound` (`[startS − lead, endS − lead)`, `lead = captureLeadIn(plan, map, start)`) ; dehors → `after-capture` ; dedans, l’attaque est gardée (`answer`) ; l’alignement ne juge aucun contenu (`judged: null`). `result()` aligne les attaques gardées (`alignAttacks`) et remplit `pairs` (`timing`, `offsetMs`, `judged: null`, `late: false`, `pending: false`, `correction: null`), `missed`, `dropped`, `extra` (instants), `shift`, `clampedWindows`, `attacks`. `done` et `zonesOver` : `now ≥ endS − lead` ; `awaiting` : faux ; `droppable` : faux ; `shownMisses` : vide.

- [ ] **Step 1: Write the failing tests**

- `it('keeps the attacks of its capture window and leaves the rest to its neighbours')` : les cas de capture de `round.spec.ts` (attaque quelques ms avant le temps 1 gardée, attaque au début du cycle suivant rendue `after-capture`).
- `it('aligns what it kept as the cycle judge does')` : `result()` d’un cycle à temps perdu → `shift` et `dropped` égaux à `alignAttacks` sur les mêmes attaques.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/domain/time/modes/alignment.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `alignmentPairing`**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/domain/time/modes`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/time/modes
git commit -m "feat: pair a cycle's attacks by the optimal alignment as a pairing mode"
```

---

### Task 7: Le moteur ne fait que router

**Files:**

- Create: `src/lib/domain/time/modes/index.ts`, `src/lib/domain/time/boundaries.spec.ts`
- Modify: `src/lib/domain/time/round.ts`, `src/lib/domain/time/index.ts`, `src/lib/application/session/plan/PlanSessionController.svelte.ts`
- Test: `src/lib/domain/time/round.spec.ts`

**Interfaces:**

- Consumes: tout ce que produisent les Tasks 1 à 6.
- Produces :

```ts
export const ROUND_MODES: RoundModes; // pairings: first-answer, alignment; verdicts: response, cycle
export type RoundEvent =
	| { kind: 'none' }
	| { kind: 'pending' }
	| { kind: 'provisional'; outcome: RoundOutcome }
	| { kind: 'settled'; outcome: RoundOutcome };
export interface Observed {
	fate: ObservationFate;
	judged: Judged | null;
	event: RoundEvent;
}
export class PlanRound {
	readonly startTime: number;
	readonly endTime: number;
	readonly promptTime: number;
	readonly listenUntilTime: number;
	readonly handoverTime: number | null;
	constructor(input: {
		plan: RoundPlan;
		clock: RoundClock;
		chained?: boolean;
		judges: ContentJudges;
		latency: CycleReport['latency'];
		thresholds: LevelParams['thresholds'] | null;
		aids: Aid[];
		modes?: RoundModes; // default ROUND_MODES
	});
	observe(observation: PlanObservation): Observed;
	advance(now: number): RoundEvent;
	/** Settles as it stands; null when the round is dropped (nothing heard, still open) or already settled. */
	close(now: number): RoundOutcome | null;
}
```

Routage :

- `observe` : capteur absent du plan → `other-sensor` ; illisible → `unreadable` (dans cet ordre, comme le contrôleur actuel) ; sinon `pairing.offer({ time, sensor, final: observation.final ?? true, payload })`. Les capteurs du plan sont ceux de ses attentes, `RHYTHM_SENSOR` sans attente. Tour réglé : `settled` (aucun appel aux modes).
- Après `offer` ou `advance(now)` (`now` = l’instant de l’attaque pour `offer`) : `pairing.done(now)`, ou `verdict.lost(result) && pairing.zonesOver(now) && !pairing.awaiting()` → `settled` avec `verdict.outcome` ; sinon, si `shownMisses(now)` contient une attente pas encore montrée → `provisional` avec l’issue telle qu’elle est ; sinon, une attaque prise (`answer`) → `pending` ; sinon `none`.
- `close(now)` : réglé → `null` ; `pairing.droppable(now)` → `null` ; sinon `settled` avec l’issue telle qu’elle est.
- Le juge d’une attente : `content ? judges(content.kind).judge(content.value, payload) : null`.

- [ ] **Step 1: Write the failing tests**

`round.spec.ts` : les tests de cycles existants passent sur l’API neuve (`observe(o).fate`, `close(now)` au lieu de `settle()`, `clock: { map, start }`, `judges: contentJudges` factice), et :

- `it('plugs a pairing mode it does not know of without changing')` : un mode factice `every-attack` (chaque attaque répond à la première attente, réglé à la première) dans `modes`, un plan qui le nomme → `observe` règle le tour ; `ROUND_MODES` n’a pas `every-attack`.
- `it('refuses a plan whose mode is not registered')` : le constructeur lève `unknown pairing mode: kazoo`.
- `it('settles a located note at once, shows a provisional miss at the window’s close, then settles off the beat')`.
- `it('settles a lost anchor once its zones are over, without waiting for readings')` : fondamentale fausse définitive, aucun accord → `advance(9.1)` réglé.
- `it('drops a round closed early with nothing heard')` : `close(6.0)` → `null`, puis `observe` → `settled`.
- `it('judges content with the judge of its kind')` : un juge factice injecté reçoit `(content.value, payload)`.

`boundaries.spec.ts` (sur le modèle de `application/session/boundaries.spec.ts`, `import.meta.glob('/src/lib/domain/time/**/*.ts', { query: '?raw', … })`) : `it('imports nothing of the music, the judges, the old timing nor the application')` → aucun fichier hors specs ne contient `$lib/domain/music`, `$lib/domain/mechanics`, `$lib/domain/judges`, `$lib/domain/triads`, `$lib/domain/gesture`, `$lib/domain/timing`, `$lib/domain/scoring` ni `$lib/application` ; et `it('actually scans the time core')`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/domain/time`
Expected: FAIL.

- [ ] **Step 3: Implement `PlanRound`, `ROUND_MODES`; adapt `PlanSessionController`**

`PlanFate` disparaît au profit d’`ObservationFate`. Dans le contrôleur de plan : `new PlanRound({ plan, clock: { map, start }, judges: contentJudges, latency, thresholds, aids })`, `cycle.round?.observe(seen).fate`, `round.close(now)` (jamais `null` pour un cycle : le contrôleur affirme `outcome !== null` et lève sinon).

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test && npm run check`
Expected: PASS ; les séances de rythme (`PlanSessionController.svelte.spec.ts`) inchangées.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/time src/lib/application/session/plan
git commit -m "feat: route every round plan through its registered modes"
```

---

### Task 8: Les quatre relations, écrites en plans

**Files:**

- Create: `src/lib/domain/exercise/roundPlans.ts`
- Test: `src/lib/domain/exercise/roundPlans.spec.ts`

**Interfaces:**

- Consumes: `RoundPlan`, `ExpectedContent`, `Meter`, `barLength` (`domain/time`) ; les constantes des Global Constraints.
- Produces :

```ts
export function beatPlan(input: {
	content: ExpectedContent;
	leadBeats: LeadBeats;
	meter: Meter;
	respirationBars: number;
}): RoundPlan;
export function anchorPlan(input: {
	root: ExpectedContent;
	chord: ExpectedContent;
	leadBeats: LeadBeats;
	meter: Meter;
	respirationBars: number;
}): RoundPlan;
export function gridChangePlan(input: {
	content: ExpectedContent;
	lengthBeats: number;
	meter: Meter;
}): RoundPlan;
export function freePlan(input: { content: ExpectedContent; recallThresholdMs: number }): RoundPlan;
```

Le « temps » est `meter.unit`. Le tour commence à la cible (position 0).

| Plan             | `prompt`           | Attentes                                                                              | `length`                      | `listenUntil` / `handover`                          | Politique                                                                                                                                                                          |
| ---------------- | ------------------ | ------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `beatPlan`       | `−leadBeats` temps | `note` à 0, ponctuelle, `{ ms: PERFECT_WINDOW_MS }`                                   | `respirationBars` mesures     | `listenUntil = length − STRING_PREVIEW_BEATS` temps | `first-answer`, `opens: { afterPromptMs: MIN_RESPONSE_MS }`, `lateMs: LATE_LIMIT_MS`, `lateCapture: { ms: LATE_CAPTURE_MS }`, `verdict: 'response'`, `correction: false`           |
| `anchorPlan`     | idem               | `note` à 0 ; `chord` étendue de `ANCHOR_CHORD_FROM_BEATS` temps à la fin de la mesure | `1 + respirationBars` mesures | `listenUntil = length − STRING_PREVIEW_BEATS` temps | idem, `correction: true`                                                                                                                                                           |
| `gridChangePlan` | `−1` temps         | `chord` à 0, ponctuelle, `{ ms: PERFECT_WINDOW_MS }`                                  | `lengthBeats` temps           | `handover = length`                                 | `first-answer`, `opens: { beforeMs: GRID_EARLY_MS, maxBeats: GRID_EARLY_MAX_BEATS }`, `lateMs: LATE_LIMIT_MS`, `lateCapture: 'to-end'`, `verdict: 'response'`, `correction: false` |
| `freePlan`       | `0`                | `name` à `null`, capteur `tap`, `{ ms: recallThresholdMs }`                           | `1`                           | —                                                   | `first-answer`, `opens: { afterPromptMs: 0 }`, `lateMs: 0`, `lateCapture: null`, `verdict: 'response'`, `correction: false`                                                        |

Capteurs : `note` pour la note et la fondamentale, `chord` pour l’accord.

- [ ] **Step 1: Write the failing tests**

- `it('writes each relation as a valid plan')` : les quatre plans, pour des entrées types (avance 2, 4, 8 ; changement de 2 et 4 temps), passent `validateRoundPlan`.
- `it('times a located note on the beat relation’s grid')` : `roundTimes(beatPlan({ leadBeats: 4, … }), { map, start: Fraction.of(2) }, false)` redonne les instants de la Task 3 (`promptS ≈ 3.1`, `captureEndS ≈ 8.35`).
- `it('waits for the chord until the next prompt’s string shows')` : `anchorPlan` → `listenUntil` = `7/4`.
- `it('hands a grid change over at its length')` : `gridChangePlan({ lengthBeats: 4 })` → `handover` = `1`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/lib/domain/exercise/roundPlans.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the four builders**

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/lib/domain/exercise`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/exercise
git commit -m "feat: write the four existing relations as round plans"
```

---

### Task 9: Le banc de comparaison avec les relations actuelles

**Files:**

- Create: `src/lib/domain/time/legacyParity.spec.ts`

**Interfaces:**

- Consumes: `beatTiming`, `createAnchorTiming(DEFAULT_PACING)`, `createGridTiming`, `identifyTiming` (`domain/timing`) ; `PlanRound`, `contentJudges` ; `beatPlan`, `anchorPlan`, `gridChangePlan`, `freePlan` (Task 8).

Le banc joue un **script** sur les deux côtés : une horloge `beatTime(i) = origin + i × spb` d’un côté, `createTempoMap(origin, [{ at: Fraction.ZERO, bpm, unit: Fraction.of(1, 4) }])` de l’autre ; des pas `{ observe: { time, sensor, final, correct, answer } }`, `{ beat: i }` (ancien : `onBeat({ index: i, time: beatTime(i) })` ; neuf : `advance(beatTime(i))`) et `{ abandon: now }` (ancien : `abandon(now)` ; neuf : `close(now)`). Un juge factice de sorte `scripted` rend `{ correct, answer, confusion: null }` du payload, et l’ancien côté reçoit les mêmes `correct` et `answer`.

Il compare, pas à pas :

1. le sort de chaque observation (ancien : `ignored.reason`, ou `answer` pour `pending`, `provisional` et `settled`) ;
2. le pas où le tour se règle, et l’issue normalisée : `verdict`, `correct`, `timingOffsetMs`, `reactionMs`, et les réponses par partie (ancrage : `{ root, chord, correction }` ↔ `expectations[0].answer`, `expectations[1].answer`, `expectations[1].correction`) ;
3. le pas du premier raté provisoire et son verdict.

- [ ] **Step 1: Write the scenarios**

- `describe('beat')` : les scénarios de `domain/timing/beat.spec.ts` qui ouvrent un tour (premier dans la fenêtre, tôt, tard, bords de `PERFECT_WINDOW_MS`, avant l’ouverture, capture tardive, après la capture, lecture en attente puis meilleure, deuxième attaque pendant l’attente, raté provisoire, abandon avant et après la fermeture), réécrits en scripts.
- `describe('anchor')`, `describe('gridChange')` (enchaîné et non enchaîné), `describe('free')` : de même depuis leurs specs.
- `describe('random scripts')` : pour chaque relation, 500 scripts tirés d’un générateur à graine fixe écrit dans le spec (mulberry32) : tempo entier dans `[80, 160]`, 0 à 4 attaques par capteur entre `promptS − 0.5` et `listenUntilS + 0.5`, `correct` et `final` au hasard (deux lectures d’une même attaque possibles), un `{ beat }` à chaque temps, un `{ abandon }` dans 10 % des scripts. Les instants (origine, consigne, attaques) sont tirés sur une grille d’une milliseconde, pour que les arrondis de `secondsToMs` et la tolérance de bord tranchent pareil des deux côtés ; les bords exacts sont dans les scénarios écrits à la main. Un `{ abandon: now }` suit toujours le `{ beat }` du même instant : l’ancien côté ne voit la fermeture d’une fenêtre qu’aux temps, comme le contrôleur actuel. Un échec affiche la graine et le script.

- [ ] **Step 2: Run the parity bench**

Run: `npx vitest run src/lib/domain/time/legacyParity.spec.ts`
Expected: PASS. Un écart est un défaut du moteur, à corriger dans la tâche qui en possède le code (zones, appariement, verdict, routage) ; s’il s’agit d’un écart voulu, il ne passe qu’après accord de l’auteur, avec son assertion propre et une ligne dans « Réalisation ».

- [ ] **Step 3: Commit**

```bash
git add src/lib/domain/time/legacyParity.spec.ts
git commit -m "test: judge the existing relations' scenarios alike on the round engine"
```

---

### Task 10: La doc suit

**Files:**

- Modify: `docs/superpowers/specs/2026-10-14-temps-musical-et-sequences-design.md` (nouvelle section « Réalisation du plan H1 »), `CLAUDE.md` (puce « Musical time » : `RoundPolicy` par modes, `domain/time/modes/`, `domain/judges/`, `PlanRound` pour tout plan, `domain/exercise/roundPlans.ts`)

- [ ] **Step 1: Write « Réalisation du plan H1 »** : les décisions de ce plan (section « Décisions prises par ce plan ») et tout écart accepté au banc.
- [ ] **Step 2: Update `CLAUDE.md`** : une à trois phrases dans la puce « Musical time », au style de la puce.
- [ ] **Step 3: Verify** : `npx prettier --check docs CLAUDE.md && npm test && npm run check` → PASS.
- [ ] **Step 4: Commit**

```bash
git add docs CLAUDE.md
git commit -m "docs: describe the round engine and its modes"
```
