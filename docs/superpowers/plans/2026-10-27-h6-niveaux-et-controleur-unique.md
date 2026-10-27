# Les niveaux d’exercice et un seul contrôleur (plan H6) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tout exercice progresse par des niveaux écrits en données, le tempo compris : le geste monte de tempo en cours de séance, à une respiration. La progression de tempo de fin de séance disparaît (Dexie 11, sauvegarde 7). Puis le rythme passe sur la série : un seul contrôleur, `SessionController`, joue tous les exercices.

**Architecture:**

- **Deux axes de niveaux, une seule règle de surcharge.** Un niveau, d’exercice (`ExerciseDefinition.levels`) ou d’item (`params.ladder`), écrit des chemins pointés (`'windows.perfectMs': 60`, `tempo: 90`) qui remplacent ces valeurs dans les paramètres résolus. C’est la même écriture que celle qu’un gabarit lit (`{ param: 'windows.perfectMs' }`). Ordre : paramètres de l’exercice, puis niveau d’exercice, puis niveau d’item. Le moteur n’impose aucun lien entre les deux axes.
- **Le tempo est un paramètre comme un autre** (`tempo`, des battements par minute dans l’unité du mètre). Le niveau d’exercice est tenu par `LevelState` sous la clé `(exercice, portée, item '')`. Il bouge à chaque tour réglé (`nextLevelState`) et s’applique au prochain tour qui ne s’enchaîne pas, c’est-à-dire à une respiration.
- **Un seul contrôleur.** `ResponseSeriesController` reçoit la politique `next` pour toutes ses frontières, la trace, les prises et la réécoute. Il apprend ensuite à jouer un cycle (tour du rythme : figure, accompagnement, mesures muettes, écoute). Le rythme bascule dessus, `PlanSessionController` est supprimé, et la série prend le nom `SessionController`.

**Tech Stack:** TypeScript, Svelte 5 (runes), Vitest (node : `*.spec.ts` ; jsdom : `*.svelte.spec.ts`), Dexie.

**Spec:** `docs/superpowers/specs/2026-10-14-temps-musical-et-sequences-design.md` :

- « Reprise (état au 2026-10-27, après H5) », « Ce que H6 doit faire » ;
- « Amendement (2026-10-23) », section 4 (le contrôleur unique) ;
- « Amendement (2026-10-26) », « Les paramètres appartiennent aux pièces qui les lisent » ;
- « Réalisation du plan H5 » (D3 : « ce qu’un niveau règle aujourd’hui »).

**Réponse de l’auteur (2026-10-27) à la question de la Reprise :** le tempo du geste change **en cours de séance, à une respiration**. La montée est annoncée, puis une mesure est comptée au nouveau tempo, comme le rythme le fait entre deux suites.

## Global Constraints

- **Branche et vérification :**
  - Branche `plan/temps-musical-h6`, worktree `.worktrees/temps-musical-h6`, partie de `main` (`e049815` ou plus récent).
  - `npm test && npm run check` vert à chaque commit.
  - Tests avant le code ; chaque test affirme.
  - Une fusion, à la fin (D1).
- **Aucun code ne nomme un exercice.** Ce qui est ajouté est une pièce du moteur ou une donnée d’exercice. Le contrôleur, le compilateur, la politique et `PlayFrame` ne nomment ni mécanique, ni exercice, ni capteur. Le test de frontière de `series/` couvre le contrôleur unique et ses nouveaux fichiers (`cycle/` excepté, voir D8).
- **Ce qui ne change pas de comportement :**
  - Localiser, identifier et les triades : `notesSession.spec.ts`, `triadsSession.spec.ts`, `dataOnlyExercise.spec.ts`, `openness.spec.ts` restent verts sans changer leurs attentes.
  - Le rythme : chaque comportement couvert par `PlanSessionController.svelte.spec.ts` est rejoué sur la série (Tasks 7 et 8) avant que ce fichier soit supprimé.
  - Le geste ne change que là où D3 et D4 le disent.
- **Les définitions restent de la pure donnée** : le test « writes every exercise as plain data » de `catalog.spec.ts` couvre aussi les niveaux d’exercice et les exercices du rythme.
- **Rien n’est gardé « pour plus tard »** : le critère de fin (Task 11) est une recherche dans `src` et `scripts`, hors `migrations/` et `legacy/`.
- **Vocabulaire** (un nom par concept) :
  - « niveau » / `level` ; « niveau d’exercice » (l’axe de la séance) et « niveau d’item » (l’échelle, `ladder`) ;
  - « surcharge » / `override` ; « portée » / `scope` ;
  - « respiration » / `breath` ; « suite » / `run` ; « mesure comptée » / `count-in` ;
  - « tour » / `round` ; un « cycle » est un tour du rythme.
- **Textes d’interface** en français et en anglais, jamais sous 16 px.
- **Commits :** Conventional Commits en minuscules, impératif, orientés comportement ; terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Décisions prises par ce plan (à relire par l’auteur)

- **D1 — Une branche, deux parties, une fusion.**
  - Partie A (Tasks 1 à 4) : les niveaux d’exercice, le tempo du geste en séance, la fin de `Progression`, Dexie 11.
  - Partie B (Tasks 5 à 10) : le contrôleur unique.

  La partie A est complète à elle seule ; si la partie B traîne, l’auteur peut demander de fusionner A d’abord. Le chantier 2 prend la version 12.

- **D2 — Un niveau surcharge des chemins pointés.** `{ tempo: 90, 'windows.perfectMs': 60 }` remplace ces deux valeurs, et rien d’autre. Un objet écrit à un chemin le remplace en entier : l’accompagnement d’un niveau du rythme remplace celui de l’exercice, sans fusion. Exception : `thresholds` du rythme, aujourd’hui fusionné clé par clé, s’écrit désormais `'thresholds.precision': 50`, sans règle à part.
  - Ce qui est refusé (`validateExercise`) : un chemin qui traverse une valeur qui n’est pas un objet (`'tempo.bpm'` quand `tempo` vaut 80) et un niveau d’item qui écrit `leadBeats` ou `aided` hors de leur forme.
  - Ce qui est accepté : un chemin qu’aucune pièce ne lit. Il est sans effet, le guide d’écriture le signalera (amendement du 2026-10-26).
  - Ce que vit l’auteur d’un exercice : un niveau peut monter le tempo et resserrer la fenêtre de `perfect` à la fois ; un niveau d’item peut élargir la fenêtre d’un item difficile.

