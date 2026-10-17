# Avant la validation (plan 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Donner à la journée de validation (G) ce qu’elle lit : une séance d’exercice décrite par une trace de segments et menée par une politique commune, l’anti-blocage, un bilan par suite avec sa réécoute, le lexique, la contestation par raison (développement) et l’oracle du capteur d’attaques.

**Architecture:** Trois modules purs neufs dans `src/lib/domain/session/` : la **trace** (segments emboîtés, ce qui a eu lieu), la **politique** (`next` : ce qui vient ensuite, anti-blocage compris) et le **bilan** calculé sur la trace ; plus le lexique (`src/lib/domain/glossary/`). `PlanSessionController` cesse de décider l’enchaînement : il exécute la politique, tient la trace et remet trace et prises à une mémoire de séance (`SessionMemory`) que le bilan lit. L’oracle tire ses suites du journal de diagnostic et se compare sur une page de développement.

**Tech Stack:** TypeScript, Svelte 5 (runes), SvelteKit statique, Dexie 4, Vitest (node : `*.spec.ts` ; jsdom : `*.svelte.spec.ts`), Web Audio, VexFlow 5.

**Spec:** `docs/superpowers/specs/2026-10-14-temps-musical-et-sequences-design.md`, section « Amendement (2026-10-17) : la séance en segments » (elle remplace la section 6 et règle le plan 2) ; sections 7 (« Contre le blocage », « Réécouter »), 10 (lexique, bilan, contestation) et 11 (l’oracle) pour le détail. **Dépend du plan 1** (fusionné : `5d91cb2`).

## Global Constraints

- Branche `plan/temps-musical-2`, dans `.worktrees/temps-musical-2`. `npm test && npm run check` vert à chaque commit ; tests avant le code ; chaque test affirme (`expect.requireAssertions`).
- **Aucune frontière entre familles d’exercices** dans le code neuf : `domain/session/` ne nomme ni `rhythm-figure`, ni une sorte de séance, ni « rythme » ; il lit des `CycleReport`, des `Level` et des `Attempt`. Le plan 2 n’ajoute aucune dépendance à `SessionKind`.
- `domain/session/` et `domain/glossary/` sont purs : ni Svelte, ni API du navigateur, ni `application/`.
- Un seul nom par concept, dans le code, l’interface et la doc. Rôles et mots d’écran (amendement, validés) : `session` séance, `series` série, `run` (aucun mot d’écran), `listen-in` mise en oreille, `rest` silence, `count-in` mesure comptée, `round` tour / cycle, `listen` écoute, `breath` respiration, `briefing` consigne, `pause` pause. « Séquence » n’est employé nulle part dans le code neuf.
- Constantes nommées et exportées là où elles servent : `BLOCK_AFTER_FAILS = 3`, `BLOCK_SAME_SPOT_CYCLES = 2`, `BLOCK_REST_MS = 3_600_000`, `SESSION_MS = 300_000`, `SESSION_TAKE_MAX_S = 360`, `PLAIN_WORDS_SESSIONS = 3`, `ORACLE_TAKES = 10`, `ORACLE_MATCH_MS = 25`, `ORACLE_MARGIN_S = 1`. `RHYTHM_SERIES_MS` et `LevelParams.cyclesPerSeries` disparaissent ; `LEARN_SESSION_MS` et `GESTURE_SESSION_MS` restent jusqu’à H.
- La contestation n’existe que dans une version de développement (`dev` de `$app/environment`, comme `requireDev()`).
- Textes d’interface en français et en anglais (`defineMessages`), jamais sous 16 px ; contenu de la vue de rythme et du bilan aux tokens existants, sans pixel art.
- `correct` n’est jamais lu pour une réussite ; la réussite est `success`.
- La trace n’est pas stockée (amendement) : elle vit en mémoire, comme les prises. Aucun changement de schéma Dexie ; seul `Attempt.contestReason` (facultatif, non indexé) s’ajoute, validé par la sauvegarde.
- Commits : Conventional Commits en minuscules, impératif, orientés comportement ; terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Décisions prises par ce plan (à reporter dans « Réalisation »)

- **Les instants de la trace sont des secondes de l’horloge audio** (`startS`, `endS`), pas des `TimePoint` (amendement) : le transport recrée sa carte de tempo à chaque reprise après une pause, si bien qu’une position en fractions n’a de sens que dans sa carte ; l’horloge audio est la seule commune à toute la séance, et elle vaut aussi pour le temps libre. Un changement de tempo n’y casse rien.
- **`resumeAfter`** = l’instant du « On change d’air » + `BLOCK_REST_MS` (1 h). L’exercice reste jouable (tout reste accessible) ; l’accueil le marque « On y revient plus tard » jusque-là.
- **Contester** se fait depuis le bilan (où se trouve aussi la réécoute de chaque suite), pas depuis la respiration.
- **Le bilan détaillé** (suites, réécoute) n’existe que tant que la séance est en mémoire ; un bilan rouvert après un rechargement montre les comptes tirés des tentatives, sans réécoute.

## Review Focus

- **Une pause ou « Quitter » au milieu d’une suite** : la suite et son tour en cours finissent dans la trace à l’instant de la coupure, `interrupted` ; sa prise reste réécoutable jusqu’à la coupure ; aucun segment prévu mais pas joué n’apparaît (Task 6).
- **« On change d’air » alors qu’un cycle est déjà posé d’avance** : la série finit à la frontière suivante, le cycle déjà joué est jugé et écrit, celui qui n’a pas commencé ne l’est pas, `resumeAfter` est écrit une fois (Task 7).
- **Un bilan rouvert après un rechargement** (la mémoire de séance est vide) : les comptes s’affichent, aucun bouton de réécoute, aucune exception (Task 9).
- **Un exercice sans niveau d’aide, ou qui change de figure à chaque cycle** (métronome sur 2 et 4) : le diagnostic ne conclut jamais `reading` sur des figures différentes, et sans niveau d’aide l’exécution mène tout droit à « On change d’air » (Task 3).
- **Une séance plus longue que la mémoire des prises** (pauses comprises, au-delà de `SESSION_TAKE_MAX_S`) : la réécoute des premières suites est retirée du bilan, jamais jouée en silence (Task 5, Task 9).

---

## File Structure

**Domaine (purs)**

