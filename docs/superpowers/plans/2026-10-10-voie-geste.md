# Voie du geste (D) — plan d’implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** quatre exercices de geste (relier, contrainte, zone, jam) joués dans une session « Geste ». Chaque changement d’une grille est un essai, jugé à son attaque, et le tempo de chaque exercice est la courbe de progrès. Les grilles sont des données. La vue est choisie par l’exercice.

**Architecture :**

- **Partie 1 (tâches 1 à 5), le cœur, sans aucun accord** : manches contiguës (passe), réveil à heure audio précise, apprenant `skill`, modèle d’écran. Elle est prouvée par des mécaniques factices, sans changement pour les notes ni pour les triades.
- **Partie 2 (tâches 6 à 12)** : grilles et symboles, mécanique `chord-grid`, exercices et ouverture, sélecteur, présentateur, session, vues, accueil, bilan.

**Tech Stack :** TypeScript, Svelte 5 (runes), Vitest (`server` / `client`), Dexie + `fake-indexeddb`.

**Spec :** `docs/superpowers/specs/2026-10-10-voie-geste-design.md` (à lire avant chaque tâche). Contexte : `2026-10-08-voie-memoire-triades-design.md`, `2026-10-09-retours-voie-memoire-design.md`, `2026-10-07-capteur-accords-design.md`, `2026-10-06-accords-voicings-design.md`.

## Global Constraints

- **Node et dépendances** : Node 22 via `.nvmrc` (`source ~/.nvm/nvm.sh && nvm use` avant `npm`/`npx`) ; `npm ci` une fois avant la tâche 1.
- **Porte de chaque tâche** : `npm test && npm run check`, en lisant la sortie de `check` (0 erreur) ; `npx prettier --check` sur les fichiers texte touchés. Pas d’import `node:` dans les specs (il n’y a pas de `@types/node`).
- **Langues et commits** : code et commentaires en anglais ; textes d’interface en français et en anglais (`defineMessages`). Commits Conventional Commits en minuscules, terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Le cœur ne nomme aucune mécanique** (`SessionController`, `ObservationSpan`, `AttemptRecorder`, `sensors.ts` hors capteurs, `domain/timing/types.ts`). Les specs des notes et des triades passent sans changer leurs attentes ; seules des signatures peuvent bouger, en ajout facultatif.
- **Constantes nommées**, aux valeurs de la spec (section 8), chacune avec un commentaire « To calibrate ».
- **Identifiants** :
  - mécanique `chord-grid` ;
  - exercices `gesture-link`, `gesture-climb`, `gesture-zone`, `gesture-jam` ;
  - genre de session `gesture` ;
  - vue `grid-scroll` ;
  - grilles `iohefy-a`, `blues-f` ;
  - capteur `chord`.
- **Interface** : les écrans suivent `DESIGN.md` (quatre tons, VT323, jetons `--np-*`, aucun texte sous 16 px).

## Review Focus

1. **Passe et capteur** (tâche 4) : à la passe, les attentes sont retirées **avant** que la manche se règle. Une lecture coupée rapporte donc dans la manche qui finit, et la manche suivante ne la reçoit jamais.
2. **Attaque près d’un changement** (tâches 3 et 4) : à 100 ms avant, elle compte pour le changement (`early`) ; à 300 ms avant à 80 bpm, elle reste dans la manche précédente ; à 160 bpm, la tolérance tombe à 150 ms.
3. **Aucune régression** (tâches 2 à 5) : les sessions de notes et de triades donnent les mêmes consignes, verdicts, respirations et mesures comptées qu’avant.
4. **La forme qui sonne** (tâche 9) : ni la forme `previous` ni ses jumelles de mêmes hauteurs ne sont candidates ; en contrainte, la comparaison se fait à la dernière forme entendue du passage, pas à la forme attendue.
5. **Apprenant `skill`** (tâches 3 et 6) : aucune carte écrite ; les essais passent la validation de la sauvegarde.

---

## Partie 1 — le cœur

### Task 1: Le métronome réveille à une heure audio

**Files :**