- **D3 — Le tempo du geste monte en séance, à une respiration** (réponse de l’auteur).
  - Données : chaque exercice du geste écrit 17 niveaux, de 80 à 160 bpm par pas de 5 (la plage de `DEFAULT_TEMPO` d’aujourd’hui). Chaque niveau monte après `pass: { successes: 10 }` changements réussis de suite, sans aide, et descend après `drop: { failures: 3 }` changements ratés de suite. **Valeurs à confirmer par l’auteur** : elles remplacent « plus de 90 % de la séance, au moins 10 changements » et « moins de 70 % ».
  - Portée : un niveau par exercice et par grille, comme la progression d’aujourd’hui. Une ballade et un blues montent chacun de leur côté ; le relier a un seul niveau.
  - Moment : le niveau bouge à chaque changement réglé, mais le tempo joué ne change qu’au prochain tour qui ne s’enchaîne pas. Pour le geste, c’est le prochain passage, après sa mesure comptée. Un tour de relier rejoué à la suite (`continued`) garde le tempo.
  - Ce que le joueur vit : il finit son passage au tempo où il l’a commencé ; le cadre annonce « Niveau 4 · ♩ = 95 » pendant la mesure comptée, puis le passage suivant se joue à 95.
  - Ce que ça coûte si c’est faux : un tempo qui monte trop vite. Il se règle dans les données (`pass`, `drop`), sans code.

- **D4 — Le bilan du geste dit le tempo du premier et du dernier passage** (« ♩ = 80 → 90 »), lus sur les essais. Il ne prédit plus un « tempo suivant » : le niveau enregistré est celui que la séance a atteint, et la séance suivante le reprend.

- **D5 — Dexie 11 et sauvegarde 7** (`migrations/v11.ts`, appliquée par la mise à niveau et par l’import) :
  - Une progression du geste devient le niveau d’exercice de sa portée : le plus haut niveau dont le tempo ne dépasse pas celui de la progression. Exemples : 112,5 bpm → 110 bpm, niveau 7 ; 200 bpm → 160 bpm, niveau 16 ; 70 bpm → 80 bpm, niveau 0. Les tempos sont figés dans `GESTURE_TEMPOS_V11`, avec un test fil-piège contre le catalogue.
  - Les autres progressions sont abandonnées : celles de localiser, d’identifier et des triades, que le jeu ignore depuis le plan L, et celles d’une grille sans portée, que le jeu ignore depuis la version 7.
  - Un `LevelState` déjà là est gardé.
  - Les tables `progressions` et `scopedProgressions` sont supprimées.
  - `Attempt.tempoScope` devient `Attempt.scope` : la portée est celle du niveau d’exercice, plus seulement du tempo.
  - Une sauvegarde 7 refuse `progressions` et `tempoScope`. Une sauvegarde 6 passe par `backupV6ToV7`.
  - Ce que le joueur vit : un blues travaillé jusqu’à 110 bpm reprend à 110.

- **D6 — L’anti-blocage devient une donnée du déroulé** (`flow.antiBlocking`, absent : non). Les trois exercices du rythme l’écrivent `true`.
  - Pourquoi : appliqué au geste, trois changements ratés de suite à 80 bpm finiraient la séance sur « On change d’air ». C’est une règle écrite pour le rythme ; elle devient un réglage de l’exercice, sa valeur par défaut gardant le comportement d’aujourd’hui de chaque exercice.
  - Ce qui reste du code : ses constantes (`BLOCK_AFTER_FAILS`, `BLOCK_SAME_SPOT_CYCLES`, `BLOCK_REST_MS`), déjà listées comme données à venir dans la Reprise.

- **D7 — Une seule politique de frontières, `next`, pour toute série.**
  - Une suite finit quand l’une de deux conditions est remplie : elle a joué `pacing.roundsPerBreath` tours (le rythme : 4, aujourd’hui `cyclesPerBreath`), ou l’item suivant demande une mesure comptée (le geste : un nouveau passage). Absent, `roundsPerBreath` ne borne rien.
  - La respiration dure au moins `pacing.breathMinMs`. Le rythme écrit `BREATH_MIN_MS` (4 000 ms) ; sans valeur, 0 ms, ce qui garde la respiration actuelle des notes et des triades (`respirationBars` entre deux tours d’une suite, inchangé).
  - La série finit à la première frontière après sa durée où le tour suivant ne s’enchaîne pas. C’est la règle des séries de réponses d’aujourd’hui ; pour le rythme, dont les cycles d’une suite s’enchaînent, elle revient à « à la respiration », comme aujourd’hui.
  - Le niveau d’une suite est fixe ; un changement s’applique à la suite suivante (D3).
  - Ce que vit le joueur : rien de nouveau en localiser ou dans les triades. Dans le geste, une montée de tempo entre deux passages. Dans le rythme, rien.

- **D8 — Le cycle reste un compilateur à part jusqu’à la séquence (S).** Un exercice qui écrit `figures` a ses tours compilés par `compileCyclePlan` depuis la figure de l’item et ses paramètres résolus (accompagnement, `cycleBars`, fenêtre). Les autres sont compilés par `compileRound`. Le code qui nomme le cycle (`cycle/` : source des figures, compilation, enregistrement, modèle d’écran `rhythm-figure`) est classé **exception** ci-dessous. La séquence l’absorbera dans `round.figure` (D10 de H5).

- **D9 — Annonces, réécoute et trace pour toutes les séries.**
  - Les annonces quittent le modèle de la vue du rythme pour `PlayView.announcement`, que `PlayFrame` affiche pendant la respiration et la mesure comptée : `level-up`, `level-down`, `aid-level`, `listen-remedy`, `play-along`, `change-of-air`.
  - La réécoute de la dernière suite (R) et la trace dans `SessionMemory` valent pour toute série. Écouter (E) reste réservé à un exercice qui sait faire sonner son contenu (`canSound` : il écrit `figures`).
  - Ce que le joueur vit de nouveau : en pause, il peut réécouter son dernier passage du geste ou ses dernières notes.

- **D10 — `PlayFrame` prend son monde de la vue de l’exercice dès l’écran de départ.** `ready()` place la vue du premier exercice de la série, et le repli sur le genre de séance disparaît. Quitter pendant la demande d’accès au micro ferme l’entrée dès qu’elle s’ouvre.

**Les pièces, classées** (primitive du moteur, donnée d’exercice, exception) :

| Pièce                                                                               | Classe    | Ce qu’elle permet                                                                                             |
| ----------------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------- |
| `overrideParams`, `resolvedParamsOf(definition, { exerciseLevel, itemLevel })`      | primitive | tout niveau, d’exercice ou d’item, règle n’importe quel paramètre, tempo compris                              |
| `ExerciseDefinition.levels` pour tout exercice, `tempo` en nombre                   | donnée    | une progression d’exercice sans code : tempo, fenêtres, accompagnement, n’importe quel paramètre              |
| niveau d’exercice tenu par la série (`ExerciseLevels`), appliqué à la respiration   | primitive | un niveau qui bouge en séance pour tout exercice, annoncé, avec mesure comptée au nouveau tempo               |
| `placeNext` (`series/placement.ts`)                                                 | primitive | la place du tour suivant décidée en un lieu pur : enchaîné, après respiration, au temps suivant, après compte |
| `next` avec `roundsPerBreath`, `breathMinMs`, item suivant compté                   | primitive | les suites et les respirations de toute série, en données                                                     |
| `flow.antiBlocking`                                                                 | donnée    | l’anti-blocage choisi par l’exercice                                                                          |
| `PlayView.announcement`                                                             | primitive | une annonce de niveau pour toute vue                                                                          |
| trace, prises, réécoute dans la série                                               | primitive | réécouter la dernière suite de tout exercice                                                                  |
| niveaux du geste (17 tempos, `pass`, `drop`)                                        | donnée    | le tempo du geste en séance                                                                                   |
| `GESTURE_TEMPOS_V11`, `v11.ts`                                                      | migration | figée, jamais lue par le jeu                                                                                  |
| `cycle/` : `createFigureSource`, compilation du cycle, `recordCycle`, `rhythmStage` | exception | le rythme sur la série, en attendant `round.figure` (S) ; à absorber par la séquence                          |

