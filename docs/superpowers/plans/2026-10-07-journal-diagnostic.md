# Journal de diagnostic (C0) — plan d’implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un journal de diagnostic à part des données d’apprentissage : le son de chaque prise à 16 kHz, les attentes et rapports complets du capteur d’accords, les trous de trames et les réglages de l’entrée, dans une base bornée par un budget, coupée par défaut en production, exportable en zip.

**Architecture:** port `DiagnosticSink` (application) écrit par les adaptateurs seulement ; `DexieDiagnosticSink` (base `neckspert-play-diagnostics`, prises, budget) et `NullDiagnosticSink` ; `DiagnosticAudioRecorder` abonné aux trames de `WebAudioInput` ; `WebAudioInput` ouvre et ferme les prises ; `NnlsChordVerifier` déplace le spectre du rapport vers le journal ; export zip sans dépendance ; réglage `Settings.diagnostics` et bloc « Diagnostic » de l’écran Réglages.

**Tech Stack:** TypeScript, Svelte 5 (runes), Dexie + `fake-indexeddb`, Vitest (`server` / `client`).

**Spec:** `docs/superpowers/specs/2026-10-07-journal-diagnostic-design.md` (à lire avant chaque tâche) ; capteur : `docs/superpowers/specs/2026-10-07-capteur-accords-design.md`.

## Global Constraints

- Node 22 via `.nvmrc` : `source ~/.nvm/nvm.sh && nvm use` avant `npm`/`npx`. Le worktree n’a pas de `node_modules` : `npm ci` une fois avant la tâche 1.
- Porte de fusion de chaque tâche : `npm test && npm run check` (vérifier la sortie de `check` : 0 erreur) ; `npx prettier --check` sur les fichiers texte touchés.
- Code, identifiants et commentaires en anglais ; textes d’interface en français et anglais via `defineMessages` ; commits Conventional Commits en minuscules, impératifs, avec `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `expect.requireAssertions` actif. Specs Dexie : `import 'fake-indexeddb/auto'`. Pas de `node:` dans les specs (le projet n’a pas `@types/node`).
- Le cœur (`SessionController`, `ObservationSpan`, `AttemptRecorder`, `sensors.ts`) et les mécaniques ne connaissent pas le journal. Le domaine reste pur : pas d’`import.meta.env` dans `domain/`.
- Valeurs : `DIAGNOSTIC_SAMPLE_RATE = 16000`, `DIAGNOSTIC_CHUNK_S = 10`, `DIAGNOSTICS_DB_NAME = 'neckspert-play-diagnostics'`, budgets proposés `[100, 300, 1000]` Mo, défaut 300 ; spectre gardé de 20 Hz à 6300 Hz ; un trou = écart entre deux trames supérieur à une demi-trame.
- `Settings.diagnostics = { enabled: boolean | null; budgetMb: number }`, défaut `{ enabled: null, budgetMb: 300 }` ; `null` = défaut du build, résolu hors du domaine : vrai si `import.meta.env.DEV`, faux sinon.
- Pas de nouvelle version de la base d’apprentissage ni de la sauvegarde (le champ de réglage est optionnel à la validation).

## Review Focus

1. **Réglage changé pendant une prise** : sans effet sur la prise en cours ; appliqué à la suivante (tâche 5).
2. **Budget dépassé avec une prise ouverte** : on efface les plus anciennes, jamais la prise ouverte ; une prise seule au-delà du budget passe en `truncated` et garde ses événements (tâche 5).
3. **Continuité du filtre entre trames** : rééchantillonner un sinus trame par trame donne le même signal qu’en un seul bloc (à 1e-6), à 48 et 44,1 kHz (tâche 3).
4. **Prise sans son** (tronquée dès le début, ou entrée ouverte puis fermée aussitôt) : l’export écrit `prise.json` et `evenements.jsonl`, pas de `audio.wav` (tâche 8).
5. **Journal coupé** : aucune écriture en base, l’enregistreur ne s’abonne pas, le vérificateur ne construit pas le spectre (tâches 4, 5, 7).

---

### Task 1: Le réglage `diagnostics`

**Files:**

- Modify: `src/lib/domain/types.ts` (`DiagnosticsSettings`, champ de `Settings`, défaut, `DIAGNOSTIC_BUDGETS_MB`, `resolveDiagnosticsEnabled`)
- Modify: `src/lib/infrastructure/storage/validateBackup.ts` (`checkSettings`)
- Test: `src/lib/infrastructure/storage/DexieSettingsRepository.spec.ts`, `validateBackup.spec.ts`, `DexieBackup.spec.ts`, `src/lib/domain/types.spec.ts` (créer s’il n’existe pas)

**Interfaces:**

- Produces :

  ```ts
  interface DiagnosticsSettings {
  	enabled: boolean | null;
  	budgetMb: number;
  }
  // Settings gagne diagnostics: DiagnosticsSettings ; DEFAULT_SETTINGS.diagnostics = { enabled: null, budgetMb: 300 }
  const DIAGNOSTIC_BUDGETS_MB: readonly number[]; // [100, 300, 1000]
  function resolveDiagnosticsEnabled(settings: DiagnosticsSettings, buildDefault: boolean): boolean;
  ```

- [ ] **Step 1: Write the failing tests** : une ligne de réglages enregistrée sans `diagnostics` se lit avec le défaut ; `resolveDiagnosticsEnabled({ enabled: null, … }, true)` → vrai, `(…, false)` → faux, `{ enabled: false }` avec `true` → faux ; la validation accepte un fichier sans `diagnostics` et avec `{ enabled: true, budgetMb: 300 }`, refuse `budgetMb: 0`, `budgetMb: 'x'`, `enabled: 'yes'` ; un aller-retour par la sauvegarde garde `{ enabled: true, budgetMb: 1000 }`.
- [ ] **Step 2: Run** les specs touchées — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: add a diagnostics setting, off by default in a published build`

