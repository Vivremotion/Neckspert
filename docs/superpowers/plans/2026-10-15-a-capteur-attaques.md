# Capteur d’attaques (plan A) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Un capteur d’attaques sans hauteur (SuperFlux), branché sur l’entrée partagée, journalisé en ombre à côté du détecteur de notes actuel, prêt à servir le rythme (plan 1) et la calibration à deux entrées.

**Architecture:** Un module spectral partagé (`infrastructure/audio/spectral/` : FFT déplacée depuis `chords/`, banc de filtres au demi-ton) ; un traqueur pur `AttackTracker` (SuperFlux, paramètres en ms) ; un adaptateur `WebAudioAttackDetector` derrière le port `AttackDetectorPort` ; un capteur `attackSensor` côté application ; l’ombre et un rapport de comparaison sur les archives du journal ; l’enregistrement au débit natif en option de développement.

**Tech Stack:** TypeScript, Vitest (projet `server` pour `*.spec.ts`), Web Audio (trames de `WebAudioInput`), Node 22 `--experimental-transform-types` pour les scripts.

**Spec:** `docs/superpowers/specs/2026-10-14-temps-musical-et-sequences-design.md` (section 8, et section 7 « Calibration » pour l’usage futur).

## Global Constraints

- Node 22.23.3, `npm test && npm run check` vert à chaque commit (barrière de fusion).
- Tests avant le code ; `expect.requireAssertions` est actif : chaque test affirme.
- Paramètres du capteur **en millisecondes**, indépendants de la fréquence d’échantillonnage.
- `MIN_ATTACK_GAP_MS = 25` (constante nommée, à calibrer).
- Critères (spec §8) : deux attaques à 30 ms séparées ; datation à ±5 ms (on vise ±2 ms sur synthèse à 44,1/48 kHz, ±3 ms à 16 kHz) ; aucune fausse attaque sur une note tenue (vibrato, bend).
- Seuls les adaptateurs écrivent au journal de diagnostic ; le cœur et les mécaniques ne le voient pas.
- `infrastructure/audio/spectral/` et `infrastructure/audio/attacks/` n’importent rien via `$lib` (imports relatifs seulement) : le script de rapport les charge sous Node.
- Le détecteur de notes (`detection/`) n’est pas modifié.
- Commits : Conventional Commits en minuscules, impératif, orientés comportement ; terminés par `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

- **Un accord gratté** (cordes attaquées à 5–15 ms d’écart) doit compter **une** attaque, pas trois : test sur les fixtures réelles « plaqué » de `chords/fixtures/` (Task 2).
- **Une note tenue avec vibrato ou bend** ne produit aucune attaque après la première (Task 2).
- **Un jeu très doux** (−30 dBFS) est détecté ; un bruit de fond seul (−60 dBFS, ronflette 50 Hz) ne l’est pas (Task 2).
- **La même scène à 16 / 44,1 / 48 kHz** donne le même nombre d’attaques (Task 2).
- **Un trou dans les trames** (`frameTime` qui saute) ne crée pas d’attaque à la reprise (Task 2).

---

## File Structure

- `src/lib/infrastructure/audio/spectral/fft.ts` (déplacé depuis `chords/fft.ts`) — FFT réelle, spectre de magnitude.
- `src/lib/infrastructure/audio/spectral/semitoneBands.ts` — banc de filtres triangulaires au demi-ton (spectre logarithmique).
- `src/lib/infrastructure/audio/spectral/index.ts` — exports.
- `src/lib/infrastructure/audio/attacks/AttackTracker.ts` — SuperFlux pur : trames → attaques.
- `src/lib/infrastructure/audio/attacks/config.ts` — `AttackConfig`, `DEFAULT_ATTACK_CONFIG`, `MIN_ATTACK_GAP_MS`.
- `src/lib/infrastructure/audio/attacks/WebAudioAttackDetector.ts` — adaptateur du port, abonné à une `FrameSource`, journalise `attack.detected`.
- `src/lib/infrastructure/audio/attacks/testing/signals.ts` — signaux de test (pincé, salve, vibrato, glissando, bruit).
- `src/lib/infrastructure/audio/attacks/index.ts`
- `src/lib/application/ports/AttackDetectorPort.ts` — le port.
- `src/lib/application/session/sensors.ts` — `attackSensor`.
- `src/lib/infrastructure/diagnostics/attackShadow.ts` — appariement pur de deux listes d’attaques et statistiques.
- `scripts/attack-shadow-report.ts` — rapport sur une archive de journal dézippée.
- `src/lib/composition/createApp.ts`, `src/lib/composition/diagnostics.ts` — câblage, ombre.
- `src/lib/infrastructure/diagnostics/DiagnosticAudioRecorder.ts`, `DexieDiagnosticSink.ts`, `src/lib/domain/types.ts` (`DiagnosticsSettings.nativeRate`), `src/lib/infrastructure/storage/validateBackup.ts`, `src/lib/ui/screens/settings/SettingsScreen.svelte` + `messages.ts` — débit natif.

---

### Task 1: Module spectral partagé et banc de filtres au demi-ton

**Files:**
- Create: `src/lib/infrastructure/audio/spectral/fft.ts` (contenu de `chords/fft.ts`, déplacé avec `git mv`), `src/lib/infrastructure/audio/spectral/fft.spec.ts` (déplacé de `chords/fft.spec.ts`), `src/lib/infrastructure/audio/spectral/semitoneBands.ts`, `src/lib/infrastructure/audio/spectral/semitoneBands.spec.ts`, `src/lib/infrastructure/audio/spectral/index.ts`
- Modify: tout import de `./fft` dans `src/lib/infrastructure/audio/chords/` (au moins `NnlsChordVerifier.ts`) → `../spectral/fft`

**Interfaces:**
- Produces:
  - `magnitudeSpectrum` (inchangé, nouveau chemin `../spectral/fft`).
  - `createSemitoneFilterbank(input: { sampleRate: number; fftSize: number; fromHz?: number; toHz?: number; bandsPerOctave?: number }): SemitoneFilterbank`
  - `interface SemitoneFilterbank { readonly bands: number; readonly centersHz: Float64Array; apply(magnitudes: Float64Array, out: Float64Array): void }` — `apply` écrit dans `out` (longueur `bands`) `log10(1 + Σ filtre × magnitude)`.
  - Défauts : `fromHz = 30`, `toHz = min(16000, sampleRate / 2)`, `bandsPerOctave = 24`.

- [ ] **Step 1: Déplacer la FFT**

```bash
git mv src/lib/infrastructure/audio/chords/fft.ts src/lib/infrastructure/audio/spectral/fft.ts
git mv src/lib/infrastructure/audio/chords/fft.spec.ts src/lib/infrastructure/audio/spectral/fft.spec.ts
```

Mettre à jour les imports (`grep -rn "from './fft'" src/lib/infrastructure/audio/chords`).

- [ ] **Step 2: Vérifier que rien n’est cassé**

Run: `npx vitest run src/lib/infrastructure/audio`
Expected: PASS (mêmes tests qu’avant).

- [ ] **Step 3: Écrire les tests du banc de filtres**

```ts
// semitoneBands.spec.ts
import { describe, expect, it } from 'vitest';
import { magnitudeSpectrum } from './fft';
import { createSemitoneFilterbank } from './semitoneBands';