- `src/lib/domain/session/trace.ts` — `SegmentRole`, `SEGMENT_ROLES`, `Segment`, `SegmentFields`, `TraceBuilder`.
- `src/lib/domain/session/block.ts` — `BlockDiagnosis`, `SettledRound`, `diagnoseBlock`, `breakingMeasure`, `BLOCK_AFTER_FAILS`, `BLOCK_SAME_SPOT_CYCLES`, `BLOCK_REST_MS`.
- `src/lib/domain/session/policy.ts` — `SESSION_MS`, `SeriesRules`, `SeriesState`, `Next`, `BlockAct`, `startSeries`, `startRun`, `next`, `askListen`, `settle`.
- `src/lib/domain/session/summary.ts` — `SeriesSummary`, `summarizeSeries`.
- `src/lib/domain/session/index.ts`.
- `src/lib/domain/glossary/index.ts` — `TERM_IDS`, `TermId`, `GLOSSARY`, `termOfMeasure`, `termOfFailure`.
- Modifiés : `src/lib/domain/time/levels.ts` (sans `cyclesPerSeries`), `src/lib/domain/exercise/rhythmCatalog.ts`, `src/lib/domain/types.ts` (`ExerciseSummary`, `Attempt.contestReason`).

**Application**

- `src/lib/application/session/sessionMemory.ts` — `RunTake`, `SessionPlayback`, `SessionMemory`.
- Modifiés : `ports/TakeBufferPort.ts`, `ports/repositories.ts` (`setContested`), `session/plan/PlanSessionController.svelte.ts`, `session/plan/recordCycle.ts` (`cycleAids`), `session/plan/rhythmStage.ts`, `session/plan/rhythmSummary.ts` (→ `exerciseSummary.ts`), `session/SessionDeps.ts` (`PlanSessionDeps.memory`), `app.ts`, `services/createAppServices.ts`.

**Infrastructure** : `audio/input/TakeBuffer.ts` ; `storage/Dexie*AttemptRepository` et contrat, `storage/validateBackup.ts` ; `diagnostics/oracle.ts` (neuf), `diagnostics/exportArchive.ts` (exporte `layoutChunks`), `diagnostics/index.ts`.

**Interface** : `src/lib/ui/primitives/Term.svelte` et `glossaryScope.ts` (neufs) ; `ui/play/views/rhythmFigure.ts`, `RhythmFigureView.svelte`, `views/messages.ts` ; `ui/screens/summary/*` ; `ui/screens/home/HomeScreen.svelte` ; `src/routes/diagnostic/oracle/+page.svelte` (neuf) ; `scripts/functional-ui.mjs`.

---

## Partie I — Le domaine de la séance (pur)

### Task 1: La trace

**Files:** Create `src/lib/domain/session/trace.ts`, `trace.spec.ts`, `index.ts`

**Interfaces:**

- Produces:

```ts
export const SEGMENT_ROLES = [
	'session',
	'series',
	'run',
	'listen-in',
	'rest',
	'count-in',
	'round',
	'listen',
	'breath',
	'briefing',
	'pause'
] as const;
export type SegmentRole = (typeof SEGMENT_ROLES)[number];
export type SeriesEnd = 'time' | 'change-of-air';
export interface SegmentFields {
	exerciseId?: string;
	item?: string;
	level?: number;
	attemptId?: number;
	aids?: Aid[];
	/** On a series: why it ended. */ reason?: SeriesEnd | 'quit';
	/** On a series ended by « On change d’air »: the measure that breaks. */ breaking?: CycleFailure;
}
export interface Segment extends SegmentFields {
	id: number;
	role: SegmentRole;
	startS: number;
	endS: number; // audio clock seconds; endS = real end, cut included
	ended: 'done' | 'interrupted';
	children: Segment[];
}
export class TraceBuilder {
	constructor(startS: number); // opens the root `session` (id 0)
	open(role: SegmentRole, startS: number, fields?: SegmentFields): number; // child of the innermost open segment
	set(id: number, fields: SegmentFields): void; // merges fields (an attempt id written later)
	close(id: number, endS: number, ended?: 'done' | 'interrupted'): void; // default 'done'
	closeAll(endS: number, ended: 'done' | 'interrupted'): void; // root included
	tree(): Segment; // deep copy; open segments end at the latest instant seen
}
```

- [ ] **Step 1: Tests** (`trace.spec.ts`) :
  - `nests a child in the innermost open segment` : `open('series', 1)`, `open('run', 2)`, `open('round', 2)` → `tree().children[0].children[0].children[0].role === 'round'`.
  - `closing a parent cuts its open children as interrupted` : un `run` ouvert à 2 avec un `round` ouvert à 3, `close(run, 4.5, 'interrupted')` → le round a `endS: 4.5`, `ended: 'interrupted'`.
  - `keeps the family laminar` : `open` avec `startS` avant le début du segment parent lève `RangeError` ; `close` avec `endS < startS` lève.
  - `a closed segment takes no child` : après `close(run, 5)`, `open('round', 6)` devient enfant de `series`, pas du run.
  - `set merges fields` : `set(roundId, { attemptId: 7 })` → `attemptId: 7`, les autres champs gardés.
  - `tree is a copy` : modifier le résultat de `tree()` ne change pas le suivant.
- [ ] **Step 2:** `npx vitest run src/lib/domain/session/trace.spec.ts` → FAIL (module absent).
- [ ] **Step 3:** Implémenter `TraceBuilder` (une pile des segments ouverts ; `Aid` de `$lib/domain/time`, `CycleFailure` de `$lib/domain/time`). `index.ts` réexporte `trace`.
- [ ] **Step 4:** Même commande → PASS.
- [ ] **Step 5:** `git commit -m "feat: trace a session as nested segments of what happened"`

### Task 2: Le diagnostic d’un blocage

**Files:** Create `src/lib/domain/session/block.ts`, `block.spec.ts`

**Interfaces:**

- Produces:

```ts
export const BLOCK_AFTER_FAILS = 3; // failed rounds in a row at the floor before the anti-blocking acts
export const BLOCK_SAME_SPOT_CYCLES = 2; // of those, rounds where the same spot fails, to read a reading block
export const BLOCK_REST_MS = 3_600_000; // after « On change d’air », the exercise rests this long
export type BlockDiagnosis = 'reading' | 'execution' | 'unclear';
/** A settled round as the policy reads it. */
export interface SettledRound {
	level: number;
	item: string;
	success: boolean;
	aided: boolean;
	report: CycleReport;
	verdict: CycleVerdict;
	/** `MATCH_LIMIT` in ms at the round's tempo: extras closer than this fall on the same spot. */
	spotMs: number;
}
export function diagnoseBlock(rounds: readonly SettledRound[]): BlockDiagnosis;
export function breakingMeasure(rounds: readonly SettledRound[]): CycleFailure | null;
```

- [ ] **Step 1: Tests** (`block.spec.ts`, des `CycleReport` écrits à la main, `spotMs: 75`) :
  - `execution when the figure is played and the measures fail` : trois rounds ratés pour `['regularity']`, `['hold']`, `['shift', 'hold']` → `'execution'`.
  - `reading when the same expectation is missed again` : même `item`, l’attente 3 `missed` dans deux des trois rounds → `'reading'`.
  - `reading when extras fall on the same spot` : même `item`, `extraAtMs` `[910]`, `[880]`, `[]` → `'reading'` (30 ms ≤ 75).
  - `never reading across different figures` : items `a`, `b`, `c`, l’attente 3 manquée dans chacun → `'unclear'`.
  - `unclear when the signs mix` : un round `['missed']` à des attentes différentes, deux `['regularity']` → `'unclear'`.
  - `breakingMeasure takes the most frequent reason, the judge's order on a tie` : `['hold']`, `['hold', 'regularity']`, `['regularity']` → `'hold'` ; `[]` réussis seulement → `null`.
