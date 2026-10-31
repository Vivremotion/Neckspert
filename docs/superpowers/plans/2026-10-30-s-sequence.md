# La séquence (plan S) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un exercice peut imposer une suite de notes, jugée note à note sur sa hauteur et sa place. Les notes viennent de l’item (l’arpège d’une forme) ou de la partition (des hauteurs écrites, avec leurs cordes). Le cycle du rythme devient une séquence sans hauteur, et son compilateur à part disparaît.

**Architecture:**

- **Une figure s’écrit dans la liste d’attentes du gabarit.** `compileRound` la déplie en une `Expectation` par note jouée, comme `compileCyclePlan` le fait aujourd’hui pour le cycle. `RoundPlan` ne change pas.
- **L’alignement apprend la hauteur.** Il garde ce que chaque attaque a fait entendre, préfère apparier une attaque à une attente dont elle a la hauteur, et marque `wrong-pitch` une note fausse en place. Le verdict du cycle compte une fausse note comme une attente manquée.
- **Plus de porte cycle / gabarit.** Les fonctions de `series/compilePlan.ts` cessent de demander « est-ce un cycle ? » et lisent le tour compilé et les paramètres résolus. `cycle/compileCycle.ts`, `cycle/rhythmExercise.ts` et `CyclePlanRecord` disparaissent. Les tentatives gardent toutes un `RoundPlanRecord` (Dexie 12, sauvegarde 8).
- **Les exercices réels restent privés.** Un dossier `exercises.local/`, hors git, est chargé au build. Un script convertit un export MusicXML de Guitar Pro.

**Tech Stack:** TypeScript, Svelte 5 (runes), Vitest (node : `*.spec.ts` ; jsdom : `*.svelte.spec.ts`), Dexie, VexFlow 5 (`TabStave`, `TabNote`, `StaveConnector`), Node pour le script.

**Spec:** `docs/superpowers/specs/2026-10-30-sequence-design.md` (décisions C1 à C7, sections 1 à 7, « Hors périmètre », « Risques »).

## Global Constraints

- **Branche et vérification :**
  - Branche `plan/sequence-s`, worktree `.worktrees/sequence-s`, partie de `main`.
  - `npm test && npm run check` vert à chaque commit ; tests avant le code ; chaque test affirme.
  - Une fusion, à la fin, après les deux étapes jouables et l’accord de l’auteur. Rien n’est poussé.
- **Rien de privé dans le dépôt.** Ni exercice du professeur, ni note d’un morceau protégé, ni le fichier MusicXML de l’auteur, ni ce que le script en tire. Les tests publics utilisent de la matière commune : triades arpégées, gamme en position, petit MusicXML écrit pour le test. `exercises.local/` est dans `.gitignore` dès la Task 10.
- **Le cœur ne nomme ni mécanique, ni exercice, ni capteur.** Les tests de frontière de `series/`, `domain/exercise/round/`, `promptStage.ts` et `LaneView.svelte` restent verts. Le LilyPond n’est importé que dans `domain/exercise/` et `ui/notation/` (boundary test), plus le script de conversion.
- **Le rythme ne change pas de comportement.** Ses plans compilés sont figés (Task 5) avant la suppression de `compileCycle` ; les specs du rythme sur la série (`series/rhythmSession.spec.ts`) gardent leurs attentes.
- **Pas de reste de l’ancien modèle.** À la fin, une recherche dans `src` et `scripts` (hors `migrations/` et `legacy/`) ne trouve plus `rhythm-figure`, `RhythmItem`, `compileCycle`, `rhythmParamsOf`, `CyclePlanRecord`, `playsCycles`, `parseLilyPondRhythm`, `RhythmStageModel`, `RhythmFigureView`.
- **Vocabulaire** (un nom par concept) :
  - « figure » / `figure` (la mécanique, la vue, le modèle d’écran) ; « voicing » / `voicing` (un accord joué d’un coup) ; « forme » / `form` (une suite de notes, chacune sur sa corde, déplaçable) ; « motif » / `pattern` ;
  - « fausse note » / `wrong-pitch` ; « hauteur » / `pitch` (MIDI exact) ; « portée » / `staff` ; « tablature » / `tab` ;
  - « tour » / `round`, « cycle » = un tour joué en boucle (`policy.unit: 'cycle'`).
- **Textes d’interface** en français et en anglais, jamais sous 16 px (les chiffres de tablature compris).
- **Commits :** Conventional Commits en minuscules, impératif, orientés comportement ; terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Décisions prises par ce plan (à relire par l’auteur)

- **D1 — Une figure se désigne par son id, jamais par du texte inline.** `figure: { id: 'eighths' } | { param: 'figure' } | { item: 'figure' }`. Les figures restent listées une fois dans `ExerciseDefinition.figures` (texte LilyPond dans un fichier local, parsé au chargement). La spec disait « écrite (texte LilyPond) » ; un id évite deux façons d’écrire la même figure.
- **D2 — Toute note d’une figure porte sa hauteur.** Le parseur donne à chaque note sa hauteur MIDI (`c` = do 3, MIDI 48). Les figures du rythme gardent `c` ; leur hauteur n’est lue que par un contenu `{ from: 'figure' }`. Schéma JSON de figure 2 ; le schéma 1 se lit toujours (sans hauteur).
- **D3 — Les nombres de `domain/time/` restent des nombres.** `FigureElement` gagne `pitch?: number` (MIDI) et `string?: number` (1 à 6), sans importer `domain/music`.
- **D4 — Une fidélité sans seuil exige zéro faute**, comme aujourd’hui (`missed` échoue toujours). `thresholds.fidelity` (part des `hit`, 0 à 1), quand un niveau l’écrit, laisse passer un tour au-dessus. La spec le permettait (« les seuils restent des données »).
- **D5 — `WRONG_PITCH_COST = 0.5`** : la pénalité de hauteur d’une paire dans l’alignement. Une paire coûte au plus 1 (écart / zone) ; une note fausse en place coûte donc moins que « une manquée + une en trop » (2), et une note juste voisine gagne sur elle.
- **D6 — Une attaque garde sa dernière lecture finale.** Le capteur de notes peut relire une attaque ; l’alignement garde, par instant d’attaque, la dernière charge `final`, sinon la dernière reçue.
- **D7 — `listenInBars` et `countIn` passent dans `pacing`** pour tout exercice, défauts 0 et `true`. Les trois exercices du rythme écrivent `pacing.listenInBars: 2` (l’ancien `LISTEN_IN_BARS` du cycle), pour garder leur comportement.
- **D8 — L’item d’une forme porte sa durée en option.** `VoicingFigureItem = { voicing, occurrence, beats? }`, clé `${voicing}@${occurrence}` suivie de `@${beats}` quand il y en a. Un exercice enchaîne ses formes par la liste `ExerciseDefinition.items` (clés d’items de sa mécanique) ; la longueur du tour lit `{ item: 'beats' }`.
- **D9 — La mécanique `rhythm-figure` devient `figure`** en un coup : identité, catalogue, vue, tentatives stockées (Dexie 12). Sa clé d’item ne change pas (`${figureId}@${level}`).
- **D10 — Le dossier local est lu au build**, par `import.meta.glob('/exercises.local/*.json', { eager: true })`. Un fichier refusé n’arrête pas l’app : il apparaît dans la console et sur l’écran d’accueil en développement, avec la raison du validateur.