## Review Focus

- **Une vraie base au moment de la mise à niveau.** Données : une progression `gesture-climb`/`blues-f` à 112,5 bpm, une `gesture-link` sans portée à 95, une `locate` à 120, une `gesture-zone` sans portée, et un `LevelState` déjà présent pour `gesture-jam`/`iohefy-a`. Après la montée en version 11, on attend : les niveaux 6 (climb/blues), 3 (link) et celui déjà là (jam) ; rien pour locate ni pour la zone sans portée ; plus de tables de progression ; `scope` à la place de `tempoScope` sur chaque essai. L’import d’une sauvegarde 6 avec les mêmes données donne la même base (Task 4).
- **Une montée au dernier changement d’un tour de relier raté.** Le tour est rejoué à la suite (`continued`) : il garde l’ancien tempo, et le tour suivant qui ne s’enchaîne pas part au nouveau, après l’annonce (Task 3).
- **Une pause pendant la mesure comptée qui annonce une montée.** La reprise compte au nouveau tempo et remontre l’annonce ; le niveau enregistré n’est pas compté deux fois (Task 3).
- **La durée de la séance passe pendant qu’un changement de niveau attend.** Le niveau atteint est enregistré (la séance suivante part de lui) même s’il n’a pas été joué, et le bilan dit le dernier tempo joué, pas le tempo atteint (Tasks 3 et 4).
- **Un rythme dont un niveau change le tempo à une respiration, pendant qu’une réécoute est demandée.** La réécoute rejoue la dernière suite à son tempo, puis la suite suivante est comptée au nouveau (Task 8).

---

## File Structure

**Domaine**

- `domain/exercise/levels.ts` (nouveau) : `overrideParams`, `exerciseLevelsOf`, `resolvedParamsOf`, `tempoOf`.
- `domain/exercise/tempo.ts` : réduit à `DEFAULT_TEMPO_BPM` ; `ExerciseTempo`, `DEFAULT_TEMPO`, `clampTempo`, `isProgressionOf`, `startTempo`, `nextTempo` supprimés.
- `domain/exercise/types.ts` : `tempo?: number`, `levels?: readonly Level<LevelOverrides>[]` pour tout exercice ; `startTempoBpm`, `base` et `Progression` supprimés ; `ExerciseFlow.antiBlocking` ; `ExercisePacing.roundsPerBreath`, `breathMinMs`.
- `domain/exercise/round/compile.ts` : `roundParamsOf` lit `resolvedParamsOf`.
- `domain/exercise/validate.ts` : chemins de niveau.
- `domain/exercise/rhythmCatalog.ts` : `base` passe dans `params`, niveaux en chemins.
- `domain/gesture/exercises.ts` : 17 niveaux de tempo.
- `domain/gesture/summary.ts` : `tempoBpm`, `lastTempoBpm`.
- `domain/time/levels.ts` : `LevelParams.tempo` devient un nombre ; `resolveLevel` supprimé (remplacé par `resolvedParamsOf`) ; `checkStart` gardé.
- `domain/session/policy.ts` : `SeriesRules` généralisé, `next(state, rules, elapsedMs, coming)`.
- `domain/session/block.ts` : `SettledRound.report` et `verdict` facultatifs.
- `domain/types.ts` : `PlannedItem.scope`, `Attempt.scope` ; `SessionSummary.gesture` suit D4.

**Application**

- `application/session/series/placement.ts` : `placeNext` et son type `Placement`.
- `application/session/series/exerciseLevels.ts` (nouveau) : `ExerciseLevels`, le niveau d’exercice par (exercice, portée) pendant une série.
- `application/session/series/ResponseSeriesController.svelte.ts` → `application/session/SessionController.svelte.ts` (Task 9).
- `application/session/plan/` → `application/session/cycle/` : `figureSource.ts` (nouveau), `compileCycle.ts` (nouveau, depuis le contrôleur), `recordCycle.ts`, `rhythmStage.ts`, `exerciseSummary.ts` ; `PlanSessionController*` et `rhythmExercise.ts` supprimés.
- `application/session/series/seriesEnd.ts` : supprimé (`nextProgressions`).
- `application/session/SessionDeps.ts` : `PlanSessionDeps` et `ResponseSeriesDeps` deviennent `SessionControllerDeps` ; `progressions` disparaît, `levels`, `takes` et `memory` entrent.
- `application/session/contract.ts` : `PlayView.announcement`.
- `application/services/createAppServices.ts` : préparations sans tempo ; `startExercise` sur le contrôleur unique.
- `application/ports/repositories.ts` : `ProgressionRepositoryPort` supprimé.

**Infrastructure**

- `infrastructure/storage/migrations/v11.ts` (nouveau) et `v11.spec.ts`.
- `infrastructure/storage/db.ts` : version 11.
- `infrastructure/storage/validateBackup.ts`, `DexieBackup.ts`, `backupFile.ts` : sauvegarde 7.
- `infrastructure/storage/DexieProgressionRepository*`, `testing/progressionRepositoryContract.ts` : supprimés.

**Interface**

- `ui/play/PlayFrame.svelte` : annonce, monde pris de la vue.
- `ui/play/views/RhythmFigureView.svelte`, `rhythmMessages.ts` : l’annonce en sort.
- `ui/screens/summary/SummaryScreen.svelte` : la ligne de tempo du geste.
- `routes/dev/rhythm`, `ui/play/demo/*`, `testing/*` : sur le contrôleur unique.

---

## Partie A — Les niveaux d’exercice

### Task 1: Le placement en unité propre

**Files:**

- Modify: `src/lib/application/session/series/placement.ts`, `placement.spec.ts`
- Modify: `src/lib/application/session/series/ResponseSeriesController.svelte.ts` (`advance`, `placeAfter`, `chainable`, `placeFollowing`, `comingStart`, `startOf`)

**Interfaces:**

- Produces:

  ```ts
  export interface PlacementContext {
  	/** Where the round before ends, and whether it hands over there. */
  	earliest: Fraction;
  	handover: boolean;
  	/** The round before was in free time and settled on its answer. */
  	freeTimeBefore: boolean;
  	current: { tempo: number; meter: Meter; scene: Scene };
  	coming: { tempo: number; meter: Meter; scene: Scene; countIn: boolean; restBars: number };
  	plan: RoundPlan;
  	/** First bar whose start is not past (`audibleBar`). */
  	firstAudibleBar: number;
  }
  export type Placement =
  	| { kind: 'chain'; start: Fraction }
  	| { kind: 'after-breath'; start: Fraction }
  	| { kind: 'next-beat'; start: Fraction }
  	| {
  			kind: 'count-in';
  			fromBar: number;
  			tempo: number | null;
  			meter: Meter | null;
  			restBars: number;
  	  };
  export function placeNext(context: PlacementContext): Placement;
  ```

