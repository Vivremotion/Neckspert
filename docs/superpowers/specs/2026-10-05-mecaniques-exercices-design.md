# Design — mécanique, exercice et exécution

Date : 2026-10-05. Statut : approuvé dans la conversation de développement du 2026-10-05.

Étape 1 de la feuille de route de `docs/plateforme.md`, dont cette spec reprend le vocabulaire (mécanique, exercice, progression, session, exécution, carte, essai) et les décisions sans les répéter. Refactor sans nouvelle fonctionnalité : les modes 1 (localiser) et 2 (identifier) deviennent les deux premières mécaniques, chacune avec un seul exercice sans paramètre. Le comportement observable ne change pas, sauf les deux exceptions de la section 9.

## Objectifs

- Les concepts du glossaire existent dans le code. Définition d’exercice et progression sont stockées séparément ; le jeu n’écrit jamais dans une définition.
- Clé de carte = mécanique + item.
- Tempo propre à chaque exercice (décisions 3 et 4) : il remplace `settings.tempoBpm` et `nextSessionTempo`, et il est enregistré avec l’exécution et avec l’essai.
- L’Apprentissage devient une session qui entrelace deux exercices.
- `Attempt` sépare les champs communs des données propres à la mécanique.
- `SessionController.svelte.ts` ne mêle plus boucle de temps, fenêtres, jugement des deux modes, persistance et FSRS.
- `SessionSelector` reste la frontière entre la pédagogie et l’orchestration.

## Couplages défaits

| Aujourd’hui                                                              | Après                                                                                                     |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `Target` union fermée, `cardKey` encode la direction                     | `mechanic` + `item` ; la clé `${mechanic}:${itemKey}` est construite par la mécanique                     |
| `PlayView.scene: 'locate' \| 'identify'`                                 | `PlayView.scene: 'guitar' \| 'screen'` : des scènes, pas des mécaniques                                   |
| `SessionController` : temps, fenêtres, deux jugements, persistance, FSRS | contrôleur (cycle de vie, scènes, vue) + rapport au temps (manches) + mécanique (justesse) + enregistreur |
| `isDirectRecall(attempt, tempoBpm)` avec le tempo des réglages           | `timing.isDirectRecall(attempt)` au tempo enregistré sur l’essai                                          |
| `settings.tempoBpm`, `nextSessionTempo`                                  | progression par exercice, `startTempo`, `nextTempo`                                                       |

## 1. Modèle de données

### Exercices (`src/lib/domain/exercise/`)

Catalogue en code, sous forme de données (aucune fonction dans une définition). L’import de définitions est hors périmètre ; ces objets ont déjà la forme d’une donnée importable.

```ts
type MechanicId = string; // 'locate', 'identify'
type ExerciseId = string;

interface ExerciseDefinition {
	id: ExerciseId;
	version: number;
	mechanic: MechanicId;
	/** Sous-ensemble d’items. Vide pour les deux exercices actuels : tout le manche, cases 1 à 11. */
	params: Readonly<Record<string, unknown>>;
	startTempoBpm?: number;
}

const LOCATE_NECK: ExerciseDefinition = {
	id: 'locate-neck',
	version: 1,
	mechanic: 'locate',
	params: {}
};
const IDENTIFY_NECK: ExerciseDefinition = {
	id: 'identify-neck',
	version: 1,
	mechanic: 'identify',
	params: {}
};
```

Pas de champ « objectif » : aucun comportement ne l’utilise encore.

### Progression

Table Dexie `progressions`, clé `exerciseId`. Seul un exercice sur le temps en a une.

```ts
interface Progression {
	exerciseId: ExerciseId;
	mechanic: MechanicId;
	/** Tempo atteint à la dernière exécution. */
	tempoBpm: number;
	updatedAt: number;
}
```