- [ ] **Step 2:** `npx vitest run src/lib/domain/session/block.spec.ts` → FAIL.
- [ ] **Step 3:** Implémenter. Règles : `execution` si tous les rounds sont ratés sans `missed` ni `extra` dans leurs raisons ; `reading` si, parmi les rounds d’un même `item`, une même attente (`expectations[i].verdict === 'missed'`) l’est dans au moins `BLOCK_SAME_SPOT_CYCLES` rounds, ou si au moins `BLOCK_SAME_SPOT_CYCLES` rounds ont chacun une ajoutée à moins de `spotMs` d’une ajoutée d’un autre ; `unclear` sinon. L’ordre du juge à égalité : `missed, extra, shift, precision, regularity, hold` (celui de `cycleVerdict`).
- [ ] **Step 4:** Même commande → PASS.
- [ ] **Step 5:** `git commit -m "feat: tell a reading block from an execution block"`

### Task 3: La politique de la série

**Files:** Create `src/lib/domain/session/policy.ts`, `policy.spec.ts` ; Modify `src/lib/domain/time/levels.ts` (retirer `cyclesPerSeries` et son commentaire), `src/lib/domain/exercise/rhythmCatalog.ts` (retirer les trois `cyclesPerSeries: 1`), `src/lib/application/session/plan/PlanSessionController.svelte.ts` (sa lecture), leurs specs.

**Interfaces:**

- Consumes: `nextLevelState`, `levelRange`, `Level`, `LevelState`, `LevelParams` (`domain/time/levels.ts`) ; Task 2.
- Produces:

```ts
export const SESSION_MS = 300_000;
export type Remedy = 'listen' | 'play-along';
export interface SeriesRules {
	levels: readonly Level[];
	params(level: number): Pick<LevelParams, 'cyclesPerBreath' | 'listen'>;
	/** The exercise can make its content sound (a figure): listening and playing along are remedies. */
	canSound: boolean;
	budgetMs: number; // SESSION_MS unless the session says otherwise
}
export interface SeriesState {
	levelState: LevelState;
	run: { level: number; played: number } | null;
	listenAsked: boolean;
	remedies: Remedy[]; // queued, taken by `next` one per round
	remedied: boolean; // the floor's remedy was given since this level's run of failures began
	recent: SettledRound[]; // settled at the level held, newest last, at most BLOCK_AFTER_FAILS
	ending: SeriesEnd | null;
	breaking: CycleFailure | null;
}
export type Next =
	| { role: 'round'; aid: 'play-along' | null; remedy: boolean }
	| { role: 'listen'; remedy: boolean }
	| { role: 'breath' }
	| { role: 'end'; reason: SeriesEnd };
export type BlockAct = {
	diagnosis: BlockDiagnosis | null;
	act: 'listen' | 'listen-then-play-along' | 'aid-level' | 'change-of-air';
};
export function startSeries(levelState: LevelState): SeriesState;
export function startRun(state: SeriesState): SeriesState; // run = { level: levelState.level, played: 0 }
export function next(
	state: SeriesState,
	rules: SeriesRules,
	elapsedMs: number
): { state: SeriesState; next: Next };
export function askListen(state: SeriesState, rules: SeriesRules): SeriesState; // ignored when the run's level has listen 'none'
export function settle(
	state: SeriesState,
	rules: SeriesRules,
	round: SettledRound,
	nowMs: number
): { state: SeriesState; changed: 'up' | 'down' | null; acted: BlockAct | null };
```

- [ ] **Step 1: Tests de `next`** (`policy.spec.ts`, trois niveaux dont un d’aide, `cyclesPerBreath: 4`) :
  - `plays rounds up to the breath` : quatre `next` → quatre `{ role: 'round', aid: null, remedy: false }`, le cinquième `{ role: 'breath' }` et `run` nul.
  - `ends with the run once the budget is spent` : `elapsedMs = SESSION_MS` au moment de la respiration → `{ role: 'end', reason: 'time' }` ; avant, la suite n’est jamais coupée.
  - `a listen asked comes before the next round and is not counted` : `askListen` puis `next` → `{ role: 'listen', remedy: false }`, `run.played` inchangé ; `listen: 'none'` → la demande est ignorée.
  - `remedies come first, one per round` : `remedies: ['listen', 'play-along']` → `listen` (`remedy: true`), puis `round` avec `aid: 'play-along'`, `remedy: true` (compté dans `played`).
  - `change of air ends at the next boundary` : `ending: 'change-of-air'` → `{ role: 'end', reason: 'change-of-air' }` même au milieu d’une suite.
- [ ] **Step 2: Tests de `settle`** :
  - `moves levels as nextLevelState does` : trois réussites sans aide au niveau 0 → `changed: 'up'`, `levelState.level === 1` ; un round d’un autre niveau que celui tenu ne change rien.
  - `reading at level 1 queues a listen then a play-along` : trois échecs au niveau 0 dont l’attente 3 manquée deux fois, `canSound: true` → `acted: { diagnosis: 'reading', act: 'listen-then-play-along' }`, `remedies: ['listen', 'play-along']`, `remedied: true`, `failures: 0`.
  - `reading without sound goes to the aid level` : même cas, `canSound: false` → `act: 'aid-level'`, `levelState.level === -1`.
  - `unclear queues a listen, then the aid level` : diagnostic `unclear` → `act: 'listen'` ; trois nouveaux échecs → `act: 'aid-level'`, `diagnosis: null`.
  - `execution goes to the aid level at once` : trois échecs `['regularity']` → `act: 'aid-level'`, niveau −1.
  - `the lowest aid level that blocks changes the air` : trois échecs au niveau d’aide le plus bas → `act: 'change-of-air'`, `ending: 'change-of-air'`, `breaking` = `breakingMeasure(recent)`, `levelState.failures === 0`, `levelState.resumeAfter === nowMs + BLOCK_REST_MS`.
  - `an aid level above the lowest goes one deeper` : deux niveaux d’aide, blocage à −1 → niveau −2, `act: 'aid-level'`.
  - `without aid levels execution changes the air` : `levelRange(levels).lowest === 0`, blocage en exécution → `act: 'change-of-air'`.
  - `a level change starts the anti-blocking again` : après une montée, `recent` vide et `remedied: false`.