## Review Focus

- **Une note lue à l’octave** (erreur du détecteur) est jugée `wrong-pitch`, jamais `hit` : le contenu `pitch` est exact (test Task 2).
- **Deux lectures d’une même attaque** (une provisoire fausse, puis une finale juste) donnent une seule attaque, jugée sur la lecture finale, ni `extra` ni `wrong-pitch` (test Task 4).
- **Un fichier JSON local cassé** (JSON invalide, clé inconnue, figure qui ne se parse pas) laisse l’app démarrer ; le fichier est signalé avec sa raison et les autres sont chargés (test Task 10).
- **Une figure longue** (49 mesures, des dizaines de fautes) : la phrase de retour reste courte (« 12 fausses notes, mesures 3, 6, 9… » limitée aux `FEEDBACK_MAX_BARS` premières mesures) et la gravure revient à la ligne par mesure (tests Tasks 8 et 12).
- **Une occurrence de forme qui n’existe pas** (occurrence 1 d’une forme qui ne tient qu’une fois sur le manche) : la compilation échoue en nommant l’exercice, l’item et le champ, sans planter la série au milieu d’un tour ; la validation la refuse avant (test Task 3).

## File Structure

| Fichier                                                                                                                  | Rôle                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `domain/time/notation/lilypond.ts`                                                                                       | `parseLilyPond` : rythme, hauteurs, cordes (renommé de `parseLilyPondRhythm`)                |
| `domain/time/figure.ts`                                                                                                  | `FigureElement.pitch`/`string`, schéma 2, `attackNotes`                                      |
| `domain/time/plan.ts`                                                                                                    | `figureExpectations` (remplace `compileCyclePlan`)                                           |
| `domain/music/voicingNotes.ts` (create)                                                                                  | les notes d’une forme à une occurrence                                                       |
| `domain/mechanics/voicingFigure.ts` (create), `domain/mechanics/figure.ts` (renamed from `rhythmFigure.ts`)              | identités `voicing-figure` et `figure`                                                       |
| `domain/judges/index.ts`, `domain/derivations/index.ts`                                                                  | contenu et juge `pitch` ; dérivation `voicing-notes` ; `ITEM_FIGURES` ; `ITEM_NUMBERS.beats` |
| `domain/exercise/round/{types,compile,validate}.ts`                                                                      | entrées à figure, motif, accompagnement, invite optionnelle                                  |
| `domain/time/judge/{align,measures}.ts`, `domain/time/modes/alignment.ts`, `modes/cycleVerdict.ts`                       | hauteur dans l’alignement, `wrong-pitch`, fidélité                                           |
| `domain/exercise/rhythmCatalog.ts`                                                                                       | le rythme écrit en `round`                                                                   |
| `domain/exercise/figureParams.ts` (create)                                                                               | `FigureParams`, `figureParamsOf`, `writesFigure`                                             |
| `domain/exercise/fromJson.ts` (create)                                                                                   | `exerciseFromJson` : une définition JSON → `ExerciseDefinition`                              |
| `application/session/series/compilePlan.ts`                                                                              | les portes, sans « cycle ? »                                                                 |
| `application/session/series/itemSource.ts` (create, replaces `cycle/figureSource.ts`)                                    | `createExerciseItemSource` : figures ou `items`                                              |
| `application/session/series/recordResponse.ts`                                                                           | un seul enregistrement de tour ; `RoundPlanRecord` étendu ; `roundPlanFromRecord`            |
| `application/session/series/figureStage.ts` (renamed from `cycle/rhythmStage.ts`)                                        | `FigureStageModel`, `figureStage`                                                            |
| `application/session/cycle/` (deleted at the end)                                                                        | ce qui reste (`exerciseSummary`, `presenter`) va dans `series/` ou `mechanics/`              |
| `infrastructure/storage/migrations/v12.ts` (create), `db.ts`, `validateBackup.ts`                                        | Dexie 12, sauvegarde 8                                                                       |
| `infrastructure/diagnostics/oracle.ts`                                                                                   | lit `RoundPlanRecord`                                                                        |
| `ui/notation/renderFigure.ts`                                                                                            | systèmes portée / tablature                                                                  |
| `ui/play/views/FigureView.svelte`, `views/figure.ts` (renamed from `RhythmFigureView.svelte`, `rhythmFigure.ts`)         | la vue `figure` ; marques ; ligne de retour                                                  |
| `src/lib/composition/localExercises.ts` (create)                                                                         | lecture de `exercises.local/`                                                                |
| `scripts/musicxml-to-lilypond.mjs` (+ `scripts/musicxml-to-lilypond.spec.ts`, fixture `scripts/fixtures/scale.musicxml`) | conversion                                                                                   |

---

## Partie A — Le format et le juge

### Task 1: Des hauteurs et des cordes dans le LilyPond

**Files:**

- Modify: `domain/time/notation/lilypond.ts` (+ spec), `domain/time/figure.ts` (+ spec), `domain/time/index.ts`, every caller of `parseLilyPondRhythm` (`rhythmCatalog.ts`, `ui/notation/`, tests), `domain/time/notation/boundaries.spec.ts`

**Interfaces:**

- Produces:

  ```ts
  export type FigureElement =
  	| {
  			kind: 'note';
  			duration: Fraction;
  			tieToNext?: boolean;
  			content: null | SoundId;
  			pitch?: number;
  			string?: number;
  	  }
  	| { kind: 'rest'; duration: Fraction };
  export type FigureNote = Extract<FigureElement, { kind: 'note' }>;
  /** Figure.schema: 2; figureFromJson reads 1 (no pitch) and 2. */
  export function parseLilyPond(text: string, options?: { meter?: Meter }): Figure;
  /** Each attack of a voice (tied notes once): its position and its note. */
  export function attackNotes(
  	figure: Figure,
  	voiceId?: string
  ): { at: Fraction; note: FigureNote }[];
  ```

  `attackPositions` reste, écrit sur `attackNotes`.

- [ ] **Step 1: Write the failing tests** in `lilypond.spec.ts`:
  - `reads absolute pitches`: `c c' c, c''` → pitches `[48, 60, 36, 72]` ;
  - `reads accidentals`: `cis' des' fis bes eses' as` → `[61, 61, 54, 58, 62, 56]` (`es`, `as` = mi♭, la♭, à la manière de LilyPond) ;
  - `reads a string number after the duration`: `e''8\1 c'4\3 g\4` → strings `[1, 3, 4]`, durations `1/8, 1/4, 1/4` ;
  - `refuses a string number that is not 1 to 6, or after a rest`: `c\7`, `r4\1` throw with the offset ;
  - `still refuses what it refused`: `\relative`, `<c e g>`, `#`, `$` throw ;
  - `keeps rhythm figures as they were`: every figure of `rhythmCatalog.ts` parses to the same durations, ties and tuplets as before (frozen table of the three exercises).
