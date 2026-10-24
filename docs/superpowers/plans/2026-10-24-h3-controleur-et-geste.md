# Le contrôleur des tours à une réponse, et le geste (plan H3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jouer les séances du geste (relier, monter, zone, jam) sur le nouveau chemin — le moteur de tour (H1), le transport et ses réveils, des pièces génériques de séance — avec ses vues dans `PlayFrame`, l’ancien `SessionController` ne jouant plus que les notes et les triades.

**Architecture:** Des collaborateurs génériques dans `src/lib/application/session/series/` : l’**exécuteur de tour** (`RoundRunner` : ouvre un `PlanRound` sur un plan, donne aux capteurs leur attente, route les observations dans leur étendue, réveille le tour sur le transport, le règle au passage de main), l’**enregistreur de réponse** (une tentative par tour réglé, au modèle cible), et le **contrôleur de série de réponses** (`ResponseSeriesController`, qui implémente `PlaySessionController` : il tire les items d’une `ItemSource`, fait préparer leur plan, enchaîne les tours sur le transport — mesure comptée, silence, passage de main, changement de tempo par portée, consigne, pause). Le geste fournit ses plans (`gesturePlan`) et ses modèles d’écran ; ses vues lisent leurs placements dans leur modèle et l’horloge commune (`timeline.nowBeat()`), plus dans `PlayView`.

**Tech Stack:** TypeScript, Svelte 5 (runes), Vitest (node : `*.spec.ts` ; jsdom : `*.svelte.spec.ts`), Web Audio (via les ports existants).

**Spec:** `docs/superpowers/specs/2026-10-14-temps-musical-et-sequences-design.md`, « Amendement (2026-10-23) », sections « 4. Le contrôleur unique », « 5. Les vues et le contrat d’écran », « 6. Données, critère de fin » ; « Réalisation du plan H1 » et « Réalisation du plan H2 ». Le découpage de H en cinq plans (H3 le geste, H4 les notes, H5 les triades et les suppressions) est décidé le 2026-10-24 ; la Task 10 le reporte dans la spec.

## Global Constraints

- Branche `plan/temps-musical-h3`, dans `.worktrees/temps-musical-h3`, partie de `main` (`780c09c`). `npm test && npm run check` vert à chaque commit ; tests avant le code ; chaque test affirme.
- **Le nouveau chemin ne nomme aucune mécanique ni aucun exercice** dans `src/lib/application/session/series/` (fichiers non-spec) ; le geste entre par ses données (`ItemSource`, un `PlanSource`, son présentateur). Un test de frontière le vérifie (Task 9), comme `application/session/boundaries.spec.ts`.
- **Le nouveau chemin n’importe ni `domain/timing/`, ni `MetronomePort`, ni `TimingRelation`** ; il parle aux sons par `Transport` seulement, et juge par `PlanRound` (H1) avec `contentJudges` (`domain/judges`).
- **L’ancien chemin ne change pas de comportement** pour les notes et les triades : `SessionController`, `PlayScreen`, `domain/timing/` restent tels quels jusqu’à H5. Les specs actuelles du geste sur l’ancien contrôleur (`gestureEndToEnd`, `chainedRounds`, `countdown`, `briefing`, `tempoScope`) restent vertes tant que l’ancien code existe ; leurs scénarios sont **reportés** sur le nouveau contrôleur comme critère d’acceptation (Task 8).
- **Comportement du geste conservé** : les tours enchaînés par passage de main (`GRID_EARLY_MS`, `GRID_EARLY_MAX_BEATS` via `gridChangePlan`), la mesure comptée entre passages et après une pause, les `restBars` de silence avant une mesure comptée (`LINK_REST_BARS`), le tempo par portée (une grille, un tempo ; une autre portée relance le tempo après une mesure comptée), la consigne (`howTo`) avant le premier passage d’un exercice, le tour de relier rejoué tout de suite, l’aide de relier après `LINK_AID_AFTER_MISSES`, la montée qui tourne (`climbDirection`), la fin quand la source ne rend plus rien.
- **« Joué juste » n’existe qu’en développement** (`development`, comme `PlanSessionController`) : décision de `docs/vision.md` (« le juge doit avoir raison seul »).
- La durée de la séance appartient à la séance : `SESSION_MS` (`domain/session/policy.ts`) ; aucun nouveau passage ne commence après, un passage commencé se termine. `GESTURE_SESSION_MS` n’est plus lu par le nouveau chemin.
- Aucun changement de schéma Dexie (le geste n’a pas de cartes ; Dexie 9 vient avec les notes, H4). Les tentatives écrites ont l’enveloppe `response` (H1) et un plan résolu en JSON.
- Un nom par concept ; « tour » / `round`, « série » / `series`, « passage » / `passage`, « mesure comptée » / `count-in`. Textes d’interface en français et en anglais (`defineMessages`), jamais sous 16 px.
- Commits : Conventional Commits en minuscules, impératif, orientés comportement ; terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Décisions prises par ce plan (à reporter dans « Réalisation »)