function sine(hz: number, rate: number, n: number): Float32Array {
	return Float32Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * hz * i) / rate));
}

describe('createSemitoneFilterbank', () => {
	it('has one band per quarter tone between 30 Hz and 16 kHz at 48 kHz', () => {
		const bank = createSemitoneFilterbank({ sampleRate: 48000, fftSize: 2048 });
		expect(bank.bands).toBeGreaterThan(200);
		expect(bank.centersHz[0]).toBeGreaterThanOrEqual(30);
		expect(bank.centersHz[bank.bands - 1]).toBeLessThanOrEqual(16000);
	});

	it('puts a 440 Hz sine in the band centred nearest 440 Hz, at 48 and 44.1 kHz', () => {
		for (const rate of [48000, 44100]) {
			const bank = createSemitoneFilterbank({ sampleRate: rate, fftSize: 2048 });
			const out = new Float64Array(bank.bands);
			bank.apply(magnitudeSpectrum(sine(440, rate, 2048)), out);
			const loudest = out.indexOf(Math.max(...out));
			expect(Math.abs(bank.centersHz[loudest] - 440)).toBeLessThan(440 * 0.03);
		}
	});

	it('stops at the Nyquist frequency at 16 kHz', () => {
		const bank = createSemitoneFilterbank({ sampleRate: 16000, fftSize: 512 });
		expect(bank.centersHz[bank.bands - 1]).toBeLessThanOrEqual(8000);
	});
});
```

- [ ] **Step 4: Lancer les tests, constater l’échec**

Run: `npx vitest run src/lib/infrastructure/audio/spectral/semitoneBands.spec.ts`
Expected: FAIL (module absent).

- [ ] **Step 5: Implémenter `createSemitoneFilterbank` dans `semitoneBands.ts`**

Filtres triangulaires sur les bins FFT, centres espacés de `1/bandsPerOctave` d’octave ; une bande dont le triangle ne couvre aucun bin entier prend le bin le plus proche (poids 1) ; normalisation de chaque filtre à une somme de 1 ; `apply` : somme pondérée puis `Math.log10(1 + x)`.

- [ ] **Step 6: Lancer les tests**

Run: `npx vitest run src/lib/infrastructure/audio/spectral`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/infrastructure/audio/spectral src/lib/infrastructure/audio/chords
git commit -m "refactor: share the spectral tools and add a quarter-tone filterbank"
```

