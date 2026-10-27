# Le langage du tour, la piste générique et les triades (plan H5) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un exercice à réponse dit en données ce qu’on attend dans un tour et ce que l’écran montre. Un seul compilateur fait son plan, une seule vue piste le dessine. Les notes, les triades et le geste passent dessus, les triades sur la série avec leurs niveaux (Dexie 10, sauvegarde 6), puis l’ancien chemin est supprimé.

**Architecture:**

- **Le tour.** `compileRound` lit le gabarit de l’exercice (`ExerciseDefinition.round`) et le compile en `RoundPlan` : avance, attentes (position, étendue, capteur, contenu tiré de l’item par une dérivation nommée), longueur, politique. Ses nombres sont écrits tels quels, lus dans les paramètres résolus de l’item (`{ param }`) ou mesurés sur l’item (`{ item }`). Il remplace `beatPlan`, `anchorPlan`, `gridChangePlan`, `freePlan`, `neckPlan` et `gesturePlan`.
- **L’écran.** La présentation de l’exercice (`ExerciseDefinition.presentation`, des textes à champs `{note}`) passe par trois registres de vocabulaire :
  - les champs d’un item, par mécanique ;
  - les dessins, par nom ;
  - les vues d’un contenu, par sorte de contenu.

  Elle devient un modèle d’écran unique (`PromptStageModel`), que la série construit et que la vue `lane` et la vue `answer-keys` dessinent.

- **Ce qui reste du code de famille, nommé :** sujets d’apprentissage, candidats du capteur d’accords, forme stockée d’un essai, geste. Les triades basculent ensuite sur la série. L’ancien chemin disparaît en quatre tâches, chacune verte.

**Tech Stack:** TypeScript, Svelte 5 (runes), Vitest (node : `*.spec.ts` ; jsdom : `*.svelte.spec.ts`), Dexie.

**Spec:** `docs/superpowers/specs/2026-10-14-temps-musical-et-sequences-design.md` : « Reprise (état au 2026-10-26, après le plan L) », « Amendement (2026-10-23) » (sections 5 et 6, critère de fin), « Réalisation du plan H4 » (« Ce qui reste à H5 »), « Amendement (2026-10-26) » et « Réalisation du plan L ». À lire aussi : `docs/reality-check-corpus-2026-10-27.md`, d’où viennent le périmètre et la contrainte de format (D10).

## Global Constraints

- **Branche et vérification :**
  - Branche `plan/temps-musical-h5`, worktree `.worktrees/temps-musical-h5`, partie de `main` (`ca67f1c` ou plus récent).
  - `npm test && npm run check` vert à chaque commit.
  - Tests avant le code ; chaque test affirme.
  - La branche est fusionnée une fois, à la fin (D1).
- **Un exercice à réponse ne demande aucun code qui le nomme.** Sa forme de tour, ses textes, ses aides et sa vue sont des données. Le code ajouté est :
  - soit une pièce du moteur ;
  - soit du vocabulaire enregistré (dérivation, mesure d’item, champs d’item, dessin, vue de contenu), qui ne nomme aucun exercice.

  Le compilateur, la série, `promptStage` et la vue `lane` ne nomment ni mécanique, ni exercice, ni capteur. Le test de frontière de `series/` s’étend à `domain/exercise/round/`, `application/presentation/promptStage.ts` et `ui/play/views/LaneView.svelte`.

- **Ce qui ne change pas de comportement :**
  - Le geste, les notes et le rythme. `gestureSession.spec.ts`, `notesSession.spec.ts`, `dataOnlyExercise.spec.ts` et les specs de `plan/` restent verts sans changer leurs attentes. Seuls changent les signatures et la forme des données d’exercice déplacées ici (D3).
  - Ce que le joueur voit change seulement là où D4 et D5 le disent.
- **Règles pédagogiques des triades gardées** (specs 2026-10-08 et 2026-10-09, testées en Task 7) :
  - un accord nouveau est d’abord sondé sans aide ;
  - un sondage raté est présenté aidé à la consigne suivante, pas tout de suite ;
  - jamais le même renversement deux fois de suite ;
  - la zone ne propose qu’un accord acquis en ancrage, et une autre forme que la dernière demandée ;
  - dans l’ancrage, la racine est jugée sur le temps et l’accord dans la bande ;
  - un premier accord faux se montre tout de suite et peut être corrigé (`corrected`) ;
  - après un raté, l’entendu, l’attendu et l’écart sont dessinés ;
  - « Joué juste » en développement seulement ;
  - seuls les essais froids nourrissent FSRS.
- **Les triades gardent leurs données** (plan L) : 80 bpm fixes, échelle `8 aidé → 4 → 2` (haut en rappel direct), `respirationBars: 1`, seuil 1500 ms.
- **Une seule durée de séance, `SESSION_MS`** (300 000 ms).
- **Les définitions restent de la pure donnée** : aucune fonction, `JSON.parse(JSON.stringify(definition))` lui est égal (testé en Task 2). Le chantier 2 les chargera depuis des fichiers sans changer leur forme.
- **Rien n’est gardé « pour plus tard » dans l’ancien chemin.** Le critère de fin de l’amendement (section 6) est vérifié par une recherche en fin de branche (Task 13), sauf ce que D1 renvoie à H6.
- **Vocabulaire :** un nom par concept : « niveau » / `level`, « échelle » / `ladder`, « avance » / `lead`, « bande » / `band`, « respiration » / `breath`, « mesure comptée » / `count-in`, « gabarit » / `template`, « dérivation » / `derivation`, « présentation » / `presentation`.
- **Textes d’interface** en français et en anglais, jamais sous 16 px.
- **Commits :** Conventional Commits en minuscules, impératif, orientés comportement ; terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Décisions prises par ce plan (à relire par l’auteur)

- **D1 — Une seule branche, fusionnée une fois.** Les triades n’ont leur niveau qu’avec Dexie 10, et Dexie 10 retire `CardState.leadBeats`, qui n’est possible qu’une fois l’ancien chemin supprimé. Fusionner le langage avant le ménage ferait rejouer aux joueurs leurs triades depuis le niveau 0. Le plan est donc organisé en deux parties (A : le langage et l’écran ; B : les triades et le ménage), mais fusionné une seule fois.
  - H6 reste : tempo dans les niveaux d’exercice, fin de `Progression` et `nextTempo` (Dexie 11, sauvegarde 7), fusion des contrôleurs sous `SessionController`.
  - Le chantier 2 prend la version 12.
- **D2 — Dexie 10 sème le niveau de chaque carte de triade depuis son avance, puis retire `leadBeats` de toutes les cartes** (`migrations/v10.ts`). L’échelle est figée dans `TRIAD_LADDER_V10` (`8, 4, 2`, test fil-piège contre `ladderOf`). Règle :
  - carte non apprise → niveau 0 ;
  - carte apprise → le cran de son avance ;
  - avance plus courte que 2 → le haut de l’échelle.

  Ce que le joueur vit : une triade apprise à l’avance 4 revient à l’avance 4, sans aide.

- **D3 — Le gabarit du tour remplace les constructeurs de plan, et la place du tour vit dans le gabarit.**
  - `params.targetBarOffset` et `params.countEndsOn` deviennent `round.barOffset` et `round.countEndsOn` : un seul endroit pour la forme du tour. Ils restent atteignables par un niveau à travers `{ param }` pour les nombres.
  - La longueur d’une grille se mesure sur l’item (`{ item: 'change-beats' }`).
  - Un tour de triade écoute jusqu’à sa fin : il n’écrit pas `listenBeforeEnd`, car aucune consigne suivante ne s’annonce avant la fin de la respiration.
  - La zone reste un tour sur le temps avec une capture tardive (`offbeat`). L’ancrage est une racine ponctuelle puis un accord étendu, avec correction.
- **D4 — Le verdict raconte chaque attente ratée, par sa sorte de contenu.** Une note ratée dit sa position (« corde de sol, case 5 »). Un accord raté dessine l’entendu, l’attendu et l’écart, et dit la forme juste (cases et notes). Le libellé de la réponse donne chaque réponse entendue, dans l’ordre des attentes. Ce que le joueur vit de nouveau :
  - après une racine fausse, l’ancrage dit où était la racine (aujourd’hui : « racine entendue X ») ; si l’accord était faux aussi, il est dessiné en plus ;
  - une note fausse en localiser est écrite telle qu’elle a été jouée (aujourd’hui : le libellé redit la cible).
