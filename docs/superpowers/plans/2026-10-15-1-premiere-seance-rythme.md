# Première séance jouable de rythme (plan 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jouer pour de vrai les trois exercices de rythme (mesures silencieuses, métronome sur 2 et 4, contretemps) sur un cœur de temps musical neuf, avec une calibration qui ne dépend pas du geste du joueur et un stockage au modèle cible.

**Architecture:** Le temps musical (`domain/time/` : fractions de ronde, mètre, carte de tempo, figure, plan d’attentes, juge par alignement) est écrit au modèle cible, à côté des relations existantes qui ne changent pas. Un **nouveau contrôleur** (`PlanSessionController`) joue les exercices de plan par un `Transport` et un `SoundSchedulerPort` ; l’ancien `SessionController` et `MetronomePort` restent pour les exercices existants jusqu’à la migration (plan H). Le stockage passe une seule fois au modèle cible (Dexie 8, sauvegarde 4) ; les anciennes relations y écrivent leurs valeurs converties.

**Tech Stack:** TypeScript, Svelte 5 (runes), SvelteKit statique, Dexie 4, Vitest (node : `*.spec.ts` ; jsdom : `*.svelte.spec.ts`), Web Audio, VexFlow 5 (`vexflow/bravura`, police embarquée).

**Spec:** `docs/superpowers/specs/2026-10-14-temps-musical-et-sequences-design.md`. **Dépend du plan A** (`docs/superpowers/plans/2026-10-15-a-capteur-attaques.md`) : `AttackDetectorPort`, `WebAudioAttackDetector`, `attackSensor`, `FakeAttackDetector` doivent exister avant la Task 13.

## Global Constraints

- `npm test && npm run check` vert à chaque commit ; tests avant le code ; chaque test affirme (`expect.requireAssertions`).
- Positions et durées en **fractions exactes de ronde** (`Fraction`) ; aucune milliseconde dans `domain/time/` hors des fenêtres et des mesures.
- Le tempo s’écrit toujours avec son unité dans l’interface : « ♩ = 100 bpm ».
- Un seul nom par concept dans le code, l’interface, la doc et le langage : **niveau** / `level`.
- `domain/time/notation/lilypond.ts` n’est importé que par le catalogue (`domain/exercise/`) ; VexFlow seulement par `ui/notation/` ; le cœur (`application/session/`, hors `plan/`) ne nomme pas `rhythm-figure`.
- Le parseur LilyPond refuse `#` et `$` ; il n’évalue rien.
- `correct` n’est jamais lu pour calculer une réussite : la réussite est `success`.
- Constantes (spec §12), nommées et exportées là où elles servent : `MATCH_LIMIT = 1/16` (ronde), `SHIFT_MIN_MATCHES = 3`, `PASS_AFTER_CYCLES = 3`, `DROP_AFTER_FAILS = 2`, `CYCLES_PER_BREATH = 4`, `BREATH_MIN_MS = 4000`, `LISTEN_IN_BARS = 2`, `MARK_MIN_OFFSET_PX = 6`, `BLEED_CHECK_CLICKS = 8`, `CLICK_BLEED_RATIO = 0.2`, `RHYTHM_SERIES_MS = 300000`, `CALIBRATION_ATTACKS = 16`.
- Textes d’interface en français et en anglais (`defineMessages`), jamais sous 16 px.
- Commits : Conventional Commits en minuscules, impératif, orientés comportement ; terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **Un cycle sans aucune attaque** (le joueur n’a pas joué) : verdict raté pour `missed`, mesures absentes (pas `NaN`), aucune exception (Task 7).
- **Une calibration jamais faite, ou faite avant ce plan** (`latency` vide, ou migrée de `calibrationOffsetMs` avec la provenance `player`) : la série démarre, précision et placement ne jugent pas (Task 7, Task 16).
- **Quitter pendant la mesure comptée, une respiration ou une écoute** : aucun son programmé ne survit, aucune tentative à moitié écrite (Task 16).
- **Une sauvegarde v3 réelle** (exportée par la version actuelle) s’importe en v4 sans perte, et une base Dexie 7 réelle monte en 8 (Task 11).
- **Une figure de lecture plus longue que l’écran** (ligne de 4 mesures sur un téléphone en portrait) : la notation passe à la ligne ou se réduit, sans débordement horizontal (Task 18).

---

## File Structure

**Domaine (`src/lib/domain/time/`, pur)**
- `fraction.ts` — `Fraction`.
- `meter.ts` — `Meter`, `barLength`, `METER_4_4`.
- `tempoMap.ts` — `TempoSegment`, `TempoMap`, `createTempoMap`.
- `figure.ts` — `Figure`, `Voice`, `FigureElement`, `validateFigure`, `attackPositions`, `figureToJson`, `figureFromJson`.
- `notation/lilypond.ts` — `parseLilyPondRhythm`.
- `accompaniment.ts` — `Accompaniment`, `SoundId`, `clickAccompaniment`, `renderSounds`.
- `plan.ts` — `Expectation`, `RoundPolicy`, `RoundPlan`, `compileCyclePlan`, `validateRoundPlan`.
- `judge/align.ts` — `alignAttacks`.
- `judge/measures.ts` — `MeasureId`, `cycleMeasures`, `CycleReport`, `cycleVerdict`, `CycleVerdict`.
- `levels.ts` — `Level`, `LevelParams`, `resolveLevel`, `LevelState`, `nextLevelState`.
- `round.ts` — `PlanRound`, `RoundOutcome` (cible), `VerdictEnvelope`, `Aid`.
- `index.ts`.

**Domaine existant** : `src/lib/domain/types.ts` (Attempt cible, `ResponseVerdict`, `SessionKind`, `Settings.latency`, `RhythmSummary`), `src/lib/domain/mechanics/` (`MechanicIdentity`, `rhythmFigure.ts`), `src/lib/domain/exercise/` (`levels`, `rhythmCatalog.ts`), `src/lib/domain/progress/*`, `src/lib/domain/gesture/*`, `src/lib/domain/scoring/fatigue.ts`, `src/lib/domain/exercise/tempo.ts`.

**Application** : `src/lib/application/ports/SoundSchedulerPort.ts`, `TakeBufferPort.ts`, `repositories.ts` (+ `LevelStateRepositoryPort`), `CalibrationPort.ts` ; `src/lib/application/session/transport.ts` ; `src/lib/application/session/plan/PlanSessionController.svelte.ts`, `plan/recordCycle.ts`, `plan/rhythmPresenter.ts` ; `src/lib/application/session/contract.ts` (`listen?`, `replay?`) ; `src/lib/application/app.ts` (`startExercise`) ; `src/lib/application/services/createAppServices.ts`.

**Infrastructure** : `src/lib/infrastructure/audio/sounds/WebAudioSoundScheduler.ts`, `sounds/clickSound.ts` (extrait de `WebAudioMetronome`) ; `src/lib/infrastructure/audio/input/TakeBuffer.ts` ; `src/lib/infrastructure/audio/calibration/` (comparaison) ; `src/lib/infrastructure/storage/` (`db.ts` v8, `migrations/v8.ts`, `DexieLevelStateRepository.ts`, `validateBackup.ts` v4, contrats).

**Interface** : `src/lib/ui/notation/` (adaptateur VexFlow), `src/lib/ui/play/views/rhythmFigure.ts`, `RhythmFigureView.svelte`, `views/index.ts` ; `src/lib/ui/screens/calibration/` ; `src/lib/ui/screens/home/` (« Rythme ») ; `src/lib/ui/screens/summary/` ; `src/routes/session/+page.svelte` ; `src/routes/dev/two-inputs/` (jetable).

---

## Partie I — Le temps musical (pur)

### Task 1: `Fraction`

**Files:** Create `src/lib/domain/time/fraction.ts`, `fraction.spec.ts`

**Interfaces:**
- Produces:

```ts
export class Fraction {
	readonly n: number; readonly d: number;            // normalisée : pgcd 1, d > 0
	static of(n: number, d?: number): Fraction;        // d défaut 1 ; lève si d = 0 ou non entier
	static parse(text: string): Fraction;              // "3/8", "2", "-1/4" ; lève sinon
	static readonly ZERO: Fraction;
	add(o: Fraction): Fraction; sub(o: Fraction): Fraction;
	mul(o: Fraction): Fraction; div(o: Fraction): Fraction;
	compare(o: Fraction): -1 | 0 | 1; equals(o: Fraction): boolean;
	toNumber(): number; toString(): string;            // "3/8", "2"
	toJSON(): string;
}
```