---

### Task 2: `AttackTracker`, SuperFlux pur

**Files:**
- Create: `src/lib/infrastructure/audio/attacks/config.ts`, `src/lib/infrastructure/audio/attacks/AttackTracker.ts`, `src/lib/infrastructure/audio/attacks/AttackTracker.spec.ts`, `src/lib/infrastructure/audio/attacks/testing/signals.ts`, `src/lib/infrastructure/audio/attacks/realAttacks.spec.ts`

**Interfaces:**
- Consumes: `magnitudeSpectrum`, `createSemitoneFilterbank` (Task 1) ; `readWav` de `src/lib/infrastructure/audio/chords/testing/wav.ts` (lecteur WAV des fixtures existantes).
- Produces:
  - `config.ts` :

```ts
export const MIN_ATTACK_GAP_MS = 25;
export interface AttackConfig {
	windowMs: number;      // 46 : fenêtre d’analyse (taille FFT = puissance de 2 la plus proche)
	hopMs: number;         // 2.5
	lagMs: number;         // 5 : écart entre la trame et sa référence (μ de SuperFlux)
	maxFilterBands: number; // 3 : largeur du filtre de maximum en fréquence
	preMaxMs: number;      // 30
	postMaxMs: number;     // 10
	preAvgMs: number;      // 100
	postAvgMs: number;     // 10
	delta: number;         // 0.6 : seuil au-dessus de la moyenne locale (spectre log)
	minGapMs: number;      // MIN_ATTACK_GAP_MS
	minRms: number;        // 0.002 : silence
}
export const DEFAULT_ATTACK_CONFIG: AttackConfig;
```

  - `AttackTracker.ts` :

```ts
export interface DetectedAttack { time: number; strength: number }
export class AttackTracker {
	constructor(sampleRate: number, config?: Partial<AttackConfig>);
	/** Feeds one block of mono samples starting at `frameTime` (audio s); returns the attacks settled by it. */
	push(samples: Float32Array, frameTime: number): DetectedAttack[];
	/** Forgets the past (a gap in the input). */
	reset(): void;
}
```

- [ ] **Step 1: Écrire les signaux de test**

`testing/signals.ts` exporte, tous en `Float32Array` au débit demandé :
- `plucks({ rate, durationS, attacksS: number[], hz?, amplitude? })` — somme de `synthesizePluck` (`../../detection/synth`) à chaque instant ;
- `mutedBurst({ rate, durationS, atS, amplitude? })` — bruit blanc de 15 ms à décroissance exponentielle (τ = 4 ms), graine fixe ;
- `vibratoNote({ rate, durationS, atS, hz, depthCents, rateHz })` — note pincée dont la fréquence oscille (phase intégrée) ;
- `glide({ rate, durationS, atS, fromHz, toHz, glideS })` — note pincée dont la fréquence monte linéairement en `glideS` ;
- `hum({ rate, durationS, amplitude })` — 50 Hz + harmoniques 2 et 3 ;
- `feed(tracker, signal, rate, blockSize = 512, start = 0, gapAfterS?: number)` — pousse par blocs (avec un saut de `frameTime` de 0,5 s après `gapAfterS` si donné) et concatène les attaques.

- [ ] **Step 2: Écrire les tests de comportement**