- Modify : `src/lib/application/ports/MetronomePort.ts`, `src/lib/infrastructure/audio/clock/WebAudioMetronome.ts`, `src/lib/testing/fakes.ts`.
- Test : `WebAudioMetronome.spec.ts` (existante, ou nouvelle à côté), `src/lib/testing/fakes.spec.ts` (nouvelle si besoin).

**Interfaces :**

```ts
interface MetronomePort {
	// …
	/** Calls back once the audio clock reaches `time` (s), at the scheduler's next wake-up: never early, at most its period late. Cancelled by stop() or the returned function. */
	at(time: number, callback: () => void): () => void;
}
```

- **`WebAudioMetronome`** : à chaque `tick`, il déclenche les réveils dont `time <= context.currentTime`, dans l’ordre du temps, après les temps du même tick. `stop()` vide les réveils. Si la tâche de fond n’a plus de temps à émettre, elle se réarme quand même, tant qu’un réveil attend et que le métronome tourne.
- **`FakeMetronome.flush()`** : il émet, dans l’ordre de leur heure de déclenchement, les temps (déclenchés à `beatTime − lookahead`) et les réveils dus (déclenchés à `time ≤ clock.now()`). Un réveil peut arrêter ou relancer le métronome : la boucle le supporte, comme pour les temps.

- [ ] **Step 1 : écrire les tests qui échouent.**
  - Un réveil n’est jamais appelé avant son heure, et l’est au premier tick qui la passe.
  - L’annulation fonctionne.
  - `stop()` annule.
  - Dans `flush()`, un temps à 1,0 s (lookahead 0,1) passe avant un réveil à 0,95 s, et un réveil à 0,85 s passe avant lui.
- [ ] **Step 2 : lancer les specs.** Elles échouent (FAIL).
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : lancer `npm test && npm run check`.** Tout passe (PASS).
- [ ] **Step 5 : commit** `feat: wake the session at an exact audio time`.

### Task 2: L’apprenant `skill` et l’item passé au rapport au temps

**Files :**

- Modify : `src/lib/domain/mechanics/types.ts`, `src/lib/domain/timing/types.ts`, `beat.ts`, `anchor.ts`, `free.ts` (selon leur signature), `src/lib/application/session/SessionController.svelte.ts`.
- Test : `src/lib/application/session/skillLearner.spec.ts` (nouvelle).

**Interfaces :**

```ts
// MechanicRules
learner: 'memory' | 'skill';
// TimingRelation.open
open(input: { planned: { leadBeats: LeadBeats | null; item: unknown }; promptBeat: number; now: number;
  beatTime: (index: number) => number; secondsPerBeat: number; chained: boolean }): Round;
```

- Le contrôleur passe `planned: item` (le `PlannedItem` entier) et `chained: false` partout aujourd’hui.
- Les relations existantes ignorent `item` et `chained`.

- [ ] **Step 1 : écrire les tests qui échouent.** Une mécanique factice `learner: 'skill'`, jouée par le contrôleur, enregistre ses essais, avec leurs observations, et aucune carte (`FakeCardStateRepository` vide), quelle que soit sa phase (`learning`, `review`).
- [ ] **Step 2 : lancer les specs.** Elles échouent (FAIL).
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : lancer `npm test && npm run check`.** Tout passe (PASS).
- [ ] **Step 5 : commit** `feat: let a mechanic learn a skill without cards`.

### Task 3: Le rapport au temps d’un changement de grille

**Files :**

- Create : `src/lib/domain/timing/gridChange.ts`.
- Modify : `src/lib/domain/timing/types.ts` (`Round.handover?`), `index.ts`.
- Test : `src/lib/domain/timing/gridChange.spec.ts`.

**Interfaces :**

```ts
export const GRID_EARLY_MS = 200; // To calibrate.
export const GRID_EARLY_MAX_BEATS = 0.4; // To calibrate.
/** What the relation reads of a change item: its length in beats. */
export interface GridChangeTiming { lengthBeats: number }
/** Reads the item's timing; the mechanic gives it (the relation knows no grid). */
export function createGridTiming(timingOf: (item: unknown) => GridChangeTiming): TimingRelation;
// Round gains:
readonly handover?: { beat: number; time: number };
```

- **Ouverture** :
  - `chained` vrai : le changement est à `promptBeat` (fractionnaire) ;
  - sinon, il est à `promptBeat + 1`, et `promptBeat(earliest) = alignedPromptBeat(earliest, 1)`.