- **H est découpé en cinq plans** : une famille d’exercices bascule avec sa vue, sinon le nouveau contrôleur devrait nourrir l’ancien écran. H3 : le cœur générique et le geste (ses vues sont déjà dans `PlayFrame`). H4 : les notes, Dexie 9 (les niveaux des cartes), `note-lane` et `answer-keys`. H5 : les triades, `triad-lane`, puis les suppressions du critère de fin.
- **Le nouveau contrôleur s’appelle `ResponseSeriesController` jusqu’à H5**, où il absorbe `PlanSessionController` (le rythme) et prend le nom `SessionController`. Ses collaborateurs (`RoundRunner`, l’enregistreur de réponse, le transport) sont ceux que le contrôleur unique gardera.
- **Le réveil d’un tour** : à chaque temps de la carte de tempo entre l’ouverture du tour et sa fin d’écoute (`transport.at`), plus le passage de main ; c’est la cadence des relations actuelles, que le banc de H1 a comparées.
- **Les vues lisent leur placement dans leur modèle** : le moment de la cible (`anchorBeat`) et les tours passés (`history`) entrent dans le modèle d’écran du geste ; `PlayView` ne leur donne plus que le cadre (statut, mesure comptée, consigne, erreur audio, « Joué juste ») et `stage`. `timeline.nowBeat()` reste l’horloge commune.
- **Le plan résolu d’une tentative de réponse** est stocké en JSON (`roundPlanRecord` : fractions en texte), comme le plan d’un cycle.

## Review Focus

- **Une pause au milieu d’un passage enchaîné** : le passage de main en attente est annulé, le tour ouvert est abandonné sans tentative s’il n’a rien entendu (ou réglé s’il a une réponse), et la reprise compte une mesure puis reprend au changement suivant (Task 6, Task 8).
- **Une observation qui arrive exactement au passage de main** : elle appartient au tour suivant ; l’attente du capteur est retirée avant le règlement, si bien qu’une fenêtre coupée court rapporte dans le tour qui finit (Task 3, Task 8).
- **Deux portées de tempo qui alternent** (ballade puis blues) : chaque passage joue au tempo de sa portée, le transport change de tempo après une mesure comptée, et la tentative porte son tempo et sa portée (Task 6, Task 8).
- **La source qui ne rend plus rien en plein passage, ou `SESSION_MS` atteint** : le passage commencé finit, aucune nouvelle consigne, le bilan s’ouvre (Task 6).
- **Un rechargement de l’écran pendant la consigne** (`briefing`) : rien ne joue tant que le joueur n’a pas repris ; la reprise compte une mesure au tempo de l’exercice (Task 6).

---

## File Structure

**Application, nouveau chemin (générique)**

- `src/lib/application/session/series/planSource.ts` — `PlanSource` (l’item → son plan de tour).
- `src/lib/application/session/series/roundRunner.ts` — `RoundRunner`, `RunnerEvent`.
- `src/lib/application/session/series/recordResponse.ts` — `responseAttempt`, `roundPlanRecord`.
- `src/lib/application/session/series/ResponseSeriesController.svelte.ts` — `ResponseSeriesController`, `ResponseSeriesDeps`.
- `src/lib/application/session/series/boundaries.spec.ts`.
- Modifié : `src/lib/application/session/transport.ts` (`countIn`).

**Domaine et présentation du geste**

- `src/lib/domain/gesture/plans.ts` — `gesturePlan(item, meter)`.
- Modifiés : `src/lib/application/mechanics/chordGrid.ts` (`stage` et `attemptData` au modèle cible), `src/lib/application/mechanics/types.ts` (`MechanicPresenter.attemptData?`, `stage` lisant une `ResponseValue`), `src/lib/ui/play/views/LinkLaneView.svelte`, `GridScrollView.svelte`, `linkLane.ts`, `gridScroll.ts` (placement depuis le modèle).