```ts
// AttackTracker.spec.ts
import { describe, expect, it } from 'vitest';
import { AttackTracker } from './AttackTracker';
import { feed, glide, hum, mutedBurst, plucks, vibratoNote } from './testing/signals';

const RATES = [48000, 44100, 16000] as const;
const tol = (rate: number) => (rate === 16000 ? 0.003 : 0.002);

describe('AttackTracker', () => {
	it.each(RATES)('dates a single pluck within tolerance at %i Hz', (rate) => {
		const attacks = feed(new AttackTracker(rate), plucks({ rate, durationS: 1, attacksS: [0.3] }), rate);
		expect(attacks).toHaveLength(1);
		expect(Math.abs(attacks[0].time - 0.3)).toBeLessThanOrEqual(tol(rate));
	});

	it.each([0.075, 0.05, 0.03])('separates plucks %f s apart', (gap) => {
		const rate = 48000;
		const times = [0.2, 0.2 + gap, 0.2 + 2 * gap, 0.2 + 3 * gap];
		const attacks = feed(new AttackTracker(rate), plucks({ rate, durationS: 1, attacksS: times, hz: 330 }), rate);
		expect(attacks.map((a) => a.time)).toHaveLength(4);
		attacks.forEach((a, i) => expect(Math.abs(a.time - times[i])).toBeLessThanOrEqual(0.002));
	});

	it('hears a muted strum (pitchless burst)', () => {
		const rate = 48000;
		const attacks = feed(new AttackTracker(rate), mutedBurst({ rate, durationS: 0.6, atS: 0.25 }), rate);
		expect(attacks).toHaveLength(1);
	});

	it('gives one attack for a held note with vibrato (±50 cents, 5.5 Hz)', () => {
		const rate = 48000;
		const signal = vibratoNote({ rate, durationS: 2, atS: 0.2, hz: 330, depthCents: 50, rateHz: 5.5 });
		expect(feed(new AttackTracker(rate), signal, rate)).toHaveLength(1);
	});

	it('gives one attack for a two-semitone bend', () => {
		const rate = 48000;
		const signal = glide({ rate, durationS: 1.5, atS: 0.2, fromHz: 330, toHz: 370, glideS: 0.3 });
		expect(feed(new AttackTracker(rate), signal, rate)).toHaveLength(1);
	});

	it('hears soft playing at −30 dBFS but not hum at −60 dBFS', () => {
		const rate = 48000;
		const soft = plucks({ rate, durationS: 1, attacksS: [0.4], amplitude: 0.0316 });
		expect(feed(new AttackTracker(rate), soft, rate)).toHaveLength(1);
		expect(feed(new AttackTracker(rate), hum({ rate, durationS: 2, amplitude: 0.001 }), rate)).toHaveLength(0);
	});

	it.each(RATES)('counts the same attacks at %i Hz', (rate) => {
		const times = [0.2, 0.45, 0.6, 0.9];
		expect(feed(new AttackTracker(rate), plucks({ rate, durationS: 1.2, attacksS: times }), rate)).toHaveLength(4);
	});

	it('makes no attack out of a gap in the frames', () => {
		const rate = 48000;
		const signal = vibratoNote({ rate, durationS: 2, atS: 0.1, hz: 220, depthCents: 0, rateHz: 1 });
		expect(feed(new AttackTracker(rate), signal, rate, 512, 0, 1.0)).toHaveLength(1);
	});

	it('reports a strength between 0 and 1, larger for a harder pick', () => {
		const rate = 48000;
		const soft = plucks({ rate, durationS: 1.5, attacksS: [0.2], amplitude: 0.05 });
		const hard = plucks({ rate, durationS: 1.5, attacksS: [0.9], amplitude: 0.4 });
		const attacks = feed(new AttackTracker(rate), soft.map((v, i) => v + hard[i]), rate);
		expect(attacks).toHaveLength(2);
		expect(attacks[1].strength).toBeGreaterThan(attacks[0].strength);
		for (const a of attacks) {
			expect(a.strength).toBeGreaterThanOrEqual(0);
			expect(a.strength).toBeLessThanOrEqual(1);
		}
	});
});
```

- [ ] **Step 3: Écrire le test sur de vrais enregistrements**

