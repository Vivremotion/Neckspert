# Journal d’essais : observations brutes — plan d’implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** chaque essai garde toutes les observations de sa plage (notes lisibles, attaques rejetées, taps), avec leur sort et l’avis du juge ; chaque session garde la latence retirée.

**Architecture:** le détecteur expose ses rejets (`onRejected`), `noteSensor` les émet comme observations illisibles. Le contrôleur ouvre une `ObservationSpan` à chaque manche, y classe chaque observation, passe l’instantané à `AttemptRecorder.record` au verdict et complète la liste (`setObservations`) à la fermeture de la plage. Stockage : Dexie version 6, sauvegarde version 3.

**Tech Stack:** TypeScript, Svelte 5 (runes), Vitest (projets `server` / `client`), Dexie + `fake-indexeddb`.

**Spec:** `docs/superpowers/specs/2026-10-06-journal-observations-design.md` (à lire avant chaque tâche).

## Global Constraints

- Node 22 via `.nvmrc` : lancer `source ~/.nvm/nvm.sh && nvm use` avant `npm`/`npx`.
- Porte de fusion de chaque tâche : `npm test && npm run check`, puis `npm run lint` (sinon `npm run format`).
- Aucun verdict, seuil ou écran ne change. Les specs existantes de `domain/` passent sans modification de leurs attentes (seules les fabriques d’essais gagnent le nouveau champ).
- Le cœur (`SessionController`, `AttemptRecorder`, `ObservationSpan`, `sensors.ts` hors `noteSensor`) ne nomme jamais `'locate'` ni `'identify'`.
- Code, identifiants et commentaires en anglais ; commits Conventional Commits en minuscules, impératifs, avec la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `expect.requireAssertions` est actif : chaque test asserte. Specs Dexie : `import 'fake-indexeddb/auto'`.
- Valeurs fixées par la spec : `fate` ∈ `'answer' | 'before-window' | 'settled' | 'after-capture' | 'other-sensor' | 'unreadable'` ; `reason` ∈ `'no-pitch' | 'unclear' | 'unstable' | 'out-of-range'`, déterminé dans cet ordre ; `observations: null` = essai d’avant l’étape 2 ; `latencyMs: null` = session d’avant l’étape 2.

## Review Focus

1. **Arrêt pendant un complément** : `quit()` pendant la respiration, puis une note qui arrive encore → aucune écriture après la `SessionRecord` de fin, aucune exception (tâche 8).
2. **Mesure comptée entre deux séquences** : une note jouée pendant un changement de scène va à l’essai précédent en `'settled'`, une note pendant le décompte initial ou après reprise n’est enregistrée nulle part (tâche 8).
3. **Pause pendant la capture hors temps puis reprise** : l’essai abandonné garde les observations d’avant la pause et aucune d’après (tâche 8).
4. **Sauvegarde mêlant anciens et nouveaux essais** : un export contenant `observations: null` et des listes non vides, et des sessions à `latencyMs: null`, se réimporte à l’identique (tâche 4).
5. **Rejet sans hauteur** : `frequencyHz` vaut 0 (jamais `NaN`), la charge survit à un aller-retour JSON (tâche 2).

---

### Task 1: Modèle de données

**Files:**

- Modify: `src/lib/domain/types.ts` (`Attempt`, `SessionRecord`, nouveaux types)
- Modify: `src/lib/application/session/AttemptRecorder.ts` (écrit `observations: []` en attendant la tâche 7)
- Modify: `src/lib/application/session/SessionController.svelte.ts` (les deux `sessions.put` portent `latencyMs: this.latencyMs`)
- Modify: fabriques d’essais et de sessions des specs : `src/lib/infrastructure/storage/testing/fixtures.ts`, `src/lib/testing/fakes.spec.ts`, `src/lib/domain/progress/{cards,stats,success,learnSelector,review}.spec.ts`, `src/lib/domain/scoring/fatigue.spec.ts`, et toute autre que `npm run check` signale
- Test: `src/lib/application/session/SessionController.spec.ts`

**Interfaces:**

- Produces (dans `domain/types.ts`) :

  ```ts
  type ObservationFate = 'answer' | IgnoreReason | 'other-sensor' | 'unreadable';
  interface RecordedObservation<P = unknown> {
  	atMs: number;
  	sensor: string;
  	fate: ObservationFate;
  	correct: boolean | null;
  	payload: P;
  }
  // Attempt<D> gagne : observations: RecordedObservation[] | null;
  // SessionRecord gagne : latencyMs: number | null;
  ```

  `IgnoreReason` s’importe de `$lib/domain/timing/types` (type seulement, pas de cycle à l’exécution).