- [ ] **Step 1: Tests** — `Fraction.of(6, 8).toString() === '3/4'` ; `Fraction.of(1, -4).toString() === '-1/4'` ; `of(1,8).add(of(1,12)).toString() === '5/24'` ; `of(1,4).div(of(1,12))` vaut `3` ; `parse('3/8').equals(of(3,8))` ; `parse('3/x')` lève ; `of(1,0)` lève ; `JSON.stringify({ at: of(1,3) }) === '{"at":"1/3"}'` ; `compare` ordonne `[3/8, 1/4, 1/2]` en `[1/4, 3/8, 1/2]`.
- [ ] **Step 2:** `npx vitest run src/lib/domain/time/fraction.spec.ts` → FAIL.
- [ ] **Step 3:** Implémenter (pgcd par Euclide, entiers sûrs ; lever `RangeError` hors `Number.isSafeInteger`).
- [ ] **Step 4:** Même commande → PASS.
- [ ] **Step 5:** `git commit -m "feat: add exact fractions for musical time"`

### Task 2: Mètre, carte de tempo, figure

**Files:** Create `src/lib/domain/time/meter.ts`, `tempoMap.ts`, `figure.ts` et leurs `.spec.ts`

**Interfaces:**
- Consumes: `Fraction` (Task 1).
- Produces:

```ts
// meter.ts
export interface Meter { count: number; unit: Fraction; grouping: number[] }
export const METER_4_4: Meter;                         // { 4, 1/4, [1,1,1,1] }
export function barLength(meter: Meter): Fraction;     // count × unit
export function beatPositions(meter: Meter): Fraction[]; // débuts des temps dans une mesure

// tempoMap.ts
export interface TempoSegment { at: Fraction; bpm: number; unit: Fraction; ramp?: 'linear' }
export interface TempoMap {
	readonly origin: number; readonly segments: readonly TempoSegment[];
	toSeconds(position: Fraction): number;
	toPosition(seconds: number): Fraction;             // arrondie au 1/3840 de ronde
	withSegment(segment: TempoSegment): TempoMap;      // ajoute un segment à partir de segment.at
}
export function createTempoMap(origin: number, segments: TempoSegment[]): TempoMap; // lève si vide ou non trié ; 'ramp' non géré : lève « not supported yet »

// figure.ts
export type FigureElement =
	| { kind: 'note'; duration: Fraction; tieToNext?: boolean; content: null }
	| { kind: 'rest'; duration: Fraction };
export interface Voice { id: string; elements: FigureElement[]; tuplets?: { from: number; to: number; ratio: [number, number] }[] }
export interface Figure { schema: 1; meter: Meter; bars: number; voices: Voice[] }
export function validateFigure(figure: Figure): string | null;   // null = valide
export function attackPositions(figure: Figure, voiceId?: string): Fraction[]; // notes non liées depuis la précédente
export function figureToJson(figure: Figure): unknown;
export function figureFromJson(value: unknown): Figure;          // lève avec un message lisible
```

- [ ] **Step 1: Tests**
  - `barLength(METER_4_4).equals(Fraction.of(1))` ; `beatPositions(METER_4_4)` = `0, 1/4, 1/2, 3/4`.
  - `createTempoMap(10, [{ at: 0, bpm: 120, unit: 1/4 }]).toSeconds(Fraction.of(1))` = `12` (une ronde = 4 noires à 0,5 s) ; `♩. = 60` : `toSeconds(3/8)` = `origin + 1`.
  - `withSegment({ at: 1, bpm: 60, unit: 1/4 })` : `toSeconds(5/4)` = `origin + 2 + 1`.
  - `toPosition(toSeconds(p))` rend `p` pour `p = 7/24`.
  - `validateFigure` : 8 croches en 4/4 sur 1 mesure → `null` ; 7 croches → message contenant `'bar 1'` ; triolet `{from:0,to:2,ratio:[3,2]}` avec trois `1/12` → `null`.
  - `attackPositions` de `c8 c8 r8 c8 r8 c8 r8 c8` (construite à la main) = `0, 1/8, 3/8, 5/8, 7/8` ; une note liée à la suivante ne crée pas d’attaque pour la suivante.
  - Aller-retour JSON : `figureFromJson(JSON.parse(JSON.stringify(figureToJson(f))))` égale `f` ; `figureFromJson({ schema: 2 })` lève `'schema'`.
- [ ] **Step 2:** `npx vitest run src/lib/domain/time` → FAIL.
- [ ] **Step 3:** Implémenter.
- [ ] **Step 4:** → PASS.
- [ ] **Step 5:** `git commit -m "feat: model meters, tempo maps and figures in exact time"`

### Task 3: Parseur LilyPond (sous-ensemble rythmique)

**Files:** Create `src/lib/domain/time/notation/lilypond.ts`, `lilypond.spec.ts`, `src/lib/domain/time/notation/boundaries.spec.ts`

**Interfaces:**
- Consumes: `Figure`, `METER_4_4`, `validateFigure` (Task 2).
- Produces: `parseLilyPondRhythm(text: string, options?: { meter?: Meter }): Figure` (une voix `'main'`, `bars` déduit, lève une `Error` dont le message cite la position fautive).

Grammaire acceptée : `c` suivi d’une durée (`1 2 4 8 16 32`) et de points ; durée omise = durée précédente (règle LilyPond) ; `r` + durée ; `~` (liaison) ; `\tuplet a/b { … }` ; `|` (contrôle de barre : la position doit être un multiple de la mesure, sinon erreur) ; espaces et retours libres. Tout autre caractère lève, en particulier `#`, `$`, `\` suivi d’autre chose que `tuplet`.

- [ ] **Step 1: Tests** — `'c8 c8 r8 c8 r8 c8 r8 c8'` → 1 mesure, 5 attaques aux positions de la Task 2 ; `'c8 c c c c c c c'` (durée reprise) → 8 attaques ; `'c4. c8 c2'` valide ; `'\\tuplet 3/2 { c8 c c } c4 c2'` → attaques `0, 1/12, 1/6, 1/4, 1/2` ; `'c4 c4 | c4'` lève (barre mal placée) ; `'c4 c4 c4'` lève (mesure incomplète) ; `'c4 #(display 1)'` lève avec `'#'` ; `'c4 $x'` lève ; `'c4~ c4 c2'` → attaques `0, 1/2` ; deux mesures `'c8 c r c r c r c | r c r c r c r c'` → `bars === 2`, 9 attaques.
- [ ] **Step 2: Test d’architecture** — `boundaries.spec.ts` lit récursivement `src/` (node `fs`) et vérifie que seuls des fichiers sous `src/lib/domain/time/notation/` et `src/lib/domain/exercise/` contiennent `time/notation/lilypond`.
- [ ] **Step 3:** `npx vitest run src/lib/domain/time/notation` → FAIL.
- [ ] **Step 4:** Implémenter (analyseur à jetons, sans `eval` ni expression régulière globale sur le texte entier).
- [ ] **Step 5:** → PASS.
- [ ] **Step 6:** `git commit -m "feat: write rhythm figures in a strict lilypond subset"`

### Task 4: Accompagnement et rendu des sons

**Files:** Create `src/lib/domain/time/accompaniment.ts`, `accompaniment.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–2.
- Produces:

```ts
export type SoundId = 'click-accent' | 'click' | 'demo' | 'play-along';
export interface Accompaniment { figure: Figure; bars: ('on' | 'off')[] }  // figure : une voix ; content des notes = SoundId (au lieu de null)
export function clickAccompaniment(input: { meter: Meter; beats: number[]; accent: number[]; bars: ('on' | 'off')[] }): Accompaniment; // beats en base 1
export interface ScheduledSound { time: number; sound: SoundId }
/** The sounds of bars [fromBar, toBar) (bar 0 = position 0), muted bars skipped, at the map’s times. */
export function renderSounds(accompaniment: Accompaniment, map: TempoMap, fromBar: number, toBar: number): ScheduledSound[];
/** A figure played as sounds (demo, play-along) over bars [fromBar, fromBar + figure.bars). */
export function renderFigure(figure: Figure, sound: SoundId, map: TempoMap, fromBar: number): ScheduledSound[];
```

`FigureElement` de type `'note'` voit son `content` typé `null | SoundId` (`figure.ts` : `content: null | SoundId` ; `validateFigure` n’y touche pas).

- [ ] **Step 1: Tests** — 4/4, `beats [1,2,3,4] accent [1]`, `bars ['on','on','on','off']`, carte ♩ = 120 bpm origine 0 : `renderSounds(…, 0, 4)` donne 12 sons, le premier `click-accent` à 0, `click` à 0,5, aucun dans la mesure 4 (de 6 à 8 s) ; `beats [2,4]` donne 2 sons par mesure à 0,5 et 1,5 ; `renderSounds(…, 4, 8)` reprend le cycle de mesures (la mesure 8 muette) ; `renderFigure` du contretemps à partir de la mesure 2 commence à 4 s.
- [ ] **Step 2:** FAIL. **Step 3:** Implémenter. **Step 4:** PASS.
- [ ] **Step 5:** `git commit -m "feat: describe accompaniments as figures and render them to timed sounds"`

### Task 5: Plan d’attentes

**Files:** Create `src/lib/domain/time/plan.ts`, `plan.spec.ts`, `src/lib/domain/time/paperPlans.spec.ts`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces:

