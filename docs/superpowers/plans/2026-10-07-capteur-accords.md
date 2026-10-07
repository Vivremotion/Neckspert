# Capteur d’accords (B1) — plan d’implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** un capteur d’accords derrière un port remplaçable : la mécanique pose une attente (candidats connus), l’adaptateur `nnls` écoute l’entrée audio partagée et rapporte, pour chaque variante du juge, le score de chaque candidat et sa décision ; les rapports deviennent des observations de l’essai.

**Architecture:** port `ChordVerifierPort` (application) ; `ObservationSource.expect?` et `MechanicPresenter.expectation?` dans le cœur, `chordSensor` ; `WebAudioInput` sorti de `WebAudioNoteDetector` et partagé ; calculs purs dans `infrastructure/audio/chords/` assemblés par `NnlsChordVerifier` ; fixtures tirées du corpus réel du spike ; section Accords de `/diagnostic`.

**Tech Stack:** TypeScript, Svelte 5 (runes), Vitest (projets `server` / `client`), Web Audio.

**Spec:** `docs/superpowers/specs/2026-10-07-capteur-accords-design.md` (à lire avant chaque tâche) ; recommandation du spike : `docs/superpowers/specs/2026-10-06-triades-detection-spike.md`.

## Global Constraints

- Node 22 via `.nvmrc` : `source ~/.nvm/nvm.sh && nvm use` avant `npm`/`npx`. Le worktree n’a pas de `node_modules` : `npm ci` une fois avant la tâche 1.
- Porte de fusion de chaque tâche : `npm test && npm run check` ; `npx prettier --check` sur les fichiers touchés (`npm run lint` échoue déjà sur 44 fichiers étrangers à ce travail).
- Code, identifiants et commentaires en anglais ; commits Conventional Commits en minuscules, impératifs, avec la ligne `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- `expect.requireAssertions` est actif : chaque test asserte.
- Le cœur (`SessionController`, `ObservationSpan`, `AttemptRecorder`, `sensors.ts` hors `chordSensor`/`noteSensor`) ne nomme aucune mécanique et ne lit jamais une attente.
- **Algorithmes de référence** : le code du spike, branche `spike/triades-detection` (`git show spike/triades-detection:spikes/triades/dsp.ts`, `…/judge.ts`). On le réécrit proprement (pas de `process.env`, pas de cache global mutable non borné, types `Float64Array`), mêmes formules.
- Constantes nommées, « to calibrate » : `TARGET_WINDOW_S = 0.17`, `HOP_SIZE` = `FFT_SIZE / 8`, `REPORT_POINTS_MS = [250, 500, 1000, 2000]`, `NOTE_LO = 52`, `NOTE_HI = 84`, `MIN_HZ = 70`, `COMB_MAX_HZ = 5000`, `SPECTRUM_KEEP_MAX_HZ = 6000`, `COMB_HARMONICS = 10`, `COMB_WIDTH_BINS = 1.6`, `COMB_INHARMONICITY = 1e-4`, `WHITENING_NU = 0.33`, `PRESENCE_RATIO = 0.15`. Variante `default` : profil `[1, 1/2, …, 1/10]`, `threshold: 0.25`, `margin: 0.01`.
- Pas de nouvelle version Dexie ni de sauvegarde.

## Review Focus

1. **Attente qui fuit d’une manche à l’autre** : une manche d’une mécanique sans `expectation` (ou d’un autre capteur), une pause, un `quit` ou la fin posent `expect(null)` sur toute source qui a `expect` ; aucun rapport n’arrive après `expect(null)` (tâches 2 et 7).
2. **Attente suivante pendant une fenêtre** : une attaque à 0 ms, une nouvelle attente à 300 ms → un rapport à 250 ms puis un dernier rapport coupé à 300 ms (`windowMs` 300, spectre gardé), plus rien ensuite pour cette attaque (tâche 7).
3. **Silence** : une attente sans attaque ne produit aucun rapport (tâche 7).
4. **Entrée à 44,1 kHz** : `FFT_SIZE` 8192, `HOP_SIZE` 1024, cases de fréquence et peignes calculés avec la vraie fréquence ; le juge reconnaît la triade synthétique (tâche 7).
5. **Candidat dont une note sort de [NOTE_LO, NOTE_HI]** : score 0, jamais retenu, aucune exception (tâche 5).

---

### Task 1: Le port et son double

**Files:**

- Create: `src/lib/application/ports/ChordVerifierPort.ts`
- Modify: `src/lib/application/ports/index.ts` (export)
- Modify: `src/lib/testing/fakes.ts` (`FakeChordVerifier`)
- Test: `src/lib/testing/fakes.spec.ts`

**Interfaces:**

- Produces : les types de la spec, section 1, à l’identique (`ChordCandidate`, `ChordExpectation`, `ChordVariantReport`, `ChordReport`, `ChordVerifierPort`), plus

  ```ts
  class FakeChordVerifier implements ChordVerifierPort {
  	readonly expectations: (ChordExpectation | null)[]; // chaque appel à expect, dans l’ordre
  	emit(report: ChordReport): void; // envoie aux abonnés
  }
  ```

- [ ] **Step 1: Write the failing tests** in `fakes.spec.ts` : `FakeChordVerifier` garde `[e1, null]` après `expect(e1); expect(null)` ; `emit` atteint un abonné et plus rien après désabonnement.
- [ ] **Step 2: Run** `npx vitest run src/lib/testing/fakes.spec.ts` — Expected: FAIL (`FakeChordVerifier` absent).
- [ ] **Step 3: Implement** le port et le double.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: describe the chord verifier port`