**Branchement**

- Modifiés : `src/lib/application/services/createAppServices.ts` (la séance du geste), `src/routes/dev/gesture/+page.svelte` (page de développement), `src/lib/domain/gesture/summary.ts` si la lecture du verdict l’exige.

---

### Task 1: Le transport compte une mesure en cours de série

**Files:**

- Modify: `src/lib/application/session/transport.ts`
- Test: `src/lib/application/session/transport.spec.ts`

**Interfaces:**

- Produces :

```ts
/** `restBars` silent bars from `atBar` (nothing sounds), then one counted bar (every beat clicked, accent on 1, `countdownAt` 4..1). Returns the bar play resumes at. Throws a `RangeError` when something is already scheduled at or past `atBar`, or `restBars` is not a whole number ≥ 0. */
countIn(atBar: number, options?: { restBars?: number }): number;
```

Le clic du geste entre deux comptes reste `accompany(from, to, clickAccompaniment({ meter, beats: [0, 1, 2, 3], accent: [0] }))`, déjà existant : pas de nouvelle méthode.

- [ ] **Step 1: Write the failing tests** :
  - `it('counts one bar in the middle of a series, then play resumes on the next downbeat')` : après `begin` et deux mesures cliquées, `countIn(4)` rend `5` ; `countdownAt(4, 0..3)` vaut `4, 3, 2, 1` ; `countdownAt(5)` vaut `null`.
  - `it('keeps restBars silent before the counted bar')` : `countIn(4, { restBars: 2 })` rend `7` ; aucun son émis sur les mesures 4 et 5 (`FakeSoundScheduler`), la mesure 6 clique et compte.
  - `it('refuses a count over bars already scheduled')`.
- [ ] **Step 2: Run** `npx vitest run src/lib/application/session/transport.spec.ts` → FAIL.
- [ ] **Step 3: Implement** sur le modèle de `breath` (mêmes sons, même tenue des mesures comptées).
- [ ] **Step 4: Run** → PASS ; le rythme (`PlanSessionController.svelte.spec.ts`) inchangé.
- [ ] **Step 5: Commit** `git commit -m "feat: count a bar in the middle of a series, after silent bars"`

---

### Task 2: Le plan d’un changement de grille, et son modèle d’écran au modèle cible

**Files:**

- Create: `src/lib/domain/gesture/plans.ts`, `src/lib/application/session/series/planSource.ts`
- Modify: `src/lib/application/mechanics/types.ts`, `src/lib/application/mechanics/chordGrid.ts`
- Test: `src/lib/domain/gesture/plans.spec.ts`, `src/lib/application/mechanics/chordGrid.spec.ts`

**Interfaces:**

- Produces (dans `planSource.ts`) :

```ts
/** The round plan of an item, by the exercise's data; the controller never builds a plan itself. */
export type PlanSource = (item: PlannedItem) => RoundPlan;
```

- Produces (dans `domain/gesture/plans.ts`) : `gesturePlan(item: ChordGridItem, meter: Meter): RoundPlan` = `gridChangePlan({ content: { kind: CHORD_GRID_CONTENT, value: item }, lengthBeats: item.changes[item.index].length, meter })` (H1, `domain/exercise/roundPlans.ts`).
- Produces (dans `mechanics/types.ts`) : `MechanicPresenter.stage?(item, settled: { value: ResponseValue; success: boolean } | null, locale, aids: { aid: AidLevel }): { model: unknown }` sur le nouveau chemin (à côté de l’ancienne signature, que l’ancien contrôleur garde jusqu’à H5 : nommer la nouvelle `stageOf` pour ne pas toucher l’ancienne) ; `MechanicPresenter.attemptData?(item, value: ResponseValue): unknown` — le `Attempt.data` de la mécanique (pour le geste : `{ item, answer, confusion }` de l’attente 0, la forme que `ChordGridData` a aujourd’hui).
- Le modèle d’écran du geste (`LinkLaneModel`, le modèle de `grid-scroll`) gagne `anchorBeat: number | null` (le temps de la cible du changement courant, en temps de la carte depuis le début de la série) et `history: readonly LaneEntry[]` ; `stageOf` les reçoit du contrôleur (Task 6) par un troisième argument `place: { anchorBeat: number | null; history: readonly LaneEntry[] }`.