```ts
export type ExpectationWindow = { ms: number } | { ofGap: Fraction };
export interface Expectation {
	at: Fraction; span: 'point' | { until: Fraction }; role: 'target' | 'judged-rest';
	sensor: string; content: unknown | null; window: ExpectationWindow;
	bar: number;                                   // mesure du cycle (0..), pour la tenue
}
export interface RoundPolicy { unit: 'response' | 'cycle'; firstAnswerOnly: boolean; lateCapture: boolean; provisional: boolean }
export interface RoundPlan { prompt: Fraction | null; expectations: Expectation[]; length: Fraction; policy: RoundPolicy; mutedBars: number[] }
export function validateRoundPlan(plan: RoundPlan): string | null;  // triées, dans [0, length), spans cohérents
/** The cycle of a looped figure over `cycleBars`, starting at bar `startBar` of the figure loop. */
export function compileCyclePlan(input: {
	figure: Figure; cycleBars: number; startBar: number; sensor: string;
	window: ExpectationWindow; accompanimentBars: ('on' | 'off')[];
}): RoundPlan;
```

- [ ] **Step 1: Tests (`plan.spec.ts`)** — contretemps 1 mesure, `cycleBars 4` → 20 attentes `target` ponctuelles, `sensor 'attack'`, `policy.unit 'cycle'`, `length` = 4 ; `startBar` 1 sur une figure de 2 mesures commence par la 2ᵉ mesure ; `mutedBars` reflète l’accompagnement tourné de `startBar` (3+1, `startBar` 3 → `mutedBars [0]`) ; `validateRoundPlan` refuse une attente hors longueur.
- [ ] **Step 2: Tests (`paperPlans.spec.ts`)** — construire à la main et valider (`validateRoundPlan` rend `null`) les plans de la spec §3 : `beat` (prompt `-2/4`, une attente `note` sur 0, `response`, `firstAnswerOnly`, `lateCapture`) ; `anchor` (deux attentes : `note` ponctuelle sur 0, `chord` étendue de `1/4` à `1`, `provisional`) ; `gridChange` (une attente `chord` par changement). Ce test prouve que le contrat porte les relations à migrer.
- [ ] **Step 3:** FAIL. **Step 4:** Implémenter. **Step 5:** PASS.
- [ ] **Step 6:** `git commit -m "feat: compile what the judge listens for into expectation plans"`

### Task 6: Alignement des attaques

**Files:** Create `src/lib/domain/time/judge/align.ts`, `align.spec.ts`

**Interfaces:**
- Consumes: `Expectation` (Task 5).
- Produces:

```ts
export const MATCH_LIMIT = Fraction.of(1, 16);    // en ronde
export const SHIFT_MIN_MATCHES = 3;
export interface TimedExpectation { index: number; time: number; zoneS: number; windowS: number; bar: number }
export type ExpectationVerdict = 'on-time' | 'early' | 'late' | 'missed';
export interface Alignment {
	pairs: { expectation: number; attack: number; offsetMs: number; verdict: Exclude<ExpectationVerdict, 'missed'> }[];
	missed: number[]; extra: number[];             // index d’attente, index d’attaque
	shift: { bar: number; byS: number } | null;
	clampedWindows: number;                        // fenêtres ramenées à la demi-distance
}
/** Expectations timed by the map: zone = min(half gaps to neighbours, MATCH_LIMIT), window = min(window, zone). */
export function timeExpectations(plan: RoundPlan, map: TempoMap, startPosition: Fraction): TimedExpectation[];
/** Monotone optimal alignment (dynamic programming): match cost |offset| / zone, insertion and deletion cost 1. */
export function alignAttacks(expectations: TimedExpectation[], attacks: number[]): Alignment;
```

Décalage : après l’alignement, pour chaque mesure `b` du cycle (dans l’ordre), réaligner les attaques à partir de `b` sur les attentes décalées de `±` un temps puis `±` la plus petite subdivision de la figure ; si un décalage gagne au moins `SHIFT_MIN_MATCHES` appariements sur l’alignement d’origine pour la même portion, garder le premier `b` et ce décalage, et rendre l’alignement décalé pour la suite (les attentes non jouées du fait du décalage ne sont pas comptées manquées).

- [ ] **Step 1: Tests** (♩ = 100 bpm, 8 croches, attaques construites)
  - attaques exactes → 8 paires `on-time`, `missed []`, `extra []` ;
  - toutes en avance de 30 ms, fenêtre 20 ms → 8 paires `early`, `offsetMs ≈ -30` ;
  - une croche absente → `missed [3]` ; une attaque en plus au milieu d’un silence → `extra [k]` ;
  - toutes les attaques après la mesure 2 décalées d’un temps (temps perdu) → `shift { bar: 2, byS: 0.6 }`, pas de liste de manquées pour la suite ;
  - doubles croches à ♩ = 160 bpm avec fenêtre 80 ms → `clampedWindows > 0` et fenêtres ≤ demi-écart ;
  - aucune attaque → toutes manquées, `pairs []`.
- [ ] **Step 2:** FAIL. **Step 3:** Implémenter. **Step 4:** PASS.
- [ ] **Step 5:** `git commit -m "feat: align attacks to expectations and tell a lost beat from scattered misses"`

### Task 7: Mesures, verdict et rapport du cycle

**Files:** Create `src/lib/domain/time/judge/measures.ts`, `measures.spec.ts`

**Interfaces:**
- Consumes: `Alignment`, `TimedExpectation` (Task 6).
- Produces:

```ts
export type MeasureId = 'fidelity' | 'placement' | 'precision' | 'regularity' | 'holdOffset' | 'holdDrift';
export type MeasureUnit = 'ms' | 'ms/bar' | 'ratio';
export type Measures = Partial<Record<MeasureId, { value: number; unit: MeasureUnit }>>;
export type LatencyProvenance = 'system' | 'player';
export interface CycleReport {
	expectations: { index: number; verdict: ExpectationVerdict; offsetMs: number | null }[];
	extra: number; shift: Alignment['shift']; measures: Measures;
	latency: { ms: number; provenance: LatencyProvenance } | null;
}
export type CycleFailure = 'missed' | 'extra' | 'shift' | 'precision' | 'regularity' | 'hold';
export type CycleVerdict = { passed: true } | { passed: false; reasons: CycleFailure[] };
export function cycleReport(input: { alignment: Alignment; expectations: TimedExpectation[]; mutedBars: number[]; latency: CycleReport['latency'] }): CycleReport;
export function cycleVerdict(report: CycleReport, thresholds: Partial<Record<'precision' | 'regularity' | 'holdOffset' | 'holdDrift', number>>): CycleVerdict;
```

Calculs (spec §4) : `fidelity` = appariées / attendues ; `placement` = moyenne signée ; `precision` = moyenne des |écarts| ; `regularity` = écart-type ; `holdOffset` = moyenne (mesures muettes) − moyenne (mesures avec clic) ; `holdDrift` = pente (moindres carrés) des écarts en fonction du numéro de mesure pendant les mesures muettes. Une mesure sans données est **absente** (jamais `NaN`). `cycleVerdict` : `missed` si une attente manque, `extra` si une attaque est ajoutée, `shift` si décalage, `regularity` et `hold` (offset ou drift en valeur absolue) contre leurs seuils ; `precision` **seulement si `latency.provenance === 'system'`**.

- [ ] **Step 1: Tests** — régulier et exact → `{ passed: true }`, `regularity.value ≈ 0` ; alterné ±40 ms → `placement ≈ 0`, `precision ≈ 40` ; latence `player` et précision 70 ms (seuil 60) → réussi ; même cycle en latence `system` → raté `['precision']` ; mesures muettes en avance de 35 ms → `holdOffset ≈ -35` ; dérive de −5 ms par mesure pendant 3 mesures muettes → `holdDrift ≈ -5` ; sans mesure muette → `holdOffset` et `holdDrift` absents ; aucune attaque → raté `['missed']`, `measures` sans `placement`, aucun `NaN` (`JSON.stringify` ne contient pas `null` pour une mesure).
- [ ] **Step 2:** FAIL. **Step 3:** Implémenter. **Step 4:** PASS.
- [ ] **Step 5:** `git commit -m "feat: measure placement, precision, regularity and hold of a cycle"`

### Task 8: Niveaux

**Files:** Create `src/lib/domain/time/levels.ts`, `levels.spec.ts`

**Interfaces:**
- Consumes: `Accompaniment`, `TempoSegment`, `ExpectationWindow`.
- Produces:

```ts
export const PASS_AFTER_CYCLES = 3; export const DROP_AFTER_FAILS = 2; export const CYCLES_PER_BREATH = 4;
export type Feedback = 'every-cycle' | 'summary' | 'out-of-tolerance';
export interface LevelParams {
	accompaniment: Accompaniment; cycleBars: number; tempo: TempoSegment; window: ExpectationWindow;
	feedback: Feedback; listen: 'free' | 'aid' | 'none'; cursor: boolean; cyclesPerBreath: number;
	thresholds: Partial<Record<'precision' | 'regularity' | 'holdOffset' | 'holdDrift', number>>;
}
export interface Level { params: Partial<LevelParams>; pass?: { successes: number }; drop?: { failures: number }; aid?: true }
/** Level `index` (0 = first level, aid levels before it have negative indexes) over the exercise's base params. */
export function resolveLevel(base: LevelParams, levels: readonly Level[], index: number): LevelParams;
export function levelRange(levels: readonly Level[]): { lowest: number; first: 0; highest: number };
export interface LevelState { exerciseId: string; scope: string; item: string; level: number; successes: number; failures: number; resumeAfter: number | null }
export function nextLevelState(state: LevelState, levels: readonly Level[], cycle: { success: boolean; aided: boolean }): { state: LevelState; changed: 'up' | 'down' | null };
```

Numérotation affichée : le niveau d’index `i ≥ 0` s’affiche « niveau i + 1 sur N » ; les niveaux d’aide (`aid: true`, placés en tête de `levels`) ont des index négatifs (−1 le plus proche du niveau 1). Un cycle aidé ne compte ni pour monter ni pour descendre (il remet seulement `successes` à 0). Monter : `successes` atteint `pass.successes ?? PASS_AFTER_CYCLES` (sans dépasser `highest`) ; descendre : `failures` atteint `drop.failures ?? DROP_AFTER_FAILS` (sans descendre sous `0` : les niveaux d’aide ne sont pas atteints par descente, c’est l’anti-blocage du plan 2 qui y mène).

- [ ] **Step 1: Tests** — 3 réussites d’affilée → `up` ; 2 réussites puis 1 échec puis 3 réussites → `up` une fois, au bon moment ; 2 échecs d’affilée → `down` ; au niveau 0, 2 échecs → reste 0, `changed null` ; au plus haut, 3 réussites → reste ; cycle aidé réussi → ni monter ni compter ; `resolveLevel` superpose `params` sur `base` (seuils fusionnés champ par champ).
- [ ] **Step 2:** FAIL. **Step 3:** Implémenter. **Step 4:** PASS.
- [ ] **Step 5:** `git commit -m "feat: move an exercise up and down its levels from cycle results"`

### Task 9: Le tour d’un plan et le résultat cible

**Files:** Create `src/lib/domain/time/round.ts`, `round.spec.ts`, `src/lib/domain/time/index.ts`

**Interfaces:**
- Consumes: Tasks 5–7.
- Produces:

```ts
export type Aid = 'show-position' | 'string-aid' | 'cursor' | 'listen' | 'play-along' | 'aid-level';
export interface VerdictEnvelope { relation: string; version: number; value: unknown }
export interface RoundOutcome {
	success: boolean; correct: boolean | null; verdict: VerdictEnvelope;
	measures: Measures; aids: Aid[]; detail: unknown;
}
// `RoundOutcome` porte le même nom que l’ancien de `domain/timing/types.ts`, qui disparaît au plan H : importer celui-ci depuis `$lib/domain/time`.
export interface PlanObservation { time: number; sensor: string; readable: boolean; payload: unknown }
export class PlanRound {
	constructor(input: { plan: RoundPlan; map: TempoMap; start: Fraction; latency: CycleReport['latency']; thresholds: LevelParams['thresholds']; aids: Aid[] });
	readonly startTime: number; readonly endTime: number;   // secondes audio
	/** Keeps a readable observation of an expected sensor; returns its fate. */
	observe(observation: PlanObservation): 'answer' | 'other-sensor' | 'unreadable' | 'after-capture';
	/** Settles the cycle: the alignment of what it kept. */
	settle(): RoundOutcome;                                  // verdict { relation: 'cycle', version: 1, value: CycleVerdict }, correct null, detail CycleReport
}
```

Une observation dont `time < startTime` ou `time ≥ endTime` rend `'after-capture'` (elle appartient au cycle voisin : le contrôleur la donne au bon tour).

- [ ] **Step 1: Tests** — un cycle de contretemps à ♩ = 100 bpm, attaques exactes observées → `settle().success === true`, `correct === null`, `verdict.relation === 'cycle'` ; une observation `note` sur un plan `attack` → `'other-sensor'` et ignorée ; une illisible → `'unreadable'` ; aides transmises telles quelles.
- [ ] **Step 2:** FAIL. **Step 3:** Implémenter. **Step 4:** PASS.
- [ ] **Step 5:** `git commit -m "feat: judge a whole cycle as one round on the target contract"`

---

## Partie II — Le stockage au modèle cible

### Task 10: La tentative cible et ses lecteurs

**Files:**
- Modify: `src/lib/domain/types.ts`, `src/lib/domain/progress/{grade,success,learnSelector,cards,stats,triadSelector,gestureSelector}.ts`, `src/lib/domain/gesture/{summary,passages}.ts`, `src/lib/domain/exercise/tempo.ts`, `src/lib/domain/scoring/fatigue.ts`, `src/lib/application/session/AttemptRecorder.ts`, `src/lib/infrastructure/storage/testing/fixtures.ts`, et tout fichier qui importe `Verdict`/`VERDICTS` (renommage)
- Test: les `.spec.ts` existants de ces fichiers ; `src/lib/domain/types.spec.ts` (créer s’il n’existe pas) ; `src/lib/domain/successBoundary.spec.ts`

**Interfaces:**
- Consumes: `VerdictEnvelope`, `Aid`, `Measures` (Task 9).
- Produces (dans `domain/types.ts`) :

```ts
export type ResponseVerdict = 'perfect' | 'early' | 'late' | 'offbeat' | 'corrected' | 'wrong'; // ex-Verdict, renommé partout
export const RESPONSE_VERDICTS: readonly ResponseVerdict[];                                   // ex-VERDICTS
export const RESPONSE_RELATIONS: readonly string[] = ['beat', 'free', 'anchor', 'grid-change'];
export interface Attempt<D = unknown> {
	// … champs existants, sauf :
	aids: Aid[];                          // remplace aid: AidLevel
	correct: boolean | null;
	success: boolean;
	verdict: VerdictEnvelope;
	measures: Measures;                   // {} pour les relations à une réponse
	plan: unknown | null;                 // plan résolu du tour (null avant ce plan et pour les relations à une réponse)
}
/** The response verdict of an attempt of a response relation, else null. */
export function responseVerdictOf(attempt: Pick<Attempt, 'verdict'>): ResponseVerdict | null;
/** For the recorder until the migration: success of a response round. */
export function isResponseSuccess(outcome: { correct: boolean; verdict: ResponseVerdict }): boolean; // ex-isSuccess
```

`AidLevel` reste le type de l’aide **planifiée** (`PlannedItem.aid`) ; l’enregistreur la traduit : `'show-position'` → `['show-position']`, `stringAid` → `'string-aid'`.

- [ ] **Step 1: Renommer** `Verdict` → `ResponseVerdict` et `VERDICTS` → `RESPONSE_VERDICTS` dans tout `src/` (`grep -rln "\bVerdict\b\|VERDICTS" src`), `isSuccess` → `isResponseSuccess` là où il juge un `RoundOutcome` ancien (l’enregistreur, `SessionController`).
- [ ] **Step 2: Tests** — `responseVerdictOf({ verdict: { relation: 'beat', version: 1, value: 'offbeat' } }) === 'offbeat'` ; `… relation: 'cycle' …` → `null` ; l’enregistreur (spec existant d’`AttemptRecorder`) écrit `success`, `aids`, `verdict.relation === timing.id`, `measures {}`, `plan null` ; `successBoundary.spec.ts` lit `src/lib/domain/**` et vérifie qu’aucun fichier hors `types.ts` n’appelle `isResponseSuccess` ni ne lit `.correct` pour décider une réussite (heuristique : pas de `isResponseSuccess` hors `types.ts` et `application/session/`).
- [ ] **Step 3:** Remplacer dans les lecteurs : `isSuccess(attempt)` → `attempt.success` ; `attempt.verdict === X` → `responseVerdictOf(attempt) === X` ; `attempt.correct` (booléen attendu) → `attempt.correct === true` ; `attempt.aid` → `attempt.aids`.
- [ ] **Step 4:** `npm test && npm run check` → PASS, 0 erreur.
- [ ] **Step 5:** `git commit -m "refactor: store success, a typed verdict envelope and aids on every attempt"`

### Task 11: Dexie 8, chaîne de migration, sauvegarde 4, niveaux et latences

**Files:**
- Create: `src/lib/infrastructure/storage/migrations/v8.ts`, `v8.spec.ts`, `src/lib/infrastructure/storage/DexieLevelStateRepository.ts` (+ `.spec.ts`), `src/lib/infrastructure/storage/testing/levelStateRepositoryContract.ts`, `src/lib/infrastructure/storage/fixtures/backup-v3.json` (exporté de l’application actuelle avant ce plan, anonymisé si besoin)
- Modify: `db.ts`, `validateBackup.ts`, `DexieBackup.ts`, `index.ts`, `src/lib/domain/types.ts` (`Settings.latency`, `BackupFile` v4), `src/lib/application/ports/repositories.ts`, `src/lib/testing/fakes.ts` (`InMemoryLevelStateRepository`), `src/lib/infrastructure/storage/testing/settingsRepositoryContract.ts`, `src/lib/application/session/SessionController.svelte.ts` (lecture de la latence), `src/lib/ui/screens/settings/SettingsScreen.svelte`, `src/lib/ui/screens/calibration/CalibrationScreen.svelte` (écriture)