- **Fenêtres** (spec, section 4) :
  - `early = min(GRID_EARLY_MS, GRID_EARLY_MAX_BEATS × secondsPerBeat × 1000)` ;
  - écoute à partir de `change − early` ;
  - fenêtre juste jusqu’à `change + LATE_LIMIT_MS`, bornée par la passe ;
  - passe : `{ beat: change + lengthBeats, time: beatTime(change + lengthBeats) − early }`.
- **Réponse et réglage** : la première attaque est la réponse, et sa lecture se précise comme dans `BeatRound` (`pending`). Un raté est provisoire à la fermeture de la fenêtre. `abandon()` règle sur la lecture en attente ou sur l’absence de réponse.
- **`after()`** : `{ advanceAt: Infinity, earliestPrompt: Math.ceil(handover.beat) }` une fois réglée.
- **Le reste de la relation** :
  - `laneBeat` est le temps du changement ;
  - `isDirectRecall` vaut false ;
  - `previewBeats` vaut 0 ;
  - `initialLead`, `learnedLead` et `adjustLead` rendent `SHORTEST_LEAD` ;
  - `usesTempo` vaut true.

- [ ] **Step 1 : écrire les tests qui échouent.** À 80 bpm, changement au temps 4, durée 2 :
  - une attaque juste à −100 ms donne `early` ;
  - à −60 ms, `perfect` ;
  - à +300 ms, `late` ;
  - à +600 ms, `offbeat` ;
  - fausse à +600 ms, `wrong` ;
  - à −300 ms, `before-window` ;
  - après la passe, `after-capture` ;
  - sans réponse, un provisoire à la fermeture, puis `abandon` donne `wrong` ;
  - une lecture `final: false` fausse puis juste au même instant donne la juste ;
  - la passe vaut `{ beat: 6, time: beatTime(6) − 0,2 }` à 80 bpm, et `− 0,15` à 160 bpm ;
  - non chaînée, l’ouverture au temps 7 met le changement au temps 8 ;
  - chaînée au temps 6,5 (croche), le changement est à 6,5 ; à 6 + 2/3 (triolet), il est à `toBeCloseTo`.
- [ ] **Step 2 : lancer les specs.** Elles échouent (FAIL).
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : lancer `npm test && npm run check`.** Tout passe (PASS).
- [ ] **Step 5 : commit** `feat: judge a chord change at its attack, rounds handing over without a gap`.

### Task 4: La passe dans le contrôleur

**Files :**

- Modify : `src/lib/application/session/SessionController.svelte.ts`.
- Test : `src/lib/application/session/chainedRounds.spec.ts` (nouvelle, sur le modèle de `thirdMechanic.spec.ts`).

**Comportement** (spec, section 4) :

- À l’ouverture d’une manche qui a `handover`, le contrôleur programme `metronome.at(handover.time, …)`.
- Une manche qui a une passe n’avance jamais par `after().advanceAt`.
- Au réveil, dans l’ordre :
  1. `expectAll({})` ;
  2. `abandonRound()` ;
  3. consigne suivante. Sans consigne, `finish()`. Avec une consigne chaînable (pas de `countIn`, même tempo d’exécution, même scène), `beginNextItem` au temps `handover.beat`, `chained: true`. Sinon, la consigne attend comme dans `advanceAfterVerdict`, à partir de `Math.ceil(handover.beat)`, avec mesure comptée, changement de tempo et de scène.
- `pause`, `quit` et `finish` annulent le réveil. Une reprise en milieu de passage rouvre la manche non chaînée, après la mesure comptée.
- Factoriser `advanceAfterVerdict` pour qu’il serve aux deux chemins, sans changer l’ancien.