- `startTempo(definition, progressions)` (domaine, pur) applique l’ordre de la décision 3 : la progression de l’exercice ; sinon `definition.startTempoBpm` ; sinon la progression la plus récemment mise à jour d’un autre exercice de la même mécanique ; sinon `DEFAULT_TEMPO_BPM` (80). Toujours borné par `clampTempo` dans [`TEMPO_MIN_BPM`, `TEMPO_MAX_BPM`] (80–160).
- `nextTempo(tempoBpm, attempts)` remplace `nextSessionTempo` : mêmes règles (`TEMPO_MIN_PROMPTS`, `TEMPO_RAISE_AT`, `TEMPO_LOWER_AT`, `TEMPO_STEP_BPM`, sondages exclus), appliquées aux essais d’un seul exercice.

### Exécution

Rangée dans la session, pas dans une table à part :

```ts
interface Execution {
	exerciseId: ExerciseId;
	/** Figé au départ. Null pour un exercice sans rapport au tempo (identify). */
	tempoBpm: number | null;
}

interface SessionRecord {
	id: string;
	kind: SessionKind; // 'learn' | 'free'
	startedAt: number;
	endedAt: number | null;
	fatigueDetected: boolean;
	executions: Execution[]; // remplace tempoBpm
}
```

Une exécution peut être découpée en plusieurs morceaux dans la session : les essais d’un exercice dans une session forment son exécution.

### Carte

La clé reste `${mechanic}:${itemKey}` : `locate:6:F` et `identify:6:3` ne changent pas.

```ts
interface CardState<I = unknown> {
	key: CardKey;
	mechanic: MechanicId;
	item: I;
	introducedAt: number;
	introducedInSession: string;
	/** Rapport au temps « beat » ; les cartes identify gardent SHORTEST_LEAD. */
	leadBeats: LeadBeats;
	scheduling: SchedulingState;
	learnedAt: number | null;
	acquiredAt: number | null;
	masteredAt: number | null;
}
```

### Essai

```ts
interface Attempt<D = unknown> {
	id?: number;
	sessionId: string;
	exerciseId: ExerciseId;
	mechanic: MechanicId;
	cardKey: CardKey;
	phase: ItemPhase;
	temperature: Temperature;
	aid: AidLevel;
	promptedAt: number;
	/** Tempo de l’exécution ; il entre dans le jugement (décision 4). */
	tempoBpm: number | null;
	/** Rapport au temps : nuls en réponse libre. */
	leadBeats: RecordedLeadBeats | null;
	timingOffsetMs: number | null;
	reactionMs: number | null;
	correct: boolean;
	verdict: Verdict;
	/** Propre à la mécanique. */
	data: D;
}

// locate   : { item: LocateItem; answer: { midi: Midi } | null; confusion: Confusion | null }
// identify : { item: IdentifyItem; answer: { pitch: PitchName } | null; confusion: Confusion | null }
```

`leadBeats` et `timingOffsetMs` restent communs : ils décrivent le rapport au temps, qui appartient au cœur. Enregistrer les observations brutes (étape 2) reste hors périmètre.

`Answer`, `Target`, `LocateTarget`, `IdentifyTarget` et `Direction` quittent `domain/types.ts`.

_Écart à l’implémentation :_ un seul type `Confusion` subsiste, dans `domain/music/confusion.ts` (`classifyNoteConfusion` et `classifyNameConfusion` le produisent, sans `NoteConfusion` ni `NameConfusion`). `cardKey(mechanic, itemKey)` et `parseCardKey` restent dans `domain/types.ts`, mais construisent la clé `${mechanic}:${itemKey}` à partir d’une mécanique et d’une clé d’item au lieu d’une cible.

`LocateItem { string; pitch }` et `IdentifyItem { string; fret }` vont dans `domain/music/`. Une union fermée `NeckCard = { mechanic: 'locate'; item: LocateItem } | { mechanic: 'identify'; item: IdentifyItem }` est permise **dans le seul domaine du manche** : sélecteur d’Apprentissage, file d’introduction, miroirs, ordre de tirage, plan du jeu libre, statistiques et carte du manche. Ce domaine porte sur les deux mécaniques à la fois ; le cœur, lui, ne les connaît pas.

### Consigne planifiée

```ts
interface PlannedItem<I = unknown> {
	exerciseId: ExerciseId;
	mechanic: MechanicId;
	item: I;
	phase: ItemPhase;
	temperature: Temperature;
	aid: AidLevel;
	leadBeats: LeadBeats | null;
	countIn?: boolean;
	stringAid?: boolean;
}
```