`realAttacks.spec.ts` lit les fixtures WAV de `src/lib/infrastructure/audio/chords/fixtures/` (nom : `NN-<id>_<geste>_<entrée>-<cases>.wav`) : pour chacune des 7 fixtures dont le geste est `plaque`, le traqueur rend **exactement 1** attaque à moins de 0,15 s de l’instant attendu (0,4 s après le début de l’extrait, cf. `BEFORE_S` de `scripts/cut-triad-fixtures.ts`) et aucune autre avant 1,5 s ; pour chacune des 3 fixtures `arpege`, **au moins 2** attaques.

- [ ] **Step 4: Lancer les tests, constater l’échec**

Run: `npx vitest run src/lib/infrastructure/audio/attacks`
Expected: FAIL (module absent).

- [ ] **Step 5: Implémenter `config.ts` et `AttackTracker`**

Algorithme (SuperFlux, Böck et Widmer, DAFx 2013, en ligne) :

```text
fft   = puissance de 2 la plus proche de windowMs·rate ; hop = round(hopMs·rate)
pour chaque pas : fenêtre de Hann des `fft` derniers échantillons → magnitudeSpectrum → bank.apply → S[t]
réf   = S[t − lag] (lag = max(1, round(lagMs / hopMs))) filtrée par un maximum sur ±floor(maxFilterBands/2) bandes
flux  = Σ max(0, S[t][b] − réf[b])                       (silence : RMS < minRms → flux = 0)
pic   = flux[t] est le maximum de [t − preMax, t + postMax]
        et flux[t] ≥ moyenne de [t − preAvg, t + postAvg] + delta
        et t − dernier pic ≥ minGap
temps = affinage dans les échantillons bruts : premier point de [tCoarse − 30 ms, tCoarse + 5 ms]
        où la RMS sur 1 ms dépasse 4 × la médiane des RMS de 1 ms des 20 ms précédentes ; sinon tCoarse
        (tCoarse = début de la trame de Hann + fft/2 − hop/2)
force = flux[pic] / max(flux des 4 dernières secondes, flux[pic]), dans [0, 1]
```

Une attaque est rendue quand `postMaxMs` (et `postAvgMs`) sont écoulés après son pic. `reset()` vide l’historique ; `push` appelle `reset()` quand `frameTime` diffère de la fin attendue du bloc précédent de plus d’un demi-bloc. Les paramètres en ms sont convertis en pas au constructeur.

- [ ] **Step 6: Lancer les tests ; régler les constantes de `DEFAULT_ATTACK_CONFIG` jusqu’au vert sans toucher aux tests**

Run: `npx vitest run src/lib/infrastructure/audio/attacks`
Expected: PASS. Si un test des fixtures réelles résiste, ne pas l’affaiblir : noter dans le commit la valeur obtenue, et le signaler (c’est une mesure de la spec, pas un détail).

- [ ] **Step 7: Commit**

```bash
git add src/lib/infrastructure/audio/attacks
git commit -m "feat: detect pitchless attacks with superflux, vibrato and bends ignored"
```

---

### Task 3: Port, adaptateur et capteur

**Files:**
- Create: `src/lib/application/ports/AttackDetectorPort.ts`, `src/lib/infrastructure/audio/attacks/WebAudioAttackDetector.ts`, `src/lib/infrastructure/audio/attacks/WebAudioAttackDetector.spec.ts`, `src/lib/infrastructure/audio/attacks/index.ts`
- Modify: `src/lib/application/ports/index.ts` (export), `src/lib/application/session/sensors.ts` (+ `attackSensor`), `src/lib/application/session/sensors.spec.ts`, `src/lib/testing/fakes.ts` (+ `FakeAttackDetector`)

**Interfaces:**
- Consumes: `AttackTracker` (Task 2) ; `FrameSource` (`src/lib/infrastructure/audio/chords/NnlsChordVerifier.ts`, à déplacer dans `src/lib/infrastructure/audio/input/WebAudioInput.ts` avec `AudioFrame`, ré-exporté depuis `chords` pour ne rien casser) ; `DiagnosticSink`.
- Produces:

```ts
// AttackDetectorPort.ts
export interface AttackEvent { time: number; strength: number; channel?: number }
/** Pitchless attacks from an input. Listening starts with the first listener and stops with the last. */
export interface AttackDetectorPort {
	onAttack(callback: (attack: AttackEvent) => void): () => void;
}

// WebAudioAttackDetector.ts
export class WebAudioAttackDetector implements AttackDetectorPort {
	constructor(source: FrameSource, options?: { diagnostics?: DiagnosticSink; config?: Partial<AttackConfig>; channel?: number });
}

// sensors.ts
export type AttackPayload = { strength: number; channel?: number };
export function attackSensor(detector: AttackDetectorPort): SensorFactory;

// fakes.ts
export class FakeAttackDetector implements AttackDetectorPort {
	emit(attack: AttackEvent): void;
	readonly listeners: number;
}
```