- [ ] **Step 1 : écrire les tests qui échouent.** Une mécanique factice « grille » (règles avec `createGridTiming`, capteur factice `fake-chord` dont les observations portent `decided`) et un sélecteur-liste de 3 changements de 2 temps, puis un 4e avec `countIn` à un autre tempo :
  - les 3 manches s’ouvrent aux passes, sans temps vide ;
  - une observation à −100 ms d’un changement est la réponse de ce changement (`early`) ;
  - une à −300 ms est rangée dans la manche précédente (`settled` ou réponse si elle n’en avait pas) ;
  - l’attente posée sur le capteur factice change à la passe, et le capteur reçoit `null` avant l’abandon : une lecture rapportée pendant ce `null` atterrit dans la manche qui finit ;
  - un changement sans réponse est enregistré `wrong` à la passe ;
  - la pause pendant la 2e manche annule la passe, et la reprise ouvre le 3e changement après une mesure comptée ;
  - le 4e redémarre le métronome au nouveau tempo après une mesure comptée ;
  - `thirdMechanic.spec.ts` et toutes les specs de session existantes passent sans changement.
- [ ] **Step 2 : lancer les specs.** Elles échouent (FAIL).
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : lancer `npm test && npm run check`.** Tout passe (PASS).
- [ ] **Step 5 : commit** `feat: hand a round over to the next one without a gap`.

### Task 5: Le modèle d’écran et la vue choisie par l’exercice

**Files :**

- Modify : `src/lib/application/mechanics/types.ts`, `src/lib/application/session/contract.ts`, `SessionController.svelte.ts`, `src/lib/domain/exercise/types.ts`, `src/lib/ui/play/demo/DemoPlaySession.svelte.ts` et les autres implémentations de `PlayView` (ajouter `stage: null`).
- Test : `src/lib/application/session/stage.spec.ts` (nouvelle).

**Interfaces :**

```ts
// ExerciseDefinition
view?: string;
// MechanicPresenter
stage?(item: I, settled: { answer: unknown; verdict: Verdict } | null, locale: Locale): { model: unknown };
// PlayView
stage: { view: string; model: unknown } | null;
export const DEFAULT_PLAY_VIEW = 'grid-scroll';
```

- **Le contrôleur pose `view.stage`** (`exercise.view ?? DEFAULT_PLAY_VIEW`) :
  - pour la consigne en attente, dès qu’elle est choisie avant une mesure comptée ;
  - à l’ouverture de la manche (`settled: null`) ;
  - au réglage, avec la réponse de la manche ;
  - à null pour une mécanique sans `stage`, et à la fin.

- [ ] **Step 1 : écrire les tests qui échouent.**
  - Une mécanique factice avec `stage` sur un exercice `view: 'fake-view'` donne `view.stage.view === 'fake-view'` pendant le décompte, puis un modèle qui change au réglage.
  - Sans `view`, c’est `'grid-scroll'`.
  - Les mécaniques de notes ont `stage: null`.
- [ ] **Step 2 : lancer les specs.** Elles échouent (FAIL).
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : lancer `npm test && npm run check`.** Tout passe (PASS).
- [ ] **Step 5 : commit** `feat: let a mechanic give the screen model its exercise's view reads`.

---

## Partie 2 — le geste

### Task 6: Grilles, symboles et qualités de septième

**Files :**

- Create : `src/lib/domain/grid/{symbols.ts,grid.ts,catalog.ts,index.ts}` et leurs specs.
- Modify : `src/lib/domain/music/chord.ts` (+ spec).

**Interfaces :** celles de la spec, section 2 (`GridChord`, `ChordGrid`, `GridChange`, `gridChanges`, `parseChordSymbol`, `SUFFIXES`, `TRIAD_OF_QUALITY`, `triadOf`, `GRIDS`, `gridById`).

- [ ] **Step 1 : écrire les tests qui échouent.**
  - **Symboles** : `Dm7`, `D-7`, `G7`, `Cmaj7`, `CΔ7`, `F7`, `Em7`, `Ebm7`, `Ab7`, `Dø7`, `E7#5`, `A7b9` (extensions `['b9']`), `Bb7#11`, `C6` et `G7/F` (basse F) se lisent ; `H7`, `Dm7#` et `Gsus` lèvent une `RangeError` qui cite le symbole.
  - **`triadOf`** : Dm7 donne D min ; G7/F donne G maj ; Dø7 donne D dim ; E7#5 donne E aug ; Ebm7 s’écrit Eb (et non D#) ; Gsus4 lève une erreur.
  - **`gridChanges(iohefy-a)`** : 8 changements, Cmaj7 à 16 pour 6 temps, F7 à 22 pour 2 temps, Ab7 à 30 pour 2 temps.
  - **`gridChanges(blues-f)`** : 8 changements après fusion.
  - **Validation** : un premier accord ailleurs qu’en 1.1, des positions non croissantes, un temps hors de la mesure, un symbole inconnu.
  - **Qualités** : les nouvelles lignes donnent les bonnes notes (Cmaj7 : C E G B ; Dm7b5 : D F Ab C) ; `closeTriadVoicings` refuse `m7`.