Les paramètres de rapport au temps passent par la consigne planifiée (`leadBeats` aujourd’hui), que la manche reçoit entière.

### Réglages

`Settings.tempoBpm` disparaît (section 9).

## 2. Rapport au temps (`src/lib/domain/timing/`)

Le rapport au temps est du code du cœur, pur, testé seul. Une mécanique en référence un ; le contrôleur ne fait jamais de `switch` sur son identité.

```ts
interface TimingRelation {
	id: string; // 'beat', 'free'
	/** Temps de la consigne, au plus tôt `earliest`. 'beat' l’aligne pour que la cible tombe sur un temps 1. */
	promptBeat(earliest: number, planned: PlannedItem): number;
	/** Temps d’aperçu avant la consigne (corde montrée d’abord) : 'beat' STRING_PREVIEW_BEATS, 'free' 0. */
	previewBeats: number;
	open(input: {
		planned: PlannedItem;
		promptBeat: number;
		/** Heure audio de la consigne, en secondes. */
		promptTime: number;
		beatTime: (index: number) => number;
		secondsPerBeat: number;
	}): Round;
	isDirectRecall(
		attempt: Pick<Attempt, 'correct' | 'verdict' | 'reactionMs' | 'leadBeats' | 'tempoBpm'>
	): boolean;
	/** Échelle des temps d’avance d’une carte (mécaniques de mémoire). 'free' : SHORTEST_LEAD partout. */
	initialLead: LeadBeats;
	learnedLead(tempoBpm: number | null): LeadBeats;
	adjustLead(current: LeadBeats, success: boolean): LeadBeats;
}

type RoundEvent =
	| { kind: 'none' }
	| { kind: 'ignored'; reason: IgnoreReason }
	/** Affiché, mais l’écoute continue (hors temps) : rien n’est enregistré. */
	| { kind: 'provisional'; outcome: RoundOutcome }
	/** Définitif : l’essai s’enregistre. */
	| { kind: 'settled'; outcome: RoundOutcome };

interface RoundOutcome {
	verdict: Verdict;
	correct: boolean;
	answer: unknown | null;
	timingOffsetMs: number | null;
	reactionMs: number | null;
	/** Temps de la piste où inscrire le verdict ; null hors piste. */
	laneBeat: number | null;
}

interface Round {
	readonly promptBeatIndex: number;
	readonly targetBeatIndex: number | null;
	/** Une observation horodatée (heure audio, latence déjà corrigée), jugée juste ou non par la mécanique. */
	observe(observation: { time: number; correct: boolean; answer: unknown }): RoundEvent;
	onBeat(beat: BeatEvent): RoundEvent;
	/** Pause ou quitter : une écoute hors temps ouverte se règle sans réponse ; sinon null (rien n’est enregistré). */
	abandon(): RoundOutcome | null;
	/** Null tant que la manche n’est pas réglée. `advanceAt` : premier temps où la consigne suivante est choisie ; `earliestPrompt` : premier temps où elle peut s’afficher. */
	after(): { advanceAt: number; earliestPrompt: number } | null;
}
```

_Écart à l’implémentation :_ `open()` prend `now` (heure audio de la consigne, en secondes) à la place de `promptTime`, et `planned` y est réduit à `{ leadBeats }` ; `nextPromptEarliest()` est remplacée par `after()`, qui donne aussi le temps où choisir la consigne suivante.

C’est la manche qui décide quand elle est réglée ; le contrôleur ne suppose jamais qu’une observation est une réponse.

### `beatTiming` (mode 1, et demain les renversements)

Reprend sans changement de règle : `answerWindow`, `MIN_RESPONSE_MS`, `PERFECT_WINDOW_MS`, `LATE_LIMIT_MS`, `LATE_CAPTURE_MS`, `lateCaptureEnd` borné par l’aperçu de la consigne suivante, `alignedPromptBeat`, `respirationStart`, `STRING_PREVIEW_BEATS`, l’ordre perfect > early/late > offbeat > wrong, la première note comme réponse, `leadForThreshold`, l’échelle `LEAD_STEPS = [8, 4, 2]`. Rappel direct : juste, pas `offbeat`, et `leadBeats × 60 000 / tempoBpm ≤ RECALL_THRESHOLD_MS`. Les comparaisons d’index de temps restent en `>=`.