### Task 2: Le port et ses doubles

**Files:**

- Create: `src/lib/application/ports/DiagnosticSink.ts` ; Modify: `ports/index.ts`
- Create: `src/lib/infrastructure/diagnostics/NullDiagnosticSink.ts`, `index.ts`
- Modify: `src/lib/testing/fakes.ts` (`FakeDiagnosticSink`)
- Test: `src/lib/testing/fakes.spec.ts`, `src/lib/infrastructure/diagnostics/NullDiagnosticSink.spec.ts`

**Interfaces:**

- Produces :

  ```ts
  interface DiagnosticAudioChunk {
  	audioTime: number;
  	sampleRate: number;
  	samples: Int16Array;
  }
  interface DiagnosticSink {
  	readonly enabled: boolean;
  	event(kind: string, audioTime: number, data: unknown): void;
  	audio(chunk: DiagnosticAudioChunk): void;
  }
  interface DiagnosticInputInfo {
  	label: string;
  	sampleRate: number;
  	channelCount: number;
  	builtInGain: number;
  }
  /** Known to the input and the composition only. */
  interface DiagnosticTakes {
  	openTake(take: {
  		startedAt: number;
  		startedAudioTime: number;
  		input: DiagnosticInputInfo;
  	}): Promise<void>;
  	closeTake(endedAt: number): Promise<void>;
  }
  class NullDiagnosticSink implements DiagnosticSink, DiagnosticTakes {} // enabled false, tout no-op
  class FakeDiagnosticSink implements DiagnosticSink, DiagnosticTakes {
  	enabled: boolean; // réglable par le test
  	readonly events: { kind: string; audioTime: number; data: unknown }[];
  	readonly chunks: DiagnosticAudioChunk[];
  	readonly takes: { opened: unknown; endedAt: number | null }[];
  }
  ```

- [ ] **Step 1: Write the failing tests** : `NullDiagnosticSink` a `enabled` faux et ses méthodes ne lèvent rien ; `FakeDiagnosticSink` garde événements, blocs et prises dans l’ordre.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: describe the diagnostic sink port`

### Task 3: Le sous-échantillonnage

**Files:**

- Create: `src/lib/infrastructure/diagnostics/downsample.ts`
- Test: `downsample.spec.ts`

**Interfaces:**

- Produces :

  ```ts
  const DIAGNOSTIC_SAMPLE_RATE = 16000;
  /** Streaming low-pass then resampling; keeps its filter state between calls. */
  interface Downsampler {
  	push(samples: Float32Array): Float32Array;
  	reset(): void;
  }
  function createDownsampler(fromRate: number, toRate?: number): Downsampler;
  ```

  Filtre FIR à phase linéaire, sinc fenêtré (Blackman), 95 coefficients, coupure à 0,45 × `toRate` (7,2 kHz), état gardé entre les appels. Rapport entier (48 kHz → 16 kHz) : un échantillon filtré sur trois. Sinon (44,1 kHz) : interpolation linéaire sur le signal filtré, à phase continue entre les appels.

- [ ] **Step 1: Write the failing tests** : à 48 kHz, un sinus de 1 kHz ressort avec son amplitude à 5 % près (régime établi) ; un sinus de 9 kHz est atténué d’au moins 40 dB ; même chose depuis 44,1 kHz ; le signal poussé en trames de 512 est identique (1e-6) au signal poussé d’un bloc ; la longueur de sortie suit le rapport (48 000 échantillons → 16 000 ± 1).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: downsample the input to 16 kHz for the diagnostic journal`