- [ ] **Step 2 : lancer les specs.** Elles échouent (FAIL).
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : lancer `npm test && npm run check`.** Tout passe (PASS). Le test « holds the four triad qualities » devient « holds the triad and seventh qualities » ; c’est le seul changement d’attente permis.
- [ ] **Step 5 : commit** `feat: read chord grids and symbols as data, with seventh qualities`.

### Task 7: La mécanique `chord-grid`

**Files :**

- Create : `src/lib/domain/mechanics/chordGrid.ts` (+ spec).
- Modify : `src/lib/domain/mechanics/index.ts`, `src/lib/infrastructure/storage/validateBackup.spec.ts` (aller-retour).

**Interfaces :** `GestureRule`, `ChordGridItem`, `ChordGridConfusion`, `ChordGridData`, et `chordGridRules: MechanicRules` (`learner: 'skill'`, `timing: createGridTiming((item) => ({ lengthBeats: item.changes[item.index].length }))`). Les helpers purs de la spec, section 3, sont exportés : `admits(item, occurrence)`, `admittedShapes(item)` (formes admises sur les groupes, pour candidats et aides) et `shapePosition(occurrence)` (position numérique, vide = 0).

- [ ] **Step 1 : écrire les tests qui échouent.** Pour le juge :
  - relier D sur sol‑si‑mi : 7‑7‑5 attendu ; 7‑7‑5 donne juste ; 2‑3‑2 donne `other-shape` ;
  - Dm donne `other-quality` ; G donne `other-chord` ; une forme sur ré‑sol‑si donne `other-set` ; rien donne `none` ;
  - contrainte en montée : previous 7‑7‑5, une forme en position 5 donne `not-higher`, en 10 juste ; previous null, tout est juste sur le groupe ; en descente, `not-lower` ;
  - zone 5 à 8, accord D : 7‑7‑7 sur ré‑sol‑si est juste, 7‑7‑5 sur sol‑si‑mi aussi, 11‑10‑10 donne `out-of-zone` ;
  - jam : toute forme du bon accord sur l’un des deux groupes est juste.

  Pour la clé et la sauvegarde : `itemKey` vaut `link:D|maj:3,2,1#2`, `parseItem` fait l’aller-retour, et une sauvegarde contenant un essai `chord-grid` s’exporte puis s’importe.

- [ ] **Step 2 : lancer les specs.** Elles échouent (FAIL).
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : lancer `npm test && npm run check`.** Tout passe (PASS).
- [ ] **Step 5 : commit** `feat: judge a chord change by its exercise's rule`.

### Task 8: Exercices, passages, zones et ouverture

**Files :**

- Create : `src/lib/domain/gesture/{exercises.ts,passages.ts,opening.ts,index.ts}` (+ specs).
- Modify : `src/lib/domain/exercise/catalog.ts` (les 4 définitions dans `EXERCISES`).

**Interfaces :**

```ts
const GESTURE_LINK, GESTURE_CLIMB, GESTURE_ZONE, GESTURE_JAM: ExerciseDefinition;
// params : { rule, stringSets: [[3,2,1],[4,3,2]], qualities: ['maj','min'], grids?: ['iohefy-a','blues-f'] }, view: 'grid-scroll'
interface GestureElement {
	exerciseId;
	rule: GestureRule;
	key: string;
	chord?: string;
	gridId?: string;
	sets: StringNumber[][];
}
function gestureElements(definition: ExerciseDefinition): GestureElement[]; // ordre du contenu
function linkShapes(chord: Chord, set: StringNumber[]): VoicingOccurrence[]; // LINK_SHAPES, montée puis descente
function nextZone(
	grid: ChordGrid,
	sets,
	last: { from: number } | null
): { from: number; to: number };
function openElements(definition, cards: readonly CardState[]): GestureElement[];
function passageSucceeded(attempts: readonly Attempt[]): boolean; // PASSAGE_SUCCESS
const LINK_SHAPES = 4,
	ZONE_FRETS = 4,
	ZONE_STEP_FRETS = 3,
	PASSAGE_SUCCESS = 0.9;
```