### `createFreeTiming` (mode 2, instance `identifyTiming`)

Reprend `judgeIdentify` : la consigne apparaît au temps reçu, le temps de réaction court de son affichage à l’observation, juste et ≤ seuil → `perfect`, juste et plus lent → `late`, faux → `wrong`. Pas d’`early` ni d’`offbeat`. La consigne suivante attend le temps qui suit la réponse. Construit avec son seuil (`createFreeTiming({ recallThresholdMs: IDENTIFY_RECALL_THRESHOLD_MS })`), calibrable à part comme le veut `PRODUCT.md`.

`judgeLocate` se coupe en deux : le placement dans le temps va à `beatTiming`, la justesse à la mécanique `locate`.

## 3. Mécaniques

### Règles (`src/lib/domain/mechanics/`, pur)

```ts
interface MechanicRules<I, O, A, C> {
	id: MechanicId;
	timing: TimingRelation;
	/** Modèle de l’apprenant (décision 5). Seule 'memory' (FSRS) existe ; 'skill' viendra avec le premier exercice de geste. */
	learner: 'memory';
	itemKey(item: I): string;
	/** Lève une erreur sur une clé invalide (validation des sauvegardes). */
	parseItem(itemKey: string): I;
	/** Justesse seule ; le placement dans le temps appartient au rapport au temps. */
	judge(item: I, observation: O): { correct: boolean; answer: A; confusion: C | null };
}
```

- `locateRules` : `beatTiming`, `acceptableMidis`, `classifyNoteConfusion` (confusions semitone, octave, string-name, other).
- `identifyRules` : `createFreeTiming` (instance `identifyTiming`), `pitchOnString`, `classifyNameConfusion`.
- `cardKeyOf(rules, item)` = `${rules.id}:${rules.itemKey(item)}`.
- `domain/mechanics/index.ts` liste les règles connues, pour la validation et la migration seulement. Aucune autre logique ne passe par cette liste.

Les fonctions de progression reçoivent explicitement la relation de temps au lieu du tempo des réglages : `applyColdAttempt(state, attempt, history, now, timing)`, `isMastered(history, timing)`, `isAcquired(state, history, timing)`, `probeTemperature(attempt, timing)`, `probeCard(…, timing)`, `markLearned(card, now, timing, tempoBpm)`, `introduceCard(…, timing)`. Le domaine du manche (sélecteur d’Apprentissage, statistiques) importe directement `locateRules` et `identifyRules`.

### Présentation (`src/lib/application/mechanics/`)

```ts
interface MechanicPresenter<I, A> {
	rules: MechanicRules<I, unknown, A, unknown>;
	/** Piste et clics pour la guitare, pavé et silence pour l’écran. */
	scene: 'guitar' | 'screen';
	sensor: SensorKind; // 'note' | 'tap' aujourd’hui
	prompt(planned: PlannedItem<I>, locale: Locale, random: () => number): PromptView;
	answerLabel(answer: A, locale: Locale, random: () => number): string | null;
	/** Montré quand la manche est réglée. Aujourd’hui : la correction après un raté. Renversements : notes et degrés. */
	reveal(
		item: I,
		outcome: Pick<RoundOutcome, 'correct' | 'verdict'>,
		locale: Locale
	): string | null;
	answerChoices?(): AnswerChoice[];
	/** Journal de détection : lignes propres à la mécanique (fréquences acceptées, écarts en cents). */
	debugLines?(item: I, observation: unknown): string[];
}
```

`locatePresenter` reprend `buildPromptView` (aide de case, corde dessinée) et `buildCorrection` ; `identifyPresenter` reprend le libellé de case, l’aide par le nom et `buildAnswerChoices`.

### Capteurs

`SessionDeps.sensors: Record<SensorKind, ObservationSource>` :

```ts
interface ObservationSource {
	/** Heure audio corrigée de la latence. Retourne la désinscription. */
	onObservation(callback: (observation: { time: number; payload: unknown }) => void): () => void;
}
```