- **D5 — Une seule vue piste, `lane`, dans le monde calme, pour localiser et les triades.** `answer-keys` lit le même modèle. `NoteLaneView` devient `LaneView` ; `NoteLaneModel` et `AnswerKeysModel` disparaissent. Le joueur voit, pour les triades :
  - la piste, la racine sur la case cible, la bande de l’accord ;
  - le nom de l’accord et ses cordes ;
  - la forme quand l’accord est aidé ;
  - l’entendu et l’attendu après un raté.

  Les vues du geste (`link-lane`, `grid-scroll`) gardent le modèle de leur présentateur jusqu’au passage du geste en données (D9).

- **D6 — Plus de son de verdict** (`SoundCuePort`, `WebAudioCues`) : seul l’ancien contrôleur en jouait. Le port, l’adaptateur et la page d’écoute `cues/listen.ts` sont supprimés.
- **D7 — L’aperçu se résout en un seul lieu.** `previewBeatsOf(definition, presenterDefault)` dans `domain/exercise/pacing.ts` (l’exercice, sinon le présentateur, sinon aucun), lu par `SeriesItems.flowOf` et passé au compilateur (`{ param: 'previewBeats' }`, 0 sans aperçu). `RESPIRATION_BARS` et `STRING_PREVIEW_BEATS` deviennent `DEFAULT_RESPIRATION_BARS` et `DEFAULT_PREVIEW_BEATS` dans le même fichier.
- **D8 — Le nom `leadBeats` reste pour l’avance d’un niveau** (`LadderParams.leadBeats`, `PlannedItem.leadBeats`, le paramètre `{ param: 'leadBeats' }`). Il disparaît de `CardState`.
- **D9 — La frontière du code de famille après H5, nommée.** C’est la liste des arbitrages pour l’auteur : chaque ligne demande une pièce du langage, et aucune n’est demandée par les triades de H5.

  | Reste du code                                                                                                                         | Pourquoi pas en H5                                                                               | Quand                                                                      |
  | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- |
  | Les sujets d’apprentissage (`neckSubject`, `triadSubject`) : ordre d’introduction, voisins, ouverture de la zone, position de la zone | « une autre forme que la dernière », « ouverte par l’ancrage » sont des relations entre réponses | avec les relations (5 exercices du corpus), au passage du geste en données |
  | Les candidats du capteur d’accords (`MechanicPresenter.expectation`, les renversements par `closeTriadVoicings`)                      | les confusions d’un accord de quatre sons demandent les familles de voicings                     | chantier 3 (familles de voicings, juge dans le grave)                      |
  | La forme stockée d’un essai (`attemptData`), `debugLines`, les touches de réponse                                                     | les statistiques du manche lisent la forme stockée                                               | chantier 5 (mesures par compétence)                                        |
  | Le geste : sélecteur, présentateurs, `link-lane`, `grid-scroll`                                                                       | montée, zone et lien sont des relations                                                          | avec les relations                                                         |

- **D10 — Le format laisse la place aux séquences.** Le corpus en a besoin pour 9 exercices : arpèges, positions de gamme, une figure rythmique × une suite de notes dérivée de l’item.
  - Aujourd’hui, `round.expectations` est une liste.
  - Une version suivante ajoutera une forme `round.figure` à côté, sans changer celle-ci.
  - `validateExercise` refuse dès maintenant toute clé de `round` qu’il ne connaît pas, si bien qu’aucun exercice ne l’écrit avant qu’elle existe.
- **D11 — L’accompagnement en données pour toute série (2 et 4, mesures muettes) n’est pas dans H5.** Il vient avec le geste en données, que demandent les quatre exercices du corpus qui l’exigent (II-V-I, lecture de grilles, patterns de blues, mesures silencieuses sur une grille).

**Les pièces ajoutées, classées** (primitive du moteur, vocabulaire, donnée d’exercice, code de famille, migration, exception) :

| Pièce                                                            | Classe          | Ce qu’elle permet                                                                                                                                                  |
| ---------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `RoundTemplate`, `compileRound`, `Num` (`{ param }`, `{ item }`) | primitive       | tout tour à réponse décrit en données : n’importe quelles attentes, capteurs, positions, étendues, fenêtres ; tout nombre réglable par un niveau                   |
| `CONTENT_DERIVATIONS`, `ITEM_NUMBERS`                            | vocabulaire     | tirer un contenu ou un nombre d’un item : `voicing-root`, `voicing-anywhere`, `voicing-at-position`, `note-of-item`, `name-of-item`, `grid-change`, `change-beats` |
| `PromptPresentation` (champs, aperçu, aide, aide qui s’efface)   | donnée          | ce que l’écran dit d’une consigne, sans code                                                                                                                       |
| `ITEM_FIELDS`, `PICTURES`, `CONTENT_VIEWS`                       | vocabulaire     | les mots d’un item, ses dessins, ce qu’un contenu dit de sa réponse et de son raté                                                                                 |
| `promptStage`, `PromptStageModel`, `StagePlace.bands`            | primitive       | un modèle d’écran pour tout exercice à réponse, les bandes calculées depuis le plan                                                                                |
| `LaneView`, `PICTURE_VIEWS`                                      | vue générique   | une piste pour tout exercice à réponse joué sur le temps                                                                                                           |
| `randomExercise`, `rightPayload` (bancs)                         | test            | la promesse « tout exercice valide se joue » vérifiée sur des exercices tirés au hasard                                                                            |
| `TRIAD_LADDER_V10`                                               | migration       | figée, jamais lue par le jeu                                                                                                                                       |
| sujets, candidats d’accords, `attemptData`, geste                | code de famille | la frontière nommée (D9)                                                                                                                                           |
| aucune                                                           | exception       | —                                                                                                                                                                  |

## Review Focus

- **Une base réelle :**
  - données : une carte d’ancrage apprise à l’avance 4, une autre à l’avance 2, une carte de zone en apprentissage, une carte de localiser avec son niveau de Dexie 9 ;
  - après la montée en version 10 : chaque triade a son niveau (1, 2, 0), aucune carte n’a plus `leadBeats`, le niveau de la note est intact ;
  - l’import d’une sauvegarde 5 donne la même base (Task 11).
- **Un gabarit qui lit un paramètre qu’un niveau ne donne pas** (un localiser dont l’échelle a un niveau sans avance) : `validateExercise` le refuse avant toute séance, en nommant l’exercice, le niveau et le champ ; jamais une erreur au milieu d’un tour (Task 2).
- **Une présentation qui cite un champ que sa mécanique n’a pas** (`{chord}` sur localiser) : refusée en nommant l’exercice et le champ (Task 4).
- **Un ancrage corrigé dans la bande :** racine juste ; premier accord faux montré tout de suite comme raté provisoire ; accord juste plus tard dans la bande. Résultat attendu (Task 7) :
  - verdict `corrected`, un raté stocké une fois (`success: false`) ;
  - le premier accord faux dessiné ;
  - contestable en développement seulement.
- **Une pause pendant la bande de l’accord** (Task 7) :
  - les attentes du capteur d’accords sont retirées avant que l’étendue se ferme ;
  - ce que le capteur rapporte au retrait entre dans le tour qui finit ;
  - la reprise compte une mesure, et la consigne suivante ne dit au capteur aucun accord précédent.

---

## File Structure

**Domaine**