### Task 4: L’enregistreur audio

**Files:**

- Create: `src/lib/infrastructure/diagnostics/DiagnosticAudioRecorder.ts`
- Test: `DiagnosticAudioRecorder.spec.ts`

**Interfaces:**

- Consumes: tâches 2 et 3 ; `FrameSource` de `$lib/infrastructure/audio/chords` (ou l’interface équivalente : `sampleRate`, `onFrame`).
- Produces :

  ```ts
  const DIAGNOSTIC_CHUNK_S = 10;
  class DiagnosticAudioRecorder {
  	constructor(sink: DiagnosticSink);
  	/** Called by the input when it opens: subscribes only if sink.enabled. */
  	start(source: FrameSource): void;
  	/** Flushes the pending chunk and unsubscribes. */
  	stop(): void;
  }
  ```

  Les échantillons rééchantillonnés sont convertis en 16 bits (arrondi, saturés à ±32767) et envoyés par blocs de `DIAGNOSTIC_CHUNK_S` secondes ; `audioTime` d’un bloc = heure audio de son premier échantillon (heure de la trame d’origine). Un écart entre la fin d’une trame et le début de la suivante supérieur à une demi-trame : `sink.event('input.gap', heure, { fromAudioTime, durationS })`, le bloc en cours part, le rééchantillonneur repart à zéro, un nouveau bloc commence.

- [ ] **Step 1: Write the failing tests** (source de trames factice de 512 à 48 kHz, `FakeDiagnosticSink`) : 25 s de signal → blocs de 10 s, 10 s, puis 5 s à `stop()`, d’heures 0, 10, 20 (à 1 ms), 160 000 / 160 000 / 80 000 échantillons ± 1 ; un trou de 0,5 s → un `input.gap` et un bloc coupé ; `enabled` faux → `start` ne s’abonne pas (aucune trame lue, aucun bloc).
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: record the input of each take at 16 kHz`

### Task 5: Le journal Dexie et son budget

**Files:**

- Create: `src/lib/infrastructure/diagnostics/DexieDiagnosticSink.ts`, `diagnosticsDb.ts`
- Test: `DexieDiagnosticSink.spec.ts`

**Interfaces:**

- Consumes: tâches 1 et 2.
- Produces :

  ```ts
  interface DiagnosticTakeRow {
  	id: string;
  	startedAt: number;
  	startedAudioTime: number;
  	endedAt: number | null;
  	input: DiagnosticInputInfo;
  	bytes: number;
  	truncated: boolean;
  }
  class DexieDiagnosticSink implements DiagnosticSink, DiagnosticTakes {
  	constructor(options: {
  		name?: string; // DIAGNOSTICS_DB_NAME
  		settings: () => Promise<{ enabled: boolean; budgetMb: number }>; // déjà résolu
  		newId: () => string;
  	});
  	usage(): Promise<{ bytes: number; takes: number }>;
  	clear(): Promise<void>;
  	takes(): Promise<DiagnosticTakeRow[]>; // plus ancienne d’abord
  	eventsOf(takeId: string): Promise<{ audioTime: number; kind: string; data: unknown }[]>;
  	audioOf(takeId: string): Promise<DiagnosticAudioChunk[]>;
  }
  ```

  `openTake` lit les réglages : coupé → pas de prise, `enabled` faux jusqu’à la prochaine. Activé → ligne `takes`, `enabled` vrai. `event` et `audio` écrivent dans la prise ouverte (file d’écriture sérialisée, sans bloquer l’appelant) et ajoutent leurs octets (`samples.byteLength`, longueur de `JSON.stringify` de l’événement) ; un bloc qui ferait dépasser le budget à la prise seule n’est pas écrit et la prise passe `truncated`. `closeTake` attend la file, fixe `endedAt`, `enabled` redevient faux, puis efface les prises fermées les plus anciennes (avec leurs événements et leur son) tant que le total dépasse le budget.

- [ ] **Step 1: Write the failing tests** (`fake-indexeddb`, base au nom aléatoire) : prise ouverte puis fermée avec événements et son, relus dans l’ordre ; budget de 1 Mo et trois prises de 0,4 Mo → la plus ancienne effacée, jamais la prise ouverte ; une prise qui reçoit 1,5 Mo de son passe `truncated` et garde ses événements ; réglage coupé → aucune ligne, aucun événement ; réglage changé pendant une prise → sans effet avant la suivante ; `usage` et `clear`.
- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: keep diagnostic takes in their own database, within a budget`