- `note` enveloppe `NoteDetectorPort.onNote` et retire la latence calibrée.
- `tap` est alimentée par `PlaySessionController.answer(value: string)`, à l’heure de l’horloge audio. `AnswerChoice { value: string; label: string }` remplace `pitch`.

L’ouverture de l’entrée audio ne change pas (toujours au départ, avec les mêmes erreurs affichées).

### Point d’ajout d’une mécanique

Deux listes, sans logique : `domain/mechanics/index.ts` (validation, migration) et `SessionDeps.mechanics: Record<MechanicId, MechanicPresenter>`, câblé dans `createApp`. Un capteur nouveau ajoute une entrée à `SessionDeps.sensors`.

## 4. Session, contrôleur, enregistreur

### Lancement

`AppServices.startSession(kind)` garde sa signature. `createAppServices` construit :

- les **exécutions** : `[locate-neck, identify-neck]`, tempo de locate par `startTempo`, `null` pour identify ;
- le **sélecteur** : `createLearnSelector` (Apprentissage) ou `createListSelector(buildFreePlan(…))` (jeu libre), dont la frontière ne change pas. Le sélecteur d’Apprentissage reçoit le tempo de l’exécution locate à la place de `settings.tempoBpm`.

Tempo du métronome : le seul tempo non nul des exécutions ; `DEFAULT_TEMPO_BPM` s’il n’y en a aucun. Deux tempos non nuls différents lèvent une erreur à la création. Un commentaire renvoie à la décision 4 : la relance du métronome dans une mesure comptée viendra au premier besoin, au même endroit que le changement de scène. Le contrôleur lit déjà le tempo de l’exécution de chaque consigne, pour que ce changement reste local.

### `SessionController`

Ne garde que :

- le cycle de vie : `start`, `pause`, `resume`, `quit`, fin, nouvelle série ;
- la mesure comptée et la scène : changement de scène (présentateur), changement de séquence (`countIn`), aperçu (`previewBeats`) ;
- l’acheminement : les observations du capteur de la mécanique en cours, jugées par `rules.judge`, vont à la manche ; les temps du métronome aussi ;
- la vue, les sons et la piste, à partir des `RoundEvent`. `reveal` n’est montré qu’au `settled`, comme la correction aujourd’hui (pas pendant l’écoute hors temps) ;
- les journaux de détection (`logDetection`), avec les lignes de `debugLines`.

### `AttemptRecorder` (`src/lib/application/session/`)

Reçoit `(planned, outcome, execution, sessionId)` :

1. **Synchrone** : construit l’`Attempt` avec la température provisoire, le pousse dans les essais de la session, et appelle `selector.record`. La fatigue et le choix suivant voient l’essai avant tout `await`, comme aujourd’hui.
2. **Asynchrone** : historique de la carte, température définitive (`probeTemperature` pour un sondage, sinon `classifyTemperature` et les règles actuelles de `temperatureFor`), stockage de l’essai, puis, pour une mécanique `'memory'`, mise à jour de la carte (`applyColdAttempt`, `introduceCard`, résultat du sélecteur) et `selector.cardChanged`.

### Fin de session

En Apprentissage, pour chaque exécution avec tempo : `nextTempo(execution.tempoBpm, essais de cet exercice dans la session)` écrit sa progression si le tempo change. Le jeu libre n’adapte pas le tempo. Le `SessionRecord` porte ses `executions` dès le départ.

### Contrat de l’écran (`application/session/contract.ts`)

- `PlayView.scene: 'guitar' | 'screen'`.
- `PromptView.direction` disparaît.
- `AnswerChoice { value; label }`, `PlaySessionController.answer(value: string)`.
- Le reste ne change pas.

### Interface

- `PlayScreen` et `showsAnswerPad` lisent `scene === 'screen'`.
- `AnswerPad` envoie `choice.value`.
- `DemoPlaySession` et `DemoIdentifySession` suivent le nouveau contrat.
- L’écran Réglages perd la ligne tempo (section 9), avec ses messages et la page `/dev/settings`.