- Create: `src/lib/domain/exercise/round/types.ts`, `compile.ts`, `validate.ts`, `index.ts` (+ specs) — le gabarit, le compilateur, la validation du gabarit.
- Create: `src/lib/domain/derivations/index.ts` (+ spec) — `CONTENT_DERIVATIONS`, `ITEM_NUMBERS`.
- Create: `src/lib/domain/triads/zoneOpen.ts` — `triadZoneOpen`, `ZONE_MIN_ACQUIRED_TRIADS` (déplacés de `triadSelector.ts`).
- Modify:
  - `src/lib/domain/exercise/`: `types.ts` (`round`, `presentation`), `catalog.ts`, `validate.ts`, `pacing.ts` (D7, plus de `targetBarOffsetOf`, `countEndsOnOf`, plus des adaptateurs), `ladder.ts` ;
  - `src/lib/domain/gesture/exercises.ts` ;
  - `src/lib/domain/progress/`: `cards.ts`, `constants.ts`, `success.ts`, `neck.ts` ;
  - `src/lib/domain/mechanics/*` (plus de `timing`) ;
  - `src/lib/domain/types.ts`.
- Delete:
  - `src/lib/domain/exercise/roundPlans.ts` (+ spec), `src/lib/domain/progress/neckPlans.ts` (+ spec), `src/lib/domain/gesture/plans.ts` (+ spec) ;
  - `src/lib/domain/timing/`, `src/lib/domain/scoring/timing.ts`, `src/lib/domain/progress/triadSelector.ts`, `src/lib/domain/time/legacyParity.spec.ts`.

**Application**

- Create: `src/lib/application/presentation/itemFields.ts`, `pictures.ts`, `contentViews.ts`, `presentPrompt.ts`, `promptStage.ts`, `validate.ts`, `index.ts` (+ specs).
- Modify:
  - `src/lib/application/mechanics/`: `types.ts` (`StagePlace.bands` ; `prompt`, `answerLabel`, `reveal`, `stage`, `stageOf` facultatifs), `locate.ts`, `identify.ts`, `triads.ts` (`attemptData`), `chordGrid.ts` ;
  - `src/lib/application/session/series/`: `ResponseSeriesController.svelte.ts` (compile lui-même, construit le modèle d’écran), `seriesItems.ts`, `planSource.ts` (supprimé en Task 3) ;
  - `src/lib/application/session/`: `AttemptRecorder.ts`, `SessionDeps.ts`, `contract.ts` ;
  - `src/lib/application/services/createAppServices.ts`.
- Delete: `src/lib/application/session/SessionController.svelte.ts` et ses specs (liste en Task 9), `src/lib/application/ports/MetronomePort.ts`, `SoundCuePort.ts`.

**Infrastructure**

- Create: `src/lib/infrastructure/storage/migrations/v10.ts` (+ spec).
- Modify: `db.ts`, `validateBackup.ts`, `DexieBackup.ts`, dépôts de cartes et leurs contrats, `testing/fixtures.ts`.
- Delete: `src/lib/infrastructure/audio/clock/WebAudioMetronome.ts` (+ spec ; `DEFAULT_LOOKAHEAD_MS` passe dans `WebAudioSoundScheduler.ts`), `audio/cues/`.

**Interface et pages**

- Create: `src/lib/ui/play/views/LaneView.svelte`, `laneView.ts`, `pictures.ts` (`PICTURE_VIEWS`) (+ specs).
- Modify: `views/index.ts`, `AnswerKeysView.svelte`, `PlayFrame.svelte`, `src/routes/session/+page.svelte`, `src/routes/session/demo/+page.svelte`, `src/routes/dev/identify/+page.svelte`, `src/lib/ui/play/demo/*`, `src/lib/ui/screens/home/HomeScreen.svelte`, `scripts/functional-ui.mjs`.
- Delete: `NoteLaneView.svelte`, `noteLane.ts` (+ specs), `src/lib/ui/play/PlayScreen.svelte` (+ specs, `answer/PlayScreen.identify.svelte.spec.ts`).

**Bancs**

- Create: `src/lib/testing/triadsSeries.ts` (le banc des triades, comme `notesSeries.ts`), `src/lib/testing/randomExercise.ts` (`randomExercise`, `rightPayload`).

---

## Partie A — Le langage du tour et l’écran

### Task 1: Le gabarit du tour et son compilateur

**Files:**

- Create: `src/lib/domain/exercise/round/types.ts`, `compile.ts`, `index.ts`, `compile.spec.ts`, `src/lib/domain/derivations/index.ts`, `derivations.spec.ts`
- Modify: `src/lib/domain/exercise/types.ts` (`round?: RoundTemplate`)

**Interfaces:**

- Produces :

```ts
// domain/exercise/round/types.ts — pure data, JSON as is
/** A number: written, read in the item's resolved params by path, or measured on the item. */
export type Num = number | { param: string } | { item: string };
/** A place in the round from its start (the target), in beats of the meter or in bars. */
export type Position = { beats: Num } | { bars: Num };
export type WindowTemplate = { ms: Num } | { ofGap: string };
export interface ExpectationTemplate {
	/** null: free time. */
	at: Position | null;
	/** A stretch ending there; absent: a point. */
	until?: Position;
	role?: 'target' | 'judged-rest';
	sensor: string;
	/** Derived from the item by a named derivation (its kind is the derivation's); null: rhythm only. */
	content: { from: string } | null;
	window: WindowTemplate;
	bar?: number;
}
export interface RoundTemplate {
	/** The prompt `lead` beats before the target. */
	prompt: { lead: Num };
	expectations: ExpectationTemplate[];
	/** Bars and beats added, plus the exercise's breath (`pacing.respirationBars` bars) when `breath`. */
	length: { bars?: Num; beats?: Num; breath?: boolean };
	/** Stops listening this long before the end (the next prompt's preview); absent: at the end. */
	listenBeforeEnd?: Position;
	handover?: 'end';
	mutedBars?: number[];
	/** As `RoundPolicy`; any number inside `pairing` may be a `Num`. */
	policy: {
		unit: 'response' | 'cycle';
		verdict: string;
		correction: boolean;
		pairing: { mode: string } & Record<string, unknown>;
	};
	/** Where the target falls in its bar, a fraction of a whole note ("1/4"); absent: the downbeat. */
	barOffset?: string;
	countEndsOn?: 'prompt' | 'target';
}
// domain/exercise/round/compile.ts
/** The plan of `item`'s round, from its exercise's template; throws an error naming the exercise and the field. */
export function compileRound(
	definition: ExerciseDefinition,
	item: PlannedItem,
	meter: Meter,
	resolved: { previewBeats: number }
): RoundPlan;
/** The params a template reads: the exercise's params, its windows, pacing and recall threshold resolved, the item's lead, the preview. */
export function roundParamsOf(
	definition: ExerciseDefinition,
	item: PlannedItem,
	resolved: { previewBeats: number }
): Readonly<Record<string, unknown>>;
// domain/derivations/index.ts
export interface ContentDerivation {
	kind: string;
	reads: readonly MechanicId[];
	derive(item: unknown): unknown;
}
export const CONTENT_DERIVATIONS: Readonly<Record<string, ContentDerivation>>;
export interface ItemNumber {
	reads: readonly MechanicId[];
	measure(item: unknown): number;
}
export const ITEM_NUMBERS: Readonly<Record<string, ItemNumber>>;
```

Le registre de départ :

| Nom                     | Sorte           | Lit                          | Donne                                       |
| ----------------------- | --------------- | ---------------------------- | ------------------------------------------- |
| `note-of-item`          | `note`          | `locate`                     | l’item                                      |
| `name-of-item`          | `name`          | `identify`                   | l’item                                      |
| `voicing-root`          | `note`          | `triad-anchor`, `triad-zone` | `rootPosition(parseVoicingKey(voicingKey))` |
| `voicing-anywhere`      | `chord-voicing` | `triad-anchor`, `triad-zone` | `{ voicingKey, position: null }`            |
| `voicing-at-position`   | `chord-voicing` | `triad-zone`                 | `{ voicingKey, position }`                  |
| `grid-change`           | `chord-grid`    | `chord-grid`                 | l’item                                      |
| `change-beats` (nombre) | —               | `chord-grid`                 | `item.changes[item.index].length`           |

Règles de `compileRound` :

- Un `{ param: 'a.b' }` se lit dans `roundParamsOf` par chemin. Un chemin absent, ou une valeur non numérique ou nulle, lève `` `${definition.id}: round.<champ> reads param "<chemin>", absent for <mechanic> item <itemKey>` ``.
- Les `Num` à l’intérieur de `policy.pairing` se résolvent en profondeur ; les chaînes (`'to-end'`) restent.
- La longueur vaut `bars·mesure + beats·unité + respirationBars·mesure` si `breath`.
- `listenUntil = length − listenBeforeEnd` ; `handover: 'end'` donne `handover = length`.
- Le plan compilé passe `validateRoundPlan`, sinon l’erreur nomme l’exercice.

