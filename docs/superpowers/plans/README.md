# Plans du prototype — feuille de route

Prototype : modes 1 et 2, répétition espacée, tableau de bord de rétention (voir `PRODUCT.md` et `docs/brief.md`). Le travail est découpé pour paralléliser au maximum : un socle court et bloquant, puis des vagues de plans indépendants, chacun dans sa branche.

## Vagues

| Vague | Plans (en parallèle dans une vague) | Dépend de |
|---|---|---|
| 0 | **P0** Socle et contrats | — |
| 1 | **A** Musique · **B** Règles de jeu · **C** Progression · **D** Stockage · **E** Horloge, métronome et sons · **F** Détection de notes · **G** Calibration · **H** Écran de jeu et système visuel | P0 |
| 2 | **I1** Accueil, bilan, carte du manche · **I2** Réponse du mode 2 · **I3** Calibration, réglages, sauvegarde · **J** Orchestration des sessions | vague 1 fusionnée |
| 3 | **K** Intégration | vague 2 fusionnée |

Chemin critique : P0 → H (le plus long de la vague 1) → I2 ou J → K.

## Règles d'exécution parallèle

1. Chaque plan s'exécute dans son propre worktree et sa branche `plan/<id>` (par exemple `plan/a-musique`), créée depuis `main` au début de la vague.
2. **Un plan ne modifie que les chemins qu'il possède** (tableau ci-dessous). Il ne touche jamais `package.json`, `package-lock.json`, `vite.config.ts` ni les fichiers du socle. Toutes les dépendances sont installées par P0.
3. Un plan n'importe, depuis un autre plan de la même vague, **rien du tout**. Il n'utilise que le socle (P0) et, pour les vagues 2 et 3, les plans des vagues précédentes, déjà fusionnés.
4. Les petits utilitaires manquants restent privés au plan qui en a besoin.
5. En fin de vague, les branches sont fusionnées dans `main` une par une, `npm test && npm run check` après chaque fusion.
6. Tests : `*.spec.ts` (Node), `*.svelte.spec.ts` (jsdom). TDD pour toute logique.

## Propriété des chemins