- [ ] **Step 1 : écrire les tests qui échouent.**
  - `linkShapes(D, sol‑si‑mi)` donne 2‑3‑2, 7‑7‑5, 11‑10‑10, 14‑15‑14, 11‑10‑10, 7‑7‑5, 2‑3‑2 ; Ab est calculé aussi ; un accord sans octave dans la plage s’arrête à 3 en montée.
  - `nextZone(iohefy-a)` : de null à `from` 1, puis 4, 7… ; une zone où un accord n’a aucune forme est sautée ; le retour en bas se fait après `MAX_VOICING_FRET`.
  - Ouverture : relier D sur sol‑si‑mi s’ouvre avec ses 3 cartes d’ancrage acquises et reste fermé avec 2 ; la contrainte `iohefy-a` sur un groupe, la zone avec les cartes zone sur les deux groupes, et le jam avec un seul groupe suivent leurs règles.
  - `passageSucceeded` : 9 sur 10 réussi ; 8 sur 10 non ; `offbeat` compte comme raté.
- [ ] **Step 2 : lancer les specs.** Elles échouent (FAIL).
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : lancer `npm test && npm run check`.** Tout passe (PASS).
- [ ] **Step 5 : commit** `feat: define the four gesture exercises and when each opens`.

### Task 9: Le sélecteur de la session Geste

**Files :**

- Create : `src/lib/domain/progress/gestureSelector.ts` (+ spec).
- Modify : `src/lib/domain/progress/index.ts`.

**Interfaces :**

```ts
function createGestureSelector(input: {
	definitions: readonly ExerciseDefinition[]; // les 4, dans l'ordre de l'échelle
	cards: readonly CardState[];
	attempts: readonly Attempt[];
	sessionId: string;
}): SessionSelector;
const GESTURE_SESSION_MS = 300_000;
```

- **Tours** : un passage par exercice ouvert à chaque tour, dans l’ordre de l’échelle. L’élément choisi est le moins récemment joué (dernier `promptedAt` de ses essais, historique et séance ; jamais joué passe d’abord ; à égalité, l’ordre du contenu).
- **Un passage** : un `PlannedItem` par changement, `phase: 'free'`, `temperature: 'hot'` et `leadBeats: null`. Le premier a `countIn: true`. `aid` vaut `'show-position'` quand le dernier passage de l’élément n’est pas réussi ou n’existe pas.
- **Les champs de chaque item** : `passageId` vaut `${sessionId}:${n}`. `direction` est l’inverse de celle du dernier passage de l’élément (d’abord `up`). `zone` vient de `nextZone`. `previous` est la forme `decided` de la dernière réponse du passage (`record()`), null au début.
- **Fin** : `next()` rend null entre deux passages quand `elapsedMs ≥ GESTURE_SESSION_MS` ou `fatigued`, ou quand rien n’est ouvert. Il ne coupe jamais un passage commencé.

- [ ] **Step 1 : écrire les tests qui échouent.**
  - L’ordre est relier, contrainte, zone, jam, puis on recommence.
  - Deux éléments relier ouverts (D sur sol‑si‑mi, D sur ré‑sol‑si) alternent.
  - Le sens de la contrainte alterne d’un passage au suivant, y compris d’une session à l’autre par l’historique.
  - `countIn` est seulement au premier changement.
  - `previous` suit `record()`.
  - L’aide part après un passage réussi et revient après un échec.
  - Pas de nouveau passage après 5 min, mais le passage en cours finit.
  - Rien d’ouvert donne null.
- [ ] **Step 2 : lancer les specs.** Elles échouent (FAIL).
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : lancer `npm test && npm run check`.** Tout passe (PASS).
- [ ] **Step 5 : commit** `feat: chain the open gesture exercises in a gesture session`.

### Task 10: Le présentateur et le câblage