- [ ] **Step 1: Write the failing tests** :
  - `compile.spec.ts`. Chacun compare avec le constructeur d’aujourd’hui sur les mêmes entrées (`roundPlans.ts` existe encore) :
    - `it('compiles a locate template to the beat plan')` ;
    - `it('compiles an identify template to the free plan')` ;
    - `it('compiles an anchor template to the anchor plan: root on the beat, chord from beat 2 to the bar end')` ;
    - `it('compiles a zone template to a beat plan heard by the chord sensor')` ;
    - `it('compiles a grid template to the grid change plan, its length measured on the item')`.
  - `compile.spec.ts`, au-delà des constructeurs :
    - `it('reads a number a level gives (the lead) and one a definition writes (a window)')` ;
    - `it('places a target and ends the count where the template says')` (`barOffset: '1/4'`, `countEndsOn: 'target'`) ;
    - `it('names the exercise, the field and the param when a param is absent')` ;
    - `it('names the exercise when the compiled plan is invalid')` (attente hors de la longueur).
  - `derivations.spec.ts` :
    - `it('derives the root of a voicing as a note on its string')` ;
    - `it('derives a voicing anywhere and at its position')` ;
    - `it('declares the mechanics each derivation reads')`.
- [ ] **Step 2: Run** `npx vitest run src/lib/domain/exercise/round src/lib/domain/derivations` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run check` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: compile a round from a template an exercise writes"`

---

### Task 2: Les exercices écrivent leur tour, le validateur le lit

**Files:**

- Create: `src/lib/domain/exercise/round/validate.ts`, `validate.spec.ts` (dans `round/`)
- Modify: `src/lib/domain/exercise/validate.ts`, `validate.spec.ts`, `catalog.ts`, `catalog.spec.ts`, `src/lib/domain/gesture/exercises.ts`, `src/lib/application/session/series/dataOnlyExercise.spec.ts` (sa définition écrit `round`)

**Interfaces:**

- Consumes : `RoundTemplate`, `CONTENT_DERIVATIONS`, `ITEM_NUMBERS` (Task 1), `ROUND_MODES` (`domain/time/modes`), `CONTENT_JUDGES` (`domain/judges`).
- Produces :
  - `roundProblem(definition: ExerciseDefinition, options?: { sensors?: readonly string[] }): string | null`, appelé par `validateExercise(definition, options?)`, qui transmet `options`.
  - Le catalogue : `round` sur `locate-neck`, `identify-neck`, `triads-anchor`, `triads-zone` et les quatre exercices du geste. Leurs gabarits sont construits par des fonctions de `catalog.ts` et de `gesture/exercises.ts` qui rendent de la donnée.

`roundProblem` refuse, en nommant le champ :

- une clé de `round` ou d’attente inconnue (D10) ;
- une dérivation ou un nombre d’item inconnu, ou qui ne lit pas la mécanique de l’exercice ;
- une sorte de contenu sans juge ;
- un mode d’appariement ou de verdict inconnu ;
- un capteur absent de `options.sensors` quand la liste est donnée ;
- un `{ param }` qu’aucun niveau ne résout. Pour `leadBeats`, chaque niveau de l’échelle de la mécanique doit donner une avance non nulle ; le message nomme les niveaux, comme `noLead` aujourd’hui. `previewBeats` est toujours résolu ; les autres chemins se lisent dans les paramètres et leurs défauts.
- une position négative, une étendue qui ne finit pas après son début, des attentes en temps libre mêlées à des attentes placées, `barOffset` hors de sa mesure, `countEndsOn` hors de `prompt | target`.

- [ ] **Step 1: Write the failing tests** :
  - `round/validate.spec.ts` :
    - `it('accepts the catalog')` ;
    - `it('refuses an unknown key, naming it')` ;
    - `it('refuses a derivation that does not read the mechanic')` ;
    - `it('refuses a lead param a level of the ladder does not give, naming the levels')` ;
    - `it('refuses a sensor the session does not have, when told the sensors')` ;
    - `it('refuses a span ending before it starts')`.
  - `catalog.spec.ts` :
    - `it('writes every exercise as plain data')` (égalité après `JSON.parse(JSON.stringify(…))`) ;
    - `it('compiles every response exercise of the catalog to the plan its builder gives')` (locate, identify au niveau 0 et en haut ; ancrage, zone sur un accord ; geste sur une grille).
- [ ] **Step 2: Run** `npx vitest run src/lib/domain/exercise` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run check` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: write each response exercise's round in its data and validate it"`

---

### Task 3: La série compile elle-même ; les constructeurs de plan disparaissent

**Files:**

- Delete: `src/lib/domain/exercise/roundPlans.ts`, `roundPlans.spec.ts`, `src/lib/domain/progress/neckPlans.ts`, `neckPlans.spec.ts`, `src/lib/domain/gesture/plans.ts`, `plans.spec.ts`, `src/lib/application/session/series/planSource.ts`
- Modify:
  - `src/lib/application/session/series/ResponseSeriesController.svelte.ts` (plus de `deps.plans`) ;
  - `src/lib/application/services/createAppServices.ts` ;
  - `src/lib/domain/exercise/pacing.ts` (D7 ; `targetBarOffsetOf`, `countEndsOnOf` retirés), `validate.ts` (plus de `params.targetBarOffset`, `params.countEndsOn`) ;
  - `src/lib/application/session/series/seriesItems.ts` (`flowOf` lit `previewBeatsOf`) ;
  - `src/lib/domain/time/legacyParity.spec.ts` (compile les gabarits du catalogue au lieu d’appeler les constructeurs) ;
  - `src/lib/testing/notesSeries.ts`, `gestureSeries.ts`, `dataOnlyExercise.spec.ts` ;
  - les specs de `compile.spec.ts` et `catalog.spec.ts`, dont le côté « constructeur » devient des plans écrits en entier, comme `paperPlans.spec.ts`.

**Interfaces:**

- Consumes : `compileRound`, `roundParamsOf` (Task 1).
- Produces :
  - `DEFAULT_RESPIRATION_BARS = 1`, `DEFAULT_PREVIEW_BEATS = 2`, `previewBeatsOf(definition: ExerciseDefinition, presenterDefault: number | undefined): number | null` (`domain/exercise/pacing.ts`).
  - La série appelle `compileRound(definition, item, seriesMeter, { previewBeats: flowOf(item).previewBeats ?? 0 })` partout où elle appelait `deps.plans`.

- [ ] **Step 1: Write the failing test** `it('resolves the preview once: the exercise, else the presenter, else none')` (`pacing.spec.ts`).
- [ ] **Step 2: Run** → FAIL ; **implement** `previewBeatsOf`, puis supprimer et suivre `npm run check` jusqu’à zéro.
- [ ] **Step 3: Run** `npm test && npm run check` → PASS (`gestureSession.spec.ts`, `notesSession.spec.ts`, `dataOnlyExercise.spec.ts` sans changement d’attentes).
- [ ] **Step 4: Commit** `git commit -m "refactor: compile every response round from its template, without plan builders"`

---

### Task 4: La présentation en données et son vocabulaire

**Files:**

- Create: `src/lib/application/presentation/itemFields.ts`, `pictures.ts`, `contentViews.ts`, `presentPrompt.ts`, `validate.ts`, `index.ts` et leurs specs
- Modify: `src/lib/domain/exercise/types.ts` (`presentation?: PromptPresentation`), `catalog.ts` (présentation de `locate-neck`, `identify-neck`, `triads-anchor`, `triads-zone`), `validate.ts` (clés connues)

**Interfaces:**

- Produces :