### Task 2: Le cœur transmet l’attente ; `chordSensor`

**Files:**

- Modify: `src/lib/application/session/sensors.ts` (`ObservationSource.expect?`, `chordSensor`, `ChordObservationPayload`)
- Modify: `src/lib/application/mechanics/types.ts` (`MechanicPresenter.expectation?`)
- Modify: `src/lib/application/session/SessionController.svelte.ts`
- Test: `src/lib/application/session/sensors.spec.ts`, `src/lib/application/session/expectation.spec.ts` (nouveau, harnais copié de `thirdMechanic.spec.ts`)

**Interfaces:**

- Consumes: tâche 1.
- Produces :

  ```ts
  // sensors.ts
  interface ObservationSource { …; expect?(expectation: unknown): void }
  type ChordObservationPayload = Omit<ChordReport, 'time'>;
  function chordSensor(verifier: ChordVerifierPort): SensorFactory;
  // mechanics/types.ts
  interface MechanicPresenter<I, A> { …; expectation?(item: I, round: { opensAt: number }): unknown }
  ```

  Contrôleur : un helper privé `expectAll(sensor: SensorKind | null, expectation: unknown)` appelle `expect(expectation)` sur la source de `sensor` et `expect(null)` sur toute autre source qui a `expect`. Dans `beginNextItem`, juste après `new ObservationSpan(...)` : `expectAll(presenter.sensor, presenter.expectation ? presenter.expectation(item.item, { opensAt: this.round.promptTime }) : null)`. Dans `pause()` et `finish()` (avant `closeAllSources`) : `expectAll(null, null)`.

- [ ] **Step 1: Write the failing tests**
  - `sensors.spec.ts` : `chordSensor(fake)` ; `source.expect(e)` atteint `fake.expectations` ; un rapport `{ time: 2, … }` avec `latencyMs: 25` devient `{ time: 1.975, readable: true, payload }` où `payload` est le rapport sans `time` ; plus rien après désabonnement.
  - `expectation.spec.ts` (mécanique factice dont le présentateur a `sensor: 'fake'` et `expectation: (item, { opensAt }) => ({ n: item.n, opensAt })`, source factice qui enregistre ses `expect`) : à la première manche, la source reçoit `{ n: 3, opensAt: metronome.beatTime(4) }` (avant tout autre appel non nul) ; après `pause()`, le dernier appel est `null` ; après `quit()` et `drain()`, le dernier appel est `null` ; avec un présentateur sans `expectation`, la source ne reçoit que `null`.