- [ ] **Step 3:** `npx vitest run src/lib/domain/session/policy.spec.ts` → FAIL.
- [ ] **Step 4:** Implémenter. Un changement de niveau fait par `settle` vaut pour la suite suivante (le contrôleur la lit à `startRun`) ; la suite en cours garde `run.level`. `startSeries` part de `remedied: false`, sans remède ni fin. Retirer `cyclesPerSeries` de `LevelParams`, du catalogue et de la branche qui le lit dans `PlanSessionController.layout` (la série dure alors `RHYTHM_SERIES_MS` jusqu’à la Task 6, comme avant le réglage provisoire du plan 1) ; corriger les specs qui en dépendaient.
- [ ] **Step 5:** `npm test && npm run check` → PASS.
- [ ] **Step 6:** `git commit -m "feat: decide what a series plays next, unblocking included, in one policy"`

### Task 4: Le bilan sur la trace et le lexique

**Files:** Create `src/lib/domain/session/summary.ts`, `summary.spec.ts`, `src/lib/domain/glossary/index.ts`, `index.spec.ts`

**Interfaces:**

- Consumes: Task 1 (`Segment`), `Attempt` (`domain/types.ts`), `Measures`, `CycleFailure`, `MeasureId`.
- Produces:

```ts
export interface RunSummary {
	id: number;
	level: number;
	ended: 'done' | 'interrupted';
	rounds: number;
	successes: number;
	/** Mean of each measure over the run's rounds that have it. */ measures: Measures;
	failed: { attemptId: number; reasons: CycleFailure[] }[];
}
export interface SeriesSummary {
	exerciseId: string;
	ended: SeriesEnd | 'quit';
	breaking: CycleFailure | null;
	/** Level of each run in order, repeats merged: [0, 1, -1] = up, then to the aid level. */ levels: number[];
	rounds: number;
	successes: number;
	aided: number;
	listens: number;
	/** Time in rounds over the series' time, 0..1. */ playedShare: number;
	runs: RunSummary[];
}
export function summarizeSeries(input: {
	series: Segment; // a `series` segment of the trace
	attempts: readonly Attempt[]; // the session's
	aided(attempt: Attempt): boolean; // an aid the level does not give
}): SeriesSummary;

// domain/glossary
export const TERM_IDS = [
	'fidelity',
	'placement',
	'precision',
	'regularity',
	'hold',
	'shift',
	'offbeat',
	'level',
	'aid-level',
	'listen-in',
	'count-in',
	'breath',
	'play-along'
] as const;
export type TermId = (typeof TERM_IDS)[number];
export interface Term {
	term: string;
	definition: string;
}
export const GLOSSARY: Record<TermId, Record<Settings['locale'], Term>>;
export function termOfMeasure(id: MeasureId): TermId; // holdOffset, holdDrift → 'hold'
export function termOfFailure(reason: CycleFailure): TermId; // missed, extra → 'fidelity'
```

- [ ] **Step 1: Tests du bilan** (`summary.spec.ts`, une trace construite avec `TraceBuilder`) :
  - `counts rounds, successes, aided and listens` : deux suites de quatre tours, une écoute, trois réussites dont une aidée → `rounds: 8`, `successes: 3`, `aided: 1`, `listens: 1`.
  - `levels merges repeats` : suites aux niveaux 0, 0, 1, −1 → `levels: [0, 1, -1]`.
  - `playedShare is round time over series time` : série de 0 à 100 s, tours totalisant 60 s → `0.6`.
  - `a run's measures are means over its rounds` : régularité 20 et 30 → `{ regularity: { value: 25, unit: 'ms' } }` ; une mesure absente de tous les tours est absente.
  - `failed lists the run's failed rounds with their reasons` (lues dans `verdict.value` quand c’est un `CycleVerdict`).
  - `ended and breaking come from the series segment` ; `ended: 'quit'` quand la série porte `reason: 'quit'`.
- [ ] **Step 2: Tests du lexique** (`glossary/index.spec.ts`) :
  - `every measure and every failure has a term` : pour chaque `MeasureId` et chaque `CycleFailure`, `GLOSSARY[termOf…(x)]` existe en `fr` et en `en`, `term` et `definition` non vides.
  - `the screen words are the glossary's` : `GLOSSARY.hold.fr.term === 'tenue'`, `GLOSSARY.level.fr.term === 'niveau'`, `GLOSSARY.breath.fr.term === 'respiration'`.
- [ ] **Step 3:** `npx vitest run src/lib/domain/session/summary.spec.ts src/lib/domain/glossary` → FAIL.
- [ ] **Step 4:** Implémenter `summarizeSeries` (les tentatives d’un tour par `attemptId`). Écrire le lexique avec ces textes (fr ; l’anglais en traduction fidèle, termes : fidelity, placement, precision, regularity, hold, lost or added beat, offbeat, level, aid level, listen-in, count-in bar, breath, play-along) :

| Id           | Terme                 | Définition                                                                                                                     |
| ------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `fidelity`   | fidélité à la figure  | La figure est-elle jouée : chaque note attendue entendue, aucune en trop, aucun temps perdu ou ajouté.                         |
| `placement`  | placement             | Devant ou derrière le temps, en moyenne : l’écart signé, en millisecondes. Ne juge que si la latence a été mesurée sans toi.   |
| `precision`  | précision             | À quelle distance du temps, en moyenne, sans le signe. Ne juge que si la latence a été mesurée sans toi.                       |
| `regularity` | régularité            | Ta constance : la dispersion de tes écarts. Elle ne dépend pas de la latence.                                                  |
| `hold`       | tenue                 | Ce que devient ton temps sans clic : un décalage (tu passes devant ou derrière) ou une dérive (tu accélères ou ralentis).      |
| `shift`      | temps perdu ou ajouté | À partir d’une mesure, toute la suite est décalée d’un temps ou d’une subdivision : un temps a sauté, ou s’est glissé en plus. |
| `offbeat`    | contretemps           | La partie du temps entre deux battues : le « et » de « 1 et 2 et ».                                                            |
| `level`      | niveau                | Le réglage de l’exercice que tu joues. Il monte après des cycles réussis sans aide, redescend après des échecs répétés.        |
| `aid-level`  | niveau d’aide         | Un niveau sous le niveau 1, plus facile au sens de l’exercice ; on y passe quand ça bloque, on en sort en réussissant.         |
| `listen-in`  | mise en oreille       | L’accompagnement seul avant de jouer : on écoute, on ne joue pas.                                                              |
| `count-in`   | mesure comptée        | La mesure où chaque temps est cliqué et compté, juste avant de jouer.                                                          |
| `breath`     | respiration           | Les mesures entre deux suites : on ne joue pas, le retour s’affiche.                                                           |
| `play-along` | jouer avec            | La figure sonne en même temps que toi, dans un autre timbre. Un cycle joué ainsi est aidé.                                     |

- [ ] **Step 5:** Même commande → PASS.
- [ ] **Step 6:** `git commit -m "feat: sum a series up from its trace and define its words in a glossary"`

---

## Partie II — La séance

