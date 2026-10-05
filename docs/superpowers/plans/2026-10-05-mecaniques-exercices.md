# Mécanique, exercice et exécution — plan d’implémentation

> **Pour les agents :** sous-skill requis : superpowers:subagent-driven-development (recommandé) ou superpowers:executing-plans, tâche par tâche. Les étapes utilisent des cases (`- [ ]`).

**But :** extraire mécanique, exercice, progression et exécution, avec les modes 1 et 2 comme premières mécaniques, sans nouvelle fonctionnalité.

**Architecture :** d’abord trois extractions qui ne changent pas le modèle de données (rapports au temps et manches, enregistreur, mécaniques et capteurs) : le `SessionController.spec.ts` existant, inchangé, prouve qu’elles préservent le comportement. Ensuite la bascule du modèle (domaine, stockage, application et interface), puis la mécanique factice qui prouve le point d’ajout.

**Stack :** SvelteKit (SPA), Svelte 5 runes, TypeScript, Vitest (projets `server` et `client`), Dexie, ts-fsrs.

**Spec :** `docs/superpowers/specs/2026-10-05-mecaniques-exercices-design.md` (vocabulaire et décisions : `docs/plateforme.md`).

## Contraintes globales

- Travail dans le worktree `.worktrees/plan-exercices`, branche `plan/exercices`, créée depuis `main`.
- Node par nvm : préfixer les commandes de `source ~/.nvm/nvm.sh && nvm use >/dev/null &&` (Node 22.23.3, `engine-strict`).
- Docs, plans et textes d’interface en français ; code, identifiants et commentaires en anglais.
- Svelte 5 runes seulement ; un test qui rend un composant ou utilise des runes s’appelle `*.svelte.spec.ts`. `expect.requireAssertions` : chaque test asserte.
- Domaine pur : rien de Svelte ni du navigateur dans `src/lib/domain/**`, et aucun import depuis `src/lib/application/**`.
- Commits Conventional Commits, minuscules, impératif, orientés comportement, terminés par la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Tous les nombres sont des constantes nommées. Valeurs fixées par la spec : tempo par défaut `DEFAULT_TEMPO_BPM = 80`, bornes 80–160, exercices `locate-neck` et `identify-neck` en version 1, Dexie version 5, sauvegarde version 2.
- Règles audio inchangées : `onBeat` jusqu’à 100 ms avant le temps, index comparés avec `>=`, jamais `===` ; `setTempo` lève en marche.
- Garde de fin de tâche : `npm test && npm run check`, sauf pendant la bascule (tâches 6 et 7), où la garde est celle indiquée dans la tâche ; la tâche 8 rétablit la garde complète.
- `npx prettier --write` sur les fichiers touchés avant chaque commit.

## Points de vigilance

1. **Base ancienne sans tempo** : une session sans `tempoBpm` et des réglages sans `tempoBpm` → les essais locate prennent 80, aucune progression n’est créée. Test en tâche 7.
2. **Essai v1 orphelin** : un essai dont la session n’est pas dans le fichier importé prend le tempo de repli, l’import ne plante pas. Test en tâche 7.
3. **Aller-retour v2** : export puis import conservent progressions et exécutions à l’identique. Test en tâche 7.
4. **Session d’Apprentissage courte** : moins de `TEMPO_MIN_PROMPTS` essais locate → aucune progression écrite, y compris quand il n’en existait pas. Test en tâche 8.
5. **Relance après la fin** : la nouvelle série lit la progression écrite par la série précédente (préparation rappelée à chaque série). Test en tâche 8.

---

### Tâche 1 : exercices et tempo par exercice (domaine)

**Fichiers :**

- Créer : `src/lib/domain/exercise/types.ts`, `catalog.ts`, `tempo.ts`, `index.ts`
- Créer : `src/lib/domain/exercise/catalog.spec.ts`, `tempo.spec.ts`
- Modifier : `src/lib/domain/progress/tempo.ts` (réexporte constantes et `clampTempo` depuis `exercise/tempo.ts`, garde `nextSessionTempo` jusqu’à la tâche 6)

**Interfaces :**

- Produit :
  - `type MechanicId = string; type ExerciseId = string;`
  - `interface ExerciseDefinition { id; version: number; mechanic: MechanicId; params: Readonly<Record<string, unknown>>; startTempoBpm?: number }`
  - `interface Progression { exerciseId: ExerciseId; mechanic: MechanicId; tempoBpm: number; updatedAt: number }`
  - `interface Execution { exerciseId: ExerciseId; tempoBpm: number | null }`
  - `LOCATE_NECK`, `IDENTIFY_NECK`, `EXERCISES: readonly ExerciseDefinition[]`, `exerciseById(id): ExerciseDefinition` (lève sur un id inconnu)
  - `DEFAULT_TEMPO_BPM = 80`, `TEMPO_MIN_BPM`, `TEMPO_MAX_BPM`, `TEMPO_STEP_BPM`, `TEMPO_RAISE_AT`, `TEMPO_LOWER_AT`, `TEMPO_MIN_PROMPTS`, `clampTempo` (déplacés tels quels)
  - `startTempo(definition: ExerciseDefinition, progressions: readonly Progression[]): number`
  - `nextTempo(tempoBpm: number, attempts: readonly Pick<Attempt, 'phase' | 'correct' | 'verdict'>[]): number` — mêmes règles que `nextSessionTempo`, sans filtre de mode : l’appelant passe les essais d’un exercice.

- [ ] **Étape 0 : worktree.** `git worktree add .worktrees/plan-exercices -b plan/exercices main`, `npm ci`, puis `npm test && npm run check` : tout passe (état de départ).
- [ ] **Étape 1 : tests rouges.**

```ts
// catalog.spec.ts
expect(LOCATE_NECK).toEqual({ id: 'locate-neck', version: 1, mechanic: 'locate', params: {} });
expect(IDENTIFY_NECK).toEqual({
	id: 'identify-neck',
	version: 1,
	mechanic: 'identify',
	params: {}
});
expect(exerciseById('identify-neck')).toBe(IDENTIFY_NECK);
expect(() => exerciseById('nope')).toThrow(/nope/);
// a definition holds data only
expect(JSON.parse(JSON.stringify(EXERCISES))).toEqual(EXERCISES);

// tempo.spec.ts — startTempo, the four steps of decision 3
const p = (exerciseId: string, mechanic: string, tempoBpm: number, updatedAt: number) => ({
	exerciseId,
	mechanic,
	tempoBpm,
	updatedAt
});
expect(startTempo(LOCATE_NECK, [p('locate-neck', 'locate', 100, 1)])).toBe(100);
expect(startTempo({ ...LOCATE_NECK, startTempoBpm: 120 }, [])).toBe(120);
expect(
	startTempo({ ...LOCATE_NECK, startTempoBpm: 120 }, [p('locate-neck', 'locate', 100, 1)])
).toBe(100);
expect(
	startTempo({ ...LOCATE_NECK, id: 'locate-g' }, [
		p('locate-neck', 'locate', 90, 1),
		p('locate-b', 'locate', 110, 2),
		p('identify-neck', 'identify', 150, 3)
	])
).toBe(110);
expect(startTempo(LOCATE_NECK, [])).toBe(DEFAULT_TEMPO_BPM);
expect(startTempo(LOCATE_NECK, [p('locate-neck', 'locate', 60, 1)])).toBe(80);
expect(startTempo({ ...LOCATE_NECK, startTempoBpm: 300 }, [])).toBe(160);
// nextTempo: the cases of the current tempo.spec.ts for nextSessionTempo, on attempts without a mode filter
```