```ts
// domain/exercise/types.ts — data
/** Text with `{field}` placeholders: one for every language, or one per language. */
export type Slot = string | { fr: string; en: string };
export interface PromptPresentation {
	primary: Slot;
	secondary?: Slot;
	/** Small, under the prompt. */
	detail?: Slot;
	/** On the target tile; absent: `primary`. */
	target?: Slot;
	/** On the band of an extended expectation. */
	band?: Slot;
	/** While the item waits for its prompt; absent: nothing. */
	preview?: Slot;
	/** At an aided level: a line, a picture, or both. */
	aided?: { line?: Slot; picture?: string };
	/** The fading aid the learning procedure gives (`PlannedItem.stringAid`). */
	fading?: { picture: string };
}
// application/presentation/
export type Picture =
	| { kind: 'string'; string: StringNumber; label: string }
	| { kind: 'shape'; notes: { string: StringNumber; fret: number }[] };
export interface ItemFields {
	names: readonly string[];
	fields(item: unknown, locale: Locale, random: () => number): Record<string, string>;
}
export const ITEM_FIELDS: Readonly<Record<MechanicId, ItemFields>>;
export const PICTURES: Readonly<
	Record<string, { reads: readonly MechanicId[]; draw(item: unknown): Picture | null }>
>;
export interface MissView {
	correction: string | null;
	heard: Picture | null;
	expected: Picture | null;
	gap: string | null;
}
export interface ContentView {
	answerLabel(value: unknown, answer: unknown, locale: Locale, random: () => number): string | null;
	miss(
		value: unknown,
		outcome: { answer: unknown; confusion: unknown },
		locale: Locale,
		random: () => number
	): MissView;
}
export const CONTENT_VIEWS: Readonly<Record<string, ContentView>>;
export interface PresentedPrompt {
	primary: string;
	secondary: string | null;
	detail: string | null;
	target: string | null;
	band: string | null;
	preview: string | null;
	aid: string | null;
	pictures: Picture[];
}
export function presentPrompt(
	definition: ExerciseDefinition,
	item: PlannedItem,
	locale: Locale,
	random: () => number
): PresentedPrompt;
export function presentationProblem(definition: ExerciseDefinition): string | null;
```

**Le vocabulaire de départ.** Les mots viennent des fonctions et des messages d’aujourd’hui, déplacés depuis les présentateurs :

- **Champs d’item :**
  - `locate` : `note`, `string`, `fret` ;
  - `identify` : `fret`, `string`, `name` ;
  - `triad-anchor` et `triad-zone` : `chord`, `root`, `rootString`, `strings`, et `around` (« vers la case 3 » / « à vide », zone seulement).
- **Dessins :** `string` (la corde de l’item et sa note à vide, `locate`) ; `lowest-shape` et `shape-at-position` (voicings).
- **Vues de contenu :**
  - `note` : le libellé écrit la note jouée comme la consigne écrit la cible ; le raté donne la position (« corde de E grave, case 5 »).
  - `name` : le nom tapé ; le raté donne le nom juste, les deux orthographes d’une note altérée.
  - `chord-voicing` : le libellé donne les cases entendues. Le raté donne :
    - l’entendu ;
    - l’attendu (la forme à la position demandée, sinon la plus proche de l’entendue) ;
    - l’écart (`TRIAD_MESSAGES.gap`) ;
    - la correction « cases · notes ».

**Les présentations du catalogue :**

| Exercice   | Ce qu’elle écrit                                                                                                                                                                                           |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Localiser  | `primary: '{note}'`, `secondary: '{string}'`, `preview: '{string}'`, `aided: { line: '{fret}' }`, `fading: { picture: 'string' }`                                                                          |
| Identifier | `primary: '{fret}'`, `secondary: '{string}'`, `aided: { line: '{name}' }`                                                                                                                                  |
| Ancrage    | `primary: '{chord}'`, `secondary: { fr: 'fondamentale sur {rootString}', en: 'root on {rootString}' }`, `detail: '{strings}'`, `target: '{root}'`, `band: '{chord}'`, `aided: { picture: 'lowest-shape' }` |
| Zone       | `primary: '{chord}'`, `secondary: '{around}'`, `detail: '{strings}'`, `aided: { line: { fr: 'fondamentale sur {rootString}', en: 'root on {rootString}' } }`                                               |

`presentationProblem` refuse un champ que la mécanique n’a pas, et un dessin inconnu ou qui ne lit pas la mécanique, en nommant l’exercice et le champ.

- [ ] **Step 1: Write the failing tests** :
  - `presentPrompt.spec.ts` :
    - `it('writes the locate prompt as today: the note, its string, the fret when aided, the string drawn while it fades')` (égal à ce que `locatePresenter.prompt` rend aujourd’hui, champ par champ) ;
    - `it('writes the anchor prompt: the chord, its root string, its strings, the root on the target, the chord on the band')` ;
    - `it('draws the lowest shape of an aided anchor and nothing when unaided')` ;
    - `it('writes a slot per language')`.
  - `contentViews.spec.ts` :
    - `it('tells a missed note its position')` ;
    - `it('tells a missed chord what was heard, what was expected near it, and the gap')` ;
    - `it('expects the zone's shape at its position')` ;
    - `it('tells a missed name both spellings')`.
  - `validate.spec.ts` (présentation) :
    - `it('accepts the catalog')` ;
    - `it('refuses a field the mechanic does not have, naming the exercise and the field')` ;
    - `it('refuses a picture that does not read the mechanic')`.
- [ ] **Step 2: Run** `npx vitest run src/lib/application/presentation` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run check` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: write what the screen says of a prompt in the exercise's data"`

---

### Task 5: Un modèle d’écran pour tout exercice à réponse

**Files:**

- Create: `src/lib/application/presentation/promptStage.ts`, `promptStage.spec.ts`
- Modify:
  - `src/lib/application/mechanics/types.ts` (`StagePlace.bands` ; `prompt`, `answerLabel`, `reveal`, `stageOf` facultatifs), `locate.ts`, `identify.ts` (plus de `prompt`, `answerLabel`, `reveal`, `stageOf`, `NoteLaneModel`, `AnswerKeysModel`), `noteVerdict.ts` (supprimé s’il n’a plus de lecteur) ;
  - `src/lib/application/session/series/ResponseSeriesController.svelte.ts` (`showStage` : `promptStage` quand l’exercice a une présentation, sinon `stageOf` du présentateur) ;
  - `src/lib/ui/play/views/NoteLaneView.svelte`, `noteLane.ts`, `AnswerKeysView.svelte` (lisent `PromptStageModel`) ;
  - `src/lib/ui/play/demo/*`, `src/routes/dev/identify/+page.svelte`, et les specs qui construisaient les anciens modèles.

**Interfaces:**

- Consumes : `presentPrompt`, `CONTENT_VIEWS` (Task 4), `RoundPlan`, `ResponseValue`.
- Produces :

```ts
export interface StageVerdict {
	verdict: ResponseVerdict;
	offsetMs: number | null;
	/** Each answer heard, in the order of the expectations, joined by « · »; null: none. */
	answerLabel: string | null;
	/** One per expectation the round missed, in order; empty on a success. */
	misses: MissView[];
}
export interface PromptStageModel {
	prompt: PresentedPrompt;
	anchorBeat: number | null;
	promptBeat: number | null;
	history: readonly LaneEntry[];
	/** The extended expectations, in lane beats. */
	bands: readonly { fromBeat: number; untilBeat: number }[];
	beatsPerBar: number;
	verdict: StageVerdict | null;
	chordDiagram: ChordDiagramStyle;
	/** The answer keys of a screen mechanic (`presenter.answerChoices`); empty otherwise. */
	choices: readonly AnswerChoice[];
}
export function promptStage(input: {
	definition: ExerciseDefinition;
	item: PlannedItem;
	plan: RoundPlan;
	settled: { value: ResponseValue; success: boolean } | null;
	place: StagePlace;
	beatsPerBar: number;
	chordDiagram: ChordDiagramStyle;
	choices: readonly AnswerChoice[];
	locale: Locale;
	random: () => number;
}): PromptStageModel;
// StagePlace gains
bands: readonly { fromBeat: number; untilBeat: number }[];
```

Une attente est ratée quand le tour n’a pas réussi et que son `correct` n’est pas `true` ou que sa `confusion` n’est pas nulle (le premier accord faux d’un tour `corrected`). La série remplit `bands` depuis le plan placé, pour tout exercice.