- [ ] **Step 2: Run** `npx vitest run src/lib/application/session/sensors.spec.ts src/lib/application/session/expectation.spec.ts` — Expected: FAIL.
- [ ] **Step 3: Implement** comme décrit dans Interfaces.
- [ ] **Step 4: Run** the same, then `npx vitest run src/lib/application` — Expected: PASS, specs existantes inchangées.
- [ ] **Step 5: Commit** — `feat: hand each round's expectation to its sensor`

### Task 3: Spectre (FFT, fenêtre, maximum par case)

**Files:**

- Create: `src/lib/infrastructure/audio/chords/fft.ts`, `spectrum.ts`, `constants.ts`
- Test: `fft.spec.ts`, `spectrum.spec.ts` (même dossier)

**Interfaces:**

- Produces :

  ```ts
  // constants.ts : toutes les constantes des Global Constraints, plus
  function fftSizeFor(sampleRate: number): number; // puissance de 2 la plus proche de TARGET_WINDOW_S
  // fft.ts
  function magnitudeSpectrum(frame: Float64Array): Float64Array; // longueur n/2, n puissance de 2
  // spectrum.ts
  function hannWindow(n: number): Float64Array;
  function maxPool(into: Float64Array, spectrum: Float64Array): void; // into[k] = max(into[k], spectrum[k])
  function binHz(sampleRate: number, fftSize: number): number;
  ```

- [ ] **Step 1: Write the failing tests** : `fftSizeFor(48000)` → 8192, `fftSizeFor(44100)` → 8192 ; un sinus de 440 Hz à 48 kHz sur 8192 points fenêtré de Hann a son maximum à la case `round(440 / binHz)` ; `maxPool` garde un pic présent seulement dans le second spectre ; `hannWindow(4)` → `[0, 0.75, 0.75, 0]`.
- [ ] **Step 2: Run** `npx vitest run src/lib/infrastructure/audio/chords` — Expected: FAIL.
- [ ] **Step 3: Implement** (FFT radix 2 itérative, comme `magnitude` du spike).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: compute peak-held magnitude spectra for chord windows`

### Task 4: Blanchiment, peigne, NNLS

**Files:**

- Create: `src/lib/infrastructure/audio/chords/whitening.ts`, `comb.ts`, `nnls.ts`
- Test: `whitening.spec.ts`, `comb.spec.ts`, `nnls.spec.ts`

**Interfaces:**

- Produces :

  ```ts
  function whiteningGains(magnitude: Float64Array, sampleRate: number, nu?: number): Float64Array; // spike: whiteningGains
  function noteComb(
  	midi: number,
  	bins: number,
  	sampleRate: number,
  	profile: readonly number[]
  ): Float64Array; // spike: comb, profil imposé
  function nnls(gram: number[][], projections: number[]): number[]; // spike: nnls (Lawson–Hanson)
  ```

- [ ] **Step 1: Write the failing tests** : les gains d’un spectre plat sont constants à 1 % près ; `noteComb(57, …, [1, 0.5])` a deux pics, aux cases de 220 Hz et ≈ 440 Hz (inharmonicité comprise), le second à moitié du premier ; `nnls` retrouve `[2, 0, 1]` sur une somme de trois peignes à ces coefficients (à 1e‑6) et ne rend jamais de coefficient négatif quand la cible favorise un coefficient négatif.
- [ ] **Step 2: Run** `npx vitest run src/lib/infrastructure/audio/chords` — Expected: FAIL.
- [ ] **Step 3: Implement** en reprenant les formules du spike.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: whiten spectra and fit harmonic combs without negative weights`

### Task 5: Le juge d’une variante

**Files:**

- Create: `src/lib/infrastructure/audio/chords/judge.ts`, `variants.ts`, `testing/synthChord.ts`
- Test: `judge.spec.ts`

**Interfaces:**