- [ ] **Step 1: Write the failing tests** in `placement.spec.ts`, one per kind, each on a plan built with `compileRound` from a catalog exercise:
  - `chains at the handover when nothing changes`: geste, `handover: true`, même tempo, mètre, scène, `countIn: false` → `{ kind: 'chain', start: earliest }`.
  - `places after the breath on the first start its plan allows`: localiser, `handover: false` → `{ kind: 'after-breath', start: timedStart(earliest, plan, meter) }`.
  - `opens on the next beat in free time`: identifier → `{ kind: 'next-beat', start: nextBeat(earliest, meter) }`.
  - `counts a bar at another tempo`: tempo 85 au lieu de 80 → `{ kind: 'count-in', tempo: 85, meter: null, restBars: 0 }`.
  - `counts a bar in another meter`: 3/4 → `meter` du mètre 3/4, `tempo` celui de l’item.
  - `asks its rest bars before a counted bar`: `countIn: true, restBars: 2` → `restBars: 2`, `fromBar` = `firstAudibleBar` quand `earliest` est passé.
  - `never counts rest bars at a change of tempo or meter` (comportement actuel épinglé, point mineur de L) → `restBars: 0`.
- [ ] **Step 2: Run** `npx vitest run src/lib/application/session/series/placement.spec.ts` — FAIL, `placeNext` absent.
- [ ] **Step 3: Implement `placeNext`** with the rules of `advance`/`placeAfter`/`chainable` as they stand. The controller builds the context, calls `placeNext`, and applies the result with the transport (`changeMeter`, `changeTempo`, `countIn`) as before. No transport call moves into `placement.ts`.
- [ ] **Step 4: Run** `npm test && npm run check` — PASS, no change to the series specs.
- [ ] **Step 5: Commit** `refactor: decide where the next round goes in one pure function`

### Task 2: Un niveau surcharge n’importe quel paramètre

**Files:**

- Create: `src/lib/domain/exercise/levels.ts`, `levels.spec.ts`
- Modify: `domain/exercise/types.ts`, `tempo.ts`, `validate.ts` (+ spec), `round/compile.ts` (+ spec), `catalog.ts`, `rhythmCatalog.ts` (+ spec), `domain/time/levels.ts` (+ spec)
- Modify: `application/session/plan/rhythmExercise.ts`, `PlanSessionController.svelte.ts` (lire les paramètres résolus), `application/session/series/seriesItems.ts`, `application/services/createAppServices.ts`

**Interfaces:**

- Produces:

  ```ts
  /** Dotted paths of the resolved params and the values that replace them. */
  export type LevelOverrides = Readonly<Record<string, unknown>>;
  export function overrideParams(
  	params: Readonly<Record<string, unknown>>,
  	overrides: LevelOverrides
  ): Readonly<Record<string, unknown>>;
  /** The exercise's levels; one implicit level `{ params: {} }` when it writes none. */
  export function exerciseLevelsOf(
  	definition: ExerciseDefinition
  ): readonly Level<LevelOverrides>[];
  /** Exercise params (`exerciseParamsOf`, with `tempo`), then the exercise level, then the item level. */
  export function resolvedParamsOf(
  	definition: ExerciseDefinition,
  	at: { exerciseLevel: number; itemLevel: number | null; mechanic?: MechanicId }
  ): Readonly<Record<string, unknown>>;
  export function tempoOf(definition: ExerciseDefinition, exerciseLevel: number): number;
  ```

  - `ExerciseDefinition.levels?: readonly Level<LevelOverrides>[]` ; `base` supprimé. Les paramètres résolus portent `tempo` (un nombre) ; `ExerciseDefinition.tempo` devient lui-même un nombre en Task 3.
  - `LevelParams.tempo: number` ; le rythme lit ses `LevelParams` par `rhythmParamsOf(definition, level): LevelParams` (`plan/rhythmExercise.ts`, qui appelle `resolvedParamsOf` puis `checkStart`).
  - `PlannedItem.exerciseLevel: number` (0 quand l’exercice n’écrit pas de niveaux ; la série le remplit en Task 3, la source écrit 0 jusque-là).
  - `roundParamsOf(definition, item, { previewBeats })` lit `resolvedParamsOf(definition, { exerciseLevel: item.exerciseLevel, itemLevel: item.level })`, puis `leadBeats` et `previewBeats` comme aujourd’hui.

- [ ] **Step 1: Write the failing tests** in `levels.spec.ts`:
  - `replaces the value at a dotted path and nothing else`: `overrideParams({ windows: { perfectMs: 80, lateMs: 300 }, tempo: 80 }, { 'windows.perfectMs': 60 })` → `{ windows: { perfectMs: 60, lateMs: 300 }, tempo: 80 }`, et l’objet reçu n’est pas modifié.
  - `replaces a whole object written at a path`: `{ accompaniment: B }` sur `{ accompaniment: A }` → `B`, sans fusion.
  - `creates a missing path`: `{ 'pacing.breathMinMs': 2000 }` sur des paramètres sans `pacing.breathMinMs` → présent.
  - `throws on a path through a value that is not an object`: `{ 'tempo.bpm': 90 }` sur `tempo: 80` → erreur qui nomme `tempo.bpm`.
  - `resolves exercise, then exercise level, then item level`: un exercice `tempo: 80`, niveau d’exercice `{ tempo: 90, 'windows.perfectMs': 60 }`, niveau d’item `{ leadBeats: 4, aided: false, 'windows.perfectMs': 100 }` → `tempo` 90, `windows.perfectMs` 100.
  - `gives one implicit level to an exercise without levels`: `exerciseLevelsOf(LOCATE)` → `[{ params: {} }]`, `tempoOf(LOCATE, 0)` → 80.
- [ ] **Step 2: Add to `validate.spec.ts`:**
  - `refuses a level path through a number, naming the exercise, the level and the path`;
  - `refuses an item level whose leadBeats is not a beat count`;
  - `accepts a level path no piece reads`.
- [ ] **Step 3: Add to `rhythmCatalog.spec.ts`:**
  - `resolves every level of every rhythm exercise to the params it resolved to before`, contre une table figée des `LevelParams` d’aujourd’hui (à écrire depuis `resolveLevel` avant de le supprimer ; tempo en nombre) ;
  - `writes thresholds as dotted paths`.