- [ ] **Step 1: Écrire les tests**

```ts
// WebAudioAttackDetector.spec.ts — `FakeFrameSource` de src/lib/infrastructure/audio/chords/testing/frames.ts (blocs de 512)
it('subscribes to the frames with its first listener and unsubscribes with its last', ...);
//   expect(source.subscribers).toBe(0) → onAttack → 1 → unsubscribe → 0
it('emits the attacks of the frames with their audio time', ...);
//   plucks à 0.3 et 0.6 s (startTime 10) → times ≈ [10.3, 10.6] à ±0.002
it('journals each attack as attack.detected when the journal is on', ...);
//   FakeDiagnosticSink(enabled) → events [{ kind: 'attack.detected', audioTime: ≈10.3, data: { strength } }, …]
it('journals nothing when the journal is off', ...);

// sensors.spec.ts
it('attackSensor dates each attack minus the calibrated latency, readable, with its strength', ...);
//   latencyMs 12, emit({ time: 1, strength: 0.5 }) → { time: 0.988, payload: { strength: 0.5 }, readable: true }
```

- [ ] **Step 2: Lancer, constater l’échec**

Run: `npx vitest run src/lib/infrastructure/audio/attacks src/lib/application/session/sensors.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implémenter le port, l’adaptateur, le capteur et le faux**

L’adaptateur crée son `AttackTracker` au premier abonnement (au débit de la source) et le jette au dernier désabonnement. `attackSensor` suit `noteSensor` (`sensors.ts`).

- [ ] **Step 4: Lancer les tests**

Run: `npx vitest run src/lib/infrastructure/audio/attacks src/lib/application/session`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/application/ports src/lib/application/session/sensors.ts src/lib/application/session/sensors.spec.ts src/lib/infrastructure/audio src/lib/testing/fakes.ts
git commit -m "feat: offer pitchless attacks as a sensor behind their own port"
```

---

### Task 4: L’ombre et son rapport

**Files:**
- Create: `src/lib/infrastructure/diagnostics/attackShadow.ts`, `src/lib/infrastructure/diagnostics/attackShadow.spec.ts`, `scripts/attack-shadow-report.ts`
- Modify: `src/lib/composition/createApp.ts`, `src/lib/composition/diagnostics.ts` (+ `shadowAttacks`), `src/lib/composition/diagnostics.spec.ts`

**Interfaces:**
- Consumes: `WebAudioAttackDetector`, `attackSensor` (Task 3) ; `NoteDetectorPort.onNote/onRejected`.
- Produces:

```ts
// attackShadow.ts (aucun import $lib)
export interface ShadowStats {
	both: number; onlyNotes: number; onlyAttacks: number;
	medianDeltaMs: number | null; p90AbsDeltaMs: number | null; biasMs: number | null; // attaque − note
}
/** Pairs each note onset with the nearest attack within `withinMs` (one-to-one, in time order). */
export function compareAttacks(notes: readonly number[], attacks: readonly number[], withinMs = 30): ShadowStats;

// composition/diagnostics.ts
/** While the journal is on, keeps the attack detector listening and journals the note detector's attacks beside it. */
export function shadowAttacks(journal: DiagnosticSink, detector: NoteDetectorPort, attacks: AttackDetectorPort): () => void;
```

Événements journalisés : `attack.detected` (par l’adaptateur), `note.attack` `{ midi }` et `note.rejected` `{ reason }` (par `shadowAttacks`, au temps de l’attaque).

- [ ] **Step 1: Écrire les tests**

```ts
// attackShadow.spec.ts
it('pairs onsets with the nearest attack within 30 ms, one to one', () => {
	const stats = compareAttacks([1.0, 2.0, 3.0], [1.004, 2.050, 3.002, 4.0]);
	expect(stats).toMatchObject({ both: 2, onlyNotes: 1, onlyAttacks: 2 });
	expect(stats.biasMs).toBeCloseTo(3, 0);
});
it('returns null deltas without any pair', () => {
	expect(compareAttacks([1], [5]).medianDeltaMs).toBeNull();
});

// diagnostics.spec.ts
it('shadowAttacks journals note attacks and keeps one attack listener while the journal is on', ...);
//   FakeNoteDetector emit → events note.attack ; FakeAttackDetector.listeners === 1 ; stop → 0
```