- [ ] **Step 1: test qui échoue** — dans `SessionController.spec.ts`, `it('stores the calibrated latency with the session')` : réglages avec `calibrationOffsetMs: 42`, démarrer une session, puis `expect((await sessions.get(id))?.latencyMs).toBe(42)` au départ et après `quit()`. Sans calibration (`null`) : `latencyMs` vaut 0.
- [ ] **Step 2:** `npx vitest run src/lib/application/session/SessionController.spec.ts -t "latency"` → FAIL.
- [ ] **Step 3:** ajouter les types, `latencyMs` aux deux `sessions.put`, `observations: []` dans l’essai construit par `AttemptRecorder.record` ; fabriques : `observations: []` pour les essais, `latencyMs: 0` pour `makeSession`.
- [ ] **Step 4:** `npm test && npm run check` → tout passe.
- [ ] **Step 5:** commit `feat: record the calibrated latency of each session`.

### Task 2: Rejets du détecteur

**Files:**

- Modify: `src/lib/application/ports/NoteDetectorPort.ts`
- Modify: `src/lib/infrastructure/audio/detection/NoteTracker.ts`, `WebAudioNoteDetector.ts`
- Modify: `src/lib/testing/fakes.ts` (`FakeNoteDetector`), et tout autre objet qui implémente `NoteDetectorPort` (`npm run check` les signale)
- Test: `NoteTracker.spec.ts`, `WebAudioNoteDetector.spec.ts`, `src/lib/testing/fakes.spec.ts`

**Interfaces:**

- Produces :

  ```ts
  // ports/NoteDetectorPort.ts
  type NoteRejectionReason = 'no-pitch' | 'unclear' | 'unstable' | 'out-of-range';
  interface PitchWindow { frequencyHz: number; clarity: number }
  interface NoteRejection { time: number; reason: NoteRejectionReason; attack: PitchWindow; sustain: PitchWindow }
  // NoteDetectorPort gagne :
  onRejected(callback: (rejection: NoteRejection) => void): () => void;
  // NoteTracker : constructor(config, sampleRate, onRejected?: (rejection: NoteRejection) => void)
  // FakeNoteDetector gagne : emitRejection(rejection: NoteRejection): void  (silencieux quand arrêté, comme emitNote)
  ```

  `NoteTracker.push` garde sa signature et son retour (`NoteOnset | null`) : les specs existantes ne changent pas.

- [ ] **Step 1: tests qui échouent** — `NoteTracker.spec.ts` : `describe('rejections')` avec un test par motif, chacun vérifiant `reason`, `time` égal à l’attaque, et `attack`/`sustain` égaux aux deux lectures. Signaux : silence/bruit après une attaque → `'no-pitch'` ; seuils de clarté poussés à 0.999 via la config → `'unclear'` ; deux plucks de hauteurs différentes collés (glissando) → `'unstable'` ; `minMidi: 60` et un pluck à E2 → `'out-of-range'`. Un pluck valide n’appelle jamais `onRejected`. Pour `'no-pitch'`, `expect(Number.isFinite(rejection.attack.frequencyHz)).toBe(true)` et `JSON.parse(JSON.stringify(rejection))` égal à `rejection`. `WebAudioNoteDetector.spec.ts` : un rejet du tracker arrive aux abonnés de `onRejected`, pas à ceux de `onNote`. `fakes.spec.ts` : `emitRejection` n’atteint les abonnés que pendant `running`.
- [ ] **Step 2:** `npx vitest run src/lib/infrastructure/audio/detection src/lib/testing` → FAIL.
- [ ] **Step 3:** dans `tryConfirm`, construire le `NoteRejection` aux deux endroits où il loggue déjà un rejet (le motif suit l’ordre de la spec : fenêtre sans fréquence, puis clarté, puis écart, puis plage) et appeler `onRejected`. Le journal `logDetection` reste. `WebAudioNoteDetector` crée le tracker avec un callback qui diffuse aux `rejectionListeners`.
- [ ] **Step 4:** `npm test && npm run check` → passe.
- [ ] **Step 5:** commit `feat: report the attacks the detector cannot read`.

### Task 3: Dépôt d’essais et Dexie version 6

**Files:**

- Modify: `src/lib/application/ports/repositories.ts`, `src/lib/infrastructure/storage/DexieAttemptRepository.ts`, `src/lib/infrastructure/storage/db.ts`, `src/lib/testing/fakes.ts` (`InMemoryAttemptRepository`)
- Test: `src/lib/infrastructure/storage/testing/attemptRepositoryContract.ts`, `src/lib/infrastructure/storage/db.spec.ts`