**Files :**

- Create : `src/lib/application/mechanics/chordGrid.ts`, `chordGridMessages.ts` (+ spec).
- Modify : `src/lib/application/mechanics/index.ts`, `src/lib/composition/createApp.ts`.

**Comportement** (spec, sections 3 et 6) :

- **Interface du présentateur** :
  - capteurs `['chord']`, scène `guitar`, `contestable: true` ;
  - `prompt` : symbole en `primary`, repère en `secondary` ;
  - `answerLabel` : les cases entendues ;
  - `reveal` : null ;
  - `feedback` : la forme entendue, la forme admise la plus proche, l’écart (`gap` traduit pour chaque confusion).
- **`expectation`** : les attendues (`admittedShapes`), plus les voisines (spec), sans `previous` ni les formes de mêmes hauteurs que lui. Les ids sont des `occurrenceId`.
- **`stage`** : le modèle de la spec (section 6). La flèche, le groupe (« sol‑si‑mi ») et le renversement (« fondamentale sur si ») viennent des messages des triades. L’aide est la forme du **changement suivant** (relier : sa forme ; contrainte : la plus proche admise au-dessus ou au-dessous de la forme entendue au réglage, sinon de `previous` ; zone : la plus basse dans la zone ; jam : null), seulement quand `aid === 'show-position'`. Au dernier changement, il n’y a pas d’aide.

- [ ] **Step 1 : écrire les tests qui échouent.**
  - Candidats de relier, de contrainte (avec `previous`), de zone et de jam : attendues justes, aucune occurrence de `previous` ni de ses jumelles.
  - Modèle d’écran de chaque règle, et aide de la contrainte recalculée avec la réponse.
  - `feedback` après `not-higher`.
- [ ] **Step 2 : lancer les specs.** Elles échouent (FAIL).
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : lancer `npm test && npm run check`.** Tout passe (PASS).
- [ ] **Step 5 : commit** `feat: show and hear a chord change`.

### Task 11: Session Geste, accueil et bilan

**Files :**

- Modify : `src/lib/domain/types.ts` (`SessionKind` + `'gesture'`, `SessionSummary.gesture?`), `src/lib/domain/progress/stats.ts` (résumé du geste), `src/lib/application/app.ts`, `src/lib/application/services/createAppServices.ts`, `src/lib/application/session/sessionKindFromQuery.ts`, `src/lib/application/ports/repositories.ts` (si `setContested` n’est pas exposé), `src/lib/ui/screens/home/*`, `src/lib/ui/screens/summary/*`, `src/routes/+page.svelte`, `src/routes/summary/+page.svelte`.
- Test : les specs voisines (`createAppServices.spec.ts`, `stats.spec.ts`, `HomeScreen.svelte.spec.ts`, `SummaryScreen.svelte.spec.ts`).

**Interfaces :**

```ts
interface GestureSummary {
	exercises: { exerciseId: string; passagesPlayed: number; passagesSucceeded: number;
		changeSuccessRate: number; tempoBpm: number; nextTempoBpm: number }[];
	misses: { attemptId: number; exerciseId: string; symbol: string; heard: string | null;
		expected: string | null; contested: boolean }[];
}
// AppServices
gesture(): Promise<{ open: boolean }>;
contest(attemptId: number): Promise<void>;
```

- **`startSession('gesture')`** : une exécution par exercice ouvert (`startTempo`), puis `createGestureSelector`.
- **`sessionSummary`** d’une session `gesture` : il remplit `gesture`, et `nextTempoBpm = nextTempo(tempo, essais de l’exercice)`. Le reste du résumé n’est pas affiché pour ce genre. Les sessions des autres genres ne changent pas.
- **Accueil** : le bouton « Geste » mène à `/session?kind=gesture`, visible quand `gesture().open`.
- **Bilan** : une ligne par exercice, puis les ratés avec « Joué juste », qui appelle `contest` et passe à « Contesté ».

- [ ] **Step 1 : écrire les tests qui échouent.**
  - Le service ouvre la session `gesture` avec les exécutions des exercices ouverts.
  - `gesture().open` est faux sans cartes et vrai avec D acquis sur sol‑si‑mi en ancrage.
  - Le résumé compte les passages et la part juste, et liste les ratés.
  - `contest` étiquette l’essai.
  - Le bouton de l’accueil apparaît.
  - Le bilan rend la section du geste.
  - `sessionKindFromQuery('gesture')`.