**Interfaces:**
- Produces:

```ts
// domain/types.ts
export interface SensorLatency { ms: number; provenance: 'system' | 'player' }
export interface Settings { /* … */ latency: Partial<Record<string, SensorLatency>>; clickBleed: boolean } // remplace calibrationOffsetMs
// repositories.ts
export interface LevelStateRepositoryPort {
	get(key: { exerciseId: string; scope: string; item: string }): Promise<LevelState | undefined>;
	put(state: LevelState): Promise<void>;
	all(): Promise<LevelState[]>;
}
// migrations/v8.ts (fonctions pures, partagées par Dexie et l’import)
export function attemptToV8(row: Record<string, unknown>, relationOf: (mechanic: string) => string): Record<string, unknown>;
export function settingsToV8(row: Record<string, unknown>): Record<string, unknown>;
export function backupV3ToV4(file: Record<string, unknown>, relationOf: (mechanic: string) => string): Record<string, unknown>;
```

`attemptToV8` : `success = correct && verdict !== 'offbeat'` ; `verdict = { relation: relationOf(mechanic), version: 1, value: verdict }` ; `aids = aid === 'show-position' ? ['show-position'] : []` puis suppression de `aid` ; `measures = {}` ; `plan = null`. `settingsToV8` : `calibrationOffsetMs: x` (non nul) → `latency: { note: { ms: x, provenance: 'player' }, chord: { ms: x, provenance: 'player' } }`, `clickBleed: false`, suppression de `calibrationOffsetMs`. `relationOf` = `mechanicRules[mechanic].timing.id` (via le registre). Dexie 8 : table `levelStates: '[exerciseId+scope+item]'`, mise à niveau des tentatives et des réglages par ces fonctions. Sauvegarde : `version: 4`, champ `levelStates` ; `validateBackup` passe v1 → v2 → v3 → v4 par la même chaîne (`backupV3ToV4`) puis `validateBackupV4`. `SessionController` lit `settings.latency.note?.ms ?? null`.

- [ ] **Step 1: Tests** — `v8.spec.ts` : chaque conversion ci-dessus sur des lignes représentatives (locate offbeat → `success false`, identify late → `success true`, chord-grid `relation 'grid-change'`) ; base Dexie 7 réelle (créée par l’ancien schéma avec `fake-indexeddb`, une tentative et des réglages) → ouverte en 8, lignes converties ; `backup-v3.json` → `validateBackup` rend une v4 dont les tentatives ont `success` et `verdict.relation` ; les suites de contrat existantes passent avec les nouveaux champs ; `levelStateRepositoryContract` (get/put/all, clé à trois parties, portée et item vides) pour Dexie et en mémoire ; un export puis un import rendent les mêmes `levelStates`.
- [ ] **Step 2:** FAIL. **Step 3:** Implémenter. **Step 4:** `npm test && npm run check` → PASS.
- [ ] **Step 5:** `git commit -m "feat: move storage to its target model with one migration chain for the database and backups"`

---

## Partie III — Les sons, le transport, la calibration

### Task 12: L’ordonnanceur de sons

**Files:**
- Create: `src/lib/application/ports/SoundSchedulerPort.ts`, `src/lib/infrastructure/audio/sounds/clickSound.ts`, `src/lib/infrastructure/audio/sounds/WebAudioSoundScheduler.ts` (+ `.spec.ts`), `src/lib/infrastructure/audio/sounds/index.ts`
- Modify: `src/lib/infrastructure/audio/clock/WebAudioMetronome.ts` (utilise `clickSound.ts`), `src/lib/testing/fakes.ts` (+ `FakeSoundScheduler`), `src/lib/application/ports/index.ts`

**Interfaces:**
- Consumes: `SoundId`, `ScheduledSound` (Task 4).
- Produces:

```ts
export interface SoundSchedulerPort {
	play(time: number, sound: SoundId): void;
	at(time: number, callback: () => void): () => void;   // jamais en avance, au plus DEFAULT_LOOKAHEAD_MS en retard
	cancelAll(): void;                                     // annule sons à venir et réveils
	emitted(): readonly ScheduledSound[];                  // journal des sons programmés depuis le dernier cancelAll
}
export class FakeSoundScheduler implements SoundSchedulerPort {
	constructor(clock: FakeClock);
	/** Runs the wake-ups due up to `clock.now()`, earliest first. */
	flush(): void;
}
```

Timbres : `click-accent` et `click` = ceux du métronome actuel (bruit filtré, `DOWNBEAT_CLICK`, `BEAT_CLICK`) ; `demo` = bruit filtré à 800 Hz, gain 0,8, 60 ms ; `play-along` = même filtre que `demo`, gain 0,5. Tous sans hauteur.

- [ ] **Step 1: Tests** — `FakeSoundScheduler` : `play` journalise ; `at` réveille dans l’ordre des temps à `flush` ; `cancelAll` vide réveils et journal ; adaptateur (contexte audio factice comme dans `WebAudioMetronome.spec.ts`) : un `play` crée une source démarrée au temps demandé ; un son dont le temps est passé n’est pas programmé.
- [ ] **Step 2:** FAIL. **Step 3:** Implémenter. **Step 4:** PASS (et les tests du métronome restent verts).
- [ ] **Step 5:** `git commit -m "feat: schedule any pitchless sound at an exact audio time and keep a log of them"`

### Task 13: Le transport

**Files:** Create `src/lib/application/session/transport.ts`, `transport.spec.ts`

**Interfaces:**
- Consumes: `SoundSchedulerPort` (Task 12), `AudioClockPort`, Tasks 1–4, `LISTEN_IN_BARS`.
- Produces:

```ts
export const LISTEN_IN_BARS = 2; export const BREATH_MIN_MS = 4000;
export class Transport {
	constructor(deps: { clock: AudioClockPort; sounds: SoundSchedulerPort });
	/** Waits for clock.settle(), then plays LISTEN_IN_BARS bars of `accompaniment` and a counted bar; bar 0 of play follows. */
	begin(input: { meter: Meter; tempo: TempoSegment; accompaniment: Accompaniment }): Promise<{ map: TempoMap; playFrom: number /* bar */ }>;
	/** Schedules the accompaniment of bars [from, to) on the current map. */
	accompany(from: number, to: number, accompaniment: Accompaniment): void;
	/** A breath of at least BREATH_MIN_MS, whole bars, clicks on every beat, the last one counted; returns its bars. */
	breath(atBar: number): { from: number; to: number };
	/** A new tempo from `atBar` (after a breath): listen-in and counted bar at the new tempo; play resumes at the returned bar. */
	changeTempo(atBar: number, tempo: TempoSegment, accompaniment: Accompaniment): { playFrom: number };
	playFigure(figure: Figure, sound: 'demo' | 'play-along', fromBar: number): void;
	at(bar: Fraction, callback: () => void): () => void;
	countdownAt(bar: number): number | null;            // 4..1 pendant une mesure comptée, sinon null
	readonly map: TempoMap;
	stop(): void;                                        // cancelAll
}
```

- [ ] **Step 1: Tests** (`FakeClock`, `FakeSoundScheduler`) — `begin` à ♩ = 100 bpm : 2 mesures d’écoute avec les sons de l’accompagnement, puis une mesure comptée (4 clics, accent sur le 1), `playFrom` = 3, `countdownAt(2)` = 4 au premier temps de la mesure comptée ; la carte part d’au moins `clock.now() + 0.1` ; `breath` à ♩ = 120 bpm dure 2 mesures (4 s), la dernière comptée ; `changeTempo` crée un segment et place l’écoute et le compte au nouveau tempo ; `stop` annule tout (plus aucun son après `flush`).
- [ ] **Step 2:** FAIL. **Step 3:** Implémenter. **Step 4:** PASS.
- [ ] **Step 5:** `git commit -m "feat: drive listen-in, counted bars, breaths and tempo changes from one transport"`

### Task 14: Essai jetable — deux entrées en même temps

**Files:** Create `src/routes/dev/two-inputs/+page.svelte` (jetable)

**But :** savoir si Chrome ouvre l’interface audio et le micro du Mac **en même temps** dans un seul `AudioContext`, et si le micro entend l’attaque d’une électrique débranchée à moins d’un mètre.