- [ ] **Step 1: Write the failing tests** :
  - `promptStage.spec.ts` :
    - `it('places the prompt, the target and the bands of the plan')` ;
    - `it('tells nothing of a success but its verdict and offset')` ;
    - `it('tells each missed expectation by its content: the root's position, the chord drawn')` ;
    - `it('draws the first wrong chord of a corrected round')` ;
    - `it('joins the answers heard in the order of the expectations')` ;
    - `it('gives the answer keys of a screen mechanic')`.
  - `ResponseSeriesController.svelte.spec.ts` : `it('gives the view the band of an extended expectation, in lane beats')`.
- [ ] **Step 2: Run** `npx vitest run src/lib/application/presentation src/lib/application/session/series` → FAIL.
- [ ] **Step 3: Implement** ; les vues des notes lisent les champs renommés, sans changer ce qu’elles dessinent (sauf D4).
- [ ] **Step 4: Run** `npm test && npm run check` → PASS ; `node scripts/functional-ui.mjs` → vert.
- [ ] **Step 5: Commit** `git commit -m "feat: build every response exercise's screen from its plan and presentation"`

---

### Task 6: La vue piste générique

**Files:**

- Create: `src/lib/ui/play/views/LaneView.svelte`, `laneView.ts`, `pictures.ts`, `LaneView.svelte.spec.ts`, `laneView.spec.ts`
- Delete: `NoteLaneView.svelte`, `NoteLaneView.svelte.spec.ts`, `noteLane.ts`, `noteLane.spec.ts`
- Modify: `src/lib/ui/play/views/index.ts` (`lane` remplace `note-lane`, monde `quiet`), `src/lib/domain/exercise/catalog.ts` (`view: 'lane'` sur localiser), `src/routes/session/demo/+page.svelte` (le plan `shot=triad` montre la piste dans `PlayFrame`, sur un modèle fixe), `scripts/functional-ui.mjs`

**Interfaces:**

- Consumes : `PromptStageModel` (Task 5).
- Produces :
  - `laneViewTiles(model: PromptStageModel, time: { nowBeat: number }): LaneTile[]` (la première bande en `followUp` de `laneTiles`) ;
  - `PICTURE_VIEWS: Record<Picture['kind'], Component<{ picture: Picture; chordDiagram: ChordDiagramStyle }>>` (`string` → `StringDiagram`, `shape` → `ChordShape`) ;
  - `PLAY_VIEWS.lane`, `VIEW_WORLDS.lane = 'quiet'`.

La vue reprend tout ce que `NoteLaneView` dessine. Elle y ajoute :

- `detail` sous la consigne ;
- `target` sur la case cible et `band` sur la bande ;
- les dessins de la consigne par `PICTURE_VIEWS` ;
- les ratés par `DrawnMiss` (un par attente ratée).

En attente, elle montre `preview` et le dessin qui s’efface. Elle dessine son décompte dans son champ. Elle ne nomme aucune mécanique.

- [ ] **Step 1: Write the failing tests** :
  - `laneView.spec.ts` :
    - `it('puts the target on its beat and the band on the beats after it')` ;
    - `it('shows no target while the item waits')`.
  - `LaneView.svelte.spec.ts` :
    - `it('shows the note and its string, and the string alone while it waits')` ;
    - `it('shows the chord, its root string and its strings, the root on the target and the chord on the band')` ;
    - `it('draws the pictures of the prompt only when given')` ;
    - `it('draws one miss per missed expectation, and nothing after a success')` ;
    - `it('shows the countdown in its field')`.
- [ ] **Step 2: Run** `npx vitest run --project client src/lib/ui/play/views` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run check` → PASS ; `node scripts/functional-ui.mjs` contre le serveur de développement → aucun texte sous 16 px sur `/session/demo` et `shot=triad`.
- [ ] **Step 5: Commit** `git commit -m "feat: draw any response exercise on one quiet lane"`

---

## Partie B — Les triades et le ménage

### Task 7: Les triades jouent sur la série

**Files:**

- Create: `src/lib/testing/triadsSeries.ts`, `src/lib/application/session/series/triadsSession.spec.ts`, `src/lib/domain/triads/zoneOpen.ts`
- Modify:
  - `src/lib/domain/triads/triadSubject.ts` (`attempts` obligatoire) ;
  - `src/lib/domain/exercise/catalog.ts` (`view: 'lane'` sur les deux exercices) ;
  - `src/lib/application/mechanics/triads.ts` (`attemptData`) ;
  - `src/lib/application/services/createAppServices.ts`, `src/routes/session/+page.svelte` (tous les genres dans `PlayFrame`) ;
  - `src/lib/ui/play/PlayFrame.svelte` (`triads`/`triads-zone` sans vue → calme), `src/lib/ui/screens/home/HomeScreen.svelte` (`SESSION_MS`).
- Delete: `src/lib/application/session/triadsSession.spec.ts` (porté)

**Interfaces:**

- Consumes : `compileRound` (Tasks 1 à 3), `promptStage` et `lane` (Tasks 5 et 6), `createLearningProcedure`, `triadSubject`.
- Produces :
  - `startSession('triads' | 'triads-zone')` rend un `ResponseSeriesController` :
    - une exécution `{ exerciseId, tempoBpm: startTempo(definition, progressions) }` ;
    - la source `createLearningProcedure({ subject: triadSubject({ mechanic, definitions, acquiredPositions, attempts }), cards, attempts, levels, sessionId, random, set: DEFAULT_SET_LEARNING })` ;
    - `durationMs: SESSION_MS` et `recall: subject.recall`.
  - `attemptData` rend `TriadAnchorData` / `TriadZoneData`, la forme stockée aujourd’hui.
  - `triadZoneOpen(cards)` est importé de `domain/triads`.

- [ ] **Step 1: Write the failing tests** (`triadsSession.spec.ts`, sur `triadsSeries.ts`) :
  - `it('learns C in anchor, acquires it cold, then asks it around a fret')` (le scénario de l’ancien spec, sur la série)
  - `it('probes a new chord unaided, then shows it aided on the next prompt after a miss, not at once')`
  - `it('never asks the same voicing twice in a row')`
  - `it('asks in the zone a shape other than the last one stored, from attempts stored before H5')`
  - `it('shows a wrong first chord at once, settles it corrected when put right in the band, stores one miss')`
  - `it('offers « Joué juste » on a miss in development only')`
  - `it('withdraws the chord expectation on pause: what the sensor reports then goes to the closing round')`
  - `it('tells the chord sensor the chord just asked, and nothing after a pause')`
  - `it('ends on the summary when the zone has nothing to ask')`
  - `it('ends after SESSION_MS, a round under way finishing')`
  - `it('plays at 80 bpm whatever progression is stored, and writes none')`
  - `it('stores the attempt data as before')` (égalité avec une `TriadAnchorData` et une `TriadZoneData` écrites en dur)
- [ ] **Step 2: Run** `npx vitest run src/lib/application/session/series/triadsSession.spec.ts` → FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npm test && npm run check` → PASS ; `node scripts/functional-ui.mjs` → vert.
- [ ] **Step 5: Commit** `git commit -m "feat: play the triads on the response series with the learning procedure"`

---

### Task 8: Tout exercice valide se joue

**Files:**

- Create: `src/lib/testing/randomExercise.ts`, `src/lib/application/session/series/openness.spec.ts`

**Interfaces:**

- Consumes : `validateExercise`, `presentationProblem`, `CONTENT_DERIVATIONS`, les bancs de la série.
- Produces :

```ts
/** A definition drawn from the registered pieces only; it may be one validateExercise refuses. */
export function randomExercise(random: () => number): ExerciseDefinition;
/** The payload a fake sensor sends for a right answer to `content`, by content kind. */
export function rightPayload(content: ExpectedContent): unknown;
```

`randomExercise` tire au hasard :