- [ ] **Step 1: Write the failing tests** :
  - `plans.spec.ts` : `it('plans a grid change as the grid relation timed it')` → pour un changement de 4 temps en 4/4, le plan vaut `gridChangePlan` attendu (prompt −1/4, handover 1, attente `chord-grid` dont la valeur est l’item) et `validateRoundPlan` → `null`.
  - `chordGrid.spec.ts` : `it('draws the change and its verdict from a response value')` → `stageOf(item, { value, success }, 'fr', { aid: 'none' }, place)` donne le même modèle que l’ancien `stage(item, { answer, verdict })` sur les cas actuels, avec `anchorBeat` et `history` de `place` ; `it('keeps the attempt data a gesture attempt has today')` → `attemptData(item, value)` égale `{ item, answer, confusion }` des données écrites aujourd’hui.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/lib/domain/gesture src/lib/application/mechanics && npm run check` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: plan a grid change and draw it from a response value"`

---

### Task 3: L’exécuteur de tour

**Files:**

- Create: `src/lib/application/session/series/roundRunner.ts`
- Test: `src/lib/application/session/series/roundRunner.spec.ts`

**Interfaces:**

- Consumes: `PlanRound`, `RoundEvent`, `Observed`, `contentJudges` (H1) ; `Transport` (`at`) ; `ObservationSpan` (`application/session/observationSpan.ts`) ; `ObservationSource` et ses attentes (`application/session/sensors.ts`) ; `MechanicPresenter.expectation` (le geste : `{ chord: gridExpectation(item, opensAt) }`).
- Produces :

```ts
export type RunnerEvent =
	{ kind: 'provisional'; outcome: RoundOutcome } | { kind: 'settled'; outcome: RoundOutcome };

/** One round on the transport: opens its PlanRound, tells the sensors what to listen for, routes observations into its span, wakes the round, settles it. */
export class RoundRunner {
	constructor(input: {
		plan: RoundPlan;
		item: PlannedItem;
		/** Bar position of the round's start on the transport (fractions allowed). */
		at: Fraction;
		chained: boolean;
		transport: Transport;
		map: TempoMap;
		latency: CycleReport['latency'];
		sources: ReadonlyMap<SensorKind, ObservationSource>;
		expectation: Partial<Record<SensorKind, unknown>>;
		onEvent: (event: RunnerEvent) => void;
	});
	readonly span: ObservationSpan;
	/** Audio seconds of the handover, when the round has one. */
	readonly handoverTime: number | null;
	observe(sensor: SensorKind, observation: Observation): void;
	/** Withdraws the expectations, then closes the round at `now` (null: dropped, nothing heard). */
	close(now: number): RoundOutcome | null;
	/** Cancels every wake-up (pause, quit). */
	cancel(): void;
}
```

Règles (chacune a son test) :

1. À la construction : l’attente de chaque capteur est donnée (`source.expect(...)`), les autres reçoivent `null` ; une étendue d’observations s’ouvre à l’ouverture du tour.
2. Un réveil à chaque temps de la carte entre l’ouverture et la fin d’écoute (`listenUntilTime`), qui appelle `round.advance(now)` ; un `settled` ou `provisional` est remis à `onEvent` (un `settled` une seule fois).
3. `observe` : le sort de chaque observation (`Observed.fate`) et le `correct` du juge sont rangés dans l’étendue, comme l’ancien contrôleur (`onObservation`) ; une observation réglant le tour est remise à `onEvent`.
4. `close(now)` retire d’abord les attentes (`expect(null)`), puis règle le tour ; un tour abandonné (`null`) ne rend rien.
5. `cancel` annule les réveils sans régler.

- [ ] **Step 1: Write the failing tests** (horloge et sources factices de `src/lib/testing/fakes.ts`, un `FakeChordVerifier`, un plan `gesturePlan`) :
  - `it('tells each sensor what to listen for, and the others nothing')`.
  - `it('settles a change answered in time and files the observation as its answer')`.
  - `it('shows a provisional miss when the window closes unanswered, on the beat that closes it')`.
  - `it('withdraws the expectation before settling: a window cut short reports into the round that ends')` (le scénario de `chainedRounds.spec.ts`).
  - `it('drops a round closed before anything was heard')`.
  - `it('stops waking once cancelled')`.
- [ ] **Step 2: Run** `npx vitest run src/lib/application/session/series/roundRunner.spec.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: run a round of a plan on the transport, its sensors and its span"`