- [ ] **Step 4: Add to `compile.spec.ts`:** `reads a window an exercise level overrides` et `reads a window an item level overrides` (localiser avec un niveau d’échelle `'windows.perfectMs': 120` → `expectations[0].window.ms` = 120).
- [ ] **Step 5: Run** the four specs — FAIL.
- [ ] **Step 6: Implement.**
  - `levels.ts` per the interfaces.
  - The rhythm: `base` moves into `params` (with `sensor`), `tempo(bpm)` becomes a number, and each level is written as paths (`thresholds` per key).
  - `resolveLevel` is deleted ; `levelRange`, `nextLevelState` and `checkStart` stay.
  - The response exercises keep `ExerciseTempo` in this task: the resolved `tempo` is the fixed tempo, or the range’s `start`. `startTempo`/`nextTempo` still move the gesture between sessions until Task 3.
- [ ] **Step 7: Run** `npm test && npm run check` — PASS.
- [ ] **Step 8: Commit** `feat: let any level override any parameter, tempo included`

### Task 3: La série tient le niveau d’exercice ; le geste monte en séance

**Files:**

- Create: `src/lib/application/session/series/exerciseLevels.ts`, `exerciseLevels.spec.ts`
- Modify: `domain/session/policy.ts` (+ spec), `domain/session/block.ts`, `domain/exercise/types.ts` (`ExerciseFlow.antiBlocking`), `domain/exercise/rhythmCatalog.ts` (`flow: { antiBlocking: true }`), `domain/gesture/exercises.ts`
- Modify: `application/session/contract.ts` (`PlayView.announcement`), `series/ResponseSeriesController.svelte.ts`, `series/seriesView.ts`, `SessionDeps.ts` (`ResponseSeriesDeps.levels`), `services/createAppServices.ts`, `composition/createApp.ts`
- Modify: `ui/play/PlayFrame.svelte` (+ spec), `ui/play/messages.ts`
- Test: `series/gestureSession.spec.ts`

**Interfaces:**

- Consumes: `exerciseLevelsOf`, `tempoOf` (Task 2), `placeNext` (Task 1).
- Produces:

  ```ts
  export type Announcement = 'level-up' | 'level-down' | 'aid-level' | 'listen-remedy' | 'play-along' | 'change-of-air';
  // PlayView
  announcement: { kind: Announcement; level: number; of: number; tempoBpm: number } | null;

  export class ExerciseLevels {
  	constructor(deps: { levels: LevelStateRepositoryPort; exercise: (id: ExerciseId) => ExerciseDefinition; now: () => number });
  	/** Loads the stored state of (exercise, scope), item '', clamped into the exercise's range; level 0 when none. */
  	load(exerciseId: ExerciseId, scope?: string): Promise<void>;
  	/** The level the next run of (exercise, scope) plays: the pending change applied. */
  	played(exerciseId: ExerciseId, scope?: string): number;
  	/** A settled round moves the state (`settle` of the policy) and stores it; a change waits for `apply`. */
  	settle(round: { exerciseId: ExerciseId; scope?: string; level: number; success: boolean; aided: boolean }): Promise<'up' | 'down' | null>;
  	/** At a round that does not chain: the change waiting for (exercise, scope) becomes the level played. */
  	apply(exerciseId: ExerciseId, scope?: string): Announcement | null;
  }
  ```

  - `SeriesRules.antiBlocking: boolean` ; `settle` skips the anti-blocking when it is false.
  - `SettledRound.report` and `verdict` become optional ; `diagnoseBlock` gives `'unclear'` for a round without report.
  - `PrepareResponseSeries` no longer returns `executions` : the series writes `SessionRecord.executions` itself, one per (exercise, scope) met, with the tempo of its first round. `Execution` stays as the stored record.

- [ ] **Step 1: Write the failing tests** in `exerciseLevels.spec.ts` (fake `InMemoryLevelStateRepository`, a data exercise with three tempo levels `pass: 2`, `drop: 2`):
  - `starts at the stored level of the scope, level 0 without one`.
  - `clamps a stored level above the exercise's highest`.
  - `moves up after the passes but plays the old level until apply`: deux réussites → `settle` rend `'up'`, `played` = 0 ; `apply` rend `'level-up'`, `played` = 1.
  - `stores the state at each settle` (le dépôt a le niveau 1 avant `apply`).
  - `keeps scopes apart`: une réussite sur `blues-f` ne touche pas `iohefy-a`.
  - `never acts the anti-blocking without antiBlocking`: cinq ratés au niveau 0 → niveau 0, pas de `ending`.
- [ ] **Step 2: Add to `policy.spec.ts`:** `acts the anti-blocking only when the rules ask it`.
- [ ] **Step 3: Add to `gestureSession.spec.ts`** (banc `testing/gestureSeries.ts`, horloge factice ; un exercice de geste avec ses 17 niveaux) :
  - `raises the tempo at the next passage after ten right changes`: le passage en cours finit à 80 ; le passage suivant est précédé d’une mesure comptée à 85 ; `view.announcement` vaut `{ kind: 'level-up', level: 1, of: 17, tempoBpm: 85 }` pendant ce compte, puis `null` au premier changement ; l’essai suivant a `tempoBpm: 85`.
  - `keeps the tempo through a link tour played again` (Review Focus) : montée au dernier changement d’un tour raté → le tour `continued` reste à 80 ; le tour suivant compté part à 85.
  - `counts again at the new tempo after a pause in the counted bar` (Review Focus) : pause pendant le compte annoncé, reprise → compte à 85, annonce remontrée, `levelStates` au niveau 1 (pas 2).
  - `stores the level reached when time runs out before it is played` (Review Focus) : niveau 1 enregistré, aucun essai à 85.
  - `starts the next session at the stored level`.
- [ ] **Step 4: Add to `PlayFrame.svelte.spec.ts`:** `shows the announcement with level and tempo` (« Niveau 2 sur 17 · ♩ = 85 », fr et en, ≥ 16 px).
- [ ] **Step 5: Run** the four specs — FAIL.
- [ ] **Step 6: Implement.**
  - The tempo becomes a number: `ExerciseDefinition.tempo?: number` (locate and the triads write `tempo: 80`, the gesture `tempo: 80` instead of `startTempoBpm`). `ExerciseTempo`, `DEFAULT_TEMPO`, `clampTempo` and `startTempoBpm` are deleted ; `tempo.ts` keeps `DEFAULT_TEMPO_BPM` and, until Task 4, `startTempo` for the stored progressions read as a start (a gesture scope without a level state yet).
  - Gesture data: `levels` of 17 tempos, `pass: { successes: 10 }`, `drop: { failures: 3 }`, written by a helper of `exercises.ts` that returns plain data.
  - The series: it loads the exercise levels of an item’s (exercise, scope) before its first round. It fills `PlannedItem.exerciseLevel` with `played` and takes the tempo from `tempoOf(definition, played)` instead of `sessionTempo`. Each settled round goes to `ExerciseLevels.settle`. At each placement that is not `chain`, it calls `apply` before taking the tempo; an announcement shows from the counted bar until the first prompt, and stays across a pause.
  - The rhythm does not change yet (Task 8 moves it).
  - `nextProgressions` is no longer called for an exercise with levels.