- Consumes: tâches 1, 3, 4 ; `closeTriadVoicings`, `voicingOccurrences`, `voicingCandidates` de `$lib/domain/music` (tests).
- Produces :

  ```ts
  // variants.ts
  interface JudgeVariant {
  	id: string;
  	profile: readonly number[];
  	threshold: number;
  	margin: number;
  }
  const DEFAULT_VARIANT: JudgeVariant; // id 'default', profil 1/h, 0.25, 0.01
  // judge.ts
  function judgeWindow(
  	pooled: Float64Array,
  	sampleRate: number,
  	candidates: readonly ChordCandidate[],
  	variant: JudgeVariant
  ): ChordVariantReport;
  // testing/synthChord.ts : spectre maximum d’un accord synthétique (somme de synthesizePluck)
  function synthChordSpectrum(
  	midis: readonly number[],
  	sampleRate: number,
  	options?: { durationS?: number }
  ): Float64Array;
  ```

  `judgeWindow` : blanchit (gains tirés de `pooled`), construit les peignes du profil pour les notes `NOTE_LO..NOTE_HI`, ajuste chaque candidat (spike : `prepare` + `fitCandidate` sans `ringing`), score = expliqué × min(1, présence / `PRESENCE_RATIO`). Un candidat dont une note sort de `[NOTE_LO, NOTE_HI]` a le score 0. `decided` = meilleur candidat si score ≥ `threshold` et (score − second) ≥ `margin`, sinon null. Scores arrondis à 4 décimales.

- [ ] **Step 1: Write the failing tests** (candidats = `voicingCandidates` de D, fondamentale sur si, 2‑3‑2, convertis en `ChordCandidate` avec `id` = frettes jointes) :
  - spectre synthétique de A3 D4 F#4 → `decided` = `'2,3,2'` ; ses scores dépassent ceux de `7,7,5`, `11,10,10`, `2,3,1`, `3,3,2` ;
  - spectre de D4 F#4 (A3 absent) → `decided` null ;
  - spectre de D4 F#4 A4 → `decided` = `'7,7,5'` (le piège d’octave tranché dans l’autre sens) ;
  - un candidat avec une note MIDI 90 → score 0, aucune exception.
- [ ] **Step 2: Run** `npx vitest run src/lib/infrastructure/audio/chords/judge.spec.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: judge which known chord candidate a spectrum holds`

### Task 6: L’entrée audio partagée

**Files:**

- Create: `src/lib/infrastructure/audio/input/WebAudioInput.ts`, `index.ts`
- Modify: `src/lib/infrastructure/audio/detection/WebAudioNoteDetector.ts`
- Test: `src/lib/infrastructure/audio/input/WebAudioInput.spec.ts` ; `WebAudioNoteDetector.spec.ts` inchangé

**Interfaces:**

- Produces :

  ```ts
  interface AudioFrame {
  	samples: Float32Array;
  	frameTime: number;
  }
  class WebAudioInput {
  	constructor(context: () => AudioContext, options?: { resume?: () => Promise<void> });
  	readonly sampleRate: number; // celle du contexte
  	listInputs(): Promise<AudioInputDevice[]>;
  	start(deviceId: string | null): Promise<void>;
  	stop(): void;
  	setBuiltInGain(gain: number): void;
  	onFrame(callback: (frame: AudioFrame) => void): () => void; // trames après gain du micro intégré
  	onLevel(callback: (rms: number) => void): () => void;
  }
  // WebAudioNoteDetector : constructor(context, options?: Partial<DetectorConfig> & { resume?; input?: WebAudioInput })
  ```

  Le code d’ouverture (contraintes, contournement Firefox, worklet `../detection/frame-processor.ts?worker&url`, nœuds, gain) déménage tel quel. Sans `input`, le détecteur crée le sien : `WebAudioNoteDetector.spec.ts` passe sans changer ses attentes.