## 5. Stockage

### Dexie version 5

Table `progressions` (`exerciseId`) ajoutée ; les index existants ne changent pas. La mise à niveau réutilise les convertisseurs purs de l’import v1 (`storage/legacy/v1.ts`), un seul endroit pour les deux chemins :

- **Essais** : `mechanic` = `target.direction` ; `exerciseId` selon la mécanique ; `data = { item, answer, confusion }` (`answer` sans son `kind`) ; `tempoBpm` = pour locate, le tempo de la session de l’essai, à défaut le `settings.tempoBpm` stocké, à défaut 80 ; pour identify, `null`. `target`, `answer` et `confusion` au premier niveau disparaissent.
- **Cartes** : `mechanic` + `item` à la place de `target`. Clés inchangées.
- **Sessions** : `executions = [{ exerciseId: 'locate-neck', tempoBpm }, { exerciseId: 'identify-neck', tempoBpm: null }]`, avec le tempo de la session ou, à défaut, celui des réglages ; `tempoBpm` disparaît.
- **Réglages** : un `tempoBpm` stocké devient la progression de `locate-neck`, puis le champ est supprimé. Sans tempo stocké, aucune progression n’est créée (le défaut 80 s’applique).

### Dépôts

Nouveau `ProgressionRepositoryPort` (`get(exerciseId)`, `put`, `all`) et `DexieProgressionRepository`, spécifié par une suite de contrat comme les autres. Fakes ajoutés dans `src/lib/testing/fakes.ts`.

### Changement de calcul délibéré

Aujourd’hui, `isMastered`, `isAcquired` et l’historique d’une carte sont jugés au tempo actuel des réglages. Désormais, chaque essai est jugé à son propre tempo (décision 4). Seuls des essais anciens joués à un autre tempo que l’actuel peuvent changer de statut de rappel direct.

## 6. Sauvegarde

- L’export passe en **version 2** : `settings` sans tempo, `progressions`, `cards`, `attempts` et `sessions` au nouveau format. Aucune définition : elles vivent dans le code (décision 1).
- L’import accepte la **v1** (validation v1 actuelle, conversion par `storage/legacy/v1.ts`, puis validation v2) et la **v2**.
- La validation v2 vérifie : mécanique connue (liste de `domain/mechanics`), cohérence clé ↔ `mechanic` + `item` par `parseItem`, `exerciseId` chaîne non vide, `tempoBpm` positif ou nul, `executions` bien formées, progressions bien formées. L’import des cartes à `leadBeats: 1` continue de les passer à 2.
- Le test d’import de l’export du 2026-10-04 (`legacyImport.spec.ts`) garde sa fixture intacte. Ses attentes suivent le modèle : cartes à 2, 4 et 2 temps, essais à `[1, 4, null]`, progression de `locate-neck` à 80, `inputDeviceId` à null ; la carte bloquée en Learning passe toujours en Review au succès suivant.

## 7. Test de l’abstraction 1 : renversements

Sans la construire, la mécanique « renversements » (mode 3 de `PRODUCT.md`) s’ajoute sans retoucher le cœur. Le domaine accords de Neckspert (`Chord`, `Shape`, `Voicing`, `ChordInstance`) dimensionne les interfaces ; le porter est hors périmètre.

| Besoin                                           | Où il se branche                                                                                          |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Items : accord × renversement × groupe de cordes | `MechanicRules.itemKey` / `parseItem` ; un exercice choisit son sous-ensemble par `params`                |
| Capteur : accord, avec basse                     | `sensor: 'chord'`, un `ObservationSource` de plus dans `SessionDeps.sensors` (classes de hauteur + basse) |
| Juge : classes de hauteur et basse               | `MechanicRules.judge` ; confusion « mauvais renversement » propre à la mécanique, dans `Attempt.data`     |
| Après la réponse : notes et degrés               | `MechanicPresenter.reveal`, montré à chaque verdict réglé                                                 |
| Sur le temps                                     | `timing: beatTiming`, sans changement                                                                     |
| Mémoire FSRS                                     | `learner: 'memory'`, cartes et `applyColdAttempt` sans changement                                         |
| Scène                                            | `scene: 'guitar'`                                                                                         |