---

### Task 4: L’enregistreur de réponse

**Files:**

- Create: `src/lib/application/session/series/recordResponse.ts`
- Modify: `src/lib/application/session/AttemptRecorder.ts` : `recordResponse(attempt: Omit<Attempt, 'id'>, span: ObservationSpan): Promise<number>` à côté de l’entrée existante, sans la changer (écrit l’essai avec l’instantané de l’étendue, puis `completeObservations` à sa clôture, comme l’entrée existante)
- Test: `src/lib/application/session/series/recordResponse.spec.ts`

**Interfaces:**

- Produces :

```ts
/** The plan as JSON, fractions as text, so an attempt keeps what it was judged against. */
export function roundPlanRecord(plan: RoundPlan): unknown;
/** The attempt of a settled response round, on the target model. */
export function responseAttempt(input: {
	outcome: RoundOutcome; // H1: success, correct, verdict envelope 'response', measures, aids, detail
	item: PlannedItem;
	plan: RoundPlan;
	data: unknown; // MechanicPresenter.attemptData
	sessionId: string;
	execution: Execution; // exerciseId, tempoBpm, scope
	promptedAt: number; // epoch ms of the prompt
	cardKey: CardKey;
}): Omit<Attempt, 'id'>;
```

Champs : `success`, `correct`, `verdict` (l’enveloppe telle quelle), `measures`, `aids`, `plan: roundPlanRecord(plan)`, `timingOffsetMs` et `reactionMs` lus dans la `ResponseValue`, `leadBeats: null` pour un plan sans avance (le geste), `tempoBpm` et `tempoScope` de l’exécution, `temperature: 'hot'` et `phase` de l’item (le geste est une compétence : aucune carte), `observations` de l’étendue à l’écriture puis complétées à sa clôture (`AttemptRecorder.completeObservations`, comme aujourd’hui).

- [ ] **Step 1: Write the failing tests** :
  - `it('writes a gesture change as the target model asks')` : succès, correct, enveloppe `response` version 1, offset et réaction, plan JSON relisible (`at` en `"0"`, `handover` en `"1"`), données `{ item, answer, confusion }`, tempo et portée.
  - `it('keeps an offbeat change correct but not a success')`.
  - `it('lets the gesture summary read the new attempts')` : `summarizeGesture` (domain/gesture) sur des tentatives `response` donne les mêmes comptes que sur les anciennes.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement**, et adapter `summarizeGesture` s’il lit le verdict par sa relation (`responseVerdictOf` lit les deux formes).
- [ ] **Step 4: Run** `npx vitest run src/lib/application/session src/lib/domain/gesture` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: store a response round as an attempt of the target model"`

---

### Task 5: Les vues du geste lisent leur placement dans leur modèle

**Files:**

- Modify: `src/lib/ui/play/views/LinkLaneView.svelte`, `GridScrollView.svelte`, `linkLane.ts`, `gridScroll.ts` et leurs specs
- Test: `src/lib/ui/play/views/LinkLaneView.svelte.spec.ts`, `GridScrollView.svelte.spec.ts`, `linkLane.spec.ts`, `gridScroll.spec.ts`

**Interfaces:**

- Consumes: le modèle d’écran du geste avec `anchorBeat` et `history` (Task 2) ; `controller.timeline.nowBeat()` ; `view.countdown` (cadre).
- Les vues ne lisent plus `view.targetBeatIndex` ni `view.history` ; l’ancien contrôleur, qui ne jouera plus le geste, n’a pas à les fournir aux vues du geste.