- [ ] **Étape 2 :** `npx vitest run src/lib/domain/exercise` → FAIL (modules absents).
- [ ] **Étape 3 : implémenter.** Déplacer les constantes et `clampTempo` de `progress/tempo.ts` vers `exercise/tempo.ts` ; `progress/tempo.ts` les réexporte et `nextSessionTempo` délègue à `nextTempo` après son filtre locate. `startTempo` borne toujours par `clampTempo`.
- [ ] **Étape 4 :** `npx vitest run src/lib/domain` → PASS ; `npm test && npm run check` → PASS.
- [ ] **Étape 5 : commit** `feat: describe exercises and pick their starting tempo`.

---

### Tâche 2 : rapports au temps et manches (domaine)

**Fichiers :**

- Créer : `src/lib/domain/timing/types.ts`, `beat.ts`, `free.ts`, `index.ts`, `beat.spec.ts`, `free.spec.ts`
- Déplacer : `src/lib/application/session/grid.ts` et `grid.spec.ts` → `src/lib/domain/timing/grid.ts`, `grid.spec.ts` (mettre à jour les imports du contrôleur)
- Modifier : `src/lib/domain/scoring/timing.ts` (exporter `timingVerdict`)

**Interfaces :**

- Consomme : `answerWindow`, `isInWindow`, `lateCaptureEnd`, `timingVerdict`, `secondsToMs` (`domain/scoring`) ; `alignedPromptBeat`, `respirationStart`, `STRING_PREVIEW_BEATS`, `BEATS_PER_BAR` (`timing/grid.ts`) ; `LEAD_STEPS`, `SHORTEST_LEAD`, `RECALL_THRESHOLD_MS`, `IDENTIFY_RECALL_THRESHOLD_MS` (`domain/types`).
- Produit (`timing/types.ts`), qui précise la spec : `open` reçoit `now` et la relation choisit l’heure de la consigne ; `after()` remplace `nextPromptEarliest()` pour porter aussi le temps où le contrôleur choisit la consigne suivante.

```ts
type IgnoreReason = 'settled' | 'before-window' | 'after-capture';
interface RoundOutcome {
	verdict: Verdict;
	correct: boolean;
	answer: unknown | null;
	timingOffsetMs: number | null;
	reactionMs: number | null;
	laneBeat: number | null;
}
type RoundEvent =
	| { kind: 'none' }
	| { kind: 'ignored'; reason: IgnoreReason }
	| { kind: 'provisional'; outcome: RoundOutcome }
	| { kind: 'settled'; outcome: RoundOutcome };
interface Round {
	readonly promptBeatIndex: number;
	readonly targetBeatIndex: number | null;
	/** Audio seconds. */ readonly promptTime: number;
	observe(observation: { time: number; correct: boolean; answer: unknown }): RoundEvent;
	onBeat(beat: { index: number; time: number }): RoundEvent;
	abandon(): RoundOutcome | null;
	/** Null until settled. advanceAt: first beat on which the next prompt is chosen; earliestPrompt: first beat it may show. */
	after(): { advanceAt: number; earliestPrompt: number } | null;
}
interface TimingRelation {
	id: string;
	usesTempo: boolean;
	previewBeats: number;
	promptBeat(earliest: number, planned: { leadBeats: LeadBeats | null }): number;
	open(input: {
		planned: { leadBeats: LeadBeats | null };
		promptBeat: number;
		now: number;
		beatTime: (index: number) => number;
		secondsPerBeat: number;
	}): Round;
	isDirectRecall(attempt: {
		correct: boolean;
		verdict: Verdict;
		reactionMs: number | null;
		leadBeats: RecordedLeadBeats | null;
		tempoBpm: number | null;
	}): boolean;
	initialLead: LeadBeats;
	learnedLead(tempoBpm: number | null): LeadBeats;
	adjustLead(current: LeadBeats, success: boolean): LeadBeats;
}
```

- `beatTiming: TimingRelation` (`id 'beat'`, `usesTempo true`, `previewBeats STRING_PREVIEW_BEATS`, `initialLead 8`).
- `createFreeTiming({ recallThresholdMs }): TimingRelation` et `identifyTiming = createFreeTiming({ recallThresholdMs: IDENTIFY_RECALL_THRESHOLD_MS })` (`id 'free'`, `usesTempo false`, `previewBeats 0`, `initialLead SHORTEST_LEAD`).

Manche `beat` : heure de consigne `beatTime(promptBeat)`, cible `promptBeat + leadBeats`, fenêtre `answerWindow`, fin d’écoute `lateCaptureEnd(beatTime(target), beatTime(respirationStart(target) − STRING_PREVIEW_BEATS))`. États : à l’écoute → (note dans la fenêtre, ou après elle jusqu’à la fin d’écoute) réglée ; à l’écoute → (temps reçu dont `time ≥ closesAt`) écoute hors temps, événement `provisional` sans réponse ; écoute hors temps → note avant la fin d’écoute : `settled` (`offbeat` si juste, sinon `wrong`) ; temps reçu dont `time ≥ fin d’écoute` : `settled` sans réponse. `after()` : `advanceAt` = cible + 1 si la note est arrivée avant la fermeture, sinon index du temps de fermeture + 1 ; `earliestPrompt = respirationStart(target)`.

Manche `free` : heure de consigne `now`, pas de cible ; temps de réaction `secondsToMs(time − promptTime)`, négatif → ignoré ; juste et ≤ seuil `perfect`, juste au-delà `late`, faux `wrong` ; `after()` : temps de la réponse `b = floor((time − beatTime(0)) / secondsPerBeat)`, `{ advanceAt: b + 1, earliestPrompt: b + 1 }` ; `abandon()` → null.

- [ ] **Étape 1 : tests rouges `beat.spec.ts`.** Horloge à 80 bpm : `beatTime = (i) => 0.1 + i * 0.75`, `secondsPerBeat = 0.75`.