**Interfaces:**

- Produces : `AttemptRepositoryPort.setObservations(id: number, observations: RecordedObservation[]): Promise<void>` — remplace la liste de l’essai `id`, ne touche aucun autre champ ; rejette (`Error`) si l’id n’existe pas.

- [ ] **Step 1: tests qui échouent** — contrat : `it('replaces the observations of a stored attempt')` (après `add` puis `setObservations(id, [obs])`, `all()` rend l’essai avec `observations: [obs]` et les autres champs intacts) ; `it('rejects observations for an unknown attempt')` (`await expect(repo.setObservations(999, [])).rejects.toThrow()`). `db.spec.ts` : une base ouverte en version 5 avec un essai et une session au format v5, rouverte en version 6 → essai à `observations: null`, session à `latencyMs: null`, le reste inchangé (suivre le modèle des tests de mise à niveau existants dans ce fichier).
- [ ] **Step 2:** `npx vitest run src/lib/infrastructure/storage src/lib/testing` → FAIL.
- [ ] **Step 3:** Dexie : `this.version(6).stores({ ...stores, progressions: 'exerciseId' }).upgrade(...)` qui pose `observations = null` et `latencyMs = null` via `toCollection().modify`. Dépôt Dexie : `update` puis échec si le nombre de lignes modifiées vaut 0.
- [ ] **Step 4:** `npm test && npm run check` → passe.
- [ ] **Step 5:** commit `feat: store the observations of an attempt`.

### Task 4: Sauvegarde version 3

**Files:**

- Modify: `src/lib/domain/types.ts` (`BackupFile.version: 3`), `src/lib/infrastructure/storage/DexieBackup.ts`, `src/lib/infrastructure/storage/validateBackup.ts`
- Create: `src/lib/infrastructure/storage/legacy/v2.ts` (`fromV2`)
- Test: `validateBackup.spec.ts`, `DexieBackup.spec.ts`, `legacy/v2.spec.ts`, `legacyImport.spec.ts` (attentes seulement, fixture intacte)

**Interfaces:**

- Consumes : `RecordedObservation`, `ObservationFate` (tâche 1).
- Produces : `validateBackupV3(file: unknown): BackupFile` ; `fromV2(file: Fields): Fields` (essais sans `observations` → `null`, sessions sans `latencyMs` → `null`, `version: 3`) ; `validateBackup` : v1 → `validateBackupV3(fromV2(fromV1(validateBackupV1(file), now)))`, v2 → `validateBackupV3(fromV2(validateBackupV2(file)))`, v3 → `validateBackupV3(file)`.

- [ ] **Step 1: tests qui échouent** — `validateBackup.spec.ts` : un fichier v3 valide passe ; refusé avec un message qui nomme le champ : `observations` ni null ni tableau, `atMs` non fini, `sensor` vide, `fate: 'maybe'`, `correct: 'yes'`, `payload` absent, `latencyMs: 'x'`. `legacy/v2.spec.ts` : `fromV2` pose les deux null et ne touche rien d’autre. `DexieBackup.spec.ts` : l’export est en version 3 ; l’aller-retour d’un état mêlant `observations: null`, `[]` et une liste non vide, et des sessions à `latencyMs` null et 12, rend l’état identique (Review Focus 4) ; un fichier v2 s’importe avec les null. `legacyImport.spec.ts` : ses essais importés ont `observations: null`, ses sessions `latencyMs: null`.
- [ ] **Step 2:** `npx vitest run src/lib/infrastructure/storage` → FAIL.
- [ ] **Step 3:** `checkObservations(value)` et le contrôle de `latencyMs` dans `validateBackup.ts`, appelés par `validateBackupV3` (qui reprend les contrôles de v2) ; `validateBackupV2` reste pour l’entrée v2 et n’exige pas les nouveaux champs. Export : `version: 3`.
- [ ] **Step 4:** `npm test && npm run check` → passe.
- [ ] **Step 5:** commit `feat: export observations and latency in backup version 3`.

### Task 5: Observations lisibles et illisibles

**Files:**

- Modify: `src/lib/application/session/sensors.ts`, `src/lib/application/session/SessionController.svelte.ts` (`onObservation` : une observation illisible est loggée et ignorée, en attendant la tâche 8), `src/lib/domain/mechanics/locate.ts` et `src/lib/application/mechanics/locate.ts` (charge sans `time`)
- Test: `sensors.spec.ts`, `src/lib/application/mechanics/locate.spec.ts`, `SessionController.spec.ts`

**Interfaces:**