- **la forme** : une mécanique parmi `locate`, `identify`, `triad-anchor`, `triad-zone` ; un mètre parmi 2/4, 3/4, 4/4, 6/8 ; un tempo fixe de 50 à 160 ;
- **les attentes** : une ou deux, chacune avec une dérivation qui lit la mécanique et le capteur de sa sorte (`note` → `note`, `chord-voicing` → `chord`, `name` → `tap`). Positions, étendues et fenêtres en fractions de temps.
- **le reste** : une longueur et une respiration ; une échelle d’une à trois marches ; une place de la cible et une fin de compte ; une présentation faite des champs de la mécanique.

La source est une liste fixe (`createListSource`) de trois items de la mécanique.

- [ ] **Step 1: Write the tests** :
  - `it('plays an exercise written only in this test: the root of a chord on beat 2 of a 3/4 bar, then the chord at its position over two beats')` — mécanique `triad-zone`, dérivations `voicing-root` et `voicing-at-position`, présentation inventée. Il affirme :
    - chaque tour stocke un essai réussi quand le faux capteur répond juste ;
    - le plan stocké porte les deux attentes aux positions écrites ;
    - le modèle d’écran porte les textes écrits.
  - `it('runs every exercise the validator accepts, drawn at random')` — 200 graines. Pour chaque définition que `validateExercise` (avec les capteurs de la séance) et `presentationProblem` acceptent, trois tours se jouent :
    - une fois avec des réponses justes (`rightPayload`) : chaque tour stocke un essai réussi ;
    - une fois sans réponse : chaque tour stocke un raté ;
    - jamais d’erreur.

    Le test affirme aussi qu’au moins 50 graines donnent une définition acceptée, pour que le tirage ne devienne pas vide sans bruit.

  - `it('names the exercise and the field of every definition it refuses')` — sur les mêmes graines, chaque refus commence par l’identifiant de l’exercice.
- [ ] **Step 2: Run** `npx vitest run src/lib/application/session/series/openness.spec.ts`. Un échec désigne un trou du moteur ou du validateur ; il se corrige dans la pièce fautive, jamais en restreignant le tirage, sauf pour retirer ce que le moteur refuse à raison (le validateur doit alors le refuser).
- [ ] **Step 3: Run** `npm test && npm run check` → PASS.
- [ ] **Step 4: Commit** `git commit -m "test: play every exercise the validator accepts, written only as data"`

---

### Task 9: L’ancien contrôleur et `PlayScreen` disparaissent

**Files:**

- Delete:
  - `src/lib/application/session/SessionController.svelte.ts`, et les specs `SessionController.spec.ts`, `chainedRounds.spec.ts`, `countdown.spec.ts`, `briefing.spec.ts`, `tempoScope.spec.ts`, `tempoSwitch.spec.ts`, `pacing.spec.ts`, `stage.spec.ts`, `expectation.spec.ts`, `refining.spec.ts`, `twoSensors.spec.ts`, `skillLearner.spec.ts` ;
  - `src/lib/ui/play/PlayScreen.svelte`, `PlayScreen.svelte.spec.ts`, `answer/PlayScreen.identify.svelte.spec.ts`.
- Modify:
  - `src/lib/application/session/thirdMechanic.spec.ts` (sur la série, avec un gabarit et une présentation) ;
  - `src/lib/application/mechanics/types.ts` (plus de `stage`, ni `NO_PLACE`), `triads.ts` (plus de `prompt`, `answerLabel`, `reveal`, `feedback`), `chordGrid.ts` ;
  - `contract.ts` (`PlayView` réduit), `PlayFrame.svelte`, `PlanSessionController.svelte.ts`, `ResponseSeriesController.svelte.ts` ;
  - `src/lib/ui/play/demo/*`, `src/lib/ui/CLAUDE.md`.

**Interfaces:**

- Produces :
  - `PlayView` = `{ status, tempoBpm, fatigueDetected, countdown, contest, audioError, stage, briefing }` (amendement, section 5). Sortent : `prompt`, `lastVerdict`, `beatsPerBar`, `promptBeatIndex`, `targetBeatIndex`, `followUp`, `leadBeats`, `history`, `answerChoices`, `scene`, `preview`, `chordDiagram`.
  - `MechanicPresenter.stage` est retiré.
  - `prompt`, `answerLabel`, `reveal`, `feedback` et `stageOf` ne servent plus qu’au geste (D9).

Chaque spec supprimé garde sa règle ailleurs, ou la perd parce qu’elle n’appartenait qu’à l’ancien contrôleur. Avant de supprimer :

- l’implémenteur nomme dans le registre, pour chaque `it`, le spec de la série qui le couvre (`gestureSession`, `notesSession`, `triadsSession`, `roundRunner`, `seriesSensors`, `ResponseSeriesController`, `openness`) ;
- un `it` sans équivalent dont la règle vaut encore (deux capteurs, lecture qui s’affine, attente retirée à la fin) est porté sur la série dans ce commit.

- [ ] **Step 1: Port** `thirdMechanic.spec.ts` et les `it` sans équivalent sur les bancs de la série → ils passent ; sinon l’écart se corrige dans la série.
- [ ] **Step 2: Delete** les fichiers listés, réduire `PlayView` et `MechanicPresenter`.
- [ ] **Step 3: Run** `npm test && npm run check` → PASS ; `node scripts/functional-ui.mjs` → vert.
- [ ] **Step 4: Commit** `git commit -m "refactor: remove the one-answer session controller and the old play screen"`

---

### Task 10: Le sélecteur des triades, l’ancien enregistrement et les adaptateurs « until H5 » disparaissent

**Files:**

- Delete: `src/lib/domain/progress/triadSelector.ts` (+ spec)
- Modify:
  - `src/lib/application/session/AttemptRecorder.ts` (plus de `record` ni `deps.timing`), `AttemptRecorder.spec.ts` ;
  - `src/lib/domain/progress/`: `cards.ts` (plus de `cardLeadAfter`), `neck.ts` (plus de `neckTiming`), `constants.ts` (plus de `LEARN_SESSION_MS` ; les constantes de la procédure ne vivent plus que comme défauts de `DEFAULT_SET_LEARNING`/`DEFAULT_ITEM_LEARNING`), `success.ts` (`cardSuccessRate` sans fenêtre par défaut) ;
  - `src/lib/domain/exercise/`: `ladder.ts` (plus de `leadStepsOf`, `learnedAfterOf`), `pacing.ts` (plus de `BeatPacing`, `DEFAULT_BEAT_PACING`, `beatPacingOf`) ;
  - `src/lib/domain/types.ts` (plus de `LEAD_STEPS`), les `index.ts` des modules.

**Interfaces:** aucune nouvelle ; `AttemptRecorder` n’expose plus que `recordResponse`, `completeObservations`, `finish` et ce que la série lit.

- [ ] **Step 1: Delete** et suivre les erreurs de `npm run check` jusqu’à zéro ; un test qui ne testait que l’élément supprimé part avec lui.
- [ ] **Step 2: Write the test** `it('keeps no constant of the procedure outside its defaults')` (`src/lib/domain/learning/params.spec.ts`) : `DEFAULT_SET_LEARNING` et `DEFAULT_ITEM_LEARNING` gardent les valeurs écrites en dur d’aujourd’hui.
- [ ] **Step 3: Run** `npm test && npm run check` → PASS.
- [ ] **Step 4: Commit** `git commit -m "refactor: remove the triad selector, the old attempt recording and the ladder adapters"`

---

### Task 11: Dexie 10 et sauvegarde 6 — chaque triade a son niveau, plus aucune carte n’a d’avance

**Files:**

- Create: `src/lib/infrastructure/storage/migrations/v10.ts`, `v10.spec.ts`
- Modify:
  - `src/lib/infrastructure/storage/`: `db.ts`, `validateBackup.ts`, `DexieBackup.ts`, `migrations/v9.spec.ts` (fil-piège sur `ladderOf`), `testing/fixtures.ts` ;
  - `src/lib/domain/types.ts` (`CardState` sans `leadBeats`, `BackupFile.version: 6`), `src/lib/domain/progress/cards.ts` (`introduceCard` sans `PLACEHOLDER_LEAD`) ;
  - tout lecteur de `card.leadBeats`.
- Test: `v10.spec.ts`, `db.spec.ts`, `validateBackup.spec.ts`

**Interfaces:**