- [ ] **Step 1: Write the failing tests** in `WebAudioInput.spec.ts` (mêmes `FakeContext` / `installMedia` que la spec du détecteur, `vi.mock` du worklet) : deux abonnés `onFrame` reçoivent la même trame ; le gain du micro intégré s’applique aux trames ; plus rien après `stop()`.
- [ ] **Step 2: Run** `npx vitest run src/lib/infrastructure/audio/input` — Expected: FAIL.
- [ ] **Step 3: Implement** et faire déléguer le détecteur.
- [ ] **Step 4: Run** `npx vitest run src/lib/infrastructure/audio` — Expected: PASS, spec du détecteur inchangée.
- [ ] **Step 5: Commit** — `refactor: share one audio input between detectors`

### Task 7: `NnlsChordVerifier`

**Files:**

- Create: `src/lib/infrastructure/audio/chords/NnlsChordVerifier.ts`, `index.ts`
- Test: `NnlsChordVerifier.spec.ts`

**Interfaces:**

- Consumes: tâches 1, 3–6 ; `OnsetDetector` et `DEFAULT_DETECTOR_CONFIG` de `../detection`.
- Produces :

  ```ts
  interface FrameSource {
  	readonly sampleRate: number;
  	onFrame(cb: (f: AudioFrame) => void): () => void;
  }
  class NnlsChordVerifier implements ChordVerifierPort {
  	constructor(
  		input: FrameSource,
  		options?: { variants?: readonly JudgeVariant[]; active?: string }
  	);
  }
  ```

  Comportement : sans attente, les trames ne coûtent rien. Avec une attente : anneau de `FFT_SIZE` échantillons, un spectre de Hann tous les `HOP_SIZE` échantillons ; `OnsetDetector` sur les trames ; une attaque à `t ≥ opensAt` ouvre une fenêtre (`maxPool` des spectres dont le début est ≥ t) ; à chaque point de `REPORT_POINTS_MS` atteint (temps de trame ≥ t + point), un rapport : `time` = t, `windowMs` = point, `variants` = `judgeWindow` de chaque variante, `decided` = celle de la variante active. Le rapport du dernier point garde `spectrum` (`fromHz` = `MIN_HZ`, `binHz`, magnitudes en `number[]` jusqu’à `SPECTRUM_KEEP_MAX_HZ`). Une nouvelle attaque dans la même attente ouvre sa propre fenêtre. `expect(autre)` ou `expect(null)` : chaque fenêtre ouverte émet un dernier rapport coupé (`windowMs` = durée réelle, spectre gardé) si elle n’a pas encore atteint son dernier point, puis tout est oublié.

- [ ] **Step 1: Write the failing tests** (source de trames factice qui découpe un signal synthétique en trames de 512 ; candidats comme à la tâche 5) :
  - accord A3 D4 F#4 attaqué à 1,0 s, attente posée à 0,9 s → quatre rapports, `windowMs` `[250, 500, 1000, 2000]`, `time` ≈ 1,0 (à 15 ms), `decided` `'2,3,2'` dès 250 ms ; seul le dernier a `spectrum` ;
  - silence → aucun rapport ;
  - nouvelle attente à 1,3 s → rapports à 250 ms puis un rapport `windowMs` ≈ 300 avec `spectrum`, rien ensuite ;
  - `expect(null)` → plus aucun rapport ;
  - même accord à 44,1 kHz → `decided` `'2,3,2'` ;
  - deux variantes (`default` et une au seuil 0,99) → `variants` a deux entrées, `decided` suit l’active.
- [ ] **Step 2: Run** `npx vitest run src/lib/infrastructure/audio/chords/NnlsChordVerifier.spec.ts` — Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `feat: verify played chords against known candidates`

### Task 8: Fixtures réelles

**Files:**

- Create: `scripts/cut-triad-fixtures.ts`
- Create: `src/lib/infrastructure/audio/chords/fixtures/*.wav`, `fixtures/index.json`
- Create: `src/lib/infrastructure/audio/chords/testing/wav.ts` (lecture PCM 16 bits mono)
- Test: `src/lib/infrastructure/audio/chords/realChords.spec.ts`

**Interfaces:**