Le capteur respecte la décision 6 : la mécanique ne s’appuie que sur ce que le capteur déclare observer.

## 8. Test de l’abstraction 2 : débits

Exercice à venir : passer de noires à croches, triolets, double-croches, quintolets, sextolets, septolets, revenir, ou dans n’importe quel ordre. Un seul exercice, plusieurs débits. Sans le construire, il s’ajoute ainsi :

| Besoin                                  | Où il se branche                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Débit variable d’une consigne à l’autre | un champ `subdivision` sur `PlannedItem`, choisi par le sélecteur de l’exercice ; la manche reçoit la consigne entière |
| Plusieurs attaques par consigne         | une nouvelle `TimingRelation` « grille » dont la manche consomme toutes les attaques et se règle seule                 |
| Points de grille                        | `beatTime(i) + k / n × secondsPerBeat`, fournis à `open`                                                               |
| Tempo fixe, métronome en noires         | l’exécution ; un changement de débit n’est pas un changement de tempo                                                  |
| Mesures point par point                 | agrégat dans les champs communs de l’essai, détail dans `Attempt.data` (rejoint l’étape 2)                             |
| Pas de FSRS : un geste (décision 5)     | `learner: 'skill'`, ajouté avec cet exercice ; l’enregistreur ne met à jour une carte que pour `'memory'`              |

## 9. Changements visibles acceptés

1. **Le tempo sort des Réglages.** L’Apprentissage règle automatiquement le tempo de chaque exercice sur le temps. Le jeu libre tourne au tempo de progression de chaque exercice, sans réglage manuel, jusqu’à l’écran de sélection d’exercice (hors périmètre), qui portera un réglage par exercice.
2. **Historique jugé au tempo de chaque essai** (section 5).

Tout le reste — grille, fenêtres, verdicts, sons, sondage, file d’introduction, miroirs, séquences, corde dessinée, rattrapage, fatigue, bilan, carte du manche — se comporte comme avant.

## 10. Tests

TDD, specs colocalisées.

- **Domaine** : machine à états de `beatTiming` (fenêtre, note trop tôt, première note seule, écoute hors temps bornée, respiration, alignement sur le temps 1, temps perdu) en reprenant les cas de `SessionController.spec.ts` et de `judgeLocate` ; `createFreeTiming` / `identifyTiming` ; `judge`, `itemKey`, `parseItem` des deux mécaniques ; `startTempo` (quatre étages) ; `nextTempo` ; progression avec `timing` explicite ; convertisseurs v1.
- **Application** : `AttemptRecorder` ; `SessionController.spec.ts` conservé comme filet de non-régression, adapté aux nouvelles formes ; **une mécanique factice réservée aux tests** (relation `beat`, capteur factice, juge trivial) jouée de bout en bout par le contrôleur, qui prouve qu’une troisième mécanique passe sans toucher au cœur ; refus d’une session à deux tempos.
- **Stockage** : mise à niveau v4 → v5 sur une base remplie à l’ancien format ; contrats de dépôt, dont `ProgressionRepository` ; import v1 et v2 ; aller-retour export → import ; `legacyImport.spec.ts`.
- **Validation** : `npm test && npm run check`. Après fusion, un passage avec une vraie guitare (`scripts/functional-ui.mjs` et jeu réel) : le contrôleur est réécrit et l’horloge factice ne couvre pas tout.

## 11. Documentation

- `CLAUDE.md` : architecture (domaine `timing/`, `mechanics/`, `exercise/` ; application `mechanics/`, `AttemptRecorder`), règles (tempo par exercice, `settings.tempoBpm` retiré, Dexie version 5, sauvegarde v2).
- `docs/plateforme.md` : étape 1 faite, renvoi à cette spec.
- `PRODUCT.md` : le tempo adaptatif est propre à chaque exercice.

## Hors périmètre

Format déclaratif des exercices, import de définitions, planificateur, portage de Neckspert, nouveaux capteurs, observations brutes (étape 2), modèle de compétence, relation « grille », relance du métronome entre deux exercices sur le temps, écran de sélection d’exercice, module IA.