- [ ] **Step 2 : lancer les specs.** Elles échouent (FAIL).
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : lancer `npm test && npm run check`.** Tout passe (PASS).
- [ ] **Step 5 : commit** `feat: open a gesture session from home and sum it up by exercise`.

### Task 12: Le cadre, la grille défilante et le bout en bout

**Files :**

- Create : `src/lib/ui/play/PlayFrame.svelte`, `src/lib/ui/play/views/{index.ts,GridScrollView.svelte,gridScroll.ts}`, `src/routes/dev/gesture/+page.svelte` (contrôleur de démo scripté, comme `DemoPlaySession`).
- Modify : `src/routes/session/+page.svelte` (`PlayFrame` pour `gesture`), `src/lib/ui/play/messages.ts` (ou des messages propres).
- Test : `PlayFrame.svelte.spec.ts`, `GridScrollView.svelte.spec.ts`, `gridScroll.spec.ts` (placement pur : mesures visibles, accord en cours et suivant d’après `nowBeat`, `targetBeatIndex` et `index`), `src/lib/application/session/gestureEndToEnd.spec.ts`.

**Comportement** : spec, section 6.

- **`PlayFrame`** : démarrer, pause et reprise (Espace), quitter vers le bilan, décompte, « Joué juste » (Entrée), erreur d’entrée audio, fatigue. Elle rend `PLAY_VIEWS[view.stage.view]` avec `{ controller, model }`, ou rien tant que `stage` est null.
- **Deux principes :** la logique de placement vit dans `gridScroll.ts`, qui est pur et testé ; le composant ne fait qu’afficher.

- [ ] **Step 1 : écrire les tests qui échouent.**
  - **Placement** : l’accord en cours et le suivant changent à la bonne mesure ; le suivant est annoncé au moins un temps avant.
  - **Vue** : elle montre le symbole en cours en grand, le suivant, le repère (flèche ↑, « cases 5 à 8 ») et l’aide (`ChordShape`).
  - **Registre** : une vue factice enregistrée et nommée par `view.stage.view` est rendue.
  - **Cadre** : `PlayFrame` met en pause et reprend.
  - **De bout en bout** (`gestureEndToEnd.spec.ts`) : les vrais exercices, sélecteur, règles et présentateur, avec un vérificateur factice qui rapporte la forme qu’on lui dicte, aux heures dictées.
    - Un passage de relier D sur sol‑si‑mi est joué juste : 7 essais, aucune carte, le passage est réussi, et l’aide part au passage suivant.
    - Un passage de contrainte sur `iohefy-a` : une forme trop basse en mesure 3 donne `not-higher`, et la candidate `previous` est exclue.
    - Un passage de jam.
    - À la fin, le tempo suivant de relier est écrit (au moins 10 changements réussis).
- [ ] **Step 2 : lancer les specs.** Elles échouent (FAIL).
- [ ] **Step 3 : implémenter.**
- [ ] **Step 4 : lancer `npm test && npm run check`.** Tout passe (PASS). Puis `npm run dev` : ouvrir `/dev/gesture` et vérifier l’affichage. Lancer `scripts/functional-ui.mjs` s’il couvre la page, ou noter dans le rapport ce qui n’a pas été vu.
- [ ] **Step 5 : mettre à jour la documentation.**
  - `CLAUDE.md` : la voie du geste, la passe, `MetronomePort.at`, l’apprenant `skill`, `PlayView.stage` et le registre, les sessions `gesture`.
  - `docs/plateforme.md` : D fait.
  - `docs/todo.md` : rien n’en sort ; ajouter « `PlayFrame` pour les notes et les triades » à l’entrée « Une vue de jeu par mécanique ».
- [ ] **Step 6 : commit** `feat: play a gesture passage on a scrolling chord grid`.

---

## Fin

Revue finale de toute la branche contre la spec et les Review Focus, en signalant chaque écart ou décision prise en cours (« ruling »). Ne pas fusionner : l’utilisateur décide.