### Task 6: L’entrée ouvre et ferme les prises

**Files:**

- Modify: `src/lib/infrastructure/audio/input/WebAudioInput.ts`
- Test: `WebAudioInput.spec.ts`

**Interfaces:**

- Consumes: tâches 2 et 4.
- Produces : `new WebAudioInput(context, { resume?, diagnostics?: DiagnosticSink & DiagnosticTakes, now?: () => number })`. À `start`, une fois l’entrée ouverte : `openTake({ startedAt: now(), startedAudioTime: ctx.currentTime, input })`, puis `event('input.opened', …, input)`, puis l’enregistreur démarre sur l’entrée elle-même. À `stop` : l’enregistreur s’arrête, `event('input.closed', …)`, `closeTake(now())` (non attendu). Sans `diagnostics`, rien ne change.

- [ ] **Step 1: Write the failing tests** (`FakeDiagnosticSink` activé) : `start` ouvre une prise avec le nom de piste, 48000, 1 canal et le gain appliqué (8 pour un micro intégré, 1 sinon), puis `input.opened` ; des trames envoyées atteignent l’enregistreur (un bloc après `stop`) ; `stop` écrit `input.closed` et ferme la prise ; sans `diagnostics`, les specs existantes passent sans changement.
- [ ] **Step 2: Run** `npx vitest run src/lib/infrastructure/audio/input` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `npx vitest run src/lib/infrastructure/audio` — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: open a diagnostic take with each opening of the input`

### Task 7: Le spectre passe du rapport au journal

**Files:**

- Modify: `src/lib/application/ports/ChordVerifierPort.ts` (retire `spectrum`)
- Modify: `src/lib/infrastructure/audio/chords/NnlsChordVerifier.ts`, `constants.ts` (`SPECTRUM_KEEP_MIN_HZ = 20`, `SPECTRUM_KEEP_MAX_HZ = 6300`)
- Modify: `NnlsChordVerifier.spec.ts`, `src/lib/infrastructure/storage/DexieBackup.spec.ts` (le test d’aller-retour d’une observation d’accord, sans spectre)
- Modify: `src/routes/diagnostic/+page.svelte` si le type l’exige

**Interfaces:**

- Consumes: tâche 2.
- Produces : `new NnlsChordVerifier(input, { variants?, active?, diagnostics?: DiagnosticSink })`. Si `diagnostics?.enabled` : à chaque `expect`, `event('chord.expectation', heure audio de la dernière trame, expectation)` ; à chaque rapport, `event('chord.report', report.time, { ...report, judgeMs, spectrum: { fromHz, binHz, magnitudes } })` sur tous les rapports (le spectre de la fenêtre au moment du rapport), `judgeMs` = durée des jugements de toutes les variantes (`performance.now()`). Sinon : aucun événement et aucun tableau de spectre construit.

- [ ] **Step 1: Write the failing tests** : journal coupé (ou absent) → rapports sans `spectrum`, aucun événement ; journal factice activé → `chord.expectation` à chaque attente (`null` compris), un `chord.report` par rapport avec `spectrum.fromHz` ≤ 20 + une case, dernière fréquence ≥ 6300 − une case, et `judgeMs` ≥ 0.
- [ ] **Step 2: Run** `npx vitest run src/lib/infrastructure/audio/chords` — Expected: FAIL.
- [ ] **Step 3: Implement**, retirer `spectrum` du port, ajuster le test de sauvegarde.
- [ ] **Step 4: Run** `npm test && npm run check` — Expected: PASS, 0 erreur.
- [ ] **Step 5: Commit** — `feat: send chord spectra to the diagnostic journal, not to attempts`

### Task 8: Zip, WAV et archive

**Files:**

- Create: `src/lib/infrastructure/diagnostics/zip.ts`, `wav.ts`, `exportArchive.ts`
- Test: `zip.spec.ts`, `exportArchive.spec.ts` (avec un lecteur de zip minimal dans `testing/readZip.ts`)

**Interfaces:**

- Consumes: tâche 5 ; `readWav` de `$lib/infrastructure/audio/chords/testing/wav` (tests).
- Produces :

  ```ts
  function crc32(bytes: Uint8Array): number;
  function zipStore(
  	files: readonly { path: string; bytes: Uint8Array }[],
  	modified?: Date
  ): Uint8Array;
  function encodeWav(sampleRate: number, samples: Int16Array): Uint8Array;
  function buildDiagnosticArchive(
  	journal: Pick<DexieDiagnosticSink, 'takes' | 'eventsOf' | 'audioOf'>,
  	learning: unknown // BackupFile
  ): Promise<Uint8Array>;
  ```

  Arborescence de la spec, section 5 : `apprentissage.json`, `prises/<startedAt ISO, ':' → '-'>/prise.json` (la ligne, plus `gaps: { atS, durationS }[]` du son), `audio.wav` (blocs mis bout à bout depuis le premier, trous comblés de silence ; absent sans bloc), `evenements.jsonl`. Zip STORE : en-têtes locaux, répertoire central, fin de répertoire, noms UTF-8 (bit 11), CRC32.

- [ ] **Step 1: Write the failing tests** : `crc32('123456789')` → `0xcbf43926` ; un zip de deux fichiers relu par le lecteur du test (noms, contenus, CRC) ; l’archive d’une prise de deux blocs séparés d’un trou de 1 s : chemins attendus, WAV relu à 16 kHz, durée = blocs + trou, silence au milieu, `gaps` dans `prise.json` ; une prise sans son → pas de `audio.wav`.
- [ ] **Step 2: Run** `npx vitest run src/lib/infrastructure/diagnostics` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS. Vérification manuelle : écrire une archive de test dans le scratchpad et lancer `unzip -t` dessus.
- [ ] **Step 5: Commit** — `feat: export the diagnostic journal as a self-contained zip`

### Task 9: Services, composition et écran Réglages

**Files:**

- Modify: `src/lib/application/app.ts` (`AppServices.diagnostics`), `services/createAppServices.ts`
- Modify: `src/lib/composition/createApp.ts`
- Modify: `src/lib/ui/screens/settings/SettingsScreen.svelte`, `messages.ts`, `SettingsScreen.svelte.spec.ts`
- Modify: `src/routes/settings/+page.svelte` (et son harnais de test si besoin)
- Modify: les doubles de services des pages `/dev` qui construisent un `AppServices`

**Interfaces:**

- Consumes: tâches 1, 5–8.
- Produces :

  ```ts
  interface DiagnosticsService {
  	usage(): Promise<{ bytes: number; takes: number }>;
  	exportArchive(): Promise<Blob>; // application/zip
  	clear(): Promise<void>;
  }
  // AppServices gagne diagnostics: DiagnosticsService
  ```

  `createApp` : un `DexieDiagnosticSink` dont `settings` lit `settings.get()` et résout `enabled` avec `resolveDiagnosticsEnabled(…, import.meta.env.DEV)` ; donné à `WebAudioInput` et à `NnlsChordVerifier`. `exportArchive` = `buildDiagnosticArchive(sink, await backup.exportAll())`.

  Bloc « Diagnostic » (nouvelles props de `SettingsScreen` : `diagnosticsEnabled`, `diagnosticsBudgetMb`, `diagnosticsUsedBytes`, `ondiagnostics(enabled)`, `ondiagnosticsbudget(mb)`, `ondiagnosticsexport()`, `ondiagnosticsclear()`), dans le style des blocs existants (`PixelBox`, `PixelButton`, `PixelText`) : bouton bascule « Enregistrer le son et les détails de la détection » (activé / coupé), « 42 Mo sur 300 », trois boutons de budget (100, 300, 1000, l’actif désactivé comme la langue), « Exporter le diagnostic », « Effacer ». Anglais : « Record sound and detection details », « 42 MB of 300 », « Export diagnostics », « Clear ».

- [ ] **Step 1: Write the failing tests** (`SettingsScreen.svelte.spec.ts`) : la bascule appelle `ondiagnostics(false)` quand activée ; le choix 1000 appelle `ondiagnosticsbudget(1000)` ; « 42 Mo sur 300 » s’affiche pour 42 × 1024² octets ; « Exporter le diagnostic » et « Effacer » appellent leurs props.
- [ ] **Step 2: Run** `npx vitest run src/lib/ui/screens/settings` — Expected: FAIL.
- [ ] **Step 3: Implement** l’écran, la page, les services et la composition.
- [ ] **Step 4: Run the merge gate** `npm test && npm run check` — Expected: tout vert, 0 erreur. Vérification dans un navigateur (Chrome sans tête, faux micro, script jetable du scratchpad) : `/settings` montre le bloc ; avec le diagnostic activé, `/diagnostic` → Démarrer, attendre 12 s, Arrêter ; `/settings` montre une place prise non nulle ; « Exporter le diagnostic » produit un zip que `unzip -t` accepte.
- [ ] **Step 5: Commit** — `feat: turn the diagnostic journal on, export or clear it from the settings`
