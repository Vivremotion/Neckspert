# Plus de niveaux d'aide ni de `aided` (#19) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un exercice n'a que des niveaux, comptés à partir de 1. Ce que l'écran montre et ce qui sonne à un niveau est écrit dans ce niveau. Le moteur ne lit plus le signe d'un niveau, ni un paramètre `aided`, ni un nombre d'échecs qui déclenche un remède.

**Architecture:**

- **La consigne suit le niveau.** La `presentation` de l'exercice entre dans ses paramètres résolus. Un niveau la réécrit par des chemins `presentation.*`, avec la règle de remplacement des autres paramètres.
- **Un niveau peut faire sonner le modèle.** Deux paramètres de niveau : `listenFirst` (le modèle est entendu avant de jouer) et `playAlong` (le modèle sonne pendant qu'on joue).
- **La mémoire ne compte qu'au niveau qui demande un rappel direct.** Un essai joué à un autre niveau est gardé « à chaud ».
- **Tout le reste sort** : niveaux d'aide et index négatifs, `aided`, sondage, aide qui s'efface, « aidé au-delà de son niveau », anti-blocage, « On change d'air », repos d'une heure, liste des aides d'un essai.
- **Une migration** (base Dexie 14, sauvegarde 10) décale les niveaux gardés des exercices qui avaient un niveau d'aide.

**Tech Stack:** TypeScript, Svelte 5, Vitest (node : `*.spec.ts` ; jsdom : `*.svelte.spec.ts`), Dexie.

**Spec:** le ticket GitHub Vivremotion/Neckspert#19 (`gh issue view 19 --repo Vivremotion/Neckspert`). Il porte les treize décisions de l'auteur avec leurs raisons, « Ce qui sort », « Ce qui entre », « Conséquences », « Fait quand » et le protocole de test en jeu. Ce plan n'y ajoute que des choix de réalisation, listés plus bas pour relecture.

## Global Constraints

- **Branche :** `feat/19-plus-de-niveaux-d-aide`, partie de `main`. `npm test && npm run check` vert à chaque commit ; tests avant le code ; chaque test affirme. Une seule branche, une seule pull request (décision de l'auteur).
- **Aucune question de produit ou de pédagogie ne se tranche dans une tâche.** Elle se pose en commentaire du ticket #19, avec le label `attend-auteur`, et le travail continue sur ce qui n'en dépend pas.
- **Le moteur refuse ce qu'il ne sait pas jouer, jamais ce qui manque de valeur pédagogique.** Une échelle sans niveau « rappel direct », un niveau 1 plus dur que le niveau 2 : acceptés.
- **Aucune règle ne se déclenche après un nombre d'échecs écrit dans le code.** Seuls `pass` et `drop`, écrits par le niveau (ou leurs défauts `PASS_AFTER_CYCLES` 3 et `DROP_AFTER_FAILS` 2), font changer de niveau.
- **Rien n'est propre au niveau 1.** Les chemins `presentation.*`, `listenFirst`, `playAlong` et `success: 'direct-recall'` s'écrivent à n'importe quel niveau, au premier comme au dernier, ou dans les paramètres de l'exercice (ils valent alors à tous les niveaux, sauf à celui qui les réécrit). Le code ne lit jamais le rang d'un niveau pour décider de ce qu'il montre ou fait sonner ; chaque tâche le prouve par un test sur un niveau qui n'est pas le premier. Limite connue, déjà vraie de `cursor`, `neck` et `notation` : `listenFirst` et `playAlong` se lisent sur les niveaux de l'exercice, pas sur l'échelle d'un élément. Les chemins `presentation.*` se lisent sur les deux.
- **Le cœur ne nomme ni exercice, ni famille, ni ensemble, ni instrument** (tests de frontière existants).
- **Rien de privé dans le dépôt** : ni le contenu ni les noms des exercices de `exercises.local/` dans un test, un message de commit ou une doc. `docs/projet.md` n'est pas modifié. Le système des archétypes n'est pas nommé dans le code.
- **Textes de l'écran** en français et en anglais (`defineMessages` ou les données) ; jamais sous 16 px. Les mots « niveau d'aide », « aidé », « On change d'air » et « On y revient plus tard » n'apparaissent plus nulle part.
- **Vocabulaire** : « niveau » / `level` ; « consigne » / `presentation` ; « dessin » / `picture` ; « écoute » / `listen` ; « joué avec » / `playAlong`.
- **Instantanés** : celui du catalogue change (les sept exercices, les échelles). Ceux des plans du rythme (`rhythmExercises.parity.spec.ts`) gardent les mêmes plans, à des niveaux décalés d'un cran : une autre différence remonte.
- **Commits :** Conventional Commits en minuscules, impératif, en anglais ; terminés par la ligne `Co-Authored-By` du modèle qui écrit. Pas de fusion dans `main` : la pull request attend l'auteur.

## Classement des pièces

| Pièce                                                                     | Sorte                                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| un niveau réécrit la consigne (`presentation.*`), l'emplacement `picture` | primitive du cœur                                                        |
| `listenFirst`, `playAlong`                                                | primitive du cœur (paramètres de niveau, lus par la politique de séance) |
| « à froid » seulement à un niveau qui demande un rappel direct            | primitive du cœur                                                        |
| le niveau 1 des sept exercices, les échelles des notes et des accords     | donnée du catalogue                                                      |
| les phrases de refus des anciennes clés                                   | primitive du cœur (validation)                                           |
| la phase `probe` et la liste `aids` des essais d'avant                    | données d'histoire, gardées telles quelles                               |
| la migration 14                                                           | infrastructure                                                           |

## Décisions prises par ce plan (à relire par l'auteur)

- **D1 — Deux paramètres de niveau : `listenFirst` et `playAlong`.** `listenFirst: true` : chaque série de cycles jouée à ce niveau (après le décompte, après chaque respiration, après une pause) commence par un cycle entendu, non joué, non jugé. `playAlong: true` : à chaque cycle joué à ce niveau, le modèle sonne avec le joueur. Rien ne l'annonce à l'écran. Sans effet sur un exercice qui n'a pas de figure à faire sonner. Autre lecture possible de `listenFirst`, écartée parce qu'elle demande au moteur de se souvenir : une seule écoute, à l'arrivée sur le niveau.
- **D2 — La démonstration de première rencontre ne s'ajoute pas** quand le niveau joué écrit `listenFirst` : le joueur entendrait le modèle deux fois de suite.
- **D3 — Un dessin par consigne.** `presentation.picture` nomme un dessin (`string`, `lowest-shape`, `admitted`…). Il remplace `aided.picture` et `fading.picture`. Un exercice peut l'écrire dans sa consigne de base : il est alors dessiné à tous les niveaux.
- **D4 — La case et le nom passent dans `detail`.** Le niveau 1 de « placer une note » écrit `"presentation.detail": "{fret}"`, celui de « nommer une note » `"presentation.detail": "{name}"`. Ce que le joueur voit changer : la case s'écrit sous la consigne, à la taille de `detail`, et non plus sur une tuile claire. La vue des réponses (`answer-keys`) apprend à écrire `detail`, au même endroit et à la même taille que la piste. Si c'est trop petit en jeu, la correction est une ligne de style, pas un nouvel emplacement.
- **D5 — L'accord en zone, niveau 1** : sa consigne a déjà un `detail` (les cordes). Le niveau 1 écrit les deux : `"{strings} · fondamentale sur {rootString}"`.
- **D6 — Le rattrapage d'une note oubliée.** Une note due qui n'est pas à un niveau « rappel direct » revient à la place de sa révision, une fois par séance, mais comme une question « à chaud » (phase `consolidation`). Elle ne compte pas parmi les révisions à froid et respecte la limite des notes travaillées à chaud dans la séance (`maxWorkingSet`).
- **D7 — Le jeu libre suit la même règle.** Une question de jeu libre porte toujours le niveau de son élément : l'écran est celui de ce niveau, et l'essai n'est « à froid » qu'à un niveau « rappel direct ».
- **D8 — Les essais d'avant gardent ce qu'ils ont enregistré** : leur phase `probe` et leur liste `aids`. Plus rien n'écrit ces valeurs ; les chiffres de rétention continuent d'écarter les anciens sondages. La ligne « n notes déjà sues » disparaît du bilan, y compris pour les séances d'avant.
- **D9 — Ce que la migration décale** : le niveau gardé de chaque exercice qui avait un niveau d'aide, le `levelReached` de ses séances, et le niveau noté dans ses essais de cycle (`data.level`), d'autant de crans qu'il avait de niveaux d'aide. Elle retire `resumeAfter` de tous les niveaux gardés.
- **D10 — Un fichier importé qui écrit une ancienne clé est refusé, pas réécrit.** La Bibliothèque dit quoi écrire à la place. Ses niveaux gardés sont décalés quand même, pour qu'ils tombent juste une fois le fichier corrigé et réimporté sous le même nom.
- **D11 — `listen: "aid"` est refusé** (« écrire `free` »). « Métronome sur 2 et 4 » passe à `"free"` : demander une écoute n'empêche plus de monter (décision 11 du ticket).
- **D12 — Les niveaux 1 des sept exercices n'écrivent ni `pass` ni `drop`** : on en sort après 3 réussites de suite, le défaut (ticket, « Conséquences »).
- **D13 — Les phrases de refus sont en anglais**, comme toutes les raisons que la Bibliothèque affiche aujourd'hui.

## Review Focus

- **Un niveau gardé hors de l'échelle** (négatif parce que la migration ne connaissait pas son exercice, ou au-dessus du sommet) : il est ramené dans `0..N-1` à la lecture, la séance démarre. Test en Task 7.
- **Un niveau qui écrit une consigne injouable** (`presentation.picture` d'un dessin que sa vue ne dessine pas, un champ `{x}` que rien ne donne, `presentation.*` sur un exercice sans consigne) : refusé au chargement, le niveau nommé, jamais une erreur en jeu. Test en Task 1.
- **Une sauvegarde d'avant** (versions 1 à 9 : sondages, `aids`, `resumeAfter`, `levelReached` à −1) : elle s'importe, les niveaux décalés une seule fois. Test en Task 8.
- **Une échelle sans niveau « rappel direct »** : ses cartes ne sont jamais « à froid » ; la séance les sert à chaud dans la limite de `maxWorkingSet`, sans boucle ni erreur. Test en Task 2.
- **Une pause pendant le cycle entendu d'un niveau `listenFirst`**, et `playAlong` sur un exercice sans figure : la reprise rejoue l'écoute ; sans figure, rien ne sonne et rien ne casse. Tests en Task 6.

---

### Task 1 : Un niveau réécrit la consigne

Les deux mécanismes vivent côte à côte dans cette tâche : `aided` et `fading` marchent encore, le catalogue ne change pas.

**Files:**

- Modify: `src/lib/domain/exercise/types.ts` (`PromptPresentation.picture?: string`)
- Modify: `src/lib/domain/exercise/levels.ts`, `src/lib/domain/exercise/validate.ts`
- Modify: `src/lib/application/presentation/presentPrompt.ts`, `passageStage.ts`, `validate.ts`
- Test: `src/lib/domain/exercise/levels.spec.ts`, `validate.spec.ts`, `src/lib/application/presentation/presentPrompt.spec.ts`, `passageStage.spec.ts`, `validate.spec.ts`

**Interfaces:**

- Produces: `presentationOf(definition: ExerciseDefinition, at: { exerciseLevel: number; itemLevel: number | null }): PromptPresentation | undefined` dans `domain/exercise/levels.ts`. `exerciseParamsOf` ajoute `presentation: definition.presentation` quand l'exercice en écrit une (une seule source, comme `tempo`).
- `presentPrompt` lit `presentationOf(definition, { exerciseLevel: item.exerciseLevel, itemLevel: item.level ?? null })` au lieu de `definition.presentation`. Le dessin de `picture` s'ajoute à `pictures` ; un dessin de contenu (`CONTENT_PICTURES`) reste laissé à la vue du tour. `passageStage` dessine `admitted` quand la consigne résolue du tour montré le nomme dans `picture` (en plus du chemin `aided` d'aujourd'hui).

- [ ] **Step 1 : tests de `presentationOf`.** Un niveau d'exercice qui écrit `"presentation.detail": "{fret}"` change `detail` et rien d'autre ; un niveau d'élément passe après le niveau d'exercice ; un exercice sans consigne rend `undefined`.
- [ ] **Step 2 : tests de `presentPrompt` et `passageStage`.** À un niveau qui écrit `presentation.detail` et `presentation.picture`, le texte et le dessin sortent ; au niveau voisin, non. Le test le fait deux fois : avec le premier niveau, puis avec le dernier d'une liste de trois (le dessin n'apparaît qu'au sommet). Une consigne de base qui écrit `picture` la dessine à tous les niveaux, sauf à celui qui réécrit `presentation.picture`.
- [ ] **Step 3 : tests de validation.** Refusés, l'exercice et le niveau nommés (`levels[1]` ou `params.ladder[0]`) : un chemin `presentation.*` sur un exercice sans consigne ; un emplacement qui lit un champ que rien ne donne ; `presentation.picture` d'un dessin qui n'existe pas, qui ne lit pas l'ensemble de l'exercice, ou `admitted` hors d'une vue de passage ; `params.presentation` écrit dans `params` (`params.presentation is not read: write presentation at the exercise's root, or "presentation.<slot>" in a level`).
- [ ] **Step 4 : réaliser.** `presentationProblem` vérifie la consigne résolue de chaque niveau d'exercice, et de chaque couple (niveau d'exercice, niveau d'échelle) quand l'exercice écrit une échelle. Le coût reste borné par `checkCost` comme les autres vérifications par niveau.
- [ ] **Step 5 :** `npm test && npm run check`, puis commit `feat: let a level rewrite a slot of the prompt`.

### Task 2 : « À froid » seulement à un niveau qui demande un rappel direct

**Files:**

- Modify: `src/lib/domain/learning/ladder.ts`, `procedure.ts`, `src/lib/domain/progress/plans.ts`
- Modify: `src/lib/application/session/AttemptRecorder.ts`, `src/lib/application/services/createAppServices.ts`
- Test: `src/lib/domain/learning/ladder.spec.ts`, `procedure.serve.spec.ts`, `procedure.learn.spec.ts`, `src/lib/domain/progress/plans.spec.ts`, `src/lib/application/session/AttemptRecorder.spec.ts`, `src/lib/application/session/series/notesSession.spec.ts`

**Interfaces:**

- Produces: `asksDirectRecall(ladder: Ladder, level: number): boolean` (`ladder[level]?.success === 'direct-recall'`).
- `AttemptRecorderDeps.countsCold?: (item: PlannedItem) => boolean`, donné par `createAppServices` à partir de l'échelle de l'exercice et de `item.level`. Sans lui, ou sans `item.level` : jamais à froid.
- `buildFreePlan` écrit toujours `level` sur ses éléments (aujourd'hui seulement quand le niveau a une avance).

- [ ] **Step 1 : tests de la procédure.** Une carte due au sommet : servie `review`, `cold`, comptée dans `coldCap`. Une carte due un cran sous le sommet : servie une fois dans la séance, à la place de la révision, en `consolidation`, `hot`, non comptée dans `coldCap`, et seulement si `fitsWorkingSet`. Une réussite la remonte d'un niveau ; la séance suivante, au sommet, elle est servie `cold`. Une échelle sans niveau `direct-recall` : six cartes dues, `maxWorkingSet` 6, la séance sert sans erreur et rien n'est planifié `cold`.
- [ ] **Step 2 : tests de l'enregistrement.** Un essai `review` ou `free` sur une carte apprise, plus d'une heure après le précédent : `cold` si `countsCold(item)`, sinon `hot`, et dans ce cas la carte n'est pas réécrite (ni calendrier, ni `acquiredAt`, ni `masteredAt`). La température provisoire donnée à la source suit la même règle.
- [ ] **Step 3 : test de séance** (`notesSession.spec.ts`) : « nommer une note » ratée en révision redescend au niveau 1 ; sa question suivante est gardée `hot` même réussie en moins de 3 secondes.
- [ ] **Step 4 : réaliser**, puis `npm test && npm run check`, commit `feat: count an attempt cold only at a level that asks a direct recall`.

### Task 3 : Plus de sondage, on commence au niveau 1

**Files:**

- Modify: `src/lib/domain/learning/procedure.ts`, `src/lib/domain/progress/cards.ts`, `scheduling.ts`, `index.ts`, `success.ts`, `stats.ts`, `src/lib/domain/scoring/fatigue.ts`, `src/lib/domain/types.ts`
- Modify: `src/lib/application/session/AttemptRecorder.ts`, `src/lib/infrastructure/storage/validateBackup.ts`
- Modify: `src/lib/ui/screens/summary/SummaryScreen.svelte`, `messages.ts`
- Test: les specs voisines (`procedure.*.spec.ts`, `cards.spec.ts`, `stats.spec.ts`, `success.spec.ts`, `fatigue.spec.ts`, `AttemptRecorder.spec.ts`, `notesSession.spec.ts`, `triadsSession.spec.ts`, `SummaryScreen.svelte.spec.ts`)

**Interfaces:**

- `ItemPhase = 'review' | 'learning' | 'consolidation' | 'free'` (ce qu'une source sert). `RecordedPhase = ItemPhase | 'probe'` sur `Attempt.phase` (ce qu'un essai a enregistré, comme `RecordedLeadBeats`).
- Supprimés : `probeCard`, `probeTemperature`, `graduateToReview`, `recordProbe`, `unansweredProbe`, `dropAbandonedProbe`, `topLevel`, `SessionSummary.knownCount` et les messages `known`, `knownTriads`.

- [ ] **Step 1 : tests.** `introduce` sert l'élément nouveau en `learning`, `hot`, au niveau 0 (le niveau 1), avec sa carte créée par l'enregistrement au premier essai ; réussi, il revient au niveau suivant après le délai long ; il est appris à la réussite qui passe le sommet. Un élément nouveau servi puis coupé par une pause revient, sans carte perdue ni doublon. `summarizeSession` écarte toujours un ancien essai `probe` des chiffres à froid.
- [ ] **Step 2 : réaliser.** Les filtres `phase !== 'probe'` qui ne lisent que la séance en cours partent (`success.ts`, `fatigue.ts`, `readyForNew`, `countMiss`) ; celui de `stats.ts`, qui lit des essais gardés, reste, avec un commentaire qui dit pourquoi.
- [ ] **Step 3 :** `npm test && npm run check`, commit `feat: start a new item at level 1 instead of probing it`.

### Task 4 : Plus de `aided`, plus d'aide qui revient après un raté

**Files:**

- Modify: `catalog/notes.json`, `catalog/chords.json`, `catalog/changes.json`
- Create: `src/lib/domain/exercise/retired.ts` (les anciennes clés et leurs phrases), Test: `retired.spec.ts`
- Modify: `src/lib/domain/exercise/types.ts`, `ladder.ts`, `validate.ts`, `src/lib/domain/learning/params.ts`, `subject.ts`, `exerciseSubject.ts`, `procedure.ts`, `testing/fakeSubject.ts`, `src/lib/domain/types.ts`
- Modify: `src/lib/application/presentation/presentPrompt.ts` (`isAided` supprimé), `passageStage.ts`, `validate.ts`, `src/lib/application/definitions/checks.ts`, `src/lib/application/session/aids.ts`, `series/stage.ts`, `src/lib/application/sets/types.ts`, `contract.ts`
- Modify: `src/lib/ui/play/views/LaneView.svelte`, `AnswerKeysView.svelte`, `StringDiagram.svelte`, `src/lib/ui/play/messages.ts`, `src/lib/testing/randomExercise.ts`
- Test: les specs de ces fichiers, `catalog.spec.ts` (instantané), `notesSession.spec.ts`, `triadsSession.spec.ts`, `openness.spec.ts`

**Interfaces:**

- Produces: `retiredProblem(definition: unknown): string | null`, appelé en premier par `validateExercise`. Dans cette tâche :
  - `params.ladder[i].params.aided` → `params.ladder[<i>].params.aided is no longer read: write what the level shows in the level, e.g. "presentation.detail" or "presentation.picture"`
  - `presentation.aided` → `presentation.aided is no longer read: write "presentation.detail" or "presentation.picture" in the params of the level that shows it`
  - `presentation.fading` → `presentation.fading is no longer read: no aid comes back after a miss; write "presentation.picture" in the params of the level that draws it`
  - `params.learning.presentAtOnce`, `params.learning.aidFadeSuccesses` → `… is no longer read: remove it`
- `LadderParams = { leadBeats: LeadBeats | null }`. `PlannedItem` perd `aid` et `stringAid`. `PresentedPrompt` perd `aid`. `PromptPresentation` perd `aided` et `fading`. `LearningSubject` perd `presentsAtOnce` et `fadingAid`. `ItemLearning = { retestGaps }`. `STRING_DIAGRAM_AID` disparaît.
- `isAided` disparaît en entier : ni la marque `show-position` ni le signe du niveau d'exercice ne décident plus de l'écran. Le niveau d'aide des quatre exercices des changements existe encore jusqu'à la Task 7, mais il écrit lui-même son dessin (ci-dessous).
- `procedure.record` : le délai avant le prochain rappel est `retestGaps[0]` après un raté, `retestGaps[1]` après une réussite, quel que soit le niveau.

**Le catalogue :**

```json
// locate-note-string, premier niveau de params.ladder ; presentation perd aided et fading
{ "params": { "leadBeats": 8, "presentation.detail": "{fret}", "presentation.picture": "string" }, "pass": { "successes": 1 }, "drop": { "failures": 1 } }
// identify-note
{ "params": { "leadBeats": null, "presentation.detail": "{name}" }, "pass": { "successes": 1 }, "drop": { "failures": 1 } }
// chord-anchor
{ "params": { "leadBeats": 8, "presentation.picture": "lowest-shape" }, "pass": { "successes": 1 }, "drop": { "failures": 1 } }
// chord-zone
{ "params": { "leadBeats": 8, "presentation.detail": { "fr": "{strings} · fondamentale sur {rootString}", "en": "{strings} · root on {rootString}" } }, "pass": { "successes": 1 }, "drop": { "failures": 1 } }
```

Les autres niveaux perdent `"aided": false`. Les deux exercices d'accords perdent `"presentAtOnce": false`.

Dans `changes.json`, la consigne des quatre exercices perd `aided`, et leur niveau d'aide (encore marqué `"aid": true` jusqu'à la Task 7) devient `{ "aid": true, "params": { "tempo": 80, "presentation.picture": "admitted" } }`.

- [ ] **Step 1 : tests de `retiredProblem`**, une phrase par clé, l'indice du niveau nommé.
- [ ] **Step 2 : tests de séance.** Une note nouvelle à placer arrive avec la case et la corde dessinée ; réussie, elle revient à 4 temps sans la case ni la corde. Après un raté au niveau 2, la question suivante sur cette note montre l'écran du niveau où elle est tombée, rien de plus. Une révision d'une note redescendue au niveau 1 montre la case (décision 7). Un accord nouveau arrive avec sa forme.
- [ ] **Step 3 : tests des vues.** `LaneView` et `AnswerKeysView` écrivent `detail` ; plus de paragraphe `.aid`.
- [ ] **Step 4 : réaliser**, mettre à jour l'instantané du catalogue en vérifiant qu'il ne change que pour ces huit exercices. `catalogPassageStage.spec.ts` reste vert : au niveau d'aide des changements, le manche est dessiné comme avant.
- [ ] **Step 5 :** `npm test && npm run check`, commit `feat: write in a level what it shows, without aided or a fading aid`.

### Task 5 : L'anti-blocage sort du moteur ; une réussite est une réussite

**Files:**

- Delete: `src/lib/domain/session/block.ts`, `block.spec.ts`, `src/lib/application/session/aids.ts`, `aids.spec.ts`
- Modify: `src/lib/domain/session/policy.ts`, `trace.ts`, `played.ts`, `summary.ts`, `index.ts`, `src/lib/domain/time/levels.ts`, `round.ts`, `src/lib/domain/exercise/types.ts`, `figureParams.ts`, `retired.ts`, `src/lib/domain/progress/stats.ts`, `src/lib/domain/types.ts`, `src/lib/domain/glossary/index.ts`
- Modify: `src/lib/application/session/series/exerciseLevels.ts`, `compilePlan.ts`, `recordResponse.ts`, `exerciseSummary.ts`, `roundRunner.ts`, `SessionController.svelte.ts`, `contract.ts`, `src/lib/application/app.ts`, `services/createAppServices.ts`
- Modify: `src/lib/ui/play/PlayFrame.svelte`, `messages.ts`, `src/lib/ui/screens/summary/SummaryScreen.svelte`, `messages.ts`, `src/lib/ui/screens/home/HomeScreen.svelte`, `messages.ts`, `src/lib/infrastructure/storage/validateBackup.ts`, `src/lib/testing/*.ts`
- Modify: `catalog/rhythm.json`, `catalog/changes.json` (`flow.antiBlocking` retiré ; `rhythm-two-four` : `"listen": "free"`)
- Test: `policy.spec.ts`, `levels.spec.ts` (domain/time), `exerciseLevels.spec.ts`, `compilePlan.spec.ts`, `rhythmSession.spec.ts`, `gestureSession.spec.ts`, `sequenceSession.spec.ts`, `played.spec.ts`, `summary.spec.ts`, `exerciseSummary.spec.ts`, `PlayFrame.svelte.spec.ts`, `SummaryScreen.svelte.spec.ts`, `retired.spec.ts`

**Interfaces:**

- `nextLevelState(state, levels, cycle: { success: boolean })`.
- `SeriesRules = { levels; roundsPerBreath(level); listen(level): boolean; budgetMs }`. `SeriesState = { levelState; run: { level; played } | null; listenAsked }`. `Next = { role: 'round' } | { role: 'listen' } | { role: 'breath' } | { role: 'end'; reason: SeriesEnd }`. `SeriesEnd = 'time' | 'complete'`. `settle(state, rules, round: { level: number; success: boolean })` rend `{ state, changed }`.
- `FigureParams.listen: 'free' | 'none'`. `Announcement = 'level-up' | 'level-down' | 'aid-level'` (le dernier part en Task 7).
- `Attempt.aids?: readonly string[]`, commenté « gardé par les essais d'avant la base 14, lu par rien ». `Aid`, `AIDS`, `RoundOutcome.aids`, `RoundGiven.aids`, `RoundHelp` disparaissent ; la validation des sauvegardes lit la liste figée `AIDS_V13` (déplacée en Task 8 dans `migrations/v14.ts`).
- Supprimés : `ExerciseLevels.resting`, `leave`, `breaking` ; `AppServices…resting` ; `SessionSummary` : `aided`, `changedAir`, la fin `change-of-air` et la mesure qui casse ; `aidedBeyondLevel`, `aidedBeyondItsLevel`, `levelAided`, `blockReadingOf`.
- `retiredProblem` : `flow.antiBlocking` → `flow.antiBlocking is no longer read: nothing is triggered after failures; a level says what it shows and plays, and its "drop" when the player leaves it` ; `listen: "aid"` (params ou niveau) → `listen "aid" is no longer read: write "free"`.

- [ ] **Step 1 : tests de la politique.** Six échecs de suite au niveau le plus bas : `next` rend toujours un tour ou une respiration, jamais une écoute imposée ni une fin ; l'état ne garde rien d'autre que le compte d'échecs du niveau. Une écoute demandée par le joueur (`askListen`) puis trois réussites : le niveau monte.
- [ ] **Step 2 : tests de séance** (`rhythmSession.spec.ts`) : mêmes deux scénarios de bout en bout ; aucune annonce `listen-remedy`, `play-along` ni `change-of-air` ; à la fin, `levelStates` ne porte pas de repos et l'accueil ne marque rien.
- [ ] **Step 3 : réaliser.** Chercher chaque nom supprimé par `grep` : aucun ne reste hors des migrations figées et de leurs tests. `LevelState.resumeAfter` reste dans le type jusqu'à la Task 8 (la base le porte encore) mais plus rien ne l'écrit ni ne le lit. Le glossaire : l'entrée « joué avec » perd « Un cycle joué ainsi est aidé » ; les mots du niveau perdent « sans aide ».
- [ ] **Step 4 :** `npm test && npm run check`, commit `feat: take the anti-blocking and aided successes out of the engine`.

### Task 6 : `listenFirst` et `playAlong`, paramètres de niveau

**Files:**

- Modify: `src/lib/domain/exercise/figureParams.ts`, `src/lib/domain/session/policy.ts`, `src/lib/application/session/series/exerciseLevels.ts`, `compilePlan.ts`, `SessionController.svelte.ts`
- Test: `figureParams` (dans `rhythmExercises.spec.ts` ou une spec à créer `figureParams.spec.ts`), `policy.spec.ts`, `exerciseLevels.spec.ts`, `rhythmSession.spec.ts`, `transport.spec.ts`

**Interfaces:**

- `FigureParams.listenFirst: boolean`, `FigureParams.playAlong: boolean` (défaut `false` ; une valeur qui n'est pas un booléen est traitée comme l'est aujourd'hui celle de `cursor` ou de `neck`).
- `SeriesRules.listenFirst(level): boolean`, `SeriesRules.playAlong(level): boolean` ; `rulesOf` les rend `false` quand `canSound(definition)` est faux. `SeriesState.run = { level; played; heard: boolean }`. `Next` : `{ role: 'round'; playAlong: boolean }`.
- `next` : dans une série de cycles qui n'a encore rien joué ni entendu, à un niveau `listenFirst`, rend `{ role: 'listen' }` et marque `heard`. Un tour rendu porte `playAlong: rules.playAlong(run.level)`.
- Le contrôleur fait sonner la figure du tour avec `Transport.playFigure(figure, 'play-along', bar)` quand `playAlong` est vrai, et `'demo'` pour une écoute, comme aujourd'hui pour les remèdes. À l'ouverture d'une séance, pas de démonstration de première rencontre quand le niveau joué écrit `listenFirst` (D2).

- [ ] **Step 1 : tests de la politique.** Niveau `listenFirst`, `roundsPerBreath` 4 : écoute, quatre tours, respiration, écoute, quatre tours. Niveau `playAlong` : chaque tour porte `playAlong: true`, ceux du niveau au-dessus `false`. Après `interrupt()` (pause), la série reprend par une écoute. Les mêmes scénarios avec les deux paramètres écrits au dernier niveau d'une liste de trois, et rien au premier : le modèle ne sonne qu'au sommet. Et avec `playAlong: true` dans les paramètres de l'exercice et `"playAlong": false` au niveau 2 : il sonne partout sauf au niveau 2.
- [ ] **Step 2 : tests de séance.** Le journal des sons porte la figure en `demo` sur le cycle entendu et en `play-along` sur chaque cycle joué ; aucun essai n'est écrit pour le cycle entendu ; trois cycles réussis en « joué avec » font monter le niveau. Un exercice sans figure dont un niveau écrit les deux paramètres joue comme sans eux.
- [ ] **Step 3 : réaliser**, `npm test && npm run check`, commit `feat: let a level play the model before and along with the player`.

### Task 7 : Plus de niveaux d'aide

**Files:**

- Modify: `catalog/changes.json`, `catalog/rhythm.json`
- Modify: `src/lib/domain/time/levels.ts` (`Level.aid`, `LevelRange`, `levelRange` supprimés) et ses quinze lecteurs (`grep -rn levelRange src`), `src/lib/domain/exercise/levels.ts`, `ladder.ts`, `validate.ts`, `selection/validate.ts`, `round/validate.ts`, `retired.ts`, `src/lib/domain/learning/ladder.ts`, `procedure.ts`, `src/lib/domain/progress/plans.ts`
- Modify: `src/lib/application/presentation/passageStage.ts`, `validate.ts`, `src/lib/application/session/series/exerciseLevels.ts`, `figureStage.ts`, `exerciseSummary.ts`, `contract.ts`, `services/createAppServices.ts`
- Modify: `src/lib/ui/play/views/FigureView.svelte`, `GridScrollView.svelte`, `LinkLaneView.svelte`, `PlayFrame.svelte`, `src/lib/ui/play/messages.ts`, `src/lib/ui/screens/summary/SummaryScreen.svelte`, `messages.ts`, `src/lib/domain/glossary/index.ts`, `src/lib/testing/randomExercise.ts`
- Test: `levels.spec.ts` (les deux), `catalog.spec.ts`, `rhythmExercises.parity.spec.ts`, `rhythmExercises.spec.ts`, `catalogChanges.spec.ts`, `catalogPassageStage.spec.ts`, `exerciseLevels.spec.ts`, `figureStage.spec.ts`, `gestureSession.spec.ts`, `rhythmSession.spec.ts`, les specs des vues et du bilan, `retired.spec.ts`

**Interfaces:**

- Un niveau est sa place dans la liste : l'index 0 est le niveau 1, le sommet `levels.length - 1`. Plus aucun index négatif.
- `PassageStageModel.aid` devient `picture` (et le repère de test `grid-aid` devient `grid-picture`) : le dessin que la consigne résolue du tour nomme.
- `figureStage` : `level: { shown: number; of: number }`. `Announcement = 'level-up' | 'level-down'`.
- `retiredProblem` : `levels[i].aid` → `levels[<i>].aid is no longer read: a level is its place in the list, the first is level 1; remove "aid"`.
- Le niveau que lit une condition d'ouverture de routine (`{ "level": { …, "atLeast": n } }`) est l'index + 1, sans cas particulier.

**Le catalogue :**

```json
// les quatre exercices de changes.json : le premier niveau perd "aid": true
{ "params": { "tempo": 80, "presentation.picture": "admitted" } }
// rhythm-silent-bars, premier niveau (son accompagnement reste celui d'aujourd'hui)
{ "params": { "accompaniment": { … "bars": ["on", "on", "on", "on"] }, "listenFirst": true, "playAlong": true } }
// rhythm-two-four, premier niveau
{ "params": { "accompaniment": { "clicks": { "beats": [1, 2, 3, 4] }, "bars": ["on"] }, "listenFirst": true, "playAlong": true } }
// rhythm-offbeats, premier niveau
{ "params": { "tempo": 70, "listenFirst": true, "playAlong": true } }
```

Les autres niveaux ne changent pas. Aucun des sept premiers niveaux n'écrit `pass` ni `drop` (D12).

- [ ] **Step 1 : tests.** `nextLevelState` : trois réussites au niveau 0 montent au niveau 1 ; au niveau 1 des changements, trois échecs redescendent au niveau 0 ; au niveau 0, les échecs ne descendent pas plus bas. `ExerciseLevels` : un niveau gardé à −1 ou à 99 est ramené dans l'échelle au premier tour (Review Focus). Un exercice jamais joué commence à l'index 0.
- [ ] **Step 2 : tests de séance.** Les changements, jamais joués : le manche est dessiné au premier passage, ♩ = 80 ; trois changements justes, l'annonce dit « Niveau 2 », le manche part au passage suivant. Le rythme, jamais joué : niveau 1 avec le modèle avant et pendant ; trois cycles réussis, niveau 2, le modèle se tait ; deux échecs, retour au niveau 1.
- [ ] **Step 3 : l'instantané de parité du rythme.** Les plans de chaque exercice sont les mêmes qu'avant, chacun à l'index d'avant + 1.
- [ ] **Step 4 : réaliser.** Tous les textes « niveau d'aide » partent (annonce, en-tête de la vue des figures, bilan, glossaire).
- [ ] **Step 5 :** `npm test && npm run check`, commit `feat: count levels from the first, without aid levels`.

### Task 8 : Base 14, sauvegarde 10

**Files:**

- Create: `src/lib/infrastructure/storage/migrations/v14.ts`, `v14.spec.ts`
- Modify: `src/lib/infrastructure/storage/db.ts`, `validateBackup.ts`, `DexieBackup.ts`, `testing/fixtures.ts`, `testing/levelStateRepositoryContract.ts`, `src/lib/domain/types.ts` (`BackupFile.version: 10`), `src/lib/domain/time/levels.ts` (`LevelState.resumeAfter` supprimé) et ses lecteurs, `src/lib/ui/screens/calibration/fakeServices.ts`
- Test: `v14.spec.ts`, `db.spec.ts`, `validateBackup.spec.ts`, `DexieBackup.spec.ts`, `legacyImport.spec.ts`

**Interfaces** (tout est figé dans `v14.ts` ; une migration ne lit jamais le code vivant) :

- `AID_LEVELS_V13: Readonly<Record<string, number>>` : `inversion-run`, `grid-in-direction`, `grid-in-zone`, `grid-reading`, `rhythm-silent-bars`, `rhythm-two-four`, `rhythm-offbeats`, chacun 1.
- `aidLevelsOfFilesV14(files: readonly Row[]): Record<string, number>` : pour chaque fichier importé (`text`, du JSON), par exercice, le nombre de ses niveaux qui écrivent `"aid": true`. Un texte illisible ne donne rien.
- `levelStateToV14(state: Row, aidLevels): Row` : `resumeAfter` retiré ; pour un niveau d'exercice (`item === ''`) d'un exercice connu, `level + n`.
- `sessionToV14(session: Row, aidLevels): Row` : `levelReached + n` pour une séance d'un seul exercice connu.
- `attemptToV14(attempt: Row, aidLevels): Row` : `data.level + n` pour un essai jugé par le verdict de cycle (`verdict.relation === 'cycle'`) d'un exercice connu ; tout le reste tel quel, `aids` et `phase` compris.
- `backupV9ToV10(backup: BackupV9): BackupV10` ; `AIDS_V13`, la liste des aides d'avant, pour valider un ancien essai.
- `validateBackup` : une version 9 passe par `backupV9ToV10` ; une version 10 refuse `resumeAfter` sur un niveau gardé, accepte la phase `probe` et une liste `aids` facultative sur un essai.

- [ ] **Step 1 : tests de `v14.ts`.** Un niveau gardé −1 devient 0, 0 devient 1, 8 devient 9 ; le niveau d'un élément (`item !== ''`) ne bouge pas ; un exercice inconnu ne bouge pas ; un fichier importé qui écrit deux niveaux d'aide décale de 2. Test de garde : chaque exercice de `AID_LEVELS_V13` existe dans le catalogue et y compte autant de niveaux qu'à la version 13 (7, 4, 5, 10, 10, 10, 10).
- [ ] **Step 2 : tests de la base et des sauvegardes.** Une base 13 remplie s'ouvre en 14 avec les niveaux décalés une fois ; la rouvrir ne les décale pas de nouveau. Une sauvegarde 9 s'importe ; une sauvegarde 3 aussi (`backup-v3.json`), par la chaîne entière ; l'export est en version 10.
- [ ] **Step 3 : réaliser**, `npm test && npm run check`, commit `feat: shift stored levels to the new numbering (database 14, backup 10)`.

### Task 9 : Les docs, la preview, la passation

**Files:**

- Modify: `docs/fichiers-de-definitions.md`, `CLAUDE.md`, `src/lib/infrastructure/CLAUDE.md` et `src/lib/ui/CLAUDE.md` s'ils nomment une pièce retirée, `docs/superpowers/plans/README.md` s'il liste une règle retirée
- Modify: `docs/superpowers/specs/2026-10-03-sondage-avant-apprentissage-design.md` et les specs d'octobre qui décrivent l'aide ou l'anti-blocage : une ligne en tête, « Remplacé par le ticket #19 (novembre 2026) », rien d'autre
- Modify: `.claude/launch.json` (configuration `preview-19` : `node scripts/preview.mjs 19`, port 5219)

- [ ] **Step 1 : `docs/fichiers-de-definitions.md`.** Réécrire « Les niveaux et l'aide » (un niveau dit ce qu'il montre ; `presentation.*` ; `listenFirst`, `playAlong`), l'exemple de la ligne 61 et son `"aid": true`, « Une aide qui part et qui revient » (plus de mise en garde sur `aid`), les conditions de niveau des routines, la section sur le repos, la liste des raisons de refus (les nouvelles phrases, les anciennes retirées). Aucun exercice privé n'y est nommé.
- [ ] **Step 2 : `CLAUDE.md`.** Mettre à jour « Sessions », « Musical time », « Exercise sessions », « Play views », « Storage » (version 14, sauvegarde 10) et « Drawn string », en gardant le style du fichier.
- [ ] **Step 3 : vérifier en jeu avant de dire prêt.** Lancer la preview par l'outil de preview, pas depuis un shell. Avec un micro simulé, jouer une séance de rythme et une séance de changements au-delà de la première respiration, et une séance de notes avec une note nouvelle. Lancer `scripts/functional-ui.mjs`.
- [ ] **Step 4 : relecture de la branche** par un agent relecteur (`requesting-code-review`), retours traités.
- [ ] **Step 5 : pull request** vers `main` (« Closes #19 » dans le corps), commentaire de passation sur le ticket selon `docs/flux-de-travail.md`, avec le protocole de test en douze points du ticket. Ne pas fusionner.

## Ce que ce plan ne fait pas

- Il ne réécrit pas les fichiers de `exercises.local/` ni ceux que l'auteur a importés : ils sont à lui. Ceux qui écrivent une ancienne clé sont refusés avec la phrase qui dit quoi écrire.
- Il ne change ni la correction montrée après un raté, ni la carte solide servie après un raté (`recoveryAfterMisses`), ni les seuils de « acquis » et « maîtrisé ».
- Il ne touche pas au style de `detail` (D4) : à décider après le test en jeu.