- [ ] **Step 2: Write** in `figure.spec.ts`: `round-trips pitch and string through schema 2`; `reads a schema 1 figure without pitch`; `attackNotes skips tied notes and keeps their pitch`.
- [ ] **Step 3: Run** `npx vitest run src/lib/domain/time` — FAIL.
- [ ] **Step 4: Implement.** The reader accepts a note letter `a`–`g` (Dutch names: `is`/`es`, `isis`/`eses`, `es` and `as` alone), then `'`/`,`, then the duration and dots, then `\1`–`\6`. `\` followed by a digit is a string number; any other command but `\tuplet` stays refused. Rename `parseLilyPondRhythm` to `parseLilyPond` everywhere, no alias.
- [ ] **Step 5: Run** `npm test && npm run check` — PASS.
- [ ] **Step 6: Commit** `feat: read pitches and string numbers in lilypond figures`

### Task 2: Les notes d’une forme, le contenu `pitch`

**Files:**

- Create: `domain/music/voicingNotes.ts` (+ spec), `domain/mechanics/voicingFigure.ts` (+ spec)
- Modify: `domain/mechanics/index.ts`, `domain/judges/index.ts` (+ `judges.spec.ts`), `domain/derivations/index.ts` (+ spec), `application/presentation/itemFields.ts` (+ spec), `application/presentation/contentViews.ts` (+ spec)

**Interfaces:**

- Produces:

  ```ts
  export interface VoicingFigureItem {
  	voicing: string;
  	occurrence: number;
  	beats?: number;
  }
  export const voicingFigureRules: MechanicIdentity<VoicingFigureItem>; // id 'voicing-figure', learner 'skill', key D8
  /** The notes of `voicing` at its `occurrence`-th place on the neck (0: the lowest), lowest string first. Throws when it has no such place. */
  export function voicingNotes(
  	voicing: Voicing,
  	occurrence: number
  ): { midi: number; string: StringNumber; fret: number }[];
  export const PITCH_CONTENT = 'pitch'; // value: { midi: number; string?: number }; payload: { midi }
  ```

  - `CONTENT_DERIVATIONS['voicing-notes']`: kind `pitch`, reads `['voicing-figure']`, `list: true`, derives a list `{ midi, string }[]` (a figure entry spreads it over its notes, Task 3). `ContentDerivation` gains `list?: true`.
  - `ITEM_NUMBERS.beats`: reads `['voicing-figure']`, the item’s `beats` (throws without).
  - `ITEM_FIELDS['voicing-figure']`: `chord` (« Do », « Cm7 »), `strings` (« sol-si-mi »).
  - `CONTENT_VIEWS.pitch.miss`: the heard and expected notes in words (« sol au lieu de la »).

- [ ] **Step 1: Write the failing tests:**
  - `voicingNotes`: Do majeur 1ᵉʳ renversement sur sol-si-mi (`C|maj|3:3,2:5,1:1`), occurrence 0 → `[{ midi: 64, string: 3, fret: 9 }, { midi: 67, string: 2, fret: 8 }, { midi: 72, string: 1, fret: 8 }]` ; occurrence 1 → frets 21-20-20 ; occurrence 2 throws ; le do ouvert `C|maj|5:1,4:3,3:5,2:1,1:3` → frets `3, 2, 0, 1, 0`.
  - `voicingFigureRules`: key round-trip with and without `beats` ; a corrupted key throws.
  - `judges.spec.ts`: `pitch judges the exact midi` — 64 against 64 correct, 76 (an octave above) wrong, 52 wrong.
  - derivations spec: `voicing-notes derives the notes of the item's voicing`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** `voicingNotes` reads the occurrences the triads already compute (`voicing.ts`, `occurrenceOfId`’s source), in occurrence order by lowest fret. `voicing-figure` joins `MECHANIC_RULES`.
- [ ] **Step 4: Run** `npm test && npm run check` — PASS (`thirdMechanic.spec.ts` included).
- [ ] **Step 5: Commit** `feat: derive the notes of a voicing and judge an exact pitch`

### Task 3: Une figure dans la liste d’attentes

**Files:**

- Modify: `domain/exercise/round/types.ts`, `compile.ts` (+ `compile.spec.ts`), `validate.ts` (+ spec), `domain/time/plan.ts` (+ spec), `domain/derivations/index.ts`, `domain/exercise/validate.ts` (+ spec), `testing/randomExercise.ts`, `application/session/series/compilePlan.ts` (passes `fromRunStart`)

**Interfaces:**

- Consumes: `parseLilyPond`, `attackNotes` (Task 1); `voicing-notes`, `ITEM_NUMBERS.beats` (Task 2).
- Produces:

  ```ts
  export type FigureRef = { id: string } | { param: string } | { item: string };
  export interface FigureExpectationTemplate {
  	figure: FigureRef;
  	at: Position;
  	sensor: string;
  	content: null | { from: string; pattern?: number[] }; // from: a derivation, or 'figure'
  	window: WindowTemplate;
  }
  export type ExpectationTemplate = PointExpectationTemplate | FigureExpectationTemplate; // PointExpectationTemplate = today's
  export type WindowTemplate = { ms: Num } | { ofGap: string } | { param: string }; // { param }: an object window in the params
  export interface RoundTemplate {
  	prompt?: { lead: Num }; // absent: plan.prompt null
  	accompaniment?: Accompaniment | { param: string }; // its 'off' bars give mutedBars when mutedBars is absent
  	/* …the rest as today */
  }
  /** Replaces compileCyclePlan: the expectations of `figure` looped over `bars` bars from `startBar`. */
  export function figureExpectations(input: {
  	figure: Figure;
  	at: Fraction;
  	bars: number;
  	startBar: number;
  	sensor: string;
  	window: ExpectationWindow;
  	content: (k: number, note: FigureNote) => ExpectedContent | null;
  }): Expectation[];
  export function compileRound(
  	definition: ExerciseDefinition,
  	item: PlannedItem,
  	meter: Meter,
  	resolved: { previewBeats: number; fromRunStart: number | null }
  ): RoundPlan;
  // in domain/exercise/round/compile.ts:
  /** The round's accompaniment at an exercise level (the run’s, D7 of H6), or null. */
  export function roundAccompanimentOf(
  	definition: ExerciseDefinition,
  	exerciseLevel: number
  ): Accompaniment | null;
  /** The bar a run's first round starts on: the accompaniment's first muted bar, else 0 (moved from cycle/rhythmExercise.ts to domain/time/accompaniment.ts, with accompanimentFrom and unmuted). */
  export function landingBar(accompaniment: Accompaniment | null): number;
  ```

  - `ITEM_FIGURES` (in `domain/derivations/`): `{ figure: { reads: ['rhythm-figure'], figureOf: (item) => item.figureId } }` (the mechanic is renamed `figure` in Task 7).
  - The figure fills the round: `bars` = the round length in bars (a whole number of figure loops, else a compile error naming the field); `startBar` = `fromRunStart ?? landingBar(accompaniment)`, rotating figure and accompaniment as `compileCyclePlan` did.
  - Content per note k (the k-th attack): `null`; `{ from: 'figure' }` → `{ kind: 'pitch', value: { midi: note.pitch, string: note.string } }`; `{ from: d, pattern }` → the derived list’s element `pattern[k mod pattern.length] − 1` (no pattern: `k mod list.length`), kind of the derivation.
  - `compileCyclePlan` is deleted; its spec becomes `figureExpectations`’s.
  - A figure entry with a derivation needs a `list` derivation, and a point entry refuses one (compile error and `roundProblem`, naming the field).
  - `landingBar`, `accompanimentFrom` and `unmuted` move to `domain/time/accompaniment.ts` in this task; `cycle/rhythmExercise.ts` imports them from there until Task 6 deletes it.