- [ ] **Step 7: Run** `npm test && npm run check` — PASS.
- [ ] **Step 8: Commit** `feat: raise the gesture's tempo at the next passage once its level moves`

### Task 4: Plus de progression de tempo : Dexie 11 et sauvegarde 7

**Files:**

- Create: `src/lib/infrastructure/storage/migrations/v11.ts`, `v11.spec.ts`
- Modify: `infrastructure/storage/db.ts` (+ `db.spec.ts`), `validateBackup.ts` (+ spec), `DexieBackup.ts` (+ spec), `backupFile.ts`, `testing/fixtures.ts`
- Delete: `DexieProgressionRepository.ts` (+ spec), `testing/progressionRepositoryContract.ts`, `application/session/series/seriesEnd.ts` (+ spec), `ProgressionRepositoryPort`, `InMemoryProgressionRepository`
- Modify: `domain/exercise/tempo.ts` (reste `DEFAULT_TEMPO_BPM`), `domain/exercise/types.ts` (`Progression` supprimé), `domain/types.ts` (`scope`), `domain/gesture/summary.ts` (+ spec), `domain/progress/gestureSelector.ts`, `series/recordResponse.ts`, `series/seriesItems.ts`, `ui/screens/summary/SummaryScreen.svelte` (+ messages), `ui/play/demo/*`, `testing/*`, `composition/createApp.ts`

**Interfaces:**

- Produces:

  ```ts
  /** The gesture's tempo levels at version 11, frozen. */
  export const GESTURE_TEMPOS_V11: readonly number[]; // 80, 85, …, 160
  export const GESTURE_EXERCISES_V11: readonly string[]; // 'gesture-link', 'gesture-climb', 'gesture-zone', 'gesture-jam'
  export function gestureLevelOfTempo(tempoBpm: number): number;
  export function levelStatesV11(
  	progressions: readonly ProgressionV10[],
  	existing: readonly LevelState[]
  ): LevelState[];
  export function attemptToV11<T extends { tempoScope?: string }>(
  	attempt: T
  ): Omit<T, 'tempoScope'> & { scope?: string };
  export function backupV6ToV7(backup: BackupV6): BackupV7;
  ```

  - `PlannedItem.tempoScope` → `PlannedItem.scope` ; `Attempt.tempoScope` → `Attempt.scope`.
  - `GestureSummary.exercises[]` : `tempoBpm` (premier tour joué) et `lastTempoBpm` (dernier), `nextTempoBpm` supprimé.

- [ ] **Step 1: Write the failing tests** in `v11.spec.ts`:
  - `maps a tempo to the highest level not above it`: 112,5 → 6 ; 200 → 16 ; 70 → 0 ; 80 → 0 ; 160 → 16.
  - `turns each gesture progression into its scope's exercise level`: `{ gesture-climb, scope blues-f, 112.5 }` → `{ exerciseId: 'gesture-climb', scope: 'blues-f', item: '', level: 6, successes: 0, failures: 0, resumeAfter: null }` ; `{ gesture-link, sans portée, 95 }` → `scope: ''`, niveau 3.
  - `drops the progressions the game ignores`: `locate`, `triads`, `gesture-zone` sans portée → rien.
  - `keeps a level state already there`.
  - `renames tempoScope to scope on attempts`, et un essai sans `tempoScope` reste sans `scope`.
  - `freezes the gesture tempos against the catalog` (fil-piège) : pour chaque exercice de `GESTURE_EXERCISES_V11`, `exerciseLevelsOf(definition).map((_, i) => tempoOf(definition, i))` égale `GESTURE_TEMPOS_V11`.
  - `converts a backup 6 to 7`: plus de `progressions`, `levelStates` complété, `scope` sur les essais, `version: 7`.
- [ ] **Step 2: Add to `db.spec.ts`** `upgrades a version 10 database to 11` with the Review Focus data. Add to `validateBackup.spec.ts`: `refuses a backup 7 with progressions` ; `refuses a backup 7 attempt with tempoScope` ; `imports a backup 6 to the same base as the upgrade`.
- [ ] **Step 3: Add to `summary.spec.ts`** (gesture) : `tells the first and the last tempo played` (essais à 80 puis 85 → `tempoBpm: 80`, `lastTempoBpm: 85`). In the summary screen spec : « ♩ = 80 → 85 », et « ♩ = 80 » seul quand ils sont égaux.
- [ ] **Step 4: Run** these specs — FAIL.
- [ ] **Step 5: Implement.**
  - Dexie version 11 : `progressions: null`, `scopedProgressions: null`, and the upgrade applying `levelStatesV11` then `attemptToV11` in one transaction. An unknown mechanic aborts it, as version 10 does.
  - Backup 7 : `backupV6ToV7` added at the end of the existing chain.
  - Delete the progression code listed above.
  - `createAppServices` loses its `startTempo` calls: locate and the triads take `tempoOf(definition, 0)`, and the gesture takes the level of its scope (Task 3).
- [ ] **Step 6: Run** `npm test && npm run check` — PASS.
- [ ] **Step 7: Commit** `feat: keep the gesture's tempo as its exercise level and drop the tempo progressions (dexie 11, backup 7)`

---

## Partie B — Un seul contrôleur

### Task 5: Une politique de frontières pour toute série

**Files:**

- Modify: `domain/session/policy.ts` (+ spec), `domain/exercise/types.ts` (`ExercisePacing`), `domain/exercise/pacing.ts` (+ spec), `domain/exercise/rhythmCatalog.ts` (+ spec), `domain/time/levels.ts` (`cyclesPerBreath` sort de `LevelParams`)
- Modify: `application/session/series/ResponseSeriesController.svelte.ts`, `application/session/plan/PlanSessionController.svelte.ts`, `application/session/transport.ts` (`BREATH_MIN_MS` devient défaut du rythme dans ses données, la constante supprimée)

**Interfaces:**

- Produces:

  ```ts
  export interface SeriesRules {
  	levels: readonly Level<LevelOverrides>[];
  	/** Rounds a run plays before its breath at this level; null: the items decide (a counted bar). */
  	roundsPerBreath(level: number): number | null;
  	listen(level: number): 'free' | 'aid' | 'none';
  	canSound: boolean;
  	antiBlocking: boolean;
  	budgetMs: number;
  }
  /** `coming`: the next item, taken from its source; null when the source has nothing more. */
  export function next(
  	state: SeriesState,
  	rules: SeriesRules,
  	elapsedMs: number,
  	coming: { chains: boolean; countIn: boolean } | null
  ): { state: SeriesState; next: Next };
  ```

  - `ExercisePacing` : `respirationBars`, `roundsPerBreath?: number`, `breathMinMs?: number` (absent : 0). `pacingOf` gives them.
  - The rhythm writes `'pacing.roundsPerBreath': 4` and `'pacing.breathMinMs': 4000` in its params ; levels that changed `cyclesPerBreath` write `'pacing.roundsPerBreath'`.