- Consumes: tâche 7 ; corpus local `corpus/triades/*.json|wav` du dépôt principal (format `neckspert-triads-corpus` v1 : `events[]` avec `voicing.frets`, `voicing.midi`, `previous`, `timeSec`, `ok` ; `input.kind`, `latencyMs`, `style`).
- Produces : `fixtures/index.json` = liste de `{ file, label, input, style, triad, frets, midi, previous, attackSec, expect: 'recognized' | 'frozen', frozenDecision?: string | null }`.

  Le script (`node --experimental-transform-types scripts/cut-triad-fixtures.ts <corpusDir> <outDir>`) découpe, pour chaque événement choisi, de `timeSec − 0,5 s` à `timeSec + 2,2 s`, en WAV PCM 16 bits mono 48 kHz. Sélection, 12 extraits, tous `ok` : D plaqué DI ; G plaqué DI ; Ebm plaqué DI ; A arpégé DI ; F#m arpégé DI ; C mélangé DI ; F mélangé DI ; D plaqué micro ; Em plaqué micro ; Ab arpégé micro ; et les deux pièges : D [2 3 2] après [7 7 5] (relier D plaqué DI) et Ab [8 9 8] après [5 4 4] (relier Ab plaqué DI).

- [ ] **Step 1: Run the script** sur le corpus et vérifier `du -sh fixtures` ≤ 3 Mo.
- [ ] **Step 2: Write the test** : chaque extrait passe dans `NnlsChordVerifier` (source de trames lue du WAV, attente posée 0,4 s après le début, candidats = `voicingCandidates` de l’occurrence étiquetée, sans l’accord précédent) ; pour `recognized`, la décision du rapport le plus long est l’étiquette ; pour `frozen`, elle vaut `frozenDecision`.
- [ ] **Step 3: Run** `npx vitest run src/lib/infrastructure/audio/chords/realChords.spec.ts`. Un extrait `recognized` qui échoue n’est pas corrigé en touchant au juge : on le passe en `frozen` avec sa décision réelle, et on le note au ledger (Ruling). Les deux pièges sont `frozen` d’office.
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** — `test: check the chord verifier on real recorded triads`

### Task 9: Câblage, sauvegarde, diagnostic

**Files:**

- Modify: `src/lib/composition/createApp.ts` (une `WebAudioInput`, donnée au détecteur et à `NnlsChordVerifier` ; `sensors.chord = chordSensor(verifier)`)
- Modify: `src/lib/infrastructure/storage/DexieBackup.spec.ts` (aller-retour)
- Modify: `src/routes/diagnostic/+page.svelte` (section Accords)

**Interfaces:**

- Consumes: tâches 2, 5–7 ; `closeTriadVoicings`, `voicingOccurrences`, `voicingCandidates`, `chordLabel`, `qualityById`, `parseSpelledNote`.

  Section Accords : sélecteurs fondamentale (12), qualité (maj, min), corde de la fondamentale (sol, si, mi) et occurrence (cases) ; bouton « Écouter » qui pose l’attente (`opensAt` = `context.currentTime`, `style: 'unknown'`) sur un `NnlsChordVerifier` branché sur l’entrée de la page ; liste des 20 derniers rapports : fenêtre, décision de chaque variante, scores par candidat (libellé = cases). Textes en français, comme le reste de la page.

- [ ] **Step 1: Write the failing test** in `DexieBackup.spec.ts` : un essai dont une observation porte un `ChordObservationPayload` avec `spectrum` (100 magnitudes) ressort identique d’un export puis import.
- [ ] **Step 2: Run** `npx vitest run src/lib/infrastructure/storage/DexieBackup.spec.ts` — Expected: PASS ou FAIL ; s’il passe d’emblée, le test fige un comportement déjà correct (noter au ledger, pas de code à écrire pour lui).
- [ ] **Step 3: Implement** le câblage et la section Accords.
- [ ] **Step 4: Run the merge gate** `npm test && npm run check` — Expected: all green. Puis `npm run dev` et ouvrir `/diagnostic` : la section s’affiche, « Écouter » ne lève pas d’erreur dans la console (vérification manuelle, sans guitare : aucun rapport attendu).
- [ ] **Step 5: Commit** — `feat: wire the chord sensor and try it on the diagnostic page`