- [ ] **Step 1: Write the failing tests** in `compile.spec.ts`:
  - `unfolds a figure into one expectation per attack`: `c8 c c c c c c c` over 1 bar → 8 targets at `0, 1/8, …`, content null, bar 0 ;
  - `loops the figure over the round and rotates it from startBar` (same values as the old `compileCyclePlan` spec, ported) ;
  - `spreads the derived notes by the pattern`: item `C|maj|3:3,2:5,1:1@0`, four eighths, `pattern: [1, 2, 3, 2]` → midis `64, 67, 72, 67` ;
  - `plays the derived list in order without a pattern`: six eighths → `64, 67, 72, 64, 67, 72` ;
  - `reads written pitches with { from: 'figure' }` ;
  - `fails naming the exercise and the field` on: a pattern index 4 for a 3-note voicing (`round.expectations[0].content.pattern`), an unknown figure id, a round length that is not a whole number of figure loops, a voicing occurrence the neck does not hold (Review Focus) ;
  - `gives a null prompt when the template writes none` ; `takes the muted bars from the accompaniment's off bars`.
- [ ] **Step 2: Write** in `round/validate.spec.ts` and `exercise/validate.spec.ts`: `accepts figure entries and the new keys`; `refuses { from: 'figure' } over a note without pitch` (a schema 1 figure); `refuses a written note impossible on its string` (`c\1`: below the open high E); `refuses a pattern index below 1`.
- [ ] **Step 3: Run** — FAIL.
- [ ] **Step 4: Implement** per the interfaces. `randomExercise.ts` learns figure entries (three contents, random patterns) so that `openness.spec.ts` draws them; the alignment still refuses content until Task 4, so openness draws content only once Task 4 lands (a flag in the generator, removed in Task 4).
- [ ] **Step 5: Run** `npm test && npm run check` — PASS.
- [ ] **Step 6: Commit** `feat: write a figure as expectations of a round template`

### Task 4: L’alignement juge la hauteur

**Files:**

- Modify: `domain/time/judge/align.ts` (+ spec), `domain/time/judge/measures.ts` (+ spec), `domain/time/modes/alignment.ts` (+ spec), `domain/time/modes/cycleVerdict.ts` (+ spec), `domain/time/round.ts` if it builds the report, `testing/randomExercise.ts`

**Interfaces:**

- Produces:

  ```ts
  export const WRONG_PITCH_COST = 0.5; // D5
  /** `fits(e, a)`: attack `a` plays what expectation `e` asks (true without content). */
  export function alignAttacks(
  	expectations: TimedExpectation[],
  	attacks: number[],
  	context: AlignContext,
  	fits?: (expectation: number, attack: number) => boolean
  ): Alignment;
  // Alignment.pairs[i] gains `fits: boolean`
  export type ReportedVerdict = ExpectationVerdict | 'dropped' | 'wrong-pitch';
  export type CycleFailure =
  	'missed' | 'wrong-pitch' | 'extra' | 'shift' | 'precision' | 'regularity' | 'hold';
  // cycleVerdict thresholds gain `fidelity?: number` (D4)
  ```

  - `AlignmentPairing.offer` keeps, per attack time, the payload (D6) and judges it through `context.judge` when the expectation it pairs with has content; `PairedAnswer.judged` carries it.
  - `cycleReport`: a pair that does not fit is `wrong-pitch` in `expectations`; `fidelity` = hits / all expectations; placement and precision over every pair, fitting or not.
  - `validateAlignment` no longer refuses content.

- [ ] **Step 1: Write the failing tests** in `align.spec.ts`:
  - `pairs a wrong note in place with its expectation`: 4 expectations, 4 attacks on time, attack 2 does not fit → 4 pairs, pair 2 `fits: false`, no missed, no extra ;
  - `gives a right note after a skipped one to its own expectation`: expectations A B C D, attacks A C D slightly late (within zone of B and C) → B missed, C and D paired fitting ;
  - `finds a lost beat under wrong notes`: the shift search still finds a beat lost when two notes are wrong.
- [ ] **Step 2: Write** in `alignment.spec.ts`: `keeps the final reading of an attack` (two payloads at one time, first non-final wrong then final right → one pair, fitting; Review Focus); `accepts content`. In `measures.spec.ts`: `reports wrong-pitch and counts it out of fidelity`; `measures placement over wrong notes too`. In `cycleVerdict.spec.ts`: `fails a cycle with a wrong note` (`reasons: ['wrong-pitch']`); `passes above thresholds.fidelity` (fidelity 0.9, threshold 0.8).
- [ ] **Step 3: Run** — FAIL.
- [ ] **Step 4: Implement.** Pair cost: `offset / zone + (fits ? 0 : WRONG_PITCH_COST)`. Remove the generator flag of Task 3: `openness.spec.ts` plays content-bearing figure rounds with right notes, none and wrong ones.
- [ ] **Step 5: Run** `npm test && npm run check` — PASS.
- [ ] **Step 6: Commit** `feat: judge the pitch of each note of an aligned round`

## Partie B — Le cycle absorbé

### Task 5: Le rythme écrit en gabarit

**Files:**

- Modify: `domain/exercise/rhythmCatalog.ts` (+ `catalog.spec.ts`), `application/session/series/compilePlan.ts`
- Create: `domain/exercise/rhythmCatalog.parity.spec.ts` with `__snapshots__/`
- Delete: `application/session/cycle/compileCycle.ts` (+ spec) at the end of the task

**Interfaces:**

- Consumes: Task 3.
- Produces: each rhythm exercise writes

  ```ts
  round: {
  	expectations: [{ figure: { item: 'figure' }, at: { bars: 0 }, sensor: 'attack', content: null, window: { param: 'window' } }],
  	accompaniment: { param: 'accompaniment' },
  	length: { bars: { param: 'cycleBars' } },
  	handover: 'end',
  	policy: { unit: 'cycle', verdict: 'cycle', correction: false, pairing: { mode: 'alignment' } }
  },
  ```

  `compilePlan` compiles every exercise with `compileRound`; `SETTLE_AFTER_BARS` moves to `series/compilePlan.ts`. `listenInBars` and `countIn` stay where they are until Task 6.