```ts
expect(beatTiming.promptBeat(4, { leadBeats: 2 })).toBe(6);
expect(beatTiming.promptBeat(4, { leadBeats: 4 })).toBe(4);
expect(beatTiming.promptBeat(5, { leadBeats: 4 })).toBe(8);
const round = () => beatTiming.open({ planned: { leadBeats: 4 }, promptBeat: 4, now: 0, beatTime, secondsPerBeat: 0.75 });
// prompt 3.1 s, target beat 8 at 6.1 s, window 3.4 → 6.5
expect(round()).toMatchObject({ promptBeatIndex: 4, targetBeatIndex: 8, promptTime: 3.1 });
it('settles the first note in the window and ignores the next', ...)
  // observe({ time: 6.13, correct: true, answer: 'a' }) → { kind: 'settled', outcome: { verdict: 'perfect', correct: true, answer: 'a', timingOffsetMs: 30, reactionMs: 3030, laneBeat: 8 } }
  // second observe → { kind: 'ignored', reason: 'settled' }; after() → { advanceAt: 9, earliestPrompt: 12 }
it('judges early and late past PERFECT_WINDOW_MS', ...)       // 6.0 → 'early' (−100) ; 6.2 → 'late' (+100)
it('keeps a wrong note wrong, with its offset', ...)           // 6.13, correct false → 'wrong', timingOffsetMs 30
it('ignores a note before the prompt or in its first 300 ms', ...) // 3.2 → ignored 'before-window'
it('opens the late capture when the window closes unanswered', ...)
  // onBeat({ index: 9, time: 6.85 }) → provisional { verdict: 'wrong', answer: null, laneBeat: 8 } ; after() → null
  // observe 7.0 correct → settled 'offbeat', correct true ; after() → { advanceAt: 10, earliestPrompt: 12 }
it('ends the capture at the next prompt string preview', ...)
  // capture end = min(6.1 + 2.4, beatTime(11) = 8.35) = 8.35 ; observe 8.4 → ignored 'after-capture'
  // onBeat({ index: 11, time: 8.35 }) → settled, verdict 'wrong', answer null
it('ends the capture before the next prompt at 160 bpm', ...)  // beatTime 0.1 + i*0.375 : capture end = beatTime(11)
it('settles an open capture as unanswered on abandon, and nothing while listening', ...)
it('calls direct recall from the lead at the attempt tempo', ...)
  // { correct: true, verdict: 'perfect', leadBeats: 2, tempoBpm: 80, reactionMs: 1600 } → true
  // leadBeats 4 → false ; verdict 'offbeat' → false ; tempoBpm null → false ; tempoBpm 160, leadBeats 4 → true
it('climbs the lead ladder', ...)
  // learnedLead(80) 2, learnedLead(160) 4 ; adjustLead(4, true) 2, (2, true) 2, (2, false) 4, (8, false) 8
```

- [ ] **Étape 2 : tests rouges `free.spec.ts`.** `identifyTiming.promptBeat(5, { leadBeats: null })` = 5 ; `open({ …, promptBeat: 5, now: 10 })` : `promptTime` 10, `targetBeatIndex` null ; observe 11.2 juste → `perfect`, `reactionMs` 1200, `timingOffsetMs` null, `laneBeat` null ; `after()` → `{ advanceAt: 15, earliestPrompt: 15 }` ; observe 14 juste → `late` (4000) ; faux → `wrong` ; 9.9 → ignoré `before-window` ; `onBeat` → `{ kind: 'none' }` ; `abandon()` → null ; `isDirectRecall` vrai à 3000 ms, faux à 3001 ; `learnedLead(80)` et `adjustLead(8, false)` → 2.
- [ ] **Étape 3 :** `npx vitest run src/lib/domain/timing` → FAIL.
- [ ] **Étape 4 : implémenter** `beat.ts` et `free.ts` (une classe de manche par fichier, non exportée ; la relation est un objet).
- [ ] **Étape 5 :** `npx vitest run src/lib/domain/timing src/lib/application/session` → PASS ; `npm test && npm run check` → PASS.
- [ ] **Étape 6 : commit** `refactor: judge timing in rounds owned by a time relation`.

---

### Tâche 3 : le contrôleur joue par manches

Extraction sans changement de comportement : `SessionController.spec.ts` ne change pas et doit passer.

**Fichiers :**

- Modifier : `src/lib/application/session/SessionController.svelte.ts`

**Interfaces :**

- Consomme : `beatTiming`, `identifyTiming`, `Round`, `RoundEvent` (tâche 2).
- Produit : rien de public. Choix provisoire `timingFor(item) = item.target.direction === 'locate' ? beatTiming : identifyTiming`, remplacé en tâche 5.

- [ ] **Étape 1 : remplacer l’état de manche du contrôleur** (`promptBeatIndex`, `targetBeatIndex`, `promptTimeAudio`, `windowClosesAt`, `captured`, `captureUntil`, `verdictBeatIndex`) par `round: Round | null`. Le contrôleur :
  - au temps de consigne (`timing.promptBeat(earliest, item)`), ouvre la manche avec `now: clock.now()` ;
  - passe chaque temps à `round.onBeat` puis, si `round.after()` n’est pas nul et `beat.index >= advanceAt`, choisit la consigne suivante avec `earliestPromptBeat = earliestPrompt` ;
  - mode 1 : passe chaque note à `round.observe({ time: onset.time − latence, correct: acceptableMidis(target).includes(onset.midi), answer: { kind: 'note', midi } })` ;
  - mode 2 : `answer(pitch)` passe `{ time: clock.now(), correct: pitch === attendu, answer: { kind: 'name', pitch } }` ;
  - `provisional` : verdict affiché sans correction, entrée de piste, son ; `settled` : verdict avec correction, entrée de piste ajoutée ou remplacée si le verdict a changé (son seulement s’il a changé), enregistrement ;
  - `pause` et `quit` : `round.abandon()` → enregistrement s’il rend un résultat.
- [ ] **Étape 2 : journaux.** Garder `logDetection` pour : note ignorée (raison traduite depuis `IgnoreReason` avec les phrases actuelles), décision (cible, fréquences acceptées, note reçue, latence, temps brut et corrigé, verdict, écart). Les lignes de position dans la fenêtre disparaissent.
- [ ] **Étape 3 :** `npx vitest run src/lib/application/session` → PASS sans modifier un seul test.
- [ ] **Étape 4 :** `npm test && npm run check` → PASS.
- [ ] **Étape 5 : commit** `refactor: play each prompt as a round of its time relation`.

---

### Tâche 4 : enregistreur d’essais

Extraction sans changement de comportement.

**Fichiers :**