### Task 5: Garder les prises de toute la séance

**Files:** Modify `src/lib/application/ports/TakeBufferPort.ts`, `src/lib/infrastructure/audio/input/TakeBuffer.ts`, `TakeBuffer.spec.ts`, le faux de `src/lib/testing/fakes.ts`

**Interfaces:**

- Produces (port) :

```ts
export interface TakeBufferPort {
	keepFrom(fromTime: number): void; // starts keeping again from fromTime; forgets nothing
	keepUntil(toTime: number): void;
	stopKeeping(): void;
	/** Forgets everything kept: a new series. */
	clear(): void;
	/** Whether [from, to) is still wholly kept (the oldest input goes past SESSION_TAKE_MAX_S). */
	holds(from: number, to: number): boolean;
	play(
		from: number,
		to: number,
		sounds: readonly ScheduledSound[],
		latencyS: number
	): Promise<void>;
	stop(): void;
}
```

- [ ] **Step 1: Tests** (`TakeBuffer.spec.ts`, trames synthétiques) :
  - `keeps every run of the session` : `keepFrom(0)`, trames jusqu’à 10 s, `keepUntil(10)`, `keepFrom(20)`, trames jusqu’à 30 s → `samples(0, 10)` et `samples(20, 30)` non nuls, `samples(10, 20)` nul.
  - `forgets the oldest input past SESSION_TAKE_MAX_S` : 400 s gardées → `holds(0, 10) === false`, `holds(390, 400) === true`.
  - `clear forgets everything` → `holds` faux partout.
  - `keeps samples as 16 bits` : un échantillon 0,5 revient à 0,5 ± 1/32768.
- [ ] **Step 2:** `npx vitest run src/lib/infrastructure/audio/input/TakeBuffer.spec.ts` → FAIL.
- [ ] **Step 3:** Implémenter : `SESSION_TAKE_MAX_S = 360` remplace `TAKE_BUFFER_MAX_S` ; trames gardées en `Int16Array` ; `keepFrom` n’oublie plus la prise précédente. Le contrôleur appelle `clear()` au début d’une série (`beginNewSeries` et première ouverture).
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5:** `git commit -m "feat: keep the input of the whole session for its runs to be heard again"`

### Task 6: Le contrôleur exécute la politique et tient la trace

**Files:** Create `src/lib/application/session/sessionMemory.ts`, `sessionMemory.spec.ts` ; Modify `src/lib/application/session/plan/PlanSessionController.svelte.ts`, `PlanSessionController.svelte.spec.ts`, `src/lib/application/session/SessionDeps.ts`, `src/lib/composition/createApp.ts`

**Interfaces:**

- Consumes: Tasks 1, 3, 5.
- Produces:

```ts
export interface RunTake {
	from: number;
	to: number;
	sounds: ScheduledSound[];
}
export interface SessionPlayback {
	sessionId: string;
	trace: Segment;
	/** The take of each run, by its segment id. */ takes: ReadonlyMap<number, RunTake>;
	latencyS: number;
}
/** The latest session played, in memory only: the summary reads it, a reload forgets it. */
export class SessionMemory {
	remember(playback: SessionPlayback): void; // replaces the previous one
	get(sessionId: string): SessionPlayback | null;
}
// PlanSessionDeps gains: memory: SessionMemory
```

- [ ] **Step 1: Test de `SessionMemory`** : `remember` puis `get` du même id → la séance ; un autre id → `null` ; un second `remember` remplace le premier.
- [ ] **Step 2: Tests du contrôleur** (`PlanSessionController.svelte.spec.ts`, `FakeClock`, faux sons, faux capteur d’attaques, comme les tests existants) :
  - `traces a series as it is played` : une suite de 4 cycles puis une respiration → `memory.get(id).trace` a une `series` (`exerciseId`) dont les enfants sont `listen-in`, `count-in`, `run` (4 `round` avec leur `attemptId`), `breath`, chacun avec `startS`/`endS` aux instants des mesures.
  - `a pause cuts the run and its round` : pause au milieu du 3ᵉ cycle → `run` et `round` `interrupted` à l’instant de la pause, un segment `pause` ; à la reprise, `listen-in`, `count-in` et un nouveau `run`.
  - `a heard cycle is a listen segment` : `listen()` → un segment `listen` sans `attemptId`.
  - `each run keeps its take` : après deux suites, `takes` a deux entrées dont `from`/`to` sont les bornes des segments `run`.
  - `the series ends after SESSION_MS with its run` : horloge murale avancée au-delà de `SESSION_MS` → fin à la respiration suivante, `reason: 'time'`.
  - `quit marks the series` : `quit()` → `reason: 'quit'`, la trace remise à la mémoire.
- [ ] **Step 3:** `npx vitest run src/lib/application/session` → FAIL.
- [ ] **Step 4:** Implémenter :
  - `RHYTHM_SERIES_MS` disparaît ; la série dure `SESSION_MS` (`SeriesRules.budgetMs`).
  - Le contrôleur garde un `SeriesState` ; `layout` ne décide plus : à chaque bloc il appelle `next(state, rules, now − startedAt)` et pose le cycle joué, le cycle d’écoute, la respiration ou la fin ; `startRunAt` et `beginRun` appellent `startRun` ; `settleCycle` appelle `settle` (à la place de `nextLevelState`) et écrit `state.levelState` comme aujourd’hui ; `listen()` appelle `askListen`.
  - `SeriesRules` : `levels` et `params` de l’exercice, `canSound: true` (un exercice de figures sait les faire sonner), `budgetMs: SESSION_MS`.
  - La trace s’écrit **à l’entrée** de chaque mesure (`enterBar`), jamais au moment où elle est posée d’avance : un segment s’ouvre quand sa première mesure commence et se ferme quand la suivante commence ; `stopPlaying` ferme tout ce qui est ouvert `interrupted` ; `finish` ferme la série avec sa raison puis `memory.remember(…)`. L’`attemptId` d’un tour est posé par `set` quand l’écriture de la tentative le rend.
  - La prise de chaque suite (`Take` actuel) est gardée dans `takes` sous l’id de son segment `run`, au lieu d’être remplacée ; `replay()` (respiration, pause) rejoue toujours la dernière.
- [ ] **Step 5:** `npm test && npm run check` → PASS (les specs existantes du contrôleur passent sans `cyclesPerSeries`).
- [ ] **Step 6:** `git commit -m "refactor: play exercise series by the session policy and trace them"`

### Task 7: L’anti-blocage dans la séance

**Files:** Modify `PlanSessionController.svelte.ts`, `PlanSessionController.svelte.spec.ts`, `src/lib/application/session/plan/recordCycle.ts`, `recordCycle.spec.ts`, `src/lib/application/session/plan/rhythmStage.ts`

**Interfaces:**

- Consumes: Tasks 2, 3, 6 ; `Transport.playFigure(figure, 'play-along', fromBar)`.
- Produces:

```ts
// recordCycle.ts
export function cycleAids(input: {
	params: LevelParams;
	aidLevel: boolean;
	listened: boolean;
	playAlong: boolean;
}): Aid[]; // + 'play-along'
// rhythmStage.ts
export type Announcement =
	'level-up' | 'level-down' | 'aid-level' | 'listen-remedy' | 'play-along' | 'change-of-air';
// RhythmStageModel.announcement: Announcement | null
```

- [ ] **Step 1: Tests** :
  - `recordCycle.spec.ts` : `cycleAids({ …, playAlong: true })` contient `'play-along'` ; `levelAided(['play-along'], params) === true`.
  - Contrôleur, `a reading block is heard, then played along` : au niveau 1, trois cycles ratés dont la même attente manquée → le cycle posé après le jugement du 3ᵉ est un `listen` (annonce `'listen-remedy'`), le suivant un cycle joué avec `'play-along'` (le son `play-along` programmé sur ses mesures, l’annonce `'play-along'`, l’aide dans la tentative).
  - `an execution block takes the aid level at the breath` : trois cycles ratés `['regularity']` → la respiration annonce `'aid-level'` et la suite suivante est au niveau −1 (l’aide `'aid-level'` dans ses tentatives).
  - `the lowest aid level that blocks changes the air` : → la série finit à la frontière suivante (`reason: 'change-of-air'`, `breaking` dans la trace), `levels.put` reçoit `resumeAfter = now + BLOCK_REST_MS` une fois, aucun cycle non commencé n’est écrit.
- [ ] **Step 2:** `npx vitest run src/lib/application/session/plan` → FAIL.
- [ ] **Step 3:** Implémenter : `next` rend `remedy: true` → la mesure porte le remède, d’où l’annonce ; un tour `aid: 'play-along'` programme `transport.playFigure(figure, 'play-along', bar)` au début du cycle et passe `playAlong: true` à `cycleAids`. `SettledRound.spotMs` = `MATCH_LIMIT` converti par la carte de tempo du cycle. L’annonce à la respiration : `'aid-level'` quand le niveau suivant est un niveau d’aide et le précédent ne l’était pas, sinon `'level-up'` / `'level-down'` comme aujourd’hui.
- [ ] **Step 4:** `npm test && npm run check` → PASS.
- [ ] **Step 5:** `git commit -m "feat: answer a blocked series with a listen, playing along, an aid level, then a change of air"`

### Task 8: Services : bilan, réécoute d’une suite, contestation, repos

**Files:** Modify `src/lib/application/app.ts`, `services/createAppServices.ts` et sa spec, `src/lib/application/session/plan/rhythmSummary.ts` → `exerciseSummary.ts` (et sa spec), `src/lib/domain/types.ts`, `src/lib/application/ports/repositories.ts`, `src/lib/infrastructure/storage/DexieAttemptRepository.ts`, son contrat (`storage/testing/`), `storage/validateBackup.ts` et sa spec, `src/lib/testing/fakes.ts`

**Interfaces:**

- Consumes: Tasks 4, 5, 6.
- Produces:

```ts
// domain/types.ts — RhythmSummary devient ExerciseSummary, SessionSummary.rhythm devient .exercise
export interface ExerciseSummary {
	exerciseId: ExerciseId;
	levelReached: { shown: number; of: number; aid: boolean };
	cycles: number; successes: number; aided: number;
	lastCycle?: { …inchangé… };              // shown in development builds only
	/** From the session in memory; absent after a reload. */ series?: SeriesSummary;
	/** Runs whose take is still held, by segment id. */ replayable?: number[];
}
// Attempt gains: contestReason?: string   (a CycleFailure for a cycle)
// AttemptRepositoryPort: setContested(id: number, reason?: string): Promise<void>
// AppServices:
contest(attemptId: number, reason?: string): Promise<void>;
replayRun(sessionId: string, runId: number): Promise<void>;   // rejects a run not held
stopReplay(): void;
/** Exercises resting after « On change d’air » (resumeAfter still ahead). */
resting(exerciseIds: readonly ExerciseId[]): Promise<ExerciseId[]>;
```

- [ ] **Step 1: Tests** :
  - `createAppServices.spec.ts`, `the summary of a session in memory has its series` : une `SessionMemory` remplie → `sessionSummary(id).exercise.series.runs.length` et `replayable` (les suites dont `takes.holds(from, to)`).
  - `after a reload the summary keeps its counts` : mémoire vide → `exercise.series` absent, `cycles` et `successes` présents.
  - `replayRun plays the run's take` : le faux `TakeBufferPort.play` reçoit `from`, `to`, les sons et la latence de la suite ; une suite inconnue ou plus gardée rejette.
  - `contest stores its reason` : `contest(5, 'regularity')` → `setContested(5, 'regularity')`.
  - `resting lists the exercises whose resumeAfter is ahead` : `resumeAfter = now + 1` → listé ; `now − 1` ou `null` → non.
  - Contrat du dépôt des tentatives : `setContested(id, 'hold')` → `contested: true`, `contestReason: 'hold'` ; sans raison, `contestReason` absent.
  - `validateBackup.spec.ts` : `contestReason` facultatif, chaîne ; un nombre est refusé avec `'contestReason must be a string'`.
- [ ] **Step 2:** `npm test` → FAIL sur ces tests.
- [ ] **Step 3:** Implémenter ; renommer partout (`summarizeRhythm` → `summarizeExercise`, `SessionSummary.rhythm` → `exercise`, messages et specs du bilan compris). `sessionSummary` cherche la séance dans `SessionMemory` et, si elle y est, calcule `series` avec `summarizeSeries` sur le segment `series` de la trace.
- [ ] **Step 4:** `npm test && npm run check` → PASS.
- [ ] **Step 5:** `git commit -m "feat: give the summary each run of the series, to hear again and contest by reason"`

---

## Partie III — L’interface

### Task 9: Le bilan d’une série

**Files:** Modify `src/lib/ui/screens/summary/SummaryScreen.svelte`, `messages.ts`, `SummaryScreen.svelte.spec.ts` ; Create `src/lib/ui/primitives/Term.svelte`, `src/lib/ui/primitives/glossaryScope.ts`, `Term.svelte.spec.ts`

**Interfaces:**

- Consumes: Tasks 4, 8.
- Produces:

```ts
// glossaryScope.ts — one per screen: only the first occurrence of a term is underlined
export function provideGlossaryScope(): void;
export function useGlossaryScope(): { first(id: TermId): boolean }; // true once per id
// Term.svelte props: { id: TermId; locale: Settings['locale']; inactive?: boolean; children: Snippet }
```