- [ ] **Step 1: Write** `rhythmCatalog.parity.spec.ts`: for each rhythm exercise, each level (aid levels included), each figure and `fromRunStart` in `0..3`, `compileRound(…)` equals `compileCycle(…)` (both called, deep equality on the plan).
- [ ] **Step 2: Run** — FAIL (the exercises write no round yet).
- [ ] **Step 3: Implement** the round of the three exercises and route `compilePlan` through `compileRound`. Run — PASS.
- [ ] **Step 4: Freeze.** Turn the parity test into a snapshot of `compileRound`’s plans (`toMatchSnapshot`), check the snapshot file in, then delete `compileCycle.ts` and its spec. Run `npm test && npm run check` — PASS, `series/rhythmSession.spec.ts` unchanged.
- [ ] **Step 5: Commit** `refactor: compile rhythm cycles from their round template`

### Task 6: Des portes sans « cycle ? »

**Files:**

- Create: `domain/exercise/figureParams.ts` (+ spec), `application/session/series/itemSource.ts` (+ spec)
- Modify: `application/session/series/compilePlan.ts` (+ spec), `series/stage.ts`, `series/exerciseLevels.ts`, `SessionController.svelte.ts`, `domain/exercise/types.ts` (`items?: string[]`), `domain/time/levels.ts` (drop `LevelParams`, `checkStart` takes `{ listenInBars, countIn }`), `application/services/createAppServices.ts` (`startExercise`), `domain/exercise/catalog.ts` (`exerciseSessionExercises()`), `src/routes/+page.svelte`, `ui/screens/home/HomeScreen.svelte` (+ spec, the list)
- Delete: `application/session/cycle/rhythmExercise.ts`, `cycle/figureSource.ts` (+ specs)

**Interfaces:**

- Produces:

  ```ts
  /** The round template writes a figure entry. */
  export function writesFigure(definition: ExerciseDefinition): boolean;
  export interface FigureParams {
  	feedback: Feedback; // default 'every-cycle'
  	listen: 'free' | 'aid' | 'none'; // default 'none'
  	cursor: boolean; // default false
  	thresholds: Partial<
  		Record<'precision' | 'regularity' | 'holdOffset' | 'holdDrift' | 'fidelity', number>
  	>; // default {}
  }
  export function figureParamsOf(
  	definition: ExerciseDefinition,
  	exerciseLevel: number
  ): FigureParams;
  /** Figures (`pick` loop | next, fitting the level's round) or the written `items`, an item per turn, `atLevel` as createFigureSource. */
  export function createExerciseItemSource(definition: ExerciseDefinition): ItemSource;
  /** Exercises played in an exercise session: a round that writes a figure, and levels; read from the live catalog (local exercises join it in Task 10). */
  export function exerciseSessionExercises(): readonly ExerciseDefinition[];
  ```

  Each gate of `compilePlan.ts` reads, for every exercise:
  - `runSetup`: `roundAccompanimentOf` (Task 3), `pacing.listenInBars` (0) and `pacing.countIn` (true), `checkStart`, `entryBars = landingBar(accompaniment)` ; the rhythm catalog moves every `listenInBars` and `countIn` it writes (params and level overrides) to `pacing.listenInBars` / `pacing.countIn`, and its base writes `pacing.listenInBars: 2` where it relied on `LISTEN_IN_BARS` (D7) ;
  - `roundGiven`: thresholds from `figureParamsOf` when the verdict reads them, aids (`cycleAids` made generic: cursor, aid level, listened, play-along), `settleAfter = SETTLE_AFTER_BARS` when `plan.policy.unit === 'cycle'` ;
  - `aidedBeyondLevel`: `levelAided(aids, figureParamsOf(…).cursor)` when `writesFigure`, else any aid ;
  - `canSound`, `contentFigure`: the figure of the round’s first figure entry (`writesFigure`) ;
  - `listenOf`: `figureParamsOf(…).listen` ;
  - `blockReadingOf`: the report when the verdict is `'cycle'` ;
  - `followsBeats` and the stage dispatch (`stage.ts`): `writesFigure`.

- [ ] **Step 1: Write the failing tests:** `figureParams.spec.ts` (defaults; a level overrides `cursor` and `thresholds.fidelity`); `itemSource.spec.ts` (ported from `figureSource.spec.ts`, plus `serves the written items in order, again from the first`, items parsed by their mechanic); `compilePlan.spec.ts` (`runSetup` of a template exercise with `pacing.listenInBars: 1`, `countIn: false` → listen-in 1, no count; `checkStart` refuses `0` + `false`).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**, then delete `rhythmExercise.ts`, `figureSource.ts` and `LevelParams`. `startExercise` accepts any exercise of `exerciseSessionExercises()`; the home list « Rythme » becomes « Exercices » and lists them.
- [ ] **Step 4: Run** `npm test && npm run check` — PASS, `rhythmSession.spec.ts` unchanged.
- [ ] **Step 5: Commit** `refactor: read figure rounds from their params, not from a cycle gate`

### Task 7: Un seul enregistrement, la mécanique `figure`, Dexie 12

**Files:**

- Modify: `application/session/series/recordResponse.ts` (+ spec), `series/compilePlan.ts` (`roundAttempt`), `domain/mechanics/rhythmFigure.ts` → `figure.ts`, `domain/mechanics/index.ts`, `rhythmCatalog.ts`, `ITEM_FIGURES`, `testing/rhythmSeries.ts`, every spec naming `rhythm-figure`, `infrastructure/storage/db.ts` (+ spec), `validateBackup.ts` (+ spec), `infrastructure/storage/testing/fixtures.ts`, `infrastructure/diagnostics/oracle.ts` (+ spec)
- Create: `infrastructure/storage/migrations/v12.ts` (+ spec)
- Delete: `application/session/cycle/recordCycle.ts` (+ spec), after moving `cycleAids`/`levelAided` to `series/aids.ts`

**Interfaces:**

- Produces:

  ```ts
  export interface RoundPlanRecord {
  	/* today’s fields */ startAudioS?: number;
  	tempo?: { at: string; bpm: number; unit: string };
  	thresholds?: FigureParams['thresholds'];
  }
  export function roundPlanFromRecord(record: RoundPlanRecord): RoundPlan;
  /** The data of a round judged by the cycle verdict. */
  export interface FigureAttemptData {
  	item: unknown;
  	level: number;
  	report: CycleReport;
  }
  // v12.ts
  export function cyclePlanToV12(record: CyclePlanRecordV11): RoundPlanRecord; // frozen copy of compileCyclePlan inside
  export function attemptToV12<T>(attempt: T): T; // rhythm-figure → figure, CyclePlanRecord → RoundPlanRecord
  export function backupV7ToV8(backup: BackupV7): BackupV8;
  ```

  - `roundAttempt` builds every attempt one way: success, `correct` (`null` without content; else no `wrong-pitch` and no `missed`), verdict envelope, measures, aids, `plan: { ...roundPlanRecord(plan), startAudioS, tempo, thresholds }`, `data`: `FigureAttemptData` for a `'cycle'` verdict, else the presenter’s.
  - Dexie `version(12)` runs `attemptToV12` on attempts whose mechanic is `rhythm-figure`; backup 8 refuses `rhythm-figure` and a plan with `cycleBars`.
  - The oracle rebuilds the plan with `roundPlanFromRecord` and rejudges against `thresholds`.