- Consumes : `NoteRejection`, `onRejected`, `emitRejection` (tâche 2).
- Produces :

  ```ts
  interface Observation {
  	time: number;
  	payload: unknown;
  	readable: boolean;
  }
  // payload lisible de 'note' : NotePayload
  type NotePayload = Pick<NoteOnset, 'midi' | 'frequencyHz' | 'clarity'>; // exporté par sensors.ts
  // payload illisible de 'note' : Omit<NoteRejection, 'time'>
  ```

  Le juge de `locate` et `locatePresenter.debugLines` reçoivent `NotePayload` ; la mention « t brut » quitte `debugLines`.

- [ ] **Step 1: tests qui échouent** — `sensors.spec.ts` : `noteSensor` avec `latencyMs: 30` émet pour une note `{ time: t - 0.03, payload: { midi, frequencyHz, clarity }, readable: true }` (pas de `time` dans la charge) et pour un rejet `{ time: t - 0.03, payload: { reason, attack, sustain }, readable: false }` ; le désabonnement coupe les deux flux ; `tapSensor` émet `readable: true`. `SessionController.spec.ts` : un rejet émis pendant l’attente ne règle pas la manche (`view.status` reste `'awaiting'`, aucun essai).
- [ ] **Step 2:** `npx vitest run src/lib/application` → FAIL.
- [ ] **Step 3:** implémenter ; `onObservation` retourne tôt sur `!observation.readable` avec un `logDetection('observation illisible', …)`.
- [ ] **Step 4:** `npm test && npm run check` → passe.
- [ ] **Step 5:** commit `feat: emit the detector rejections as unreadable observations`.

### Task 6: `ObservationSpan`

**Files:**

- Create: `src/lib/application/session/observationSpan.ts`
- Test: `src/lib/application/session/observationSpan.spec.ts`

**Interfaces:**

- Consumes : `Observation` (tâche 5), `RecordedObservation`, `ObservationFate` (tâche 1), `PlannedItem`.
- Produces :

  ```ts
  class ObservationSpan {
  	constructor(promptTime: number, planned: PlannedItem);
  	readonly planned: PlannedItem;
  	add(
  		sensor: string,
  		observation: Observation,
  		fate: ObservationFate,
  		correct: boolean | null
  	): void;
  	snapshot(): RecordedObservation[]; // copie
  	close(): RecordedObservation[]; // add() lève une Error ensuite
  }
  ```

  `atMs = (observation.time - promptTime) * 1000`, sans arrondi.

- [ ] **Step 1: tests qui échouent** — `atMs` relatif (observation 0,25 s après → 250, `toBeCloseTo`) ; négatif avant la consigne ; `sensor`, `fate`, `correct`, `payload` recopiés ; `snapshot()` n’est pas affecté par un `add` ultérieur ; plage vide → `[]` ; `add` après `close` lève.
- [ ] **Step 2:** `npx vitest run src/lib/application/session/observationSpan.spec.ts` → FAIL.
- [ ] **Step 3:** implémenter.
- [ ] **Step 4:** `npm test && npm run check` → passe.
- [ ] **Step 5:** commit `feat: collect the observations of one prompt`.

### Task 7: L’enregistreur écrit et complète

**Files:**

- Modify: `src/lib/application/session/AttemptRecorder.ts`
- Test: `src/lib/application/session/AttemptRecorder.spec.ts`

**Interfaces:**

- Consumes : `setObservations` (tâche 3), `RecordedObservation` (tâche 1).
- Produces :

  ```ts
  record(planned, outcome, promptTime, judged, execution, observations: RecordedObservation[]): { attempt; stored: Promise<void> };
  /** Waits for the attempt's write, then replaces its observations. No-op for an attempt this recorder did not record. */
  completeObservations(attempt: Attempt, observations: RecordedObservation[]): Promise<void>;
  /** Settles once every write and completion started so far has settled. */
  settled(): Promise<void>;
  ```

  Le recorder garde, par essai, la promesse de son identifiant (celle de `attempts.add`). `completeObservations` met aussi `attempt.observations = observations` en mémoire, de façon synchrone.

- [ ] **Step 1: tests qui échouent** — l’essai stocké porte l’instantané passé à `record` ; après `completeObservations(attempt, full)`, `attempts.all()` rend `full` ; `completeObservations` appelé avant la résolution de `stored` (dépôt dont `add` est retardé par une promesse contrôlée) écrit quand même `full` après l’essai ; `settled()` attend les compléments ; un essai inconnu → aucune écriture.
- [ ] **Step 2:** `npx vitest run src/lib/application/session/AttemptRecorder.spec.ts` → FAIL.
- [ ] **Step 3:** implémenter ; mettre à jour l’appel dans le contrôleur avec `[]` pour garder la porte verte (la tâche 8 branche la plage).
- [ ] **Step 4:** `npm test && npm run check` → passe.
- [ ] **Step 5:** commit `feat: complete an attempt with the observations that follow its verdict`.