- [ ] **Step 1:** Page de développement (sous `/dev`, déjà gardée par `requireDev`) : deux listes d’entrées (`enumerateDevices`), un bouton « Ouvrir les deux », deux `WebAudioInput` (sans journal) sur le même contexte, un `WebAudioAttackDetector` par entrée, et pour chaque entrée : niveau en direct et la liste des 10 dernières attaques (temps audio). En bas : les écarts `t_interface − t_micro` des attaques appariées à ±50 ms, leur médiane et leur dispersion.
- [ ] **Step 2: Vérification manuelle par l’auteur** — Chrome, son interface et le micro du Mac : les deux niveaux bougent en même temps ; 16 attaques jouées donnent 16 paires ; dispersion des écarts sous 3 ms.
- [ ] **Step 3:** Noter le résultat (oui / non, médiane, dispersion, navigateur) dans la spec, section « Réalisation » (à créer en fin de spec). Si l’essai échoue, la Task 15 ne fait que la phase d’écoute et garde la calibration jouée (provenance `player`).
- [ ] **Step 4:** Supprimer la page (`git rm`), puis `git commit -m "docs: record whether two audio inputs open together"`.

### Task 15: La calibration par comparaison

**Files:**
- Create: `src/lib/infrastructure/audio/calibration/compare.ts`, `compare.spec.ts`
- Modify: `src/lib/application/ports/CalibrationPort.ts`, `src/lib/infrastructure/audio/calibration/CalibrationService.ts` (+ `.spec.ts`), `src/lib/infrastructure/audio/input/WebAudioInput.ts` (exporter `isBuiltInMicLabel`), `src/lib/composition/createApp.ts`, `src/lib/ui/screens/calibration/CalibrationScreen.svelte`, `messages.ts`, `fakeServices.ts`

**Interfaces:**
- Consumes: `AttackDetectorPort` (plan A), `SoundSchedulerPort` (Task 12), résultat de la Task 14.
- Produces:

```ts
export const BLEED_CHECK_CLICKS = 8; export const CLICK_BLEED_RATIO = 0.2; export const CALIBRATION_ATTACKS = 16;
// compare.ts (pur)
/** Clicks heard by a silent input: median delay and the share of clicks heard (bleed). */
export function loopLatency(clickTimes: number[], heard: number[], withinS: number): { ms: number | null; heardRatio: number };
/** Pairs the same attacks on two inputs: median and spread of (a − b), in ms. */
export function pairedDelay(a: number[], b: number[], withinS: number): { ms: number; spreadMs: number; pairs: number } | null;
// CalibrationPort.ts
export type CalibrationPhase = 'listen' | 'compare' | 'play';
export interface CalibrationProgress { phase: CalibrationPhase; done: number; needed: number }
export type CalibrationOutcome =
	| { ok: true; latency: Record<string, SensorLatency>; clickBleed: boolean }
	| { ok: false; reason: 'no-sound' | 'inconsistent' | 'cancelled' | 'second-input' };
```

Déroulé (`CalibrationService.run`) :
1. **Écoute** (`listen`) : `BLEED_CHECK_CLICKS` clics (♩ = 80 bpm) sur la sortie ; le capteur d’attaques de l’**entrée de jeu** écoute. Si l’entrée de jeu est le micro intégré : `loopLatency` donne `R` et `clickBleed = heardRatio ≥ CLICK_BLEED_RATIO`, puis latence `attack` = `R` (`system`) et on passe au 3 pour la note. Sinon (interface) : `clickBleed` est mesuré de même sur l’interface, et la même phase écoute aussi le **micro de l’appareil** (deuxième `WebAudioInput`, appareil choisi par `isBuiltInMicLabel`) pour `R_micro`.
2. **Comparaison** (`compare`, interface seulement, si l’essai de la Task 14 a réussi) : le guitariste joue `CALIBRATION_ATTACKS` notes, librement ; `pairedDelay(interface, micro)` ; `attack` = `R_micro + médiane + d` (`d` = 0, distance non demandée), provenance `system`.
3. **Note et accord** : pendant la même phase (ou pendant la phase jouée du repli), `pairedDelay(note, attack)` sur l’entrée de jeu donne le retard propre du détecteur de notes ; `note` = `chord` = `attack` + ce retard, même provenance que `attack`.
4. **Repli** (`play`) : si la deuxième entrée ne s’ouvre pas ou n’entend rien, l’ancienne calibration jouée sur le clic, provenance `player` pour toutes les entrées.

L’écran guide chaque phase (fr/en) : « Ne joue pas. Si tu joues au casque, pose-le contre le micro de l’ordinateur. » ; « Joue 16 notes, comme tu veux, sans retour par les haut-parleurs. » ; il écrit `latency` et `clickBleed` dans les réglages.

- [ ] **Step 1: Tests** — `loopLatency` : clics à 0, 0,75, 1,5… entendus 12 ms après, 7 sur 8 → `ms 12`, `heardRatio 0.875` ; rien entendu → `ms null`, `0` ; `pairedDelay` : deux listes décalées de 8 ms (±1 ms de bruit) → `ms ≈ 8`, `spreadMs ≤ 1` ; aucune paire → `null`. Service (faux ordonnanceur, deux `FakeAttackDetector`, `FakeNoteDetector`) : interface + micro → `latency.attack.provenance === 'system'`, `attack.ms === R_micro + écart` ; deuxième entrée absente → repli, toutes `player` ; micro intégré seul → `attack` = `R`.
- [ ] **Step 2:** FAIL. **Step 3:** Implémenter. **Step 4:** `npm test && npm run check` → PASS.
- [ ] **Step 5:** `git commit -m "feat: calibrate the interface against the computer mic so the player's habit stays out of latency"`

---

## Partie IV — Le rythme jouable

### Task 16: Mécanique, exercices et contrôleur de plan

**Files:**
- Create: `src/lib/domain/mechanics/rhythmFigure.ts` (+ `.spec.ts`), `src/lib/domain/exercise/rhythmCatalog.ts` (+ `.spec.ts`), `src/lib/application/session/plan/PlanSessionController.svelte.ts` (+ `.svelte.spec.ts`), `src/lib/application/session/plan/recordCycle.ts`, `src/lib/application/session/plan/rhythmStage.ts`
- Modify: `src/lib/domain/mechanics/types.ts` (`MechanicIdentity`), `src/lib/domain/mechanics/index.ts` (registre), `src/lib/domain/exercise/types.ts` (`levels?`, `base?`), `src/lib/domain/exercise/catalog.ts` (`EXERCISES` inclut les trois), `src/lib/domain/types.ts` (`SessionKind` + `'exercise'`, `SessionRecord.exerciseId?`), `src/lib/application/session/contract.ts` (`listen?`, `replay?`, `audioError: 'input' | 'bleed' | null`), `src/lib/application/app.ts` (`startExercise`), `src/lib/application/services/createAppServices.ts`, `src/lib/application/session/SessionDeps.ts` (+ `sounds`, `levels`, `takes`), `src/lib/application/session/sessionKindFromQuery.ts`, `src/lib/composition/createApp.ts`, `src/lib/infrastructure/storage/validateBackup.ts` (session `'exercise'`)

**Interfaces:**
- Consumes: Parties I–III ; `attackSensor` (plan A) ; `ObservationSpan` (existant) ; `LevelStateRepositoryPort` (Task 11).
- Produces:

```ts
// mechanics/types.ts
export interface MechanicIdentity<I = unknown> { id: MechanicId; learner: 'memory' | 'skill'; itemKey(item: I): string; parseItem(key: string): I }
export interface MechanicRules<I, O, A, C> extends MechanicIdentity<I> { /* inchangé */ }
// registre : Record<MechanicId, MechanicIdentity> (la migration lit `timing.id` quand il existe)

// rhythmFigure.ts
export interface RhythmItem { figureId: string; level: number }
export const rhythmFigureRules: MechanicIdentity<RhythmItem>;        // id 'rhythm-figure', learner 'skill', clé `${figureId}@${level}`

// exercise/types.ts
export interface ExerciseDefinition { /* … */ levels?: readonly Level[]; base?: LevelParams; figures?: readonly { id: string; figure: Figure }[]; pick?: 'loop' | 'next' }
// rhythmCatalog.ts
export const RHYTHM_SILENT_BARS: ExerciseDefinition;  // 'rhythm-silent-bars'
export const RHYTHM_TWO_FOUR: ExerciseDefinition;     // 'rhythm-two-four'
export const RHYTHM_OFFBEATS: ExerciseDefinition;     // 'rhythm-offbeats'

// contract.ts (PlaySessionController)
listen?(): void;            // « Écouter la figure »
replay?(): Promise<void>;   // « Réécouter » (Task 17)

// app.ts
startExercise(exerciseId: ExerciseId): Promise<PlaySessionController>;

// PlanSessionController
export class PlanSessionController implements PlaySessionController {
	constructor(session: { id: string; exerciseId: ExerciseId }, deps: SessionDeps & { sounds: SoundSchedulerPort; levels: LevelStateRepositoryPort; takes?: TakeBufferPort });
}
// rhythmStage.ts : le modèle d’écran (opaque au cœur)
export interface RhythmStageModel {
	phase: 'listen-in' | 'count-in' | 'play' | 'listening' | 'breath';
	exerciseLabel: string; level: { shown: number; of: number; aid: boolean };
	tempo: { bpm: number; unit: string };       // « ♩ = 100 bpm »
	figure: Figure; next: Figure | null;         // la figure jouée et, à la respiration, celle à jouer
	barInCycle: number; cycleBars: number; muted: boolean;
	cursor: Fraction | null;                     // position dans la figure, null si le niveau n’en donne pas ou si la mesure est muette
	feedback: Feedback; settled: { report: CycleReport; verdict: CycleVerdict }[]; // les cycles de la suite, à la respiration
	announcement: 'level-up' | 'level-down' | null; listen: 'free' | 'aid' | 'none';
}
```