- [ ] **Step 1: Write the failing tests:** `v12.spec.ts` — `rewrites a stored cycle plan as the round plan it judged` (a fixture `CyclePlanRecord` of each rhythm exercise → `roundPlanFromRecord(cyclePlanToV12(r))` equals `compileRound` of the live catalog at that `fromRunStart`), `renames the mechanic`, tripwire `the frozen cycle compiler still matches figureExpectations`; `db.spec.ts` — `upgrades 11 to 12`; `validateBackup.spec.ts` — `imports a version 7 file through v12`, `refuses rhythm-figure in a version 8 file`; `recordResponse.spec.ts` — `records a cycle round with its report and plan`; `oracle.spec.ts` — the existing cases on `RoundPlanRecord`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Rename `rhythm-figure` → `figure` and `RhythmItem` → `FigureItem` in one sweep (D9).
- [ ] **Step 4: Run** `npm test && npm run check` — PASS.
- [ ] **Step 5: Commit** `feat: keep one round plan record for every attempt (dexie 12, backup 8)`

### Task 8: La vue `figure`

**Files:**

- Rename: `cycle/rhythmStage.ts` → `series/figureStage.ts`; `ui/play/views/RhythmFigureView.svelte` → `FigureView.svelte` (+ specs); `views/rhythmFigure.ts` → `views/figure.ts` (+ spec); `views/rhythmMessages.ts` → `views/figureMessages.ts`
- Modify: `ui/play/views/index.ts` (`PLAY_VIEWS`, `VIEW_WORLDS`), `application/presentation/playViews.ts` (`PLAY_VIEW_NAMES`, `PROMPT_STAGE_VIEWS` gains `'figure'`), `rhythmCatalog.ts` (`view: 'figure'`), `src/routes/dev/rhythm/+page.svelte`, `scripts/functional-ui.mjs`
- Move: `cycle/exerciseSummary.ts` → `series/exerciseSummary.ts`, `cycle/presenter.ts` → `application/mechanics/figurePresenters.ts` (`FIGURE_PRESENTERS`, with a `voicing-figure` presenter: scene, sensor `note`); delete `cycle/`

**Interfaces:**

- Produces:

  ```ts
  export interface FigureStageModel /* RhythmStageModel renamed */ {
  	/* …today’s fields */
  	prompt: { primary: string; secondary: string | null } | null; // presentPrompt of the exercise's presentation, else null
  	figure: Figure; // derived notes written into its notes (pitch, string), for the tab aid
  	notation: { staff: boolean; tab: boolean } | null; // Task 12; null until then
  }
  export type MarkKind = 'early' | 'late' | 'on-time' | 'missed' | 'extra' | 'wrong-pitch';
  export const FEEDBACK_MAX_BARS = 4;
  /** A note of a figure by its bar and beat, from 1: « mesure 6, temps 3 ». */
  export function notePlace(at: Fraction, meter: Meter): { bar: number; beat: number };
  ```

  `feedbackLine` gains the reason `wrong-pitch`: one fault → « Mesure 6, temps 3 : sol au lieu de la » (from `CONTENT_VIEWS.pitch.miss`); two → both; more → « N fausses notes, mesures 3, 6, 9 » with at most `FEEDBACK_MAX_BARS` bars then « … ». After a failed derived round, the breath shows the expected `shape` picture through `PICTURE_VIEWS`.

- [ ] **Step 1: Write the failing tests:** `figure.spec.ts` — `marks a wrong note in place as wrong-pitch`; `tells one wrong note by bar and beat`; `sums up more than two by their bars, at most FEEDBACK_MAX_BARS` (a 49-bar figure with 12 faults; Review Focus); `notePlace` on 4/4 and 3/4. `FigureView.svelte.spec.ts` — `shows the prompt above the figure`; `shows the expected shape after a failed derived round`. `index.svelte.spec.ts` — the registry keys equal `PLAY_VIEW_NAMES` with `figure`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** One rename sweep, no alias.
- [ ] **Step 4: Run** `npm test && npm run check` — PASS; then `scripts/functional-ui.mjs` against `npm run dev` — PASS.
- [ ] **Step 5: Commit** `feat: show a figure round with its prompt and its wrong notes`

## Partie C — Jouer ses propres exercices

### Task 9: Plusieurs formes enchaînées, de bout en bout

**Files:**

- Create: `application/session/series/sequenceSession.spec.ts`, `testing/sequenceSeries.ts` (bench, on `testing/rhythmSeries.ts`’s model), `testing/arpeggioExercise.ts` (common material: major and minor triads on sol-si-mi, three inversions)
- Modify: whatever the spec shows missing in `SessionController.svelte.ts`, `exerciseLevels.ts`, `domain/session/policy.ts`

**Interfaces:**

- Consumes: Tasks 2 to 8.
- Produces: `testing/arpeggioExercise.ts` — an exercise of mechanic `voicing-figure`, `items` C, F, G (keys with `beats: 4`), figures `quarters` (`c4 c c c`) and `eighths`, levels 1 (quarters, ♩ = 60) and 2 (eighths, ♩ = 60), an aid level (`notation.tab: true`, used from Task 12), round `{ figure: { param: 'figure' }, content: { from: 'voicing-notes', pattern: [1, 2, 3, 2] }, sensor: 'note', … length: { beats: { item: 'beats' } }, handover: 'end', policy cycle }`, presentation `primary: '{chord}'`, `secondary: '{strings}'`.

- [ ] **Step 1: Write the failing tests** in `sequenceSession.spec.ts`:
  - `chains the three chords without a gap, one attempt each` (rounds open at the previous handover, no counted bar between them) ;
  - `passes a chord played right and fails one with a wrong note` (`success`, `correct`, report `wrong-pitch` on the right expectation) ;
  - `fails every chord when nothing is played`, and the anti-blocking stays off (no `flow.antiBlocking`) ;
  - `levels up from quarters to eighths at a breath` (the figure param changes, the tempo stays) ;
  - `listens with the note sensor only` (the session opens only `voicing-figure`’s sensor).
- [ ] **Step 2: Run** — FAIL where the series still assumes a looped figure.
- [ ] **Step 3: Implement** the smallest changes the tests show (the spec’s risk « tours enchaînés au verdict du cycle »).
- [ ] **Step 4: Run** `npm test && npm run check` — PASS.
- [ ] **Step 5: Commit** `feat: chain figure rounds over a list of voicings`

### Task 10: Les exercices locaux

**Files:**

- Create: `domain/exercise/fromJson.ts` (+ spec), `src/lib/composition/localExercises.ts` (+ spec), `docs/exercices-locaux.md` (French: the format, with a public example; the folder itself stays out of git)
- Modify: `.gitignore` (`/exercises.local/`), `domain/exercise/catalog.ts` (`registerExercises`), `src/routes/+layout.svelte` or `composition/createApp.ts`, `ui/screens/home/HomeScreen.svelte` (refused files, in development only)