- Créer : `src/lib/application/session/AttemptRecorder.ts`, `AttemptRecorder.spec.ts`
- Modifier : `SessionController.svelte.ts`

**Interfaces :**

- Produit :

```ts
class AttemptRecorder {
	constructor(deps: {
		attempts: AttemptRepositoryPort;
		cards: CardStateRepositoryPort;
		clock: AudioClockPort;
		now: () => number;
		selector: SessionSelector;
		sessionId: string;
		tempoBpm: number;
	});
	/** This series' attempts, oldest first. */
	readonly sessionAttempts: readonly Attempt[];
	/** Synchronous part done on return (attempt pushed, selector told); `stored` settles once card and attempt are written. */
	record(
		planned: PlannedItem,
		outcome: RoundOutcome,
		promptTime: number
	): { attempt: Attempt; stored: Promise<void> };
}
```

Le contrôleur crée un enregistreur par série (au `start`) et lit `sessionAttempts` pour la fatigue.

- [ ] **Étape 1 : tests rouges** (`InMemory*` de `src/lib/testing/fakes.ts`, un sélecteur espion) :
  - `it('tells the selector before the attempt is stored')` : après `record`, `sessionAttempts` contient l’essai et `selector.record` a été appelé, `attempts.all()` est encore vide ; après `await stored`, il contient l’essai.
  - `it('stores a missed probe hot and a passed probe cold')` : sondage locate à 2 temps, 80 bpm, `perfect` → `cold` ; `wrong` → `hot`.
  - `it('creates the card of a learning prompt the selector does not report')` : phase `learning`, sélecteur qui rend null → `cards.get(clé)` défini, `learnedAt` null.
  - `it('records the confusion of a wrong note')` : cible F corde 2, note 66 (F#4) → `confusion: { kind: 'semitone', delta: 1 }`.
- [ ] **Étape 2 :** `npx vitest run src/lib/application/session/AttemptRecorder.spec.ts` → FAIL.
- [ ] **Étape 3 : implémenter** en déplaçant `persistAttempt`, `storeCard` et `temperatureFor` du contrôleur.
- [ ] **Étape 4 :** `npx vitest run src/lib/application/session` → PASS (spec du contrôleur inchangée) ; `npm test && npm run check` → PASS.
- [ ] **Étape 5 : commit** `refactor: record attempts outside the session controller`.

---

### Tâche 5 : mécaniques, présentateurs, capteurs, contrat de scène

Le modèle stocké ne change pas encore ; le contrat de l’écran change (scène, choix de réponse).

**Fichiers :**

- Créer : `src/lib/domain/music/items.ts`, `items.spec.ts`
- Créer : `src/lib/domain/mechanics/types.ts`, `locate.ts`, `identify.ts`, `index.ts`, `locate.spec.ts`, `identify.spec.ts`
- Créer : `src/lib/application/mechanics/types.ts`, `locate.ts`, `identify.ts`, `index.ts`, `locate.spec.ts`, `identify.spec.ts` (reprennent `prompt.ts` et `prompt.spec.ts`, supprimés)
- Créer : `src/lib/application/session/sensors.ts`, `sensors.spec.ts`
- Modifier : `SessionDeps.ts`, `SessionController.svelte.ts`, `AttemptRecorder.ts`, `contract.ts`, `src/lib/composition/createApp.ts`, `src/lib/ui/play/answer/showsAnswerPad.ts`, `AnswerPad.svelte`, `PlayScreen.svelte`, `DemoPlaySession.svelte.ts`, `DemoIdentifySession.svelte.ts`, `src/routes/session/demo/+page.svelte`, et leurs specs ; `SessionController.spec.ts` (seulement `createDeps`, `scene`, `answer`)

**Interfaces :**

- Produit (`domain/music/items.ts`) :
  - `interface LocateItem { string: StringNumber; pitch: PitchName }`, `interface IdentifyItem { string: StringNumber; fret: number }`
  - `type NeckCard = { mechanic: 'locate'; item: LocateItem } | { mechanic: 'identify'; item: IdentifyItem }`
  - `locateItemKey(item): string` → `'6:F'` ; `parseLocateItem(key): LocateItem` ; `identifyItemKey(item)` → `'6:3'` ; `parseIdentifyItem(key)` (frets 0–`MAX_PROMPT_FRET`) ; erreurs comme `parseCardKey` aujourd’hui.
  - `neckCardKey(card: NeckCard): CardKey` → `'locate:6:F'`.
  - Les fonctions de `music/` prennent désormais des items (`acceptableMidis(item: LocateItem)`, `classifyNoteConfusion(item: LocateItem, midi)`) : un `LocateTarget` reste assignable jusqu’à la tâche 6.
- Produit (`domain/mechanics/types.ts`) :

```ts
interface MechanicRules<I = unknown, O = unknown, A = unknown, C = unknown> {
	id: MechanicId;
	timing: TimingRelation;
	learner: 'memory';
	itemKey(item: I): string;
	parseItem(itemKey: string): I;
	judge(item: I, observation: O): { correct: boolean; answer: A; confusion: C | null };
}
function cardKeyOf<I>(rules: MechanicRules<I>, item: I): CardKey; // `${rules.id}:${rules.itemKey(item)}`
```

- `locateRules: MechanicRules<LocateItem, { midi: Midi }, { midi: Midi }, Confusion>` (`beatTiming`) ; `identifyRules: MechanicRules<IdentifyItem, PitchName, { pitch: PitchName }, Confusion>` (`identifyTiming`).
- `MECHANIC_RULES: readonly MechanicRules[]` et `mechanicRules(id): MechanicRules` (lève sur un id inconnu) dans `index.ts` — validation et migration seulement.
- Produit (`application/mechanics/types.ts`) :

```ts
type Scene = 'guitar' | 'screen';
type SensorKind = string; // 'note', 'tap'
interface MechanicPresenter<I = any, A = any> {
	rules: MechanicRules<I, unknown, A, unknown>;
	scene: Scene;
	sensor: SensorKind;
	prompt(
		item: I,
		aids: { aid: AidLevel; stringAid: boolean },
		locale: Locale,
		random: () => number
	): PromptView;
	answerLabel(answer: A, item: I, locale: Locale, random: () => number): string | null;
	reveal(item: I, outcome: { correct: boolean; verdict: Verdict }, locale: Locale): string | null;
	answerChoices?(): AnswerChoice[];
	debugLines?(item: I, payload: unknown): string[];
}
```

- `locatePresenter` (`guitar`, `note`) : invite, aide de case, corde dessinée ; `answerLabel` épelle la note **cible** comme aujourd’hui ; `reveal` rend la position (`buildCorrection`) sur `wrong`, sinon null ; `debugLines` : fréquences acceptées et écarts en cents (`detectionLog`).
- `identifyPresenter` (`screen`, `tap`) : libellé de case, aide par le nom, `answerChoices` (douze choix, `value` = la hauteur), `reveal` = `answerChoiceLabel` sur `wrong`.
- `NECK_PRESENTERS: Record<MechanicId, MechanicPresenter>`.
- Produit (`application/session/sensors.ts`) :

```ts
interface Observation {
	time: number;
	payload: unknown;
}
interface ObservationSource {
	onObservation(callback: (o: Observation) => void): () => void;
	push?(payload: unknown): void;
}
type SensorFactory = (context: { latencyMs: number; clock: AudioClockPort }) => ObservationSource;
function noteSensor(detector: NoteDetectorPort): SensorFactory; // payload NoteOnset, time = onset.time − latencyMs / 1000
function tapSensor(): SensorFactory; // push(value) → { time: clock.now(), payload: value }
```

- `SessionDeps` gagne `mechanics: Record<MechanicId, MechanicPresenter>` et `sensors: Record<SensorKind, SensorFactory>`.
- Contrat : `PlayView.scene: Scene` ; `PromptView` sans `direction` ; `AnswerChoice { value: string; label: string }` ; `PlaySessionController.answer(value: string)`.

- [ ] **Étape 1 : tests rouges du domaine.**
  - `items.spec.ts` : aller-retour des clés ; `parseLocateItem('7:F')`, `'1:H'`, `'1:'` lèvent ; `parseIdentifyItem('1:12')` lève ; `neckCardKey({ mechanic: 'identify', item: { string: 6, fret: 3 } })` = `'identify:6:3'`.
  - `locate.spec.ts` : `locateRules.judge({ string: 2, pitch: 'F' }, { midi: 65 })` → `{ correct: true, answer: { midi: 65 }, confusion: null }` ; `{ midi: 66 }` → semitone +1 ; `{ midi: 59 }` sur la corde 2 → `string-name` ; `locateRules.timing` est `beatTiming` ; `cardKeyOf(locateRules, { string: 6, pitch: 'F' })` = `'locate:6:F'`.
  - `identify.spec.ts` : `identifyRules.judge({ string: 6, fret: 3 }, 'G')` juste ; `'G#'` → semitone +1 ; `identifyRules.timing.id` = `'free'`.
  - `mechanicRules('locate')` est `locateRules` ; `mechanicRules('chords')` lève.
- [ ] **Étape 2 : tests rouges de l’application.**
  - `application/mechanics/*.spec.ts` : les cas actuels de `prompt.spec.ts` réécrits sur `prompt`, `reveal` et `answerChoices` ; `reveal` rend null sur `perfect` et sur `offbeat`.
  - `sensors.spec.ts` : `noteSensor` à 35 ms de latence transforme une attaque à 1,0 s en observation à 0,965 s, payload = l’attaque ; la désinscription coupe le flux ; `tapSensor` : `push('G')` émet `{ time: clock.now(), payload: 'G' }`.
- [ ] **Étape 3 :** `npx vitest run src/lib/domain/mechanics src/lib/domain/music src/lib/application/mechanics src/lib/application/session/sensors.spec.ts` → FAIL.
- [ ] **Étape 4 : implémenter** règles, présentateurs et capteurs.
- [ ] **Étape 5 : brancher le contrôleur.** Présentateur = `deps.mechanics[planned.target.direction]` (provisoire jusqu’à la tâche 6) ; relation = `presenter.rules.timing` ; au départ d’une série, ouvrir une source par capteur des mécaniques de `deps.mechanics` ; une observation d’un autre capteur que celui de la consigne en cours est journalisée et ignorée ; `answer(value)` alimente la source `tap` ouverte (`push`) ; la justesse vient de `rules.judge(item, payload)` ; vue : `scene` et clics depuis `presenter.scene`, invite depuis `presenter.prompt`, correction depuis `presenter.reveal` au `settled`, choix depuis `presenter.answerChoices`. `record` gagne un quatrième paramètre `judged: { answer: unknown; confusion: Confusion | null } | null` (le résultat du juge, null sans réponse) ; l’enregistreur en tire la confusion et convertit provisoirement la réponse en `Answer` (`{ kind: 'note', midi }` / `{ kind: 'name', pitch }`) ; cette conversion disparaît en tâche 8.
- [ ] **Étape 6 : interface.** `showsAnswerPad(view)` = `view.scene === 'screen'` ; `AnswerPad` envoie `choice.value` ; démos et page `session/demo` sur le nouveau contrat. Specs : remplacer `scene: 'locate' | 'identify'` par `'guitar' | 'screen'` et retirer `direction` des invites, sans toucher aux attentes de comportement. `createApp` et `createDeps` (spec du contrôleur) fournissent `mechanics: NECK_PRESENTERS` et `sensors: { note: noteSensor(detector), tap: tapSensor() }`.
- [ ] **Étape 7 :** `npm test && npm run check` → PASS.
- [ ] **Étape 8 : commit** `refactor: give each mechanic its rules, presentation and sensor`.

---

### Tâche 6 : bascule du modèle — domaine

Garde de fin de tâche : `npx vitest run --project server src/lib/domain` → PASS et `npm run check` sans erreur sous `src/lib/domain/`. Le reste reste rouge jusqu’à la tâche 8.

**Fichiers :**

- Modifier : `src/lib/domain/types.ts`, `music/{fretboard,confusion,curriculum,mirror,index}.ts`, `progress/{cards,lead,learnSelector,introduction,review,sequence,success,order,plans,stats,index}.ts`, `scoring/{index,fatigue}.ts`, `timing/*`, `mechanics/*`, et leurs specs
- Supprimer : `progress/tempo.ts` et sa spec (tout est dans `exercise/tempo.ts`), `scoring/recall.ts`, `scoring/identify.ts`, `judgeLocate` dans `scoring/timing.ts`, `scoring/judgement.ts` (garder `secondsToMs` dans `timing.ts`), et leurs specs (leurs cas vivent dans `timing/*.spec.ts`)

**Interfaces :**

- `domain/types.ts` : `CardState<I>`, `Attempt<D>`, `PlannedItem<I>`, `SessionRecord` (`executions: Execution[]`), `Settings` sans `tempoBpm`, `BackupFile` en version 2 (`progressions: Progression[]`), exactement comme la section 1 de la spec. `cardKey(mechanic: MechanicId, itemKey: string): CardKey` et `parseCardKey(key): { mechanic: MechanicId; itemKey: string }` (lève si pas de `:` ou partie vide). Retirés : `Target`, `LocateTarget`, `IdentifyTarget`, `Direction`, `Answer`, `Confusion` (va dans `music/confusion.ts`).
- Données d’essai : `LocateData = { item: LocateItem; answer: { midi: Midi } | null; confusion: Confusion | null }`, `IdentifyData = { item: IdentifyItem; answer: { pitch: PitchName } | null; confusion: Confusion | null }` dans `domain/mechanics/{locate,identify}.ts`.
- Progression, avec relation explicite : `introduceCard(card: { key; mechanic; item }, now, sessionId, timing)`, `probeCard(card: { key; mechanic; item }, attempt, now, sessionId, timing)`, `probeTemperature(attempt, timing)`, `markLearned(card, now, timing, tempoBpm: number | null)`, `applyColdAttempt(state, attempt, history, now, timing)`, `isAcquired(state, history, timing)`, `isMastered(history, timing)`. `lead.ts` ne garde que ce qui n’est pas dans `beatTiming` (rien : supprimer s’il se vide).
- Domaine du manche : `locateItems(): LocateItem[]`, `practiceCards(): NeckCard[]`, `isMirrorPair(a: NeckCard, b: NeckCard)`, `mirrorItems(item: LocateItem): LocateItem[]`, `introductionOrder(): LocateItem[]`, `nextNewCard(cards): NeckCard | null`, `allowedAfter(card: NeckCard, previous: NeckCard | null)`, `pickAtRandom<T extends { mechanic: string; item: unknown }>(…)`, `Sequence { mechanic: MechanicId; lead; count }`, `buildFreePlan` produit des `PlannedItem` avec `exerciseId` du catalogue, `createLearnSelector` inchangé dans sa signature et produisant `exerciseId`, `buildNeckMap({ cards, attempts, pitchAt })` (plus de `sessions` : le tempo vient de l’essai).
- `asNeckCard(x: { mechanic: string; item: unknown }): NeckCard` (lève sur une autre mécanique) dans `music/items.ts`, pour le domaine du manche.

- [ ] **Étape 1 : réécrire `domain/types.ts`** et les fixtures des specs du domaine (une fabrique par spec, par exemple `locateAttempt(overrides)` avec `exerciseId: 'locate-neck'`, `mechanic: 'locate'`, `tempoBpm: 80`, `data: { item, answer, confusion }`).
- [ ] **Étape 2 : tests rouges ajoutés.**
  - `cards.spec.ts` : `it('judges every attempt at its own tempo')` — historique de trois succès à froid à 4 temps dans trois sessions espacées de 72 h, à `tempoBpm: 160` → `isMastered(history, beatTiming)` vrai ; le même historique à `tempoBpm: 80` → faux.
  - `types.spec.ts` (ou `cardKey.spec.ts`) : `cardKey('locate', '6:F')` = `'locate:6:F'` ; `parseCardKey('identify:6:3')` = `{ mechanic: 'identify', itemKey: '6:3' }` ; `parseCardKey('locate')` lève.
  - `stats.spec.ts` : la carte du manche lit le tempo de l’essai (essai à 4 temps, `tempoBpm: 120` → `locateRecallMs` 2000) sans liste de sessions.
- [ ] **Étape 3 :** `npx vitest run --project server src/lib/domain` → FAIL.
- [ ] **Étape 4 : migrer le domaine.** Remplacer chaque `target.direction` par `mechanic`, `target` par `item` ou `NeckCard`, `cardKey(target)` par `neckCardKey` ; passer `locateRules.timing` / `identifyRules.timing` là où il fallait un tempo ; `sessionSuccessRate` et `nextTempo`-appelants filtrent sur `mechanic === 'locate'`. Le sélecteur d’Apprentissage garde son `tempoBpm` (pour `learnedLead` et le sondage) mais juge le rappel direct par la relation, au tempo de l’essai.
- [ ] **Étape 5 :** `npx vitest run --project server src/lib/domain` → PASS ; `npm run check 2>&1 | grep 'src/lib/domain'` → aucune ligne.
- [ ] **Étape 6 : commit** `refactor: key cards by mechanic and item and judge attempts at their tempo`.

---

### Tâche 7 : bascule du modèle — stockage et sauvegarde

Garde de fin de tâche : `npx vitest run src/lib/infrastructure/storage src/lib/domain` → PASS et `npm run check` sans erreur sous `src/lib/infrastructure/` et `src/lib/domain/`.

**Fichiers :**

- Créer : `src/lib/infrastructure/storage/legacy/v1.ts`, `v1.spec.ts`
- Créer : `src/lib/infrastructure/storage/DexieProgressionRepository.ts`, `.spec.ts`, `testing/progressionRepositoryContract.ts`
- Modifier : `db.ts`, `db.spec.ts`, `validateBackup.ts`, `validateBackup.spec.ts`, `DexieBackup.ts`, `DexieBackup.spec.ts`, `legacyImport.spec.ts` (attentes seulement), `testing/fixtures.ts`, `testing/settingsRepositoryContract.ts` (`tempoBpm: 96` → `locale: 'en'`), `testing/*Contract.ts`, `index.ts`
- Modifier : `src/lib/application/ports/repositories.ts`, `ports/index.ts`, `src/lib/testing/fakes.ts`

**Interfaces :**

- `ProgressionRepositoryPort { get(exerciseId): Promise<Progression | undefined>; put(p: Progression): Promise<void>; all(): Promise<Progression[]> }` ; `DexieProgressionRepository` ; `InMemoryProgressionRepository`.
- `NeckspertDb.progressions: EntityTable<Progression, 'exerciseId'>`, store `progressions: 'exerciseId'`, version 5.
- `legacy/v1.ts` :

```ts
const V1_EXERCISE_IDS = { locate: 'locate-neck', identify: 'identify-neck' } as const;
interface V1Data {
	settings: Record<string, unknown>;
	cards: Record<string, unknown>[];
	attempts: Record<string, unknown>[];
	sessions: Record<string, unknown>[];
}
/** One conversion for the Dexie upgrade and the v1 import. */
function convertV1(
	data: V1Data,
	now: number
): {
	settings: Partial<Settings>;
	progressions: Progression[];
	cards: CardState[];
	attempts: Attempt[];
	sessions: SessionRecord[];
};
```

Règles (spec, section 5) : tempo de repli = `clampTempo(settings.tempoBpm)` s’il existe, sinon 80 ; essai locate → tempo de sa session s’il est connu et non nul, sinon le repli ; essai identify → null ; `answer` sans `kind` ; session → `executions` `[locate-neck avec son tempo ou le repli, identify-neck null]` ; progression `locate-neck` seulement si `settings.tempoBpm` existe, à `clampTempo`, `updatedAt: now` ; `settings` sans `tempoBpm` ; cartes passées par `withoutLegacyLead`.

- `validateBackupV1(file): V1Backup` (le validateur actuel, renommé) ; `validateBackupV2(file): BackupFile` ; `validateBackup(file, now = Date.now()): BackupFile` — v1 : valide, convertit, puis valide en v2 ; v2 : valide ; autre version : `Unsupported backup version`.
- Validation v2, messages lisibles comme aujourd’hui : `mechanic` connu (`mechanicRules`), `cardKey` = `cardKey(mechanic, rules.itemKey(rules.parseItem(itemKey)))` et `item` égal à l’item analysé, `exerciseId` chaîne non vide, `tempoBpm` positif ou null, `data` objet avec `item`, `executions` tableau d’objets `{ exerciseId, tempoBpm }`, progressions `{ exerciseId, mechanic, tempoBpm > 0, updatedAt }`.
- `DexieBackup.exportAll()` écrit `version: 2` avec `progressions` ; `importAll` vide et remplit aussi `progressions`, `inputDeviceId` toujours remis à null.

- [ ] **Étape 1 : tests rouges `v1.spec.ts`.**
  - `it('turns a v1 attempt into a mechanic attempt at its session tempo')` : essai locate de la session `s1` (tempo 100) → `{ exerciseId: 'locate-neck', mechanic: 'locate', tempoBpm: 100, data: { item: { string: 6, pitch: 'A' }, answer: { midi: 45 }, confusion: null } }`, sans `target`.
  - `it('falls back on the settings tempo, then 80')` (point de vigilance 1) : session sans `tempoBpm`, réglages à 96 → 96 ; ni l’un ni l’autre → 80 et `progressions` vide.
  - `it('falls back for an attempt whose session is missing')` (point de vigilance 2).
  - `it('leaves identify attempts without tempo')`, `it('moves the settings tempo to the locate-neck progression')` (réglages à 60 → progression à 80), `it('gives each session its two executions')`, `it('moves one-beat cards to two')`.
- [ ] **Étape 2 : tests rouges `db.spec.ts`.** `it('converts every table when a version 4 database is opened')` : base `versionFour(name)` (même motif que `versionThree`) remplie d’une carte, d’un essai locate, d’un essai identify, d’une session à 100 bpm et d’un réglage à 96 ; à l’ouverture de `NeckspertDb`, les lignes sont au nouveau format et `progressions` contient `locate-neck` à 96 ; `it('declares the five tables …')` mis à jour.
- [ ] **Étape 3 : tests rouges de sauvegarde.**
  - `validateBackup.spec.ts` : un fichier v2 valide passe ; mécanique `'chords'` → erreur contenant `mechanic` (point de vigilance de la spec) ; clé `locate:6:F` avec item `{ string: 5, pitch: 'F' }` → erreur ; version 3 → `Unsupported backup version: 3`.
  - `DexieBackup.spec.ts` : `it('exports version 2 with progressions')` ; `it('restores progressions and executions after an export and an import')` (point de vigilance 3, `toEqual` sur les deux tables).
  - `legacyImport.spec.ts` : fixture **inchangée** ; attentes : cartes `leadBeats` 2, 4, 2 et `mechanic`/`item` corrects ; essais `leadBeats` `[1, 4, null]` et `tempoBpm` `[80, 80, null]` ; `progressions.get('locate-neck')` à 80 ; réglages `{ calibrationOffsetMs: 35, inputDeviceId: null }` sans `tempoBpm` ; la seconde partie appelle `applyColdAttempt(card, success, [success], now, beatTiming)` avec `success` au nouveau format (`tempoBpm: 80`) et attend toujours `scheduling.state` 2 et `acquiredAt` = `now`.
- [ ] **Étape 4 :** `npx vitest run src/lib/infrastructure/storage` → FAIL.
- [ ] **Étape 5 : implémenter** : `convertV1`, version 5 (`upgrade` lit les quatre tables, appelle `convertV1(…, Date.now())`, vide et réécrit, écrit les progressions), dépôt et contrat, validateurs, export et import.
- [ ] **Étape 6 :** `npx vitest run src/lib/infrastructure/storage src/lib/domain` → PASS ; `npm run check 2>&1 | grep -E 'src/lib/(infrastructure|domain)/'` → aucune ligne.
- [ ] **Étape 7 : commit** `feat: store progressions and convert v1 data to mechanic cards and attempts`.

---

### Tâche 8 : bascule du modèle — application et interface

Rétablit la garde complète.

**Fichiers :**

- Créer : `src/lib/application/session/executions.ts`, `executions.spec.ts`
- Modifier : `SessionController.svelte.ts`, `SessionController.spec.ts`, `AttemptRecorder.ts`, `AttemptRecorder.spec.ts`, `SessionDeps.ts`, `services/createAppServices.ts` (et sa spec si présente), `src/lib/composition/createApp.ts`, `src/lib/infrastructure/audio/clock/WebAudioMetronome.ts` (`DEFAULT_TEMPO_BPM`), `src/lib/ui/play/answer/DemoIdentifySession.svelte.ts` (juge par `identifyRules` et `identifyTiming`), `src/lib/ui/play/demo/DemoPlaySession.svelte.ts`
- Modifier : `src/lib/ui/screens/settings/SettingsScreen.svelte`, `messages.ts`, `SettingsScreen.svelte.spec.ts`, `src/routes/settings/+page.svelte`, `page.svelte.spec.ts`, `TestHarness.svelte`, `src/routes/dev/settings/+page.svelte`
- Supprimer : `src/lib/ui/screens/settings/tempo.ts`, `tempo.spec.ts`

**Interfaces :**

- `sessionTempo(executions: readonly Execution[]): number` — le seul tempo non nul, `DEFAULT_TEMPO_BPM` sans tempo, lève `Error` dont le message cite la décision 4 si deux tempos non nuls diffèrent.
- `SessionDeps` gagne `progressions: ProgressionRepositoryPort` ; `settings` ne sert plus au tempo.
- `SessionController(session: { id: string; kind: SessionKind }, prepare: (sessionId: string) => Promise<{ selector: SessionSelector; executions: Execution[] }>, deps: SessionDeps)` — `prepare` remplace `makeSelector` et est rappelé à chaque série.
- `AttemptRecorder` : `tempoBpm` retiré du constructeur ; `record(planned, outcome, promptTime, judged: { answer; confusion } | null, execution: Execution)` construit l’`Attempt` final (`exerciseId`, `mechanic`, `tempoBpm` de l’exécution, `data: { item, answer, confusion }`) et passe `presenter.rules.timing` aux fonctions de progression ; il ne met à jour une carte que si `rules.learner === 'memory'`.
- `createAppServices` : `startSession(kind)` fournit `prepare` qui lit cartes, essais et progressions, construit `executions = [LOCATE_NECK, IDENTIFY_NECK].map((e) => ({ exerciseId: e.id, tempoBpm: mechanicRules(e.mechanic).timing.usesTempo ? startTempo(e, progressions) : null }))` et le sélecteur (`createLearnSelector({ …, tempoBpm: tempo de locate-neck })` ou `createListSelector(buildFreePlan(…))`).
- Fin d’une session d’Apprentissage : pour chaque exécution avec tempo, `nextTempo(tempoBpm, essais de la série dont exerciseId correspond)` ; s’il diffère, `progressions.put({ exerciseId, mechanic, tempoBpm: suivant, updatedAt: now })`.
- `SettingsScreen` perd `tempoBpm` et `ontempo` ; `messages.tempo` disparaît en fr et en en.

- [ ] **Étape 1 : tests rouges `executions.spec.ts`.** `sessionTempo([{ exerciseId: 'locate-neck', tempoBpm: 100 }, { exerciseId: 'identify-neck', tempoBpm: null }])` = 100 ; `sessionTempo([{ …, tempoBpm: null }])` = 80 ; deux tempos 100 et 120 → lève, message contenant `decision 4`.
- [ ] **Étape 2 : adapter `SessionController.spec.ts`.** `planWith(items, kind, executions = [{ exerciseId: 'locate-neck', tempoBpm: 80 }, { exerciseId: 'identify-neck', tempoBpm: null }])` fournit `prepare` ; items au nouveau format (`exerciseId`, `mechanic`, `item`). Réécrire le bloc « tempo between sessions » :
  - `it('speeds the next learn session up after more than 90 % right')` → `progressions.get('locate-neck')` à 85 ;
  - `it('slows the next learn session down under 70 %, never below 80 bpm')` ;
  - `it('leaves the tempo alone after free play')` ;
  - `it('writes no progression after a learn session of fewer than ten locate prompts')` (point de vigilance 4 : `progressions.all()` vide) ;
  - `it('starts a new series at the tempo the previous series reached')` (point de vigilance 5 : `prepare` lit la progression, la seconde série démarre le métronome à 85).
  - Les tests « stores the tempo from settings at start … » deviennent : le `SessionRecord` porte `executions` dès le départ et à la fin, inchangées quand la progression change entre-temps.
  - Ajouter `it('records each attempt with its exercise and tempo')` : un essai locate porte `exerciseId: 'locate-neck'` et `tempoBpm: 80`, un essai identify `identify-neck` et `null`.
- [ ] **Étape 3 :** `npx vitest run src/lib/application` → FAIL.
- [ ] **Étape 4 : implémenter** contrôleur (exécution de chaque consigne par `planned.exerciseId`, tempo du métronome par `sessionTempo`, `view.tempoBpm` idem), enregistreur, services, composition, démos.
- [ ] **Étape 5 : interface des réglages.** Retirer la ligne tempo et ses tests ; la page `/settings` ne lit ni n’écrit plus de tempo ; `/dev/settings` suit.
- [ ] **Étape 6 :** `npm test && npm run check` → PASS ; `grep -rn "tempoBpm" src/lib/domain/types.ts` → seulement `Attempt`, `Execution`, `Progression`.
- [ ] **Étape 7 : commit** `feat: keep a tempo per exercise and leave it out of the settings`.

---

### Tâche 9 : troisième mécanique factice et documentation

**Fichiers :**

- Créer : `src/lib/application/session/thirdMechanic.spec.ts`
- Modifier : `CLAUDE.md`, `docs/plateforme.md`, `PRODUCT.md`, `docs/superpowers/plans/README.md` (index des plans)

**Interfaces :**

- Consomme : `MechanicRules`, `MechanicPresenter`, `SensorFactory`, `beatTiming`, `SessionController`, `createListSelector` ; rien n’est ajouté hors du fichier de test.

- [ ] **Étape 1 : écrire le test.** Dans le fichier : `fakeRules` (`id 'fake'`, `timing: beatTiming`, `learner 'memory'`, item `{ n: number }`, clé `String(n)`, `judge(item, payload: { value: number })` → juste si `value === n`, réponse = payload, confusion null) ; `fakePresenter` (`guitar`, capteur `'fake'`, invite `{ primary: String(n), secondary: '', aid: null, diagram: null }`, `reveal` → `n = ${n}` sur `wrong`) ; capteur factice avec `push`. Session d’une exécution `{ exerciseId: 'fake-ex', tempoBpm: 100 }`, consignes `{ exerciseId: 'fake-ex', mechanic: 'fake', item: { n: 3 }, phase: 'review', temperature: 'cold', aid: 'none', leadBeats: 4 }`.
  - `it('plays a mechanic the core has never seen, on the beat')` : métronome à 100 bpm ; `push({ value: 3 })` au temps cible → `view.lastVerdict.verdict` = `perfect` ; essai stocké `{ mechanic: 'fake', exerciseId: 'fake-ex', tempoBpm: 100, data: { item: { n: 3 }, answer: { value: 3 }, confusion: null } }`.
  - `it('shows what the mechanic reveals after a miss')` : `push({ value: 4 })` → `wrong`, `view.lastVerdict.correction` = `'n = 3'`.
- [ ] **Étape 2 :** `npx vitest run src/lib/application/session/thirdMechanic.spec.ts` → PASS. S’il échoue parce qu’un fichier du cœur connaît `'locate'` ou `'identify'`, corriger ce fichier (c’est le défaut que le test doit révéler), pas le test.
- [ ] **Étape 3 : documentation.**
  - `CLAUDE.md` : architecture (`domain/exercise`, `domain/timing`, `domain/mechanics`, `application/mechanics`, `AttemptRecorder`, capteurs) ; règles : tempo par exercice (`startTempo`, `nextTempo`, progressions), `settings.tempoBpm` retiré, Dexie version 5, sauvegarde v2 qui importe la v1, point d’ajout d’une mécanique.
  - `docs/plateforme.md` : étape 1 faite, renvoi à la spec du 2026-10-05.
  - `PRODUCT.md` : le tempo adaptatif est propre à chaque exercice ; il n’est plus réglable dans les Réglages.
  - `docs/superpowers/plans/README.md` : ligne « Mécaniques et exercices » dans l’index.
- [ ] **Étape 4 :** `npm test && npm run check` → PASS ; `npm run lint` sur les fichiers touchés → propre.
- [ ] **Étape 5 : commit** `test: play a third mechanic without touching the core` puis `docs: describe mechanics, exercises and per-exercise tempo`.

---

## Fin

- Revue de toute la branche, puis superpowers:finishing-a-development-branch.
- Avant fusion, recommander au guitariste un passage réel : `scripts/functional-ui.mjs` contre le serveur de dev, puis une session d’Apprentissage avec la guitare (mode 1 sur le temps, hors temps, mode 2, changement de scène), et l’ouverture d’une base existante (migration v5).