**Contenu des trois exercices** (figures écrites avec `parseLilyPondRhythm`, stockées en JSON ; consignes `howTo` fr/en écrites par nous) — base commune : 4/4, capteur `attack`, fenêtre `{ ms: 80 }`, `feedback 'every-cycle'`, `cursor true`, `cyclesPerBreath 4`, seuils `{ regularity: 40, holdOffset: 60, holdDrift: 25, precision: 60 }`.

| Exercice | Figures | `pick` | Niveaux (`params` surchargés, du premier au dernier) |
|---|---|---|---|
| `rhythm-silent-bars` | `c8 c c c c c c c` | `loop` | aide : `bars [on,on,on,on]` ; 1 : `[on,on,on,off]` ♩ = 80 ; 2 : `[on,on,off,off]` ; 3 : `[on,off,off,off]` ; 4 : 3+1 ♩ = 65, `cursor false`, `{ ms: 50 }` ; 5 : 2+2 ♩ = 65, `feedback 'summary'` ; 6 : 1+3 ♩ = 65, `{ ms: 30 }`, `feedback 'out-of-tolerance'`, seuils `{ regularity: 20, holdOffset: 25, holdDrift: 10, precision: 30 }` ; `cycleBars 4` |
| `rhythm-two-four` | 6 lignes de 4 mesures (noires, croches, blanches), écrites dans le catalogue | `next` | clic `beats [2,4] accent []` ; `cyclesPerBreath 1`, `cycleBars 4`, `listen 'aid'` ; aide : clic sur chaque temps ; 1 : ♩ = 100 bpm ; 2 : ♩ = 120 bpm ; 3 : ♩ = 140 bpm, `cursor false` |
| `rhythm-offbeats` | une mesure `c8 c r c r c r c` ; deux mesures `c8 c r c r c r c \| r c r c r c r c` | `loop` | aide : ♩ − 10 bpm ; 1 : une mesure, ♩ = 80 bpm, seuils larges `{ regularity: 80, holdOffset: 200, holdDrift: 100 }` (fidélité seule, critère « sans ajout ni suppression de temps ») ; 2 : deux mesures, `cycleBars 2` ; 3 : ♩ = 90 bpm ; 4 : ♩ = 100 bpm, `cursor false` |

**Déroulé du contrôleur** (spec §6, §7) :
1. `ready()` : lit l’exercice, son `LevelState` (défaut niveau 0), la latence (`settings.latency.attack`) et la fuite (`clickBleed` → `audioError: 'bleed'`, l’écran demande un casque) ; `briefing` = `howTo` à la première rencontre (aucune tentative de l’exercice).
2. `start()` : ouvre le capteur `attack` (`SessionDeps.sensors.attack`), `Transport.begin` ; première rencontre : `playFigure(…, 'demo')` pendant une mesure d’écoute supplémentaire.
3. **Suite** : entrée en jeu (les mesures `on` qui précèdent la première `off` de l’accompagnement, non jugées), puis `cyclesPerBreath` cycles ; chaque cycle : `compileCyclePlan` (tourné pour commencer à la première mesure muette), un `PlanRound`, une `ObservationSpan`, l’accompagnement programmé une mesure à l’avance ; au réveil de fin de cycle (`transport.at`), `settle()`, `recordCycle`, `nextLevelState`.
4. **Respiration** : `transport.breath` ; le modèle passe en `breath` avec les cycles de la suite ; si le niveau a changé de tempo, `changeTempo` ; sinon la dernière mesure de respiration est comptée et la suite reprend.
5. `listen()` : si `listen !== 'none'`, le cycle suivant devient un cycle d’écoute (`playFigure(…, 'demo')`, aucun tour, aucune tentative) ; le cycle joué suivant porte l’aide `'listen'` si `listen === 'aid'`.
6. Fin à `RHYTHM_SERIES_MS` (au terme de la suite en cours) ; `pause` / `quit` / fin : `transport.stop()`, enveloppes fermées, `finish` attend les écritures.

`recordCycle` écrit une `Attempt` : `mechanic 'rhythm-figure'`, `cardKey` = `rhythm-figure:${figureId}@${level}`, `phase 'free'`, `temperature 'hot'`, `tempoBpm`, `leadBeats null`, `timingOffsetMs` = placement ou null, `reactionMs null`, `correct null`, `success`, `verdict`, `measures`, `aids` (`cursor` si le niveau le donne, `listen`), `plan` = `{ figure, cycleBars, startBar, accompaniment, tempo, window, thresholds }` en JSON, `data { item, level, report }`, observations de l’enveloppe.

- [ ] **Step 1: Tests** — `rhythmFigure.spec.ts` (clé et `parseItem` aller-retour) ; `rhythmCatalog.spec.ts` (chaque figure valide ; chaque niveau se résout ; les niveaux d’aide sont en tête ; `rhythm-offbeats` niveau 2 a une figure de 2 mesures dont la seconde n’a pas d’attaque sur le 1) ; `PlanSessionController.svelte.spec.ts` avec `FakeClock`, `FakeSoundScheduler`, `FakeAttackDetector`, dépôts en mémoire :
  - une série de contretemps où le faux capteur joue exactement la figure : 4 cycles réussis enregistrés (`success true`, `correct null`, `verdict.relation 'cycle'`, `plan` non nul), puis une respiration (modèle `phase 'breath'`, `settled.length 4`) ;
  - 3 cycles réussis → `LevelState.level` passe à 1 et l’annonce `level-up` apparaît à la respiration ;
  - mesures silencieuses : le 1 de la mesure où le clic revient est jugé une seule fois (une seule attente à cette position dans tout le journal des plans) ;
  - `listen()` pendant un cycle : le cycle suivant ne crée aucune tentative et le journal des sons contient des `demo` ; le cycle d’après porte `aids` contenant `'listen'` (lecture) ;
  - `quit()` pendant la mesure comptée et pendant une respiration : `emitted()` ne s’allonge plus après `flush`, aucune tentative sans `verdict` ;
  - latence absente : la série démarre, `report.latency === null`, la précision ne fait pas rater.
- [ ] **Step 2:** FAIL. **Step 3:** Implémenter (le cœur `application/session/` hors `plan/` reste sans mention de `rhythm-figure` : le contrôleur reçoit l’exercice et son présentateur par `SessionDeps`). **Step 4:** `npm test && npm run check` → PASS.
- [ ] **Step 5:** `git commit -m "feat: play rhythm exercises cycle after cycle with levels, breaths and listening"`

### Task 17: Réécouter la suite

**Files:**
- Create: `src/lib/application/ports/TakeBufferPort.ts`, `src/lib/infrastructure/audio/input/TakeBuffer.ts` (+ `.spec.ts`)
- Modify: `PlanSessionController.svelte.ts` (`replay`), `src/lib/composition/createApp.ts`, `src/lib/testing/fakes.ts` (`FakeTakeBuffer`)

**Interfaces:**
- Produces:

```ts
export interface TakeBufferPort {
	/** Starts keeping the input from `fromTime` (audio s), forgetting what came before. */
	keepFrom(fromTime: number): void;
	/** Plays what was kept between from and to, with `sounds` resynthesized at their times shifted by `latencyS`. Resolves when done. */
	play(from: number, to: number, sounds: readonly ScheduledSound[], latencyS: number): Promise<void>;
	stop(): void;
}
```

Le contrôleur appelle `keepFrom` au début de chaque suite ; `replay()` (pause ou respiration) rejoue de ce début à la fin de la suite, avec le clic resynthétisé depuis `sounds.emitted()` y compris aux mesures muettes (les sons de clic des mesures `off` sont ajoutés pour la réécoute), puis reprend par une mesure comptée.

- [ ] **Step 1: Tests** — `TakeBuffer` sur une `FakeFrameSource` : garde 3 s de trames, rend les bons échantillons pour `[from, to)` ; au-delà de 60 s gardées, les plus anciennes sont oubliées ; contrôleur : `replay()` en pause appelle `play` avec les sons de la suite, mesures muettes incluses, et la reprise compte une mesure.
- [ ] **Step 2:** FAIL. **Step 3:** Implémenter. **Step 4:** PASS.
- [ ] **Step 5:** `git commit -m "feat: replay the last run with the click put back over the silent bars"`

### Task 18: L’adaptateur de notation (VexFlow)