**Interfaces:**

- Produces:

  ```ts
  /** A JSON definition: figures as { id, lilypond }, the rest as ExerciseDefinition. Throws naming the field. */
  export function exerciseFromJson(json: unknown): ExerciseDefinition;
  export interface LocalExercises {
  	loaded: ExerciseDefinition[];
  	refused: { file: string; reason: string }[];
  }
  /** Parses, validates (validateExercise, presentationProblem, screenProblem) and keeps the valid ones; ids already in the catalog are refused. */
  export function readLocalExercises(files: Record<string, unknown>): LocalExercises;
  ```

  `createApp` calls `readLocalExercises(import.meta.glob('/exercises.local/*.json', { eager: true, import: 'default' }))`, registers `loaded`, logs `refused` with `console.error`.

- [ ] **Step 1: Write the failing tests:** `fromJson.spec.ts` — `reads figures written in lilypond`, `refuses an unknown key naming it`; `localExercises.spec.ts` — `keeps the valid files and reports the others with their reason` (one valid, one invalid JSON value, one with a figure that does not parse, one whose id is taken; Review Focus), `refuses nothing when the folder is empty`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Write `docs/exercices-locaux.md` with `testing/arpeggioExercise.ts` as the example, in JSON.
- [ ] **Step 4: Run** `npm test && npm run check` — PASS; `git status` shows nothing under `exercises.local/`.
- [ ] **Step 5: Commit** `feat: load private exercises from a local folder`

### Task 11: Convertir un export MusicXML

**Files:**

- Create: `scripts/musicxml-to-lilypond.mjs`, `scripts/musicxml-to-lilypond.spec.ts`, `scripts/fixtures/scale.musicxml` (a C major scale in quarters and a bar of triplets, with a TAB staff and strings, plus a second part of three-note chords; written for the test)
- Modify: `vite.config.ts` only if the `server` project does not already pick `scripts/*.spec.ts`; `package.json` (`"musicxml": "node scripts/musicxml-to-lilypond.mjs"`); `docs/exercices-locaux.md`

**Interfaces:**

- Produces:

  ```ts
  /** One part of one voice → our LilyPond (pitch from string + fret, standard tuning), plus warnings. */
  export function convertMelody(
  	xml: string,
  	partId: string
  ): { lilypond: string; warnings: string[] };
  /** One part of chords → the shapes bar by bar: strings and frets, to name as voicing keys. */
  export function listShapes(
  	xml: string,
  	partId: string
  ): { bar: number; beat: number; frets: (number | null)[] }[];
  ```

  CLI: `npm run musicxml -- <file> --part P1` prints the LilyPond, `--shapes P2` the shapes; warnings go to stderr. No XML library: the script reads the elements it needs with a small tag reader, so the project gets no new dependency.

- [ ] **Step 1: Write the failing tests** on the fixture: `converts the melody with strings and triplets` (exact expected LilyPond text); `fills a pickup bar with rests`; `warns on a chord in a melody part and on a second voice`; `ignores the tab staff duplicate (voice 5)`; `lists the shapes of the chord part`; `the output parses with parseLilyPond`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Pitch = open string of standard tuning + fret (the export writes the guitar an octave up; the tab says what sounds). Durations from `<duration>` and `<divisions>` (which change by bar), ties from `<tie type="start">`, tuplets from `<time-modification>` grouped as `\tuplet a/b { … }`.
- [ ] **Step 4: Run** `npm test && npm run check` — PASS.
- [ ] **Step 5: Commit** `feat: convert a guitar pro musicxml export to a figure`

### Étape jouable 1 — les tétrades de l’auteur (au milieu du plan)

Hors commit. Avec l’auteur, dans `exercises.local/` :

- [ ] Lister les formes de la partie d’accompagnement (`npm run musicxml -- <fichier> --shapes P2`) ; l’auteur nomme chaque accord ; écrire les items `{ voicing, occurrence, beats }` de la grille et l’exercice des tétrades (figure en noires, ♩ = 60, motif montant).
- [ ] Si la grille contient un accord diminué : ajouter le degré `bb7` et la qualité `dim7` (`domain/music/chord.ts`, test `reads dim7 and voices it`), commit `feat: add the diminished seventh chord`.
- [ ] L’auteur joue. Noter ce qui le gêne ; ce qui touche S se corrige dans une task supplémentaire, le reste va en issue.

## Partie D — La portée et la tablature

### Task 12: Portée, tablature, `notation`

**Files:**

- Modify: `ui/notation/renderFigure.ts` (+ `renderFigure.svelte.spec.ts`), `FigureView.svelte` (+ spec), `series/figureStage.ts`, `domain/exercise/figureParams.ts` (`notation`), `application/presentation/validate.ts` (`screenProblem`) (+ spec), `src/routes/dev/rhythm/+page.svelte`, `scripts/functional-ui.mjs`

**Interfaces:**

- Produces:

  ```ts
  // FigureParams gains
  notation: { staff: boolean; tab: boolean } | null; // null: the default of the round's content (below)
  export interface RenderOptions { maxWidth: number; scale?: number; notation?: { staff: boolean; tab: boolean } } // absent: one-line rhythm
  // FigureLayout keeps noteX/noteLine; lineY and rowHeight now measure a system
  ```

  Defaults (`figureStage`): content `{ from: 'figure' }` → staff and tab; a derivation → neither (rhythm line and prompt); no content → rhythm line. A level that writes `notation` wins. Staff: `treble_8`, key signature none (accidentals on notes). Tab: six lines, frets from pitch and string, stems with the rhythm. Both: `StaveConnector` `bracket` + `singleLeft`.

- [ ] **Step 1: Write the failing tests:** `renderFigure.svelte.spec.ts` — `engraves a staff over a tab, joined` (two staves per line, `noteX` equal on both); `keeps one-line rhythm without notation`; `wraps a 49-bar figure by bar` (Review Focus). `figureStage` — `writes the derived notes into the figure for the tab aid`; `hides the notes of a derived figure by default`. `screenProblem` — `refuses a level that shows the tab of a figure with a note without string`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** `/dev/rhythm` gains `?shot=written` and `?shot=derived`; `functional-ui.mjs` checks both (no text under 16 px, tab digits included).
- [ ] **Step 4: Run** `npm test && npm run check` — PASS; `scripts/functional-ui.mjs` — PASS.
- [ ] **Step 5: Commit** `feat: engrave a figure as staff and tablature`

### Étape jouable 2 — le thème de l’auteur

Hors commit. Avec l’auteur :

- [ ] `npm run musicxml -- <fichier> --part P1` ; l’auteur relit les avertissements ; écrire l’exercice du thème (contenu `{ from: 'figure' }`, premier niveau ♩ = 70, puis 80 et 93 ; un niveau sans portée, un sans tablature).
- [ ] L’auteur joue. Ce que le capteur rate au débit réel se note pour la piste « notes rapides » (spec C1).

### Task 13: Critère de fin et documentation

**Files:**