- Produces (pur, sur des lignes, comme `v9.ts`) :

```ts
/** The triads' ladder as version 10 knew it: frozen; a tripwire test compares it with the catalog. */
export const TRIAD_LADDER_V10: {
	leadSteps: readonly [8, 4, 2];
	exercises: { 'triad-anchor': 'triads-anchor'; 'triad-zone': 'triads-zone' };
};
/** The level of a triad card from its lead; null for a card outside the triads. */
export function triadLevelOfCard(card: Row): Row | null;
export function levelStatesV10(cards: Row[], existing: Row[]): Row[];
/** A card without its lead. */
export function cardToV10(card: Row): Row;
export function backupV5ToV6(file: Row): Row;
```

Règle (D2) : non apprise → 0 ; apprise → `leadSteps.findLastIndex(lead => lead >= card.leadBeats)`, et `-1` → le haut (2). La validation des fichiers 1 à 5 garde sa liste figée `[8, 4, 2, 1]`, écrite dans `validateBackup.ts` (plus `LEAD_STEPS`) ; un fichier 6 refuse une carte qui porte `leadBeats`.

- [ ] **Step 1: Write the failing tests** :
  - `v10.spec.ts` :
    - `it('gives a learned anchor card the level of its lead')` (4 → 1, 2 → 2, 1 → 2) ;
    - `it('starts a triad card still learned at level 0')` ;
    - `it('seeds no neck card and keeps a stored level state')` ;
    - `it('removes the lead from every card')` ;
    - `it('keeps the frozen ladder equal to the catalog')` ;
    - `it('upgrades a version 5 backup to 6 with the same level states')`.
  - `v9.spec.ts` : le fil-piège compare `NECK_LADDER_V9` à `ladderOf(LOCATE_NECK)` et `ladderOf(IDENTIFY_NECK)`.
  - `db.spec.ts` : `it('upgrades a version 9 database: each triad card gets its level, no card keeps a lead, nothing else changes')`.
  - `validateBackup.spec.ts` : un fichier 6 valide ; 5 → `backupV5ToV6` ; 4 → `backupV4ToV5` puis `backupV5ToV6`.
- [ ] **Step 2: Run** `npx vitest run src/lib/infrastructure/storage` → FAIL.
- [ ] **Step 3: Implement** : `db.version(10)` (mêmes tables), upgrade qui sème puis réécrit les cartes ; `exportAll` écrit la version 6.
- [ ] **Step 4: Run** `npm test && npm run check` → PASS.
- [ ] **Step 5: Commit** `git commit -m "feat: give every triad card a level in dexie 10 and backup 6, and drop the card lead"`

---

### Task 12: `domain/timing/` et le métronome disparaissent

**Files:**

- Delete: `src/lib/domain/timing/`, `src/lib/domain/scoring/timing.ts` (+ spec), `src/lib/domain/time/legacyParity.spec.ts`, `src/lib/application/ports/MetronomePort.ts`, `SoundCuePort.ts`, `src/lib/infrastructure/audio/clock/WebAudioMetronome.ts` (+ spec), `src/lib/infrastructure/audio/cues/`
- Modify:
  - `src/lib/domain/mechanics/`: `types.ts`, `index.ts`, `locate.ts`, `identify.ts`, `chordGrid.ts`, `triadAnchor.ts`, `triadZone.ts` (plus de `timing`, `timingFor`, `isTimed`, `timedRules`) ;
  - `src/lib/domain/exercise/windows.ts` (ses défauts écrits sur place) ;
  - `src/lib/domain/types.ts` (`IgnoreReason` déménage dans `domain/time/`, plus de `isResponseSuccess`) ;
  - `src/lib/testing/`: `attempts.ts`, `fakes.ts`, `notesSeries.ts`, `gestureSeries.ts`, `triadsSeries.ts` ;
  - `src/lib/composition/createApp.ts`, `SessionDeps.ts`, `WebAudioSoundScheduler.ts` (`DEFAULT_LOOKAHEAD_MS`) ;
  - les specs de frontière (`domain/time`, `domain/learning`, `series/`, `exercise/round/`).

**Interfaces:**

- Produces : `MechanicRules` n’a plus de relation de temps ; `MechanicIdentity` et `MechanicRules` ne diffèrent plus que par `judge`, `itemKey`, `parseItem`.

- [ ] **Step 1: Delete** et suivre `npm run check` jusqu’à zéro.
- [ ] **Step 2: Run** `npm test && npm run check` → PASS.
- [ ] **Step 3: Commit** `git commit -m "refactor: remove the one-answer time relations and the metronome"`

---

### Task 13: Le critère de fin, vérifié, et la doc suit

**Files:**

- Modify:
  - `docs/superpowers/specs/2026-10-14-temps-musical-et-sequences-design.md` :
    - « Réalisation du plan H5 », avec le tableau des pièces et la frontière D9 ;
    - « Reprise », réécrite pour H6 ;
    - la liste « Données d’exercice encore écrites dans le code ».
  - `CLAUDE.md` : puces « Metronome », « Bar grid », « Sessions », « Gesture track », « Musical time », « Play views », « Mechanics and exercises », « Storage », « Drawn string ».
  - `docs/superpowers/plans/README.md`, si elle nomme l’ancien chemin.

**Interfaces:** aucune.

Le critère de fin se vérifie une fois, par une recherche, pas par un test gardé dans le code. Le compilateur empêche déjà d’importer un module supprimé. Un test de noms absents serait fragile (commentaires, noms réutilisés : `SessionController` revient en H6) et resterait comme une liste de noms morts. Les règles qui continuent de valoir restent des tests de frontière (Global Constraints).

- [ ] **Step 1: Verify the end criterion.** Run :

```bash
rg -n -e 'domain/timing' -e 'TimingRelation' -e 'MetronomePort' -e 'WebAudioMetronome' -e 'BEATS_PER_BAR' -e 'alignedPromptBeat' -e 'adjustLead' -e 'learnedLead' -e 'initialLead' -e 'laneBeat' -e 'isResponseSuccess' -e 'learnSelector' -e 'triadSelector' -e 'sequence\.ts' -e 'SEQUENCES_ENABLED' -e 'PlayScreen' -e 'LEARN_SESSION_MS' -e 'GESTURE_SESSION_MS' -e 'cardLeadAfter' -e 'leadStepsOf' -e 'beatPacingOf' -e 'SoundCuePort' -e 'card\.leadBeats' -e 'beatPlan' -e 'anchorPlan' -e 'gridChangePlan' -e 'freePlan' -e 'neckPlan' -e 'gesturePlan' -e 'PlanSource' -e 'NoteLaneModel' -e 'AnswerKeysModel' -e 'new SessionController' src scripts --glob '!**/storage/migrations/**' --glob '!**/legacy/**'
```

Expected : aucune ligne. Un reste se supprime dans ce commit ; la sortie (vide) va dans le rapport de la revue de fin.

- [ ] **Step 2: Update the docs.** La liste de noms de l’étape 1 sert de liste de contrôle pour `CLAUDE.md` et la spec, que les agents lisent :
  - **Spec :** décisions D1–D11, écarts acceptés, points mineurs nouveaux. Dans « Reprise » : H6 (tempo dans les niveaux, quand il change pour le geste — question pour l’auteur —, fin de `Progression`, Dexie 11, fusion sous `SessionController`, placement en unité propre), puis le chantier 2 à la version 12.
  - **`CLAUDE.md`**, une à trois phrases par puce, au style des puces :
    - retirer l’ancien chemin des triades, `PlayScreen`, `LEARN_SESSION_MS`, « until H5 », `MetronomePort` et les constructeurs de plan ;
    - ajouter le gabarit du tour (`round`, `compileRound`, `Num`, les registres de dérivations), la présentation en données et ses registres, `PromptStageModel`, la vue `lane`, les triades sur la série, Dexie 10 / sauvegarde 6, `openness.spec.ts`.
- [ ] **Step 3: Verify** `npx prettier --check` sur les fichiers touchés, `npm test && npm run check` → PASS.
- [ ] **Step 4: Commit** `git commit -m "docs: record the round language, the generic lane and the end of the one-answer path"`