- [ ] **Step 1: Write the failing tests** in `policy.spec.ts`:
  - `ends a run after roundsPerBreath rounds`.
  - `ends a run when the coming item asks a counted bar`.
  - `never ends a run on roundsPerBreath null while rounds chain`.
  - `ends the series at the first boundary after its length where the next round does not chain`: `elapsedMs ≥ budgetMs`, `coming.chains` true → `round` ; false → `end` `'time'`.
  - `ends the series when the source has nothing more` (`coming: null` → `end`).
- [ ] **Step 2: Add to `rhythmCatalog.spec.ts`:** `breathes at least two bars at every level` now reads `'pacing.breathMinMs'` (the catalog test of today, moved).
- [ ] **Step 3: Run** — FAIL.
- [ ] **Step 4: Implement.** Both controllers ask `next` at each boundary. The response series peeks the coming item (`chains` from `placeNext(...).kind === 'chain'`); its own `spent`/`chainable` end rule is deleted. The rhythm passes `coming: { chains: true, countIn: false }` within a run and reads `breathMinMs` from its params.
- [ ] **Step 5: Run** `npm test && npm run check` — PASS, the series and rhythm specs unchanged.
- [ ] **Step 6: Commit** `refactor: let one policy decide runs, breaths and the end of every series`

### Task 6: Trace, prises et réécoute pour toute série

**Files:**

- Modify: `series/ResponseSeriesController.svelte.ts`, `series/seriesTrace.ts`, `SessionDeps.ts` (`ResponseSeriesDeps.takes`, `memory`), `services/createAppServices.ts`, `composition/createApp.ts`, `contract.ts` (`replay` sur le contrat commun s’il n’y est pas)
- Modify: `domain/session/summary.ts` (`summarizeSeries` sans hypothèse de cycle)
- Test: `series/ResponseSeriesController.svelte.spec.ts`, `domain/session/summary.spec.ts`

**Interfaces:**

- Consumes: `TraceBuilder` (segments `session` › `series` › `count-in`, `run` › `round`, `breath`, `pause`), `TakeBufferPort` (`keepFrom`, `keepUntil`, `stopKeeping`, `clear`, `holds`), `SessionMemory`.
- Produces: `SeriesTrace` writes the same segments as the rhythm, in audio seconds, as bars begin. `replay()` replays the last run from `TakeBufferPort` with its clicks resynthesized from the run’s sounds.

- [ ] **Step 1: Write the failing tests:**
  - `traces a gesture session as session › series › count-in, run › rounds` (passages = suites ; un segment `round` par changement, `interrupted` sur une coupure).
  - `replays the last passage at pause` : `takes.holds` vrai pour la suite ; `replay()` joue la prise et les clics de la suite, aucun essai écrit.
  - `keeps the latest session in memory` : `memory` a la trace et les suites rejouables après la fin.
  - In `summary.spec.ts` : `sums a run of response rounds up` (une suite sans mesures de cycle : tours, réussites, temps joué).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** by moving the rhythm’s `openTake`/`closeTake`/`keepRunTake`/`traceBar` logic into pieces of `series/` shared by both controllers (`seriesTakes.ts`), and have `PlanSessionController` use them.
- [ ] **Step 4: Run** `npm test && npm run check` — PASS.
- [ ] **Step 5: Commit** `feat: trace and replay the last run of any series`

### Task 7: Le cycle sur la série : figure, accompagnement, enregistrement

**Files:**

- Rename: `application/session/plan/` → `application/session/cycle/` (with `recordCycle`, `rhythmStage`, `exerciseSummary`)
- Create: `cycle/figureSource.ts` (+ spec), `cycle/compileCycle.ts` (+ spec)
- Modify: `series/ResponseSeriesController.svelte.ts`, `series/seriesProblem.ts` (+ spec), `series/boundaries.spec.ts`
- Create: `series/rhythmSession.spec.ts`, `testing/rhythmSeries.ts`

**Interfaces:**

- Produces:

  ```ts
  /** The items of a figure exercise: the same figure again (`loop`) or the next one (`next`), at the level played. */
  export function createFigureSource(definition: ExerciseDefinition): ItemSource;
  /** A cycle's plan from its item's figure and the resolved params of its level (D8). */
  export function compileCycle(
  	definition: ExerciseDefinition,
  	item: PlannedItem<RhythmItem>,
  	meter: Meter
  ): RoundPlan;
  ```

  - The series compiles with `compileCycle` when the exercise writes `figures`, else with `compileRound` (the one place that tells them apart, `series/compilePlan.ts`).
  - The accompaniment comes from the resolved params (`accompaniment`, muted bars) through `Transport.accompany`, for any exercise that writes one. An exercise without accompaniment keeps the series click (`seriesClick`).
  - A cycle settles `SETTLE_AFTER_BARS` after its end and is written by `recordCycle`; a response round is written by `recordResponse`, as today.
  - `seriesProblem` no longer refuses `unit: 'cycle'`, a verdict that `readsThresholds` (the series now gives the level’s thresholds) or `mutedBars`.

- [ ] **Step 1: Port the cycle specs.** Write `rhythmSession.spec.ts` on the series with the bench `testing/rhythmSeries.ts`, by porting the tests of `PlanSessionController.svelte.spec.ts` on: chained cycles of a run, muted bars (the cycle starts on the first muted bar, the click’s return judged once), `SETTLE_AFTER_BARS`, the attempt per cycle (`correct: null`, success, measures, aids, `CyclePlanRecord`), the screen model `rhythm-figure`, the first encounter (`howTo`), and `countIn: false` after the listen-in. Keep the same expected values.
- [ ] **Step 2: Write** `figureSource.spec.ts` (`loop` gives the same figure, `next` goes round the list, items keyed `${figureId}@${level}`) and `compileCycle.spec.ts` (the plan equals what `PlanSessionController` compiled for each rhythm exercise at levels 0 and highest, frozen table).
- [ ] **Step 3: Update `seriesProblem.spec.ts`:** the three refusals become acceptances, and `openness.spec.ts` stays green with them drawn.
- [ ] **Step 4: Run** — FAIL.
- [ ] **Step 5: Implement** per the interfaces. The cycle’s view model is built by `rhythmStage` from the series’ events. The boundary test of `series/` allows `cycle/` only from `compilePlan.ts` and the stage dispatch.
- [ ] **Step 6: Run** `npm test && npm run check` — PASS.
- [ ] **Step 7: Commit** `feat: play rhythm cycles on the series`

### Task 8: Le cycle sur la série : écoute, respiration, niveaux, anti-blocage

**Files:**

- Modify: `series/ResponseSeriesController.svelte.ts`, `series/exerciseLevels.ts`, `cycle/rhythmStage.ts`, `ui/play/views/RhythmFigureView.svelte` (+ spec), `ui/play/views/rhythmMessages.ts`
- Test: `series/rhythmSession.spec.ts`

**Interfaces:**

- Consumes: `next`/`settle`/`askListen` (Task 5), `ExerciseLevels` (Task 3), `PlayView.announcement` (Task 3), trace and takes (Task 6).
- Produces: `listen()` on the controller (key E, L in English). It inserts a heard cycle when `canSound`; the next played cycle carries `'listen'` when the level’s `listen` is `'aid'`. The rhythm view no longer has an `announcement` in its model.