| Plan | Possède |
|---|---|
| P0 | configuration du projet, `src/lib/domain/types.ts`, `src/lib/domain/stats.ts`, `src/lib/domain/music/types.ts`, `src/lib/application/ports/**`, `src/lib/application/session/contract.ts`, `src/lib/application/app.ts`, `src/lib/i18n/index.svelte.ts`, `src/lib/testing/**`, `src/routes/+layout.ts` |
| A | `src/lib/domain/music/**` sauf `types.ts` |
| B | `src/lib/domain/scoring/**` |
| C | `src/lib/domain/progress/**` |
| D | `src/lib/infrastructure/storage/**` |
| E | `src/lib/infrastructure/audio/clock/**`, `src/lib/infrastructure/audio/cues/**` |
| F | `src/lib/infrastructure/audio/detection/**`, `src/routes/diagnostic/**` |
| G | `src/lib/infrastructure/audio/calibration/**` |
| H | `src/lib/ui/**` (sauf `src/lib/ui/screens/**`), `src/routes/session/**`, `src/routes/+layout.svelte`, `static/fonts/**`, `DESIGN.md`, et le monde déjà posé sous `.impeccable/` (brief de session, maquette `comp-4`, état de build de l'écran de jeu) |
| I1 | `src/routes/+page.svelte`, `src/routes/summary/**`, `src/routes/map/**`, `src/lib/ui/screens/home/**`, `src/lib/ui/screens/summary/**`, `src/lib/ui/screens/map/**`, `src/routes/dev/home/**`, `src/routes/dev/summary/**`, `src/routes/dev/map/**` |
| I2 | `src/lib/ui/play/answer/**`, `src/routes/dev/identify/**`, modifications de `src/lib/ui/play/PlayScreen.svelte` (fusionné en vague 1) |
| I3 | `src/routes/calibration/**`, `src/routes/settings/**`, `src/lib/ui/screens/calibration/**`, `src/lib/ui/screens/settings/**`, `src/routes/dev/calibration/**`, `src/routes/dev/settings/**` |
| J | `src/lib/application/session/**` sauf `contract.ts`, `src/lib/application/services/**` |
| K | `src/lib/composition/**`, modifications de `src/routes/+layout.svelte`, suppression des routes `src/routes/dev/**` du build de production si nécessaire |

I1, I2 et I3 ajoutent leurs propres briefs, maquettes et captures sous `.impeccable/surfaces/`, `.impeccable/mocks/` et `.impeccable/review/`, dans des fichiers nommés d'après leur écran. Ils ne modifient pas `DESIGN.md`, le brief de session, `comp-4-full-bleed-lane.png`, les jetons ni les primitives. `.impeccable/build/state.json` est unique : deux plans ne lancent pas `build-phase` en même temps.

## Décisions de produit fixées pour les plans

- **Annonce en mode 1** : la consigne apparaît `leadBeats` temps avant le temps cible. Paliers `LEAD_STEPS = [8, 4, 2, 1]`. Une carte commence à 8 temps (deux mesures) pendant l'apprentissage, raccourcit d'un palier après chaque réussite à froid, et rallonge d'un palier après un échec à froid.
- **Rappel direct** : en mode 1, une réponse juste dont la durée d'annonce (`leadBeats × 60 000 / tempo`) est au plus `RECALL_THRESHOLD_MS`. Le temps de réaction du mode 1 inclut l'annonce, il ne mesure donc pas le rappel : à 80 bpm, une annonce de 2 temps (1 500 ms) est un rappel direct même si la note tombe 10 ms après le temps, une annonce de 4 temps n'en est pas un. En mode 2 (`leadBeats` null), une réponse juste dont `reactionMs` est au plus `RECALL_THRESHOLD_MS`.
- **Temps de réaction** : de l'affichage de la consigne à la réponse (attaque corrigée de la latence en mode 1, toucher en mode 2).
- **Verdict du mode 1** : mauvaise hauteur ou pas de réponse dans la fenêtre → `wrong`. Hauteur juste : `|écart| ≤ PERFECT_WINDOW_MS` (80 ms) → `perfect`, en avance au-delà → `early`, en retard au-delà → `late`. 80 ms est le plancher technique (détection et gigue d'ordonnancement) : la fenêtre ne descend pas en dessous, et jouer sur le temps veut dire dans cette fenêtre.
- **Verdict du mode 2** : nom juste et temps de réaction ≤ `RECALL_THRESHOLD_MS` → `perfect` ; nom juste mais plus lent → `late` ; nom faux → `wrong`. `early` n'existe pas en mode 2.
- **Fenêtre de réponse du mode 1** : de l'affichage de la consigne au temps cible + `LATE_LIMIT_MS`. La première note détectée dans la fenêtre est la réponse ; les suivantes sont ignorées.
- **Session du jour** : remplacée par l'Apprentissage (sélecteur consigne par consigne, 5 minutes, fenêtre glissante) — voir `docs/superpowers/specs/2026-10-02-apprentissage-design.md`.
- **Sondage** (remplace le positionnement le 2026-10-03) : chaque note nouvelle de l'Apprentissage est d'abord demandée sans aide, annonce `leadForThreshold(tempo)` en mode 1. Réussite en rappel direct → carte en révision, apprise et acquise, tentative à froid. Échec → tentative à chaud, carte en apprentissage, aide à la consigne suivante. Voir `docs/superpowers/specs/2026-10-03-sondage-avant-apprentissage-design.md`.
- **Curriculum** : remplacé le 2026-10-02 par une file d'introduction (naturelles puis altérées, cordes alternées, sans case 0) — voir la spec Apprentissage.
- **Acquis** : au moins une réussite en rappel direct, à froid, dans une session postérieure à la session d'introduction (ou au sondage).
- **Maîtrisé** : sur les tentatives à froid, au moins 90 % en rappel direct ; au moins trois sessions distinctes avec une réussite en rappel direct ; au moins 72 h entre les deux dernières sessions réussies.
- **Fatigue** : sur les tentatives de la session, au moins 12 réponses, et, entre les 6 premières et les 6 dernières, une baisse de précision d'au moins 20 points ou une hausse de 25 % du temps de réaction médian. Cette hausse ne regarde que les tentatives du mode 2 : en mode 1, le temps de réaction mesure surtout la durée d'annonce.
- **Sons** : chaque verdict a un son réservé (`SoundCuePort`).
- **Univers visuel** : Game Boy aux couleurs de la guitare (contrat : `.impeccable/surfaces/src-routes-session-page-svelte.md`, maquette approuvée : `.impeccable/mocks/comp-4-full-bleed-lane.png`). Quatre tons stricts, verdicts en sprites (rond, flèche gauche, flèche droite, croix).
- Tous les nombres ci-dessus sont des valeurs de départ, déclarées comme constantes nommées, à calibrer.

## Règles audio partagées

- **Démarrage du métronome** : toujours `metronome.start(clock.now() + 0.1)` au plus tôt. Un temps déjà passé au moment de l'ordonnancement est abandonné (ni clic ni événement).
- **Événements de temps** : `onBeat` arrive jusqu'à 100 ms avant l'heure du temps. Ne jamais supposer `clock.now() >= beat.time`, et comparer les index avec `>=`, jamais `===`.
- **Tempo** : on ne change pas le tempo pendant la marche (`setTempo` lève une erreur). Réglage utilisateur entre 60 et 140 bpm ; bornes techniques du métronome 20 à 300.
- **Pas de fuite du clic dans la détection** : le clic du métronome est une courte rafale de bruit filtré, sans hauteur nette, pour que le détecteur ne la prenne pas pour une note. Les sons de verdict sont brefs (moins de 150 ms) et joués après la réponse.
- **Entrée audio brute** : le détecteur ouvre l'entrée avec `echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false`. Avec le micro de l'appareil, l'écran de calibration recommande un casque.

## Signatures produites par chaque plan

Ces signatures sont le contrat entre plans. Un plan peut ajouter des fonctions privées, mais doit produire exactement celles-ci.

### A — Musique (`src/lib/domain/music/`)

```ts
// fretboard.ts
export function midiOnString(string: StringNumber, fret: number): Midi;
export function pitchOnString(string: StringNumber, fret: number): PitchName;
/** Frets 0..maxFret on `string` whose pitch is `pitch`, ascending. */
export function fretsForPitch(string: StringNumber, pitch: PitchName, maxFret?: number): number[];
/** MIDI notes accepted for a mode 1 target: every octave of the pitch on that string, frets 0..MAX_PLAYABLE_FRET. */
export function acceptableMidis(target: LocateTarget): Midi[];
// naming.ts
/** Naturals keep their name; altered pitches get sharp or flat at random (random() < 0.5 → sharp). */
export function spellPitch(pitch: PitchName, random?: () => number): NoteLabel;
export function formatNote(label: NoteLabel): string; // 'F#', 'Gb', 'F'
export function answerChoiceLabel(pitch: PitchName): string; // 'F', 'F# / Gb'
export function stringLabel(string: StringNumber, locale: Locale): string; // fr: 'corde de E grave' (6), 'corde de A', 'corde de D', 'corde de G', 'corde de B', 'corde de E aiguë' (1) ; en: 'low E string', 'A string', …, 'high E string'
export function fretLabel(fret: number, locale: Locale): string; // fr: 'case 8', 'corde à vide' ; en: 'fret 8', 'open string'
// confusion.ts
/** Null when the played note is acceptable. */
export function classifyNoteConfusion(target: LocateTarget, playedMidi: Midi): Confusion | null;
/** Null when the names match. Delta is the signed pitch-class distance folded into −6..+5. */
export function classifyNameConfusion(expected: PitchName, answered: PitchName): Confusion | null;
// curriculum.ts
export function buildCurriculum(): Curriculum; // ids 'locate-s6-a', 'identify-s6-a', 'locate-s6-b', …
export function placementTargets(): LocateTarget[]; // 72 targets
// index.ts réexporte tout ce qui précède
```

### B — Règles de jeu (`src/lib/domain/scoring/`)

```ts
export const PERFECT_WINDOW_MS = 80;
export const LATE_LIMIT_MS = 400;
export interface Judgement {
	answer: Answer | null;
	correct: boolean;
	verdict: Verdict;
	timingOffsetMs: number | null;
	reactionMs: number | null;
}
/** Times in audio seconds. `onset.time` is raw; latencyMs is subtracted. */
export function answerWindow(promptTime: number, targetTime: number): { opensAt: number; closesAt: number };
export function isInWindow(correctedTime: number, window: { opensAt: number; closesAt: number }): boolean;
export function judgeLocate(input: {
	acceptable: readonly Midi[];
	promptTime: number;
	targetTime: number;
	onset: { time: number; midi: Midi } | null;
	latencyMs: number;
}): Judgement;
/** Times in audio seconds; `answerTime` null means no answer. */
export function judgeIdentify(input: {
	expected: PitchName;
	promptTime: number;
	answerTime: number | null;
	answered: PitchName | null;
}): Judgement;
/** Mode 1 (`leadBeats` set): correct and lead duration ≤ RECALL_THRESHOLD_MS. Mode 2 (`leadBeats` null): correct and reactionMs ≤ RECALL_THRESHOLD_MS. */
export function isDirectRecall(attempt: Pick<Attempt, 'correct' | 'reactionMs' | 'leadBeats'>, tempoBpm: number): boolean;
/** `attempts` of one session, oldest first. */
export function detectFatigue(attempts: readonly Attempt[]): boolean;
// index.ts réexporte tout
```

### C — Progression (`src/lib/domain/progress/`)

```ts
export const MIN_COLD_DELAY_MS = 60 * 60 * 1000;
export const DAILY_COLD_CAP = 20;
export const NEW_PER_SESSION = 3;
export const UNLOCK_RATIO = 0.8;
export const MASTERY_ACCURACY = 0.9;
export const MASTERY_SESSIONS = 3;
export const MASTERY_MIN_GAP_MS = 72 * 60 * 60 * 1000;
export const NEXT_SESSION_GAP_MS = 2 * 60 * 60 * 1000;
/** Reviews and placement only. Learning and free play keep the temperature stamped on the plan (`hot`): a first learning attempt has no previous attempt, so this function would call it cold. */
export function classifyTemperature(input: { lastAttemptAt: number | null; attemptedInSession: boolean; now: number }): Temperature;
export function leadForThreshold(tempoBpm: number): LeadBeats; // longest step whose duration ≤ RECALL_THRESHOLD_MS, at least 1
export function introduceCard(target: Target, now: number, sessionId: string): CardState; // New state, due = now + MIN_COLD_DELAY_MS, leadBeats 8 (identify: 1)
/** `history`: every attempt of this card, oldest first, `attempt` included. */
export function applyColdAttempt(state: CardState, attempt: Attempt, history: readonly Attempt[], now: number, tempoBpm: number): CardState;
export function placementCard(target: LocateTarget, attempt: Attempt, now: number, sessionId: string, tempoBpm: number): CardState | null;
export function isAcquired(state: CardState, history: readonly Attempt[], tempoBpm: number): boolean;
export function isMastered(history: readonly Attempt[], tempoBpm: number): boolean;
export function cardStatus(state: CardState | undefined): CardStatus;
export function unlockedSets(curriculum: Curriculum, cards: readonly CardState[]): CurriculumSet[];
export function nextNewTargets(curriculum: Curriculum, cards: readonly CardState[], count: number): Target[];
export function buildDailyPlan(input: { cards: readonly CardState[]; curriculum: Curriculum; now: number; sessionId: string; skipLearning?: boolean }): SessionPlan;
export function buildPlacementPlan(input: { targets: readonly LocateTarget[]; now: number; sessionId: string; tempoBpm: number; random?: () => number }): SessionPlan;
export function buildFreePlan(input: { cards: readonly CardState[]; now: number; sessionId: string; count?: number; random?: () => number }): SessionPlan;
export function nextSuggestedAt(cards: readonly CardState[], now: number): number | null;
export function computeHomeStats(input: { cards: readonly CardState[]; attempts: readonly Attempt[]; settings: Settings; curriculum: Curriculum; now: number }): HomeStats;
export function summarizeSession(input: { record: SessionRecord; attempts: readonly Attempt[]; cards: readonly CardState[]; now: number }): SessionSummary;
/** 72 cells: strings 1..6, frets 0..11. `pitchAt` is injected to avoid depending on plan A. */
export function buildNeckMap(input: { cards: readonly CardState[]; attempts: readonly Attempt[]; pitchAt: (string: StringNumber, fret: number) => PitchName }): NeckMapCell[];
// index.ts réexporte tout
```

C utilise `ts-fsrs` (`fsrs`, `createEmptyCard`, `Rating`, `generatorParameters`) et convertit vers `SchedulingState`. C ne dépend pas de A : les courriculums de test sont des fixtures. C ne dépend pas de B non plus : il reprend la définition du rappel direct ci-dessus (durée d'annonce en mode 1, `reactionMs` en mode 2), avec le tempo des réglages.

### D — Stockage (`src/lib/infrastructure/storage/`)

```ts
export class NeckspertDb extends Dexie { /* tables attempts (++id, cardKey, sessionId, promptedAt), cards (key), sessions (id, startedAt), settings (id) */ }
export function createDatabase(name?: string): NeckspertDb; // default 'neckspert-play'
export class DexieAttemptRepository implements AttemptRepositoryPort { constructor(db: NeckspertDb) }
export class DexieCardStateRepository implements CardStateRepositoryPort { constructor(db: NeckspertDb) }
export class DexieSessionRepository implements SessionRepositoryPort { constructor(db: NeckspertDb) }
export class DexieSettingsRepository implements SettingsRepositoryPort { constructor(db: NeckspertDb) }
export class DexieBackup implements BackupPort { constructor(db: NeckspertDb, now?: () => number) }
export function validateBackup(file: unknown): BackupFile; // throws Error with a readable message
export function downloadBackup(file: BackupFile): void; // browser: JSON download named neckspert-play-YYYY-MM-DD.json
export function readBackupFile(file: File): Promise<unknown>;
```

### E — Horloge, métronome et sons (`src/lib/infrastructure/audio/clock/`, `src/lib/infrastructure/audio/cues/`)

```ts
export class WebAudioClock implements AudioClockPort { constructor(createContext?: () => AudioContext); context(): AudioContext /* throws before resume() */ }
export class WebAudioMetronome implements MetronomePort { constructor(context: () => AudioContext, options?: { beatsPerBar?: number; lookaheadMs?: number; scheduleAheadS?: number }) }
/** Pure scheduling step, unit-tested: indexes of beats to schedule in (now, now + horizon]. */
export function beatsToSchedule(input: { nextIndex: number; firstBeatTime: number; secondsPerBeat: number; now: number; horizon: number }): number[];
export class WebAudioCues implements SoundCuePort { constructor(context: () => AudioContext) }
```

Le métronome n'utilise un minuteur que pour réveiller l'ordonnanceur ; tous les temps viennent de `AudioContext.currentTime`. `onBeat` est appelé au moment de l'ordonnancement, avec l'heure audio exacte du temps.

### F — Détection de notes (`src/lib/infrastructure/audio/detection/`)

```ts
export class WebAudioNoteDetector implements NoteDetectorPort { constructor(context: () => AudioContext, options?: Partial<DetectorConfig>) }
export interface DetectorConfig { minMidi: number; maxMidi: number; clarityThreshold: number; onsetRatio: number; minRms: number; cooldownMs: number; windowSize: number }
export const DEFAULT_DETECTOR_CONFIG: DetectorConfig; // guitare : minMidi 40, maxMidi 88
/** Continuous MIDI (A4 = 440 Hz → 69), so cents are 100 × (frequencyToMidi(f) − rounded). */
export function frequencyToMidi(frequencyHz: number): number;
/** Rounded and clamped to [minMidi, maxMidi]. This is the MIDI stored on a NoteOnset. */
export function midiFromFrequency(frequencyHz: number, minMidi: number, maxMidi: number): Midi;
export class OnsetDetector { constructor(config: DetectorConfig, sampleRate: number); /** Returns the onset time (audio s) or null. */ push(frame: Float32Array, frameTime: number): number | null }
export function estimatePitch(samples: Float32Array, sampleRate: number, clarityThreshold: number): { frequencyHz: number; clarity: number } | null;
/** Glues onset and pitch: emits one NoteOnset per attack, once the pitch is stable. */
export class NoteTracker { constructor(config: DetectorConfig, sampleRate: number); push(frame: Float32Array, frameTime: number): NoteOnset | null }
```

Capture par `AudioWorklet` (le processeur transmet des blocs avec l'heure audio de leur premier échantillon). Le suivi de note se teste avec des signaux synthétiques (cordes pincées : harmoniques amorties). Page `/diagnostic` utilitaire : niveau, dernière note, écart en cents, horodatage.

### G — Calibration (`src/lib/infrastructure/audio/calibration/`)

```ts
export interface CalibrationConfig { bpm: number; hitsNeeded: number; maxSpreadMs: number; noSoundBeats: number }
export const DEFAULT_CALIBRATION_CONFIG: CalibrationConfig; // 80 bpm, 10 frappes, dispersion max 40 ms, abandon après 32 temps sans son
/** Median offset and median absolute deviation of the offsets it receives. Null when the spread exceeds maxSpreadMs. */
export function computeCalibration(offsetsMs: readonly number[], maxSpreadMs: number): { offsetMs: number; spreadMs: number } | null;
export class CalibrationService implements CalibrationPort {
	constructor(deps: { clock: AudioClockPort; metronome: MetronomePort; detector: NoteDetectorPort; deviceId: () => Promise<string | null> }, config?: Partial<CalibrationConfig>);
}
```

Le guitariste joue une corde étouffée ou une note sur chaque clic. L'écart est mesuré entre l'attaque brute et le temps annoncé le plus proche. Le service écarte les attaques à plus d'un demi-temps de tout temps annoncé, puis passe les écarts retenus à `computeCalibration`. Il n'enregistre rien ; l'écran (I3) enregistre l'écart dans les réglages.

### H — Écran de jeu et système visuel (`src/lib/ui/`, `src/routes/session/`)

Construit selon le parcours comp-led d'impeccable (phases `build-phase` : spec, plates, hero, sections, motion, responsive, review, puis `DESIGN.md` par le documenter), à partir de la maquette approuvée et du contrat de direction. Produit :

```ts
// src/lib/ui/tokens.css : quatre tons, grille 8 px, police pixel, espacements ; importé par src/routes/+layout.svelte
// Primitives réutilisables par les autres écrans :
// src/lib/ui/primitives/PixelBox.svelte ({ variant: 'plain' | 'double' | 'inverted'; children })
// src/lib/ui/primitives/PixelButton.svelte ({ onclick; disabled?; size?: 'large' | 'huge'; children })
// src/lib/ui/primitives/VerdictSprite.svelte ({ verdict: Verdict; size?: number; inverted?: boolean })
// src/lib/ui/primitives/PixelText.svelte ({ as?: string; scale?: 1 | 2 | 3 | 4 | 8; children })
// src/lib/ui/play/PlayScreen.svelte ({ controller: PlaySessionController })
// src/lib/ui/play/lane.ts : laneTiles(input: { nowBeat: number; beatsPerBar: number; promptBeatIndex: number | null; targetBeatIndex: number | null; history: readonly LaneEntry[]; beatsBefore: number; beatsAfter: number }): LaneTile[] (pure, testée)
// src/lib/ui/play/barLabel.ts : barLabel(input: { nowBeat: number; promptBeatIndex: number; targetBeatIndex: number; beatsPerBar: number }): { bar: number; bars: number; beat: number } (pure, testée)
// src/lib/ui/play/demo/DemoPlaySession.svelte.ts : class DemoPlaySession implements PlaySessionController (scénario scripté, sans audio)
// src/routes/session/+page.svelte : lit ?kind=placement|daily|free, obtient le contrôleur par useAppServices().startSession(kind), affiche PlayScreen
// src/routes/session/demo/+page.svelte : PlayScreen avec DemoPlaySession
// src/routes/+layout.svelte : importe tokens.css et la police ; rend children
```

### I1 — Accueil, bilan, carte du manche

Composants de présentation alimentés par props (`HomeScreen`, `SummaryScreen`, `NeckMapScreen` sous `src/lib/ui/screens/…`), routes minces qui lisent `useAppServices()`, pages `src/routes/dev/…` avec des données de démonstration pour la vérification visuelle. Utilise les primitives et jetons de H. Accueil : un seul bouton (positionnement, session du jour, ou heure de la prochaine révision) et un seul chiffre (temps de réaction médian à froid et sa tendance). Bilan : précision et temps médian à froid, positions apprises, fatigue, heure conseillée de la prochaine session. Carte du manche : 6 cordes × 12 cases, statut par sens.

### I2 — Réponse du mode 2

`src/lib/ui/play/answer/AnswerPad.svelte` ({ choices: AnswerChoice[]; disabled: boolean; onanswer: (pitch: PitchName) => void }) : douze grands boutons, premier toucher retenu, désactivés hors de `awaiting`. Intégration dans `PlayScreen` quand `view.prompt.direction === 'identify'` : le pavé remplace la piste de tuiles. Scénario de démonstration du mode 2 ajouté au dossier `src/lib/ui/play/answer/`.

### I3 — Calibration, réglages, sauvegarde

Écran `/calibration` (choix de l'entrée via `detector.listInputs()`, niveau via `detector.onLevel`, lancement de `calibration.run`, enregistrement de `calibrationOffsetMs` et `inputDeviceId` dans les réglages). Écran `/settings` (langue, tempo, entrée audio, lien vers la calibration, export via `backup.exportAll` + `downloadBackup`, import via `readBackupFile` + `backup.importAll`, avec confirmation avant remplacement).

### J — Orchestration des sessions (`src/lib/application/session/`, `src/lib/application/services/`)

```ts
export interface SessionDeps {
	clock: AudioClockPort; metronome: MetronomePort; detector: NoteDetectorPort; cues: SoundCuePort;
	attempts: AttemptRepositoryPort; cards: CardStateRepositoryPort; sessions: SessionRepositoryPort; settings: SettingsRepositoryPort;
	curriculum: Curriculum; now: () => number; random: () => number; newId: () => string;
}
// src/lib/application/session/SessionController.svelte.ts
export class SessionController implements PlaySessionController { constructor(plan: SessionPlan, deps: SessionDeps) }
// src/lib/application/services/createAppServices.ts
export function createAppServices(deps: SessionDeps & { backup: BackupPort; calibration: CalibrationPort }): AppServices;
```

Machine à états d'une série ; décompte ; consigne à `promptBeatIndex`, cible à `promptBeatIndex + leadBeats` ; première note dans la fenêtre ; jugement (B), confusion (A), température (C), mise à jour de carte (C), enregistrement de la tentative, son du verdict, historique de la piste ; apprentissage répété jusqu'à réussite ; fatigue. Testé entièrement avec les doublures de P0.

### K — Intégration (`src/lib/composition/`)

`createApp(): AppServices` câble les implémentations réelles (un seul `AudioContext` partagé), `src/routes/+layout.svelte` fournit les services et applique la langue des réglages, exclusion des pages `dev` en production, build statique, `impeccable detect` sur toutes les interfaces, liste de vérification manuelle avec une vraie guitare.

## Index des plans

| Plan | Fichier |
|---|---|
| P0 | `2026-09-30-p0-socle-et-contrats.md` |
| A | `2026-09-30-a-musique.md` |
| B | `2026-09-30-b-regles-de-jeu.md` |
| C | `2026-09-30-c-progression.md` |
| D | `2026-09-30-d-stockage.md` |
| E | `2026-09-30-e-horloge-metronome-sons.md` |
| F | `2026-09-30-f-detection-de-notes.md` |
| G | `2026-09-30-g-calibration.md` |
| H | `2026-09-30-h-ecran-de-jeu.md` |
| I1 | `2026-09-30-i1-accueil-bilan-carte.md` |
| I2 | `2026-09-30-i2-reponse-mode-2.md` |
| I3 | `2026-09-30-i3-calibration-reglages-sauvegarde.md` |
| J | `2026-09-30-j-orchestration.md` |
| K | `2026-09-30-k-integration.md` |
| Sondage | `2026-10-03-sondage-avant-apprentissage.md` |