- [ ] **Step 1: Tests** :
  - `Term.svelte.spec.ts` : la première occurrence d’un terme dans un écran est soulignée en pointillés (classe `term-first`) et la deuxième non ; la définition (`GLOSSARY[id][locale].definition`) s’affiche au survol, au focus clavier et au toucher, et jamais quand `inactive`.
  - `SummaryScreen.svelte.spec.ts`, avec un `ExerciseSummary` portant `series` :
    - une ligne par suite (niveau, réussis sur joués, mesures moyennes avec leur terme), un bouton « Réécouter la suite » seulement pour les suites de `replayable`, qui appelle `replayRun(sessionId, runId)` ;
    - les changements de niveau (« niveau 1 → niveau 2 → niveau d’aide »), les écoutes, la part du temps joué (« 62 % du temps joué ») ;
    - `ended: 'change-of-air'` : « On change d’air », la mesure qui casse (« Ce qui casse : la tenue »), un lien vers chacun des autres exercices de rythme ;
    - sans `series` : les comptes seuls, aucun bouton de réécoute ;
    - `lastCycle` et les boutons de contestation ne sont rendus qu’en développement (`dev` simulé) ; « C’était en place · régularité » appelle `contest(attemptId, 'regularity')`, un bouton par raison du cycle raté.
- [ ] **Step 2:** `npx vitest run --project client src/lib/ui/screens/summary src/lib/ui/primitives` → FAIL.
- [ ] **Step 3:** Implémenter. Textes (fr) : « Réécouter la suite », « Arrêter », « Suite {n} », « On change d’air », « Ce qui casse : {terme} », « {p} % du temps joué », « {n} écoute(s) », « C’était en place · {terme} » ; l’anglais en traduction. Tokens existants, texte ≥ 16 px, aucun pixel art.
- [ ] **Step 4:** Même commande → PASS ; `npm run check` → PASS.
- [ ] **Step 5:** `git commit -m "feat: show each run of a series in the summary, with its replay and its words"`

### Task 10: La vue de rythme : remèdes, temps perdu, mots qui s’effacent

**Files:** Modify `src/lib/ui/play/views/rhythmFigure.ts`, `rhythmFigure.spec.ts`, `RhythmFigureView.svelte` et sa spec, `views/messages.ts`, `src/lib/application/session/plan/rhythmStage.ts`, `PlanSessionController.svelte.ts` (`plainWords`), `src/routes/dev/rhythm/` (états de démonstration), `scripts/functional-ui.mjs`

**Interfaces:**

- Consumes: Tasks 4 (lexique), 7 (`Announcement`), 9 (`Term`).
- Produces:

```ts
// RhythmStageModel gains: plainWords: boolean   (sessions ended on the exercise < PLAIN_WORDS_SESSIONS)
export const PLAIN_WORDS_SESSIONS = 3; // in rhythmStage.ts
export function feedbackLine(
	report: CycleReport,
	locale: Locale,
	verdict?: CycleVerdict,
	plain?: boolean
): Line; // plain defaults to true
export function shiftMark(report: CycleReport): { bar: number; lost: boolean } | null; // lost: byS < 0
```

- [ ] **Step 1: Tests** (`rhythmFigure.spec.ts`, vue) :
  - `feedbackLine without plain words keeps the term and its number` : tenue −35 ms → `plain` vrai : « Sans clic, tu passes devant (−35 ms) » ; faux : « tenue −35 ms ». Une ligne sans nombre (« En place ») est la même dans les deux cas.
  - `shiftMark names the bar of a lost beat` : `shift: { bar: 2, byS: -0.3 }` → `{ bar: 2, lost: true }` ; sans décalage → `null`.
  - Vue : « temps perdu » (ou « temps ajouté ») écrit au-dessus de sa mesure à la respiration ; les annonces « Niveau d’aide », « On réécoute la figure », « On la joue ensemble » ; le terme du retour rendu par `Term`, `inactive` hors respiration.
  - Contrôleur : `plainWords` vrai tant que moins de `PLAIN_WORDS_SESSIONS` séances terminées de l’exercice (`sessions.list()`, `endedAt` non nul), faux ensuite.
- [ ] **Step 2:** `npx vitest run src/lib/ui/play src/lib/application/session/plan` → FAIL.
- [ ] **Step 3:** Implémenter ; `/dev/rhythm` gagne un état « temps perdu » et un état « jouer avec ». Dans `scripts/functional-ui.mjs`, vérifier sur `/dev/rhythm` que l’étiquette « temps perdu » est rendue à au moins 16 px et dans la largeur de sa mesure.
- [ ] **Step 4:** `npm test && npm run check` → PASS ; `npm run dev` puis `node scripts/functional-ui.mjs` → aucune erreur.
- [ ] **Step 5:** `git commit -m "feat: announce the remedies, mark a lost beat on its bar and let the plain words fade"`

### Task 11: L’accueil marque un exercice au repos

**Files:** Modify `src/lib/ui/screens/home/HomeScreen.svelte`, `messages.ts`, `HomeScreen.svelte.spec.ts`

- [ ] **Step 1: Test** : `resting` rend `['rhythm-offbeats']` → « Contretemps » porte « On y revient plus tard » et reste un lien vers `/session?kind=exercise&exercise=rhythm-offbeats`.
- [ ] **Step 2:** `npx vitest run --project client src/lib/ui/screens/home` → FAIL.
- [ ] **Step 3:** Implémenter (appel à `resting(RHYTHM_EXERCISES.map((e) => e.id))` au montage).
- [ ] **Step 4:** Même commande → PASS.
- [ ] **Step 5:** `git commit -m "feat: mark on the home screen an exercise resting after a change of air"`

---

## Partie IV — L’oracle

### Task 12: Exporter les suites de l’oracle

**Files:** Create `src/lib/infrastructure/diagnostics/oracle.ts`, `oracle.spec.ts` ; Modify `exportArchive.ts` (exporter `layoutChunks`), `diagnostics/index.ts`, `src/lib/application/app.ts` (`DiagnosticsService`), `src/lib/composition/createApp.ts` ; Create `src/routes/diagnostic/oracle/+page.svelte`

**Interfaces:**

- Produces:

```ts
export const ORACLE_TAKES = 10;
export const ORACLE_MARGIN_S = 1;
/** Consecutive cycle attempts of a session with no gap above one bar: one run of the oracle. */
export interface OracleRun { sessionId: string; attemptIds: number[]; fromMs: number; toMs: number; contested: boolean }
export function oracleRuns(attempts: readonly Attempt[]): OracleRun[];
/** The contested runs first, then drawn with `random`, up to ORACLE_TAKES, only runs a take with sound covers. */
export function pickOracleRuns(runs: readonly OracleRun[], takes: readonly DiagnosticTakeRow[], random: () => number): OracleRun[];
/** Audacity labels: one line per attack, `start\tend\tlabel`, start = end, label its number from 1. */
export function audacityLabels(timesS: readonly number[]): string;
export function parseAudacityLabels(text: string): number[];   // the start of each line, sorted
export interface OracleSuite {
	name: string;                       // "suite-01"
	sessionId: string; takeId: string; attemptIds: number[];
	sliceStartAudioS: number; sampleRate: number;
	/** The attacks the sensor heard, s from the slice start, before latency correction. */ detected: number[];
	/** What re-judging needs, per attempt: its plan record, its round start (s from the slice start), latency, stored verdict. */
	cycles: { attemptId: number; plan: CyclePlanRecord; startS: number; latency: CycleReport['latency']; verdict: CycleVerdict }[];
}
// DiagnosticsService gains:
oracleArchive(): Promise<Blob>;     // zip: suite-NN.wav, suite-NN.txt, suites.json
```