- [ ] **Step 1: Port the rest of `PlanSessionController.svelte.spec.ts`** into `rhythmSession.spec.ts`:
  - listen-in of `listenInBars` and the demonstration on a first encounter ;
  - `listen()` and the play-along ;
  - the breath of `breathMinMs` in whole bars with the run’s marks ;
  - level up and down announced at the breath, with tempo change and a counted bar at the new tempo ;
  - the anti-blocking (remedies, aid levels, « On change d’air », `resumeAfter`) ;
  - `replay()` at pause ;
  - pause and quit at every phase ;
  - the summary (`summarizeExercise`, `levelReached`).
- [ ] **Step 2: Add** `replays the last run at its tempo, then counts the next run at the new one` (Review Focus).
- [ ] **Step 3: Run** — FAIL.
- [ ] **Step 4: Implement.** `ExerciseLevels` gives the rhythm its level state (item `''`, as today), and the anti-blocking through `flow.antiBlocking`. The announcements move to `PlayView.announcement`, and `RhythmFigureView` drops its own line. The remedies come from `next`.
- [ ] **Step 5: Run** `npm test && npm run check` — PASS, `PlanSessionController.svelte.spec.ts` still green (the old path is still there).
- [ ] **Step 6: Commit** `feat: give rhythm cycles on the series their listen, breath, levels and anti-blocking`

### Task 9: La bascule : un seul `SessionController`

**Files:**

- Delete: `application/session/plan/PlanSessionController.svelte.ts` (+ spec), `cycle/rhythmExercise.ts` (what remains moves to `cycle/`), `PlanSessionDeps`
- Rename: `series/ResponseSeriesController.svelte.ts` → `application/session/SessionController.svelte.ts` (+ spec) ; `PrepareResponseSeries` → `PrepareSession` ; `ResponseSeriesDeps` → `SessionControllerDeps`
- Modify: `services/createAppServices.ts` (`startExercise` prepares a `createFigureSource` session), `composition/createApp.ts`, `routes/dev/rhythm`, `ui/play/demo/*`, `testing/*`, `application/session/boundaries.spec.ts`, `series/boundaries.spec.ts`, `thirdMechanic.spec.ts`, `scripts/functional-ui.mjs` (if it names the controller)

- [ ] **Step 1: Write the failing test** in `services/createAppServices.spec.ts`: `starts a rhythm exercise on the session controller` (`startExercise('rhythm-two-four')` gives an instance of `SessionController`, view `rhythm-figure`).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Switch, delete, rename.** The boundary test covers `SessionController.svelte.ts` (no mechanic, exercise or sensor named) and checks that `PlanSessionController` and `ResponseSeriesController` are named nowhere in `src`.
- [ ] **Step 4: Run** `npm test && npm run check`, then `node scripts/functional-ui.mjs` against the dev server (preview `/dev/rhythm`, `/dev/gesture`, `/session?kind=learn`) — PASS, no text under 16 px.
- [ ] **Step 5: Commit** `refactor: play every exercise on one session controller`

### Task 10: Ce que H5 laisse

**Files:**

- Modify: `SessionController.svelte.ts` (`ready`, `quit`), `ui/play/PlayFrame.svelte` (+ spec), `ui/play/views/index.ts`
- Test: `SessionController.svelte.spec.ts`

- [ ] **Step 1: Write the failing tests:**
  - `shows the first exercise's view from the start screen`: après `ready()`, `view.stage.view` est celle du premier item (`lane` pour localiser, `link-lane` pour le relier, `rhythm-figure`) ; dans `PlayFrame.svelte.spec.ts`, le monde vient de `VIEW_WORLDS[view]` sans lire `kind`.
  - `closes the input that opens after a quit during the permission prompt`: `detector.open` en attente, `quit()`, puis l’ouverture se résout → `detector.close` appelé, aucune séance écrite.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.** `ready()` peeks the first item without consuming it (`ItemSource.peek?` when the source offers it, else takes it and keeps it for `start`). `PlayFrame` loses its fallback on `kind`. `openInput` checks the generation once the opening resolves and closes it when stale.
- [ ] **Step 4: Run** `npm test && npm run check` — PASS.
- [ ] **Step 5: Commit** `fix: show the exercise's world from the start screen and close an input opened after quit`

### Task 11: Critère de fin et documentation

**Files:**

- Modify: `CLAUDE.md`, `src/lib/infrastructure/CLAUDE.md` (si le stockage y est décrit), `docs/superpowers/specs/2026-10-14-temps-musical-et-sequences-design.md` (« Réalisation du plan H6 », « Reprise » mise à jour pour S), `docs/superpowers/plans/README.md` (si une règle de tempo y est écrite)

- [ ] **Step 1: Run the end search:**

  ```bash
  rg -n "PlanSessionController|ResponseSeriesController|PlanSessionDeps|ResponseSeriesDeps|PrepareResponseSeries|Progression\b|ProgressionRepository|progressions|scopedProgressions|nextTempo|startTempo|clampTempo|ExerciseTempo|DEFAULT_TEMPO\b|startTempoBpm|tempoScope|nextProgressions|seriesEnd|resolveLevel|cyclesPerBreath|CYCLES_PER_BREATH|BREATH_MIN_MS|base:" src scripts --glob '!**/migrations/**' --glob '!**/legacy/**'
  ```

  Expected: only `validateBackup.ts` (the validation of files 1 to 6 before their migration) and assertions of absent names in boundary tests. Rename or remove anything else.

- [ ] **Step 2: Update `CLAUDE.md`.**
  - Bullets « Sessions » (tempo), « Musical time » (the two controllers until H6), « Exercise sessions » (`PlanSessionController`, `PlanSessionDeps`) and « Storage » (Dexie 11, backup 7, H6 then chantier 2 at 12) describe the code as it now is.
  - Keep the author’s slimmed style: rules, not history.
- [ ] **Step 3: Write « Réalisation du plan H6 »** in the spec, on the model of H5: each decision as the code does it, the classified pieces, the end search, deviations accepted (each with what the player lives and what it costs if wrong), minor points left. Update « Reprise » for S.
- [ ] **Step 4: Run** `npm test && npm run check` — PASS.
- [ ] **Step 5: Commit** `docs: record plan h6 and resume from the sequence`

---

## Avant de fusionner

Suivre « Façon de travailler » de la Reprise :

- Valider d’abord, avec l’accord de l’auteur, les modifications non validées de `main` sur des fichiers que la branche touche.
- `git merge --no-ff plan/temps-musical-h6`. Un conflit de `CLAUDE.md` se résout en faveur de la version allégée de l’auteur.
- `npm test && npm run check`.
- Supprimer le worktree et la branche. Ne jamais pousser sans demande.

À la fin, une séance réelle de l’auteur : localiser, triades, geste (une montée de tempo vue en séance) et rythme.