### Task 8: Le contrôleur classe et rattache

**Files:**

- Modify: `src/lib/application/session/SessionController.svelte.ts`
- Test: `SessionController.spec.ts`, `thirdMechanic.spec.ts`

**Interfaces:**

- Consumes : `ObservationSpan` (tâche 6), `record(…, observations)`, `completeObservations`, `settled()` (tâche 7), `Observation.readable` (tâche 5).

Règles (spec, section 3) : la plage s’ouvre dans `beginNextItem` (après avoir fermé la précédente) ; elle se ferme aussi dans `pause()` (après `abandonRound`), `quit()` et `finish()`. Une plage se souvient de l’essai produit par sa manche (renseigné dans `persistAttempt`) ; à sa fermeture, `completeObservations(attempt, span.close())` si un essai existe. Classement dans `onObservation`, dans cet ordre : pas de plage → log seulement ; illisible → `'unreadable'`, `null` ; capteur ≠ `presenterFor(span.planned).sensor` → `'other-sensor'`, `null` ; plage dont la manche est nulle → `'settled'`, avis du juge de `span.planned` ; sinon `round.observe` → `'answer'` si `settled`, `event.reason` si `ignored`. `finish()` attend `recorder.settled()` avant le `sessions.put` final ; après `finish`, aucune observation n’est plus classée.

- [ ] **Step 1: tests qui échouent** — `SessionController.spec.ts`, `describe('observations')` en mode 1 (locate) avec le détecteur factice :
  - un même essai reçoit dans l’ordre : une note avant la fenêtre (`'before-window'`), la réponse (`'answer'`, `correct: true`), une seconde note avant la fin de la manche (`'settled'`), une note pendant la respiration (`'settled'`), un rejet (`'unreadable'`, `correct: null`) ; `atMs` de la réponse ≈ son écart à la consigne ; l’essai est écrit au verdict avec les deux premières, puis complété avec les cinq à l’ouverture de la consigne suivante ;
  - une note pendant le décompte initial n’apparaît dans aucun essai (Review Focus 2) ;
  - une note pendant la mesure comptée d’un changement de scène va à l’essai précédent en `'settled'` (Review Focus 2) ;
  - en mode 2, une note jouée à la guitare pendant la consigne → `'other-sensor'`, `correct: null`, et la manche attend toujours le tap ;
  - pause pendant la capture hors temps : l’essai garde ce qui précède la pause, rien d’après la reprise (Review Focus 3) ;
  - `quit()` pendant la respiration puis une note : la liste complétée est écrite avant la `SessionRecord` de fin (la `SessionRecord` écrite implique `observations` à jour), la note tardive n’est enregistrée nulle part, aucune exception (Review Focus 1) ;
  - `thirdMechanic.spec.ts` : l’essai de la mécanique factice porte sa réponse en `'answer'` avec la charge du capteur factice.
- [ ] **Step 2:** `npx vitest run src/lib/application/session` → FAIL.
- [ ] **Step 3:** implémenter selon les règles ci-dessus ; retirer le retour anticipé de la tâche 5 sur `!readable` au profit du classement `'unreadable'`.
- [ ] **Step 4:** `npm test && npm run check && npm run lint` → passe.
- [ ] **Step 5:** commit `feat: keep every observation of a prompt with its attempt`.

### Task 9: Documentation

**Files:**

- Modify: `CLAUDE.md`, `docs/plateforme.md`

- [ ] **Step 1:** `CLAUDE.md` : section Storage → Dexie version 6 (observations et latence), sauvegarde version 3 (v2 et v1 encore importées) ; nouvelle règle « **Observations** » : la plage d’un essai (de sa manche à la suivante, pause, fin), rattachement à l’arrivée, `fate`, les rejets du détecteur enregistrés `'unreadable'` et jamais réponses, `observations: null` pour les anciens essais ; architecture : `observationSpan.ts`, `NoteDetectorPort.onRejected`.
- [ ] **Step 2:** `docs/plateforme.md`, feuille de route : étape 2 marquée **Fait** (2026-10-06) avec renvoi à la spec.
- [ ] **Step 3:** `npm run lint` → passe.
- [ ] **Step 4:** commit `docs: describe the observations kept with each attempt`.