**Files:**
- Create: `src/lib/ui/notation/renderFigure.ts`, `src/lib/ui/notation/renderFigure.svelte.spec.ts`, `src/lib/ui/notation/boundaries.spec.ts`, `src/lib/ui/notation/index.ts`
- Modify: `package.json` (`vexflow@5.0.0`, version exacte), `scripts/functional-ui.mjs`

**Interfaces:**
- Consumes: `Figure` (Task 2).
- Produces:

```ts
export interface FigureLayout { noteX: number[]; barX: number[]; width: number; height: number }
/** Draws a figure (one rhythmic line per voice, bars wrapped to `maxWidth`) into `host`; returns where each note and bar landed. */
export function renderFigure(host: HTMLElement, figure: Figure, options: { maxWidth: number; scale?: number }): FigureLayout;
```

Import **`vexflow/bravura`** (police Bravura embarquée dans le paquet) ; aucune URL de police externe. Portée d’une ligne, hampes en haut, ligatures par temps, n-olets, silences.

- [ ] **Step 1: Tests** — jsdom : une figure de contretemps produit 5 `noteX` croissants et 1 barre ; une ligne de 4 mesures avec `maxWidth 360` passe sur plusieurs lignes (aucun `noteX` > `maxWidth`) ; `boundaries.spec.ts` : seul `src/lib/ui/notation/` importe `vexflow`. `scripts/functional-ui.mjs` : sur la vue de rythme, `document.fonts.check('30px Bravura')` vrai et la boîte d’un glyphe de tête de note a une largeur > 0.
- [ ] **Step 2:** FAIL. **Step 3:** `npm install vexflow@5.0.0 --save-exact`, implémenter. **Step 4:** PASS.
- [ ] **Step 5:** `git commit -m "feat: engrave rhythm figures with vexflow and its embedded bravura font"`

### Task 19: La vue `rhythm-figure`

**Files:**
- Create: `src/lib/ui/play/views/rhythmFigure.ts` (+ `.spec.ts`), `src/lib/ui/play/views/RhythmFigureView.svelte` (+ `.svelte.spec.ts`), `src/lib/ui/play/views/rhythmMessages.ts`
- Modify: `src/lib/ui/play/views/index.ts` (`'rhythm-figure'`), `src/lib/ui/play/PlayFrame.svelte` (touches E/L et R vers `listen` / `replay` quand le contrôleur les offre ; pause : Échap reprend ; « Quitter l’exercice » sans raccourci ; `audioError 'bleed'` : « Le micro entend le clic : branche un casque ou ta guitare sur une interface, puis relance. »)

**Interfaces:**
- Consumes: `RhythmStageModel` (Task 16), `renderFigure` (Task 18), `CycleReport`.
- Produces (module pur) :

```ts
export const MARK_MIN_OFFSET_PX = 6;
export interface Mark { x: number; kind: 'early' | 'late' | 'on-time' | 'missed' | 'extra'; label: string | null }
/** Marks of a cycle over a layout: offsets drawn exaggerated (×3 of the beat width share), never under MARK_MIN_OFFSET_PX. */
export function cycleMarks(report: CycleReport, layout: FigureLayout, feedback: Feedback, beatWidthPx: number): Mark[];
/** The plain-words line and its term, by locale: « Sans clic, tu passes devant (−35 ms) · tenue ». */
export function feedbackLine(report: CycleReport, locale: Locale): { words: string; term: 'hold' | 'placement' | 'precision' | 'regularity' | 'fidelity' | null };
export function cursorVisible(model: RhythmStageModel): boolean;   // jamais pendant une mesure muette
```

Disposition validée (maquette A) : pendant le jeu, la figure en grand ; à la respiration, la suite jouée **à gauche**, estompée, avec ses marques, et la figure à jouer **à droite**, en grand ; en dessous, la ligne de retour. En-tête : « Contretemps · niveau 3 sur 6 · ♩ = 90 bpm ». Bouton « Écouter la figure » (touche affichée E en français, L en anglais) visible si `listen !== 'none'` ; à la respiration, « Réécouter » (R).

Lignes de retour (fr) : décalage de tenue « Sans clic, tu passes devant (−35 ms) » / « derrière » ; dérive « Sans clic, tu accélères » / « ralentis » ; décalage « Temps perdu mesure 3 » / « Temps ajouté mesure 3 » ; fidélité « 2 notes oubliées » / « 1 note en trop » ; régularité « Irrégulier (± 28 ms) » ; placement seulement en latence `system`. Équivalents anglais dans `rhythmMessages.ts`.

- [ ] **Step 1: Tests** — `cycleMarks` : un écart de 5 ms est dessiné à `MARK_MIN_OFFSET_PX` ; en `out-of-tolerance`, seules les marques hors fenêtre restent ; `feedbackLine` sur un `holdOffset` de −35 rend « Sans clic, tu passes devant (−35 ms) » et le terme `'hold'` ; sur un `holdDrift` négatif rend « tu accélères » ; `cursorVisible` faux sur une mesure muette ; composant (jsdom) : à la respiration, la figure jouée précède la suivante dans le DOM et porte la classe estompée ; la touche E appelle `listen` ; le texte du bouton de pause dit « Quitter l’exercice ».
- [ ] **Step 2:** FAIL. **Step 3:** Implémenter (tokens `--np-*` existants, aucun élément propre au monde Game Boy ; texte ≥ 16 px). **Step 4:** PASS.
- [ ] **Step 5:** `git commit -m "feat: show the rhythm figure, its marks after each run and the next figure to read"`

### Task 20: Accueil, route, bilan minimal

**Files:**
- Modify: `src/routes/session/+page.svelte` (kind `exercise` : `startExercise(page.url.searchParams.get('exercise'))`, `PlayFrame`), `src/lib/ui/screens/home/HomeScreen.svelte` + `messages.ts` (« Rythme » ouvre la liste des trois exercices, liens `/session?kind=exercise&exercise=<id>`), `src/lib/domain/types.ts` (`SessionSummary.rhythm?`), `src/lib/application/services/createAppServices.ts` (`sessionSummary` pour une séance `exercise`), `src/lib/ui/screens/summary/SummaryScreen.svelte` + `messages.ts`
- Test: `HomeScreen.svelte.spec.ts`, `createAppServices.spec.ts`, `SummaryScreen.svelte.spec.ts`

**Interfaces:**
- Produces: `interface RhythmSummary { exerciseId: string; levelReached: { shown: number; of: number }; cycles: number; successes: number; aided: number }` ; `SessionSummary.rhythm?: RhythmSummary`.

- [ ] **Step 1: Tests** — l’accueil montre « Rythme » et, ouvert, trois liens vers les bons `exercise` ; `sessionSummary` d’une séance `exercise` rend `rhythm` avec les comptes des tentatives ; l’écran de bilan affiche « Niveau atteint : 3 sur 6 » et « 11 cycles réussis sur 14 ».
- [ ] **Step 2:** FAIL. **Step 3:** Implémenter. **Step 4:** `npm test && npm run check` → PASS ; `node scripts/functional-ui.mjs` contre `npm run dev` → PASS (police, 16 px, curseur absent en mesure muette).
- [ ] **Step 5:** `git commit -m "feat: open the rhythm exercises from home and sum a rhythm session up"`

### Task 21: Documentation

**Files:** Modify `CLAUDE.md`, `docs/vision.md`, `PRODUCT.md`, `docs/superpowers/specs/2026-10-14-temps-musical-et-sequences-design.md` (section « Réalisation »)

- [ ] **Step 1:** `CLAUDE.md` : le temps musical (`domain/time/`, fractions de ronde, plan d’attentes, `PlanRound`, `PlanSessionController` à côté de `SessionController` jusqu’à la migration), les sons (`SoundSchedulerPort`, `Transport`, journal des sons), le verdict (`success`, `correct` nullable, enveloppe, `ResponseVerdict`), les aides (`aids`), le stockage (Dexie 8, sauvegarde 4, chaîne `migrations/`, `levelStates`), la séance `'exercise'`, la latence par capteur et sa provenance, le changement de tempo à une respiration.
- [ ] **Step 2:** `docs/vision.md` : chantier 1, plan 1 fait ; `PRODUCT.md` : le rythme comme compétence ; spec : « Réalisation » (écarts, résultat de l’essai à deux entrées).
- [ ] **Step 3:** `npm run lint` → PASS (ou `npm run format` puis relire).
- [ ] **Step 4:** `git commit -m "docs: describe musical time, the plan controller and the target storage"`

---

## Après le plan

Plan 2 (avant la validation) : anti-blocage (`diagnoseBlock`, « joué avec », niveaux d’aide atteints par l’anti-blocage, « on change d’air », `resumeAfter`), lexique, phrase simple qui s’efface après `PLAIN_WORDS_SESSIONS`, bilan complet, contestation par raison en développement, export et comparaison de l’oracle. Puis la journée de validation (G), puis la migration (H), qui passe aussi `RoundObservation.correct` et le retour de `MechanicRules.judge` à `boolean | null` (spec §5) avec les relations existantes.