- [ ] **Step 1: Update the view specs** : leurs modèles portent `anchorBeat` et `history` ; `PlayView` n’a plus ces champs pour ces vues ; les placements attendus sont ceux d’aujourd’hui.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/lib/ui/play` → PASS.
- [ ] **Step 5: Commit** `git commit -m "refactor: place the gesture's views from their own model"`

---

### Task 6: Le contrôleur de série de réponses

**Files:**

- Create: `src/lib/application/session/series/ResponseSeriesController.svelte.ts`
- Modify: `src/lib/application/session/SessionDeps.ts` (`ResponseSeriesDeps`)
- Test: `src/lib/application/session/series/ResponseSeriesController.svelte.spec.ts`

**Interfaces:**

- Consumes: Tasks 1–5 ; `ItemSource`, `SelectorContext` (H2) ; `Execution`, `executionTempo` et le choix de l’exécution par exercice et portée (`application/session/executions.ts`) ; `SESSION_MS` ; `TraceBuilder` (`domain/session/trace.ts`).
- Produces :

```ts
export interface ResponseSeriesDeps {
	clock: AudioClockPort;
	sounds: SoundSchedulerPort;
	sensors: SessionDeps['sensors'];
	mechanics: SessionDeps['mechanics'];
	repositories: Pick<SessionDeps, 'attempts' | 'sessions' | 'settings' | 'progressions'>;
	recorder: AttemptRecorder;
	plans: PlanSource;
	locale: () => Locale;
	development: boolean;
}
export class ResponseSeriesController implements PlaySessionController {
	constructor(
		session: { id: string; kind: SessionKind },
		prepare: (sessionId: string) => Promise<{ source: ItemSource; executions: Execution[] }>,
		deps: ResponseSeriesDeps
	);
}
```

Règles (chacune a son test ; le comportement de référence est celui de l’ancien contrôleur sur le geste, `SessionController.svelte.ts`) :

1. **Départ** : `ready()` prépare la série et montre la consigne du premier exercice sur l’écran de départ ; `start()` : `transport.begin({ meter: METER_4_4, tempo: { at: Fraction.ZERO, bpm, unit: Fraction.of(1, 4) }, accompaniment: clickAccompaniment(…), listenInBars: 0, countIn: true })` au tempo de la première consigne, puis la première consigne une mesure plus loin, sa cible sur le premier temps qui suit le compte.
2. **Enchaînement** : un item qui suit sans `countIn`, au même tempo, même scène, s’ouvre au passage de main du tour précédent (`chained`), sans écart ; sinon après un `countIn` (avec `restBars` de silence avant quand l’item le demande), sa consigne un temps avant sa cible (`gridChangePlan.prompt`).
3. **Tempo par portée** : un item d’une autre exécution (exercice ou portée) change le tempo du transport (`changeTempo`) puis compte une mesure.
4. **Consigne** : le premier item d’un exercice qui a un `howTo` dans la série arrête le transport (statut en pause, `view.briefing`) ; `resume()` compte une mesure au tempo de cet exercice.
5. **Pause, reprise, quitter** : la pause annule le passage de main et les réveils, règle ou abandonne le tour ouvert (`RoundRunner.close`), ferme l’étendue ; la reprise compte une mesure et reprend au changement suivant ; quitter écrit la séance et finit.
6. **Fin** : la source rend `null`, ou `SESSION_MS` est passé au moment de choisir un nouveau passage (un passage commencé se termine) → la séance s’écrit et le bilan s’ouvre (`finished`).
7. **Écran** : `view.stage` = `{ view: définition.view, model: presenter.stageOf(item, settled, locale, aids, place) }` à l’ouverture et au règlement ; `place.anchorBeat` en temps de la carte depuis le début de la série, `place.history` les tours réglés (temps de la cible, verdict) ; `view.countdown` par `transport.countdownAt` ; `timeline.nowBeat()` = la position du transport en temps.
8. **Enregistrement** : chaque tour réglé → `recorder.recordResponse(responseAttempt(...))`, puis `source.record(attempt, now)` ; l’étendue se clôt à l’ouverture du tour suivant (ou pause, ou fin) et complète l’essai.
9. **« Joué juste »** : en développement seulement (`deps.development`), offert après un raté d’une mécanique contestable jusqu’à la consigne suivante ; ailleurs, `view.contest` reste `null`.
10. **Trace** : la série, ses mesures comptées, ses tours et ses pauses entrent dans la trace (`TraceBuilder`, rôles `series`, `count-in`, `rest`, `round`, `briefing`, `pause`), comme le rythme.

- [ ] **Step 1: Write the failing tests** (fakes : `FakeClock`, `FakeSoundScheduler`, `FakeChordVerifier`, dépôts en mémoire ; une source d’items scriptée et un `PlanSource` par `gesturePlan`) : un test par règle, dont les cinq lignes de la Review Focus.
- [ ] **Step 2: Run** `npx vitest run src/lib/application/session/series` → FAIL.
- [ ] **Step 3: Implement** (le contrôleur ne fait qu’orchestrer : ouvrir les exécuteurs de tour, choisir l’item suivant, placer sur le transport, écrire ; aucune règle de jugement ni d’exercice).
- [ ] **Step 4: Run** `npx vitest run src/lib/application/session && npm run check` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: play a series of response rounds on the transport"`