- Modify: `CLAUDE.md`, `docs/superpowers/specs/2026-10-30-sequence-design.md` (section « Réalisation »), `docs/superpowers/specs/2026-10-14-temps-musical-et-sequences-design.md` (la « Reprise » renvoie à S), `src/lib/infrastructure/CLAUDE.md` if the oracle text changes

- [ ] **Step 1: Search** `src` and `scripts` (outside `migrations/` and `legacy/`) for the names of « Pas de reste de l’ancien modèle » — none found.
- [ ] **Step 2: Update `CLAUDE.md`:** « Musical time » (figure entries, `figureExpectations`, `wrong-pitch`, `pitch`), « Exercise sessions » (no cycle gate, `exerciseSessionExercises()`, `exercises.local/`), « Play views » (`figure`, staff and tab, `notation`), « Mechanics and exercises » (`figure`, `voicing-figure`, `items`), « Storage » (Dexie 12, backup 8, `v12.ts`; chantier 2 takes 13).
- [ ] **Step 3: Write « Réalisation »** in the spec: D1 to D10 of this plan, what the playable steps changed.
- [ ] **Step 4: Run** `npm test && npm run check` — PASS.
- [ ] **Step 5: Commit** `docs: record the sequence in the project guide and its spec`

## Partie E — Les formes mobiles (ajoutée après le premier essai de l’auteur)

### Task 14: Une forme écrite une fois, déplacée d’accord en accord

Retour de l’auteur (2026-10-30) : les formes d’arpège travaillées ont plusieurs notes par corde, comme une gamme, et la même forme se déplace d’un accord à l’autre. `voicing-notes` ne peut pas les jouer (une note par corde). Sur une grille, chaque accord repart de la première note de sa forme ; un arpège qui continue d’un accord à l’autre viendra plus tard, hors de S.

**Files:**

- Create: `domain/mechanics/formFigure.ts` (+ spec), `domain/music/formNotes.ts` (+ spec)
- Modify: `domain/time/notation/lilypond.ts` (+ spec), `domain/exercise/types.ts`, `domain/exercise/fromJson.ts` (+ spec), `domain/exercise/validate.ts` (+ spec), `domain/exercise/round/compile.ts` (+ spec), `domain/derivations/index.ts` (+ spec), `domain/mechanics/index.ts`, `application/presentation/itemFields.ts` (+ spec), `application/mechanics/figurePresenters.ts`, `application/session/series/sequenceSession.spec.ts`, `testing/` (a public exercise), `docs/exercices-locaux.md`, `CLAUDE.md`, the spec’s « Réalisation » and « Hors périmètre »

**Interfaces:**

- Produces:

  ```ts
  // lilypond.ts: notes only, for a form: no rhythm to fill, durations ignored; a rest, a tie, a tuplet or a note without string number throws with its offset.
  export function parseLilyPondNotes(text: string): { midi: number; string: number }[];
  // types.ts: plain data, like the rest of a definition
  export interface ExerciseForm {
  	id: string;
  	symbol: string;
  	notes: { midi: number; string: number }[];
  }
  // ExerciseDefinition gains forms?: readonly ExerciseForm[]; in a JSON file a form is { id, symbol, lilypond }
  // formFigure.ts: mechanic 'form-figure', learner 'skill'; key `${form}@${first}` then `@${beats}` when present; `first` is one LilyPond note (`d`, `g,`, `bes'`), checked by parseItem
  export interface FormFigureItem {
  	form: string;
  	first: string;
  	beats?: number;
  }
  // formNotes.ts: the form moved so that its first note is `firstMidi`, strings kept; throws when a note falls off the neck (fretOf)
  export function movedForm(
  	notes: readonly { midi: number; string: number }[],
  	firstMidi: number
  ): { midi: number; string: number; fret: number }[];
  ```

  - `CONTENT_DERIVATIONS['form-notes']`: kind `pitch`, reads `['form-figure']`, `list: true`. `ContentDerivation.derive` also receives the exercise definition (`derive(item, definition)`), since the forms are the exercise’s.
  - `ITEM_NUMBERS.beats` also reads `form-figure`.
  - `ITEM_FIELDS['form-figure']`: `chord` = the name of `first` as written (`bes` → `Bb`, `as` → `Ab`, `fis` → `F#`) followed by the form’s `symbol` (« Dm7 »). `ItemFields.fields` receives the definition too.
  - A `form-figure` presenter (sensor `note`) in `FIGURE_PRESENTERS`.
  - `validateExercise`: forms have unique ids, at least one note, each note playable as written (`fretOf`). An item naming an unknown form, or a form moved off the neck, is refused by `itemsProblem` naming `items[i]`.
  - No `shape` picture for a form (`DERIVED_PICTURES` unchanged): a chord diagram cannot draw several notes on one string. After a failed round the breath tells the wrong notes in words, and an aid level may write `notation.tab`.
  - `voicing-figure` and `voicing-notes` stay, for arpeggios of a chord.

- [ ] **Step 1: Write the failing tests** (public material only, never the author’s forms; example form `c\5 e\4 g\4 b\3`):
  - `parseLilyPondNotes`: `c\5 e\4 g\4 b\3` → midis `48, 52, 55, 59`, strings `5, 4, 4, 3`, two notes on one string allowed; `refuses a rest, a tie, a tuplet, a note without string` ; durations ignored; no bar to fill.
  - `movedForm`: from first 50 → midis `50, 54, 57, 61`, strings kept, frets `5, 4, 7, 6`; first 43 on a form whose first string is 5 → throws (below the open string); a note above fret 24 throws.
  - `formFigureRules`: key round-trip with and without `beats`; a corrupted `first` throws.
  - `form-notes` derivation; `chord` field: `bes` + `maj7` → « Bbmaj7 ».
  - `validate.spec.ts`: refuses two forms with one id, an empty form, an unknown form in `items`, a form moved off the neck, each naming the field.
  - `fromJson.spec.ts`: reads forms written in LilyPond; a form that does not parse is refused naming it.
  - `sequenceSession.spec.ts`: `plays a form with two notes on a string, moved from chord to chord, each chord restarting from its first note` (changes of 4 and 2 beats, right notes pass; a wrong note on the right expectation).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** Update `docs/exercices-locaux.md` (the format, with the public example; the octave and accidental rules for writing a form), `CLAUDE.md`, and the spec’s « Réalisation » (why forms were added) and « Hors périmètre » (the arpeggio that continues from chord to chord).
- [ ] **Step 4: Run** `npm test && npm run check` — PASS; no snapshot changes.
- [ ] **Step 5: Commit** `feat: move a written form from chord to chord`

## Avant de fusionner

- Revue de toute la branche (`superpowers:requesting-code-review`).
- `npm test && npm run check`, `scripts/functional-ui.mjs`.
- `git log main..plan/sequence-s -- exercises.local` est vide ; aucun fichier ne contient une note du thème de l’auteur (`git grep` sur quelques mesures de sa sortie locale, sans les copier ailleurs).
- L’auteur a joué les deux étapes et donne son accord. Fusion sans pousser.