- [ ] **Step 2: Lancer, constater l’échec**

Run: `npx vitest run src/lib/infrastructure/diagnostics/attackShadow.spec.ts src/lib/composition/diagnostics.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implémenter `compareAttacks`, `shadowAttacks` et le câblage**

`createApp` : `const attacks = new WebAudioAttackDetector(input, { diagnostics: journal })` ; `sensors` reçoit `attack: attackSensor(attacks)` ; `shadowAttacks(journal, detector, attacks)` est appelé une fois (le journal décide à chaque prise s’il écrit).

Script `scripts/attack-shadow-report.ts` (lancé par `node --experimental-transform-types scripts/attack-shadow-report.ts <archive-dézippée>`) : pour chaque `prises/*/evenements.jsonl`, lit les temps de `note.attack` et `attack.detected`, appelle `compareAttacks`, imprime une ligne par prise et un total.

- [ ] **Step 4: Lancer les tests et le check**

Run: `npx vitest run src/lib/infrastructure/diagnostics src/lib/composition && npm run check`
Expected: PASS, 0 erreur.

- [ ] **Step 5: Commit**

```bash
git add src/lib/infrastructure/diagnostics src/lib/composition scripts/attack-shadow-report.ts
git commit -m "feat: run the attack detector in the shadow of the note detector and report how they agree"
```

---

### Task 5: Enregistrer au débit natif (option de développement)

**Files:**
- Modify: `src/lib/domain/types.ts` (`DiagnosticsSettings.nativeRate?: boolean`), `src/lib/infrastructure/diagnostics/DexieDiagnosticSink.ts` (+ getter `nativeRate`), `src/lib/application/ports/DiagnosticSink.ts` (`readonly nativeRate?: boolean`), `src/lib/infrastructure/diagnostics/DiagnosticAudioRecorder.ts`, `src/lib/composition/diagnostics.ts`, `src/lib/infrastructure/storage/validateBackup.ts`, `src/lib/ui/screens/settings/SettingsScreen.svelte`, `src/lib/ui/screens/settings/messages.ts`
- Test: `DiagnosticAudioRecorder.spec.ts`, `validateBackup.spec.ts`, `src/lib/infrastructure/storage/testing/settingsRepositoryContract.ts`

**Interfaces:**
- Produces: `DiagnosticsSettings.nativeRate?: boolean` (absent = `false`).

- [ ] **Step 1: Écrire les tests**

```ts
// DiagnosticAudioRecorder.spec.ts
it('keeps the input rate when the journal asks for the native rate', ...);
//   sink.nativeRate = true, source à 48 kHz → chunk.sampleRate === 48000, longueur = échantillons reçus
it('still brings the sound down to 16 kHz by default', ...);
// validateBackup.spec.ts
it('accepts settings with diagnostics.nativeRate and without it', ...);
```

- [ ] **Step 2: Lancer, constater l’échec**

Run: `npx vitest run src/lib/infrastructure/diagnostics src/lib/infrastructure/storage/validateBackup.spec.ts`
Expected: FAIL.

- [ ] **Step 3: Implémenter**

Le recorder lit `sink.nativeRate` à `start` : vrai → pas de `Downsampler`, blocs de `DIAGNOSTIC_CHUNK_S` secondes au débit de la source. L’écran Réglages montre la case « Enregistrer au débit natif » dans la section du journal **seulement si `import.meta.env.DEV`** (libellé fr/en dans `messages.ts`).

- [ ] **Step 4: Lancer les tests et le check**

Run: `npm test && npm run check`
Expected: PASS, 0 erreur.

- [ ] **Step 5: Commit**

```bash
git add src/lib
git commit -m "feat: let a development build journal the input at its native rate"
```

---

## Après le plan

Jouer une séance réelle des exercices existants avec le journal actif, exporter l’archive, lancer `scripts/attack-shadow-report.ts`, et lire le rapport ensemble avant de brancher le capteur au rythme (plan 1). L’oracle annoté (plan 2) donnera ensuite la vérité de terrain.