---

### Task 7: Le geste joue sur le nouveau chemin

**Files:**

- Modify: `src/lib/application/services/createAppServices.ts`, `src/lib/composition/createApp.ts` si les dépendances y sont assemblées, `src/routes/dev/gesture/+page.svelte`
- Test: `src/lib/application/services/createAppServices.spec.ts` (ou le spec existant de la séance du geste)

**Interfaces:**

- Consumes: `ResponseSeriesController` (Task 6), `gesturePlan` (Task 2), `createGestureSelector` (inchangé, il est une `ItemSource`).
- La séance `'gesture'` crée un `ResponseSeriesController` (source : le sélecteur du geste ; plans : `gesturePlan(item, METER_4_4)` ; `development` : `dev`) ; les autres sortes de séance ne changent pas.

- [ ] **Step 1: Write the failing test** : `it('plays a gesture session on the response series')` → `AppServices` démarre une séance du geste et rend un `ResponseSeriesController`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run check` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: play gesture sessions on the response series"`

---

### Task 8: Les scénarios du geste, reportés sur le nouveau chemin

**Files:**

- Create: `src/lib/application/session/series/gestureSession.spec.ts`

Les scénarios de `gestureEndToEnd.spec.ts`, `chainedRounds.spec.ts`, des cas du geste de `countdown.spec.ts`, `briefing.spec.ts`, `tempoScope.spec.ts` et `twoSensors.spec.ts` (attentes par capteur, consigne précédente donnée à l’attente, raté montré puis réglé, « Joué juste » en développement seulement), réécrits sur `ResponseSeriesController` avec le vrai sélecteur du geste, le vrai présentateur `chordGrid`, `gesturePlan` et les fakes. Les verdicts, tentatives écrites (succès, données, tempo, portée), consignes, comptes et changements de tempo attendus sont ceux des specs actuelles.

- [ ] **Step 1: Write the scenarios.**
- [ ] **Step 2: Run** `npx vitest run src/lib/application/session/series/gestureSession.spec.ts` → PASS ; un écart avec l’ancien comportement se corrige dans la tâche qui possède le code, ou, s’il est voulu, attend l’accord de l’auteur et sa ligne dans « Réalisation ».
- [ ] **Step 3: Commit** `git commit -m "test: play the gesture's scenarios on the response series"`

---

### Task 9: La frontière du nouveau chemin

**Files:**

- Create: `src/lib/application/session/series/boundaries.spec.ts`

- [ ] **Step 1: Write the test** : `it('names no mechanic nor exercise, and imports no old timing')` → aucun fichier non-spec de `application/session/series/` ne contient un identifiant de mécanique (`MECHANIC_RULES`) ni d’exercice (`EXERCISES`), entre apostrophes, guillemets ou accents graves, ni n’importe `$lib/domain/timing`, `MetronomePort`, `TimingRelation` (alias et chemins relatifs) ; et `it('actually scans the series folder')`.
- [ ] **Step 2: Run** → PASS (sinon corriger le code fautif dans sa tâche).
- [ ] **Step 3: Commit** `git commit -m "test: keep the response series free of mechanics and old timing"`

---

### Task 10: La doc suit

**Files:**

- Modify: `docs/superpowers/specs/2026-10-14-temps-musical-et-sequences-design.md` (le découpage de H en cinq plans dans le tableau de l’amendement ; « Réalisation du plan H3 »), `CLAUDE.md` (puces « Gesture track » et « Musical time » : le geste sur `ResponseSeriesController`, ses vues au modèle, les collaborateurs ; ce qui reste à H4 et H5)

- [ ] **Step 1: Update the spec** : le tableau des plans de l’amendement devient H3 (cœur et geste), H4 (notes, Dexie 9, `note-lane`, `answer-keys`), H5 (triades, `triad-lane`, suppressions) ; « Réalisation du plan H3 » avec les décisions de ce plan et tout écart accepté.
- [ ] **Step 2: Update `CLAUDE.md`** : une à trois phrases par puce, au style des puces.
- [ ] **Step 3: Verify** : `npx prettier --check` sur les deux fichiers, `npm test && npm run check` → PASS.
- [ ] **Step 4: Commit** `git commit -m "docs: describe the response series and the gesture on it"`