- [ ] **Step 1: Tests** (`oracle.spec.ts`) :
  - `oracleRuns splits a session where cycles stop chaining` : quatre cycles enchaînés, une respiration de 3 s, quatre autres → deux suites ; `contested` vrai si une tentative l’est.
  - `pickOracleRuns takes the contested first, then at random, within takes with sound` : 3 contestées, 20 autres, `random` fixé → 10 suites, les 3 contestées en tête ; une suite hors de toute prise est écartée.
  - `audacityLabels and parseAudacityLabels round-trip` : `[0.5, 1.25]` → `"0.500000\t0.500000\t1\n1.250000\t1.250000\t2\n"` → `[0.5, 1.25]` ; une ligne illisible est ignorée.
  - `a suite's slice covers the run with its margins` : prise ouverte à l’époque `t0` et à l’instant audio `a0` → `sliceStartAudioS = a0 + (fromMs − t0) / 1000 − ORACLE_MARGIN_S` ; `detected` ne garde que les `attack.detected` de la tranche, relatifs à son début.
- [ ] **Step 2:** `npx vitest run src/lib/infrastructure/diagnostics/oracle.spec.ts` → FAIL.
- [ ] **Step 3:** Implémenter ; l’archive est construite avec `ZipWriter` et `wavHeader` existants, suite par suite. La page `/diagnostic/oracle` (déjà derrière `requireDev()` par son layout) porte « Exporter les suites de l’oracle », et rappelle la procédure Audacity de la spec (§11, « L’oracle, concrètement ») et sa convention du début d’une attaque.
- [ ] **Step 4:** Même commande → PASS ; `npm run check` → PASS.
- [ ] **Step 5:** `git commit -m "feat: export runs of the attack sensor for the oracle, with audacity labels"`

### Task 13: Comparer l’oracle et rejouer le juge

**Files:** Modify `oracle.ts`, `oracle.spec.ts`, `src/lib/application/app.ts`, `src/routes/diagnostic/oracle/+page.svelte`

**Interfaces:**

- Consumes: Task 12 ; `compileCyclePlan`, `createTempoMap`, `PlanRound`, `figureFromJson`, `Fraction`.
- Produces:

```ts
export const ORACLE_MATCH_MS = 25;
export interface SensorComparison { matched: number; missed: number; falseAttacks: number; biasMs: number | null; spreadMs: number | null }
/** One-to-one, in time order, within ORACLE_MATCH_MS: truth unmatched = missed, detected unmatched = false. bias = mean(detected − truth). */
export function compareAttacks(detected: readonly number[], truth: readonly number[]): SensorComparison;
/** Each cycle judged again on the truth: its verdict then and now. */
export function rejudge(suite: OracleSuite, truth: readonly number[]): { attemptId: number; before: CycleVerdict; after: CycleVerdict }[];
export interface OracleReport { suites: { name: string; sensor: SensorComparison; changed: ReturnType<typeof rejudge> }[]; total: SensorComparison }
// DiagnosticsService gains:
oracleReport(files: readonly { name: string; text: string }[]): OracleReport;  // suites.json + suite-NN.txt
```

- [ ] **Step 1: Tests** :
  - `compareAttacks` : `detected [1.000, 2.010, 3.500]`, `truth [1.005, 2.000, 4.000]` → `matched 2`, `missed 1`, `falseAttacks 1`, `biasMs` = moyenne de −5 et +10 = 2,5.
  - `rejudge keeps the verdict when the truth is what was heard` : une suite dont `truth = detected` → `before` égal à `after` pour chaque cycle.
  - `rejudge shows a verdict the sensor changed` : une attaque fausse retirée de la vérité → un cycle passe de `{ passed: false, reasons: ['extra'] }` à `{ passed: true }`.
  - `oracleReport reads suites.json and the labels by name` ; un fichier d’étiquettes sans suite est ignoré et nommé dans le rapport.
- [ ] **Step 2:** `npx vitest run src/lib/infrastructure/diagnostics/oracle.spec.ts` → FAIL.
- [ ] **Step 3:** Implémenter `rejudge` : la carte de tempo du cycle a pour origine son début (`startS`) et l’unique segment de son `tempo` ; le plan est `compileCyclePlan` sur la figure, `cycleBars`, `startBar`, le capteur `attack`, la fenêtre et les mesures de l’accompagnement du record ; chaque attaque de la vérité est observée à `t − latence` ; `settle()` rend le verdict. La page lit les fichiers déposés et affiche, par suite et au total : appariées, manquées, fausses, biais et dispersion, puis les cycles dont le verdict change.
- [ ] **Step 4:** Même commande → PASS ; `npm test && npm run check` → PASS.
- [ ] **Step 5:** `git commit -m "feat: compare the annotated attacks with the sensor and judge the cycles again"`

---

### Task 14: Documentation

**Files:** Modify `CLAUDE.md`, `docs/vision.md` (avancement du chantier 1), la spec (section « Réalisation » : un paragraphe « Plan 2 » avec les décisions de ce plan et ce que l’exécution aura décidé d’autre)

- [ ] **Step 1:** `CLAUDE.md` : `domain/session/` (trace, politique `next`, anti-blocage, bilan sur la trace), `domain/glossary/`, `SessionMemory` et la réécoute par suite, `SESSION_MS` pour les séances d’exercice, la contestation par raison (développement), l’oracle (`/diagnostic/oracle`) ; retirer `RHYTHM_SERIES_MS`, `cyclesPerSeries`, `TAKE_BUFFER_MAX_S`, `SessionSummary.rhythm`.
- [ ] **Step 2:** `npm run lint` → PASS (ou `npm run format` puis relire).
- [ ] **Step 3:** `git commit -m "docs: describe the session trace, its policy, the summary by run and the oracle"`

---

## Après le plan

La journée de validation (G) : au moins `VALIDATION_MIN_CYCLES` cycles par exercice, puis l’oracle (export, annotation, rapport), les contestations par raison, la comparaison en ombre, la part du temps joué et les changements de niveau par série. Puis H, qui passe les quatre relations et les sélecteurs sur la politique et la trace (segments en temps libre compris) et donne `SESSION_MS` à toutes les séances ; la fin de `SessionKind` vient au chantier 2, avec les parcours en données.
