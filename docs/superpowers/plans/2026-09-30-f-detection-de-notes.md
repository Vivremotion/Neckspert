# F — Détection de notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter la détection d'attaque et de hauteur (octave incluse) pour une guitare branchée, via `AudioWorklet` + `pitchy`, et exposer une page utilitaire `/diagnostic` pour la valider à l'oreille et à l'écran.

**Architecture:** Un processeur `AudioWorklet` découpe l'entrée en trames d'environ 512 échantillons et envoie chaque trame avec l'heure audio du premier échantillon. Sur le fil principal, `OnsetDetector` repère une montée de RMS contre une enveloppe lente (avec cooldown), `estimatePitch` appelle `pitchy`, et `NoteTracker` confirme la hauteur sur deux fenêtres consécutives avant d'émettre un `NoteOnset` à l'heure de l'attaque (pas à celle de la confirmation). `WebAudioNoteDetector` branche `getUserMedia`, le worklet et le tracker, et implémente `NoteDetectorPort`. La page `/diagnostic` a son propre `AudioContext` (ce plan ne possède pas l'horloge) et sert uniquement au diagnostic.

**Tech Stack:** TypeScript, Web Audio API (`AudioWorklet`, `MediaStreamAudioSourceNode`), `pitchy@4.1.0` (`PitchDetector.forFloat32Array` / `findPitch`), Vitest (projet `server`, Node) pour la logique pure et le tracker sur signaux synthétiques ; Svelte 5 (runes) + CSS natif pour `/diagnostic`.

## Global Constraints

- Svelte 5, runes uniquement : `$state`, `$derived`, `$effect`, `$props`. Pas de stores Svelte 4 (`writable`), pas de `export let`.
- SvelteKit en site statique : adapter-static avec `fallback: 'index.html'`, `ssr = false` dans `src/routes/+layout.ts`.
- Toute la temporisation audio est calée sur `AudioContext.currentTime` (secondes). Jamais `setInterval`, jamais `performance.now()` pour mesurer un temps musical. Les horodatages de stockage sont en millisecondes epoch (`Date.now()` ou `AudioClockPort.toEpochMs`).
- CSS natif avec variables ; pas de bibliothèque de composants ni de Tailwind.
- Tests Vitest : fichiers `*.spec.ts` (Node) ; tests de composants dans `*.svelte.spec.ts` (jsdom).
- Noms de notes toujours en lettres (C, D, E…), dièses canoniques en interne (`C#`), bémols seulement à l'affichage.
- Interface bilingue français et anglais ; français par défaut.
- Données uniquement en local (IndexedDB), sans compte.
- Prettier : tabulations, guillemets simples, pas de virgule finale, largeur 100 (configuration générée par `sv`).
- Node : version de `.nvmrc` (22.23.3).

Contraintes propres à ce plan :

- Branche `plan/f-detection-de-notes`, créée depuis `main` après la fusion de P0.
- Chemins possédés uniquement : `src/lib/infrastructure/audio/detection/**` et `src/routes/diagnostic/**`. Aucun autre fichier n'est créé ni modifié : ni `package.json`, ni `vite.config.ts`, ni fichier du socle, ni autre plan de la vague 1.
- Imports autorisés hors de ces dossiers : `$lib/application/ports` (`NoteDetectorPort`, `NoteOnset`, `AudioInputDevice`) et `$lib/domain/music/types` (`Midi`). Rien des plans A à E ni G à H.
- `pitchy` est déjà installé par P0 (`^4.1.0`). Import : `import { PitchDetector } from 'pitchy'`.
- Entrée audio brute : `getUserMedia` avec `echoCancellation: false`, `noiseSuppression: false`, `autoGainControl: false` (README, « Règles audio partagées »).
- E grave à vide ≈ 82,4 Hz : `windowSize` ≥ 2048 à 48 kHz (plusieurs périodes dans la fenêtre McLeod).
- Chargement du worklet (Vite 8) : `import workletUrl from './frame-processor.ts?worker&url'` puis `await context.audioWorklet.addModule(new URL(workletUrl, import.meta.url))` — même motif que Neckspert (`HPCPDetector`). Ne pas utiliser `new URL('./frame-processor.ts', import.meta.url)` seul : en build de production le `.ts` n'est pas transpiled. Ce plan ne peut pas toucher `vite.config.ts` ; le motif `?worker&url` suffit avec la config P0.
- Le clic du métronome (plan E) est hors périmètre ; ce plan n'émet aucun son.
- Tests : `npx vitest run <fichier.spec.ts>`. Pas de `*.svelte.spec.ts` pour `/diagnostic` (page utilitaire).

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `src/lib/infrastructure/audio/detection/config.ts` | `DetectorConfig`, `DEFAULT_DETECTOR_CONFIG`, constantes de confirmation |
| `src/lib/infrastructure/audio/detection/frequencyToMidi.ts` | Conversion Hz → MIDI (flottant), arrondi et clamp |
| `src/lib/infrastructure/audio/detection/frequencyToMidi.spec.ts` | Tests de conversion et de clamp |
| `src/lib/infrastructure/audio/detection/estimatePitch.ts` | Enveloppe autour de `pitchy` |
| `src/lib/infrastructure/audio/detection/estimatePitch.spec.ts` | Tests sur sinusoïdes et silence |
| `src/lib/infrastructure/audio/detection/OnsetDetector.ts` | Montée de RMS vs enveloppe lente + cooldown |
| `src/lib/infrastructure/audio/detection/OnsetDetector.spec.ts` | Tests sur enveloppes synthétiques |
| `src/lib/infrastructure/audio/detection/synth.ts` | Générateur de cordes pincées (privé aux tests et au tracker) |
| `src/lib/infrastructure/audio/detection/NoteTracker.ts` | Enchaîne onset + deux fenêtres de pitch → `NoteOnset` |
| `src/lib/infrastructure/audio/detection/NoteTracker.spec.ts` | Batterie de précision à 44,1 et 48 kHz |
| `src/lib/infrastructure/audio/detection/frame-processor.ts` | `AudioWorkletProcessor` : trames ~512 + `frameTime` |
| `src/lib/infrastructure/audio/detection/WebAudioNoteDetector.ts` | `NoteDetectorPort` : media, worklet, tracker, abonnés |
| `src/lib/infrastructure/audio/detection/WebAudioNoteDetector.spec.ts` | Tests avec faux contexte / faux media |
| `src/lib/infrastructure/audio/detection/index.ts` | Réexporte l'API publique du README F |
| `src/routes/diagnostic/+page.svelte` | Page utilitaire de diagnostic |

## Décisions de ce plan

- **Taille de trame worklet** : `FRAME_SIZE = 512`. Le quantum Web Audio vaut 128 ; le processeur accumule jusqu'à 512 avant `postMessage`, pour limiter le trafic de messages tout en gardant une granularité d'attaque ≤ ~11 ms à 48 kHz.
- **Fenêtre de pitch** : `DEFAULT_DETECTOR_CONFIG.windowSize = 2048`. À 48 kHz, E2 (82,4 Hz) tient ≈ 3,5 périodes dans la fenêtre — minimum pour que McLeod (`pitchy`) stabilise le grave sans erreur d'octave.
- **Confirmation** : après une attaque, `NoteTracker` estime le pitch sur **deux fenêtres consécutives non chevauchées** de `windowSize` échantillons à partir de l'échantillon d'attaque. Acceptation si les deux clarités passent le seuil **et** `|1200 · log₂(f₁/f₂)| ≤ CONFIRM_CENTS` (50). Le `NoteOnset.time` est l'heure d'attaque renvoyée par `OnsetDetector`, jamais l'heure de la seconde fenêtre.
- **MIDI** : `Math.round(frequencyToMidi(frequencyHz))` puis clamp dans `[minMidi, maxMidi]` (40…88). Hors plage guitare → note la plus proche bornée, pas de rejet silencieux une fois la hauteur confirmée.
- **Onset** : RMS de trame vs enveloppe EMA lente (`envelope = (1 - α) · envelope + α · rms`, α petit). Attaque si `rms ≥ minRms` et `rms ≥ onsetRatio · envelope` et cooldown écoulé. L'heure d'attaque est `frameTime + i / sampleRate` où `i` est le premier échantillon de la trame dont le RMS glissant local dépasse le seuil (sinon `frameTime`).
- **Après émission** : cooldown (ms → échantillons) ; le tracker ignore les nouvelles attaques jusqu'à la fin du cooldown, pour ne pas re-déclencher sur la même résonance.
- **Niveaux** : chaque trame calcule un RMS (0…1) pour `onLevel` ; pas de lissage obligatoire côté détecteur (la page peut afficher directement).
- **Page diagnostic** : `AudioContext` local, créé au clic sur Démarrer (geste utilisateur). N'utilise pas `WebAudioClock`. CSS natif minimal, pas de jetons H, pas d'i18n partagé (libellés FR en dur — page utilitaire).

Valeurs de `DEFAULT_DETECTOR_CONFIG` :

| Clé | Valeur | Rôle |
|---|---|---|
| `minMidi` | `40` | E2 |
| `maxMidi` | `88` | E6 (marge aiguë) |
| `clarityThreshold` | `0.85` | Seuil `pitchy` |
| `onsetRatio` | `1.8` | RMS / enveloppe |
| `minRms` | `0.02` | Plancher de silence |
| `cooldownMs` | `100` | Anti double-déclenchement |
| `windowSize` | `2048` | Fenêtre McLeod |

---

### Task 1: Configuration et conversion MIDI

**Files:**
- Create: `src/lib/infrastructure/audio/detection/config.ts`
- Create: `src/lib/infrastructure/audio/detection/frequencyToMidi.ts`
- Test: `src/lib/infrastructure/audio/detection/frequencyToMidi.spec.ts`

**Interfaces:**
- Consumes: `Midi` de `$lib/domain/music/types`.
- Produces: `DetectorConfig`, `DEFAULT_DETECTOR_CONFIG`, `CONFIRM_CENTS` (= 50), `frequencyToMidi(frequencyHz: number): number` (MIDI flottant, A4 = 440 Hz → 69), `midiFromFrequency(frequencyHz: number, minMidi: number, maxMidi: number): Midi` (arrondi + clamp).

- [ ] **Step 1: Écrire le test**

Créer `src/lib/infrastructure/audio/detection/frequencyToMidi.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_DETECTOR_CONFIG } from './config';
import { frequencyToMidi, midiFromFrequency } from './frequencyToMidi';

describe('DEFAULT_DETECTOR_CONFIG', () => {
	it('covers the playable guitar range and a long enough window for low E', () => {
		expect(DEFAULT_DETECTOR_CONFIG.minMidi).toBe(40);
		expect(DEFAULT_DETECTOR_CONFIG.maxMidi).toBe(88);
		expect(DEFAULT_DETECTOR_CONFIG.windowSize).toBeGreaterThanOrEqual(2048);
		expect(DEFAULT_DETECTOR_CONFIG.clarityThreshold).toBeGreaterThan(0);
		expect(DEFAULT_DETECTOR_CONFIG.onsetRatio).toBeGreaterThan(1);
		expect(DEFAULT_DETECTOR_CONFIG.minRms).toBeGreaterThan(0);
		expect(DEFAULT_DETECTOR_CONFIG.cooldownMs).toBeGreaterThan(0);
	});
});

describe('frequencyToMidi', () => {
	it('maps A4 and open low E', () => {
		expect(frequencyToMidi(440)).toBeCloseTo(69, 5);
		expect(frequencyToMidi(82.40689)).toBeCloseTo(40, 2);
	});
});

describe('midiFromFrequency', () => {
	it('rounds to the nearest MIDI note and clamps', () => {
		expect(midiFromFrequency(440, 40, 88)).toBe(69);
		expect(midiFromFrequency(82.40689, 40, 88)).toBe(40);
		expect(midiFromFrequency(20, 40, 88)).toBe(40);
		expect(midiFromFrequency(5000, 40, 88)).toBe(88);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/infrastructure/audio/detection/frequencyToMidi.spec.ts`
Expected: FAIL, « Failed to resolve import "./config" » ou « Failed to resolve import "./frequencyToMidi" ».

- [ ] **Step 3: Écrire la configuration et la conversion**

Créer `src/lib/infrastructure/audio/detection/config.ts` :

```ts
export interface DetectorConfig {
	minMidi: number;
	maxMidi: number;
	clarityThreshold: number;
	onsetRatio: number;
	minRms: number;
	cooldownMs: number;
	windowSize: number;
}

/** Guitar range: low E (MIDI 40) to E6 (MIDI 88). windowSize ≥ 2048 at 48 kHz for E2. */
export const DEFAULT_DETECTOR_CONFIG: DetectorConfig = {
	minMidi: 40,
	maxMidi: 88,
	clarityThreshold: 0.85,
	onsetRatio: 1.8,
	minRms: 0.02,
	cooldownMs: 100,
	windowSize: 2048
};

/** Max cents between two confirming pitch estimates. */
export const CONFIRM_CENTS = 50;
```

Créer `src/lib/infrastructure/audio/detection/frequencyToMidi.ts` :

```ts
import type { Midi } from '$lib/domain/music/types';

/** Continuous MIDI number; A4 (440 Hz) = 69. */
export function frequencyToMidi(frequencyHz: number): number {
	return 69 + 12 * Math.log2(frequencyHz / 440);
}

/** Nearest MIDI note, clamped to [minMidi, maxMidi]. */
export function midiFromFrequency(frequencyHz: number, minMidi: number, maxMidi: number): Midi {
	const midi = Math.round(frequencyToMidi(frequencyHz));
	return Math.min(maxMidi, Math.max(minMidi, midi));
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/infrastructure/audio/detection/frequencyToMidi.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/infrastructure/audio/detection/config.ts \
  src/lib/infrastructure/audio/detection/frequencyToMidi.ts \
  src/lib/infrastructure/audio/detection/frequencyToMidi.spec.ts
git commit -m "feat(detection): add detector config and frequency-to-MIDI"
```

---

### Task 2: Estimation de hauteur (pitchy)

**Files:**
- Create: `src/lib/infrastructure/audio/detection/estimatePitch.ts`
- Test: `src/lib/infrastructure/audio/detection/estimatePitch.spec.ts`

**Interfaces:**
- Consumes: `PitchDetector` de `pitchy` ; rien d'autre du dépôt hors ce dossier.
- Produces: `estimatePitch(samples: Float32Array, sampleRate: number, clarityThreshold: number): { frequencyHz: number; clarity: number } | null` — `null` si la clarté est sous le seuil, si la fréquence est ≤ 0, ou si `samples.length` est 0.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/infrastructure/audio/detection/estimatePitch.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { estimatePitch } from './estimatePitch';

function sine(frequencyHz: number, sampleRate: number, length: number): Float32Array {
	const samples = new Float32Array(length);
	for (let i = 0; i < length; i++) {
		samples[i] = Math.sin((2 * Math.PI * frequencyHz * i) / sampleRate);
	}
	return samples;
}

describe('estimatePitch', () => {
	it('detects A4 on a clean sine at 48 kHz', () => {
		const result = estimatePitch(sine(440, 48000, 2048), 48000, 0.8);
		expect(result).not.toBeNull();
		expect(result!.frequencyHz).toBeCloseTo(440, 0);
		expect(result!.clarity).toBeGreaterThanOrEqual(0.8);
	});

	it('detects low E without an octave error at 48 kHz', () => {
		const result = estimatePitch(sine(82.40689, 48000, 2048), 48000, 0.8);
		expect(result).not.toBeNull();
		expect(result!.frequencyHz).toBeCloseTo(82.4, 0);
	});

	it('returns null for silence', () => {
		expect(estimatePitch(new Float32Array(2048), 48000, 0.8)).toBeNull();
	});

	it('returns null when clarity is below the threshold', () => {
		const noise = new Float32Array(2048);
		for (let i = 0; i < noise.length; i++) noise[i] = Math.random() * 2 - 1;
		expect(estimatePitch(noise, 48000, 0.99)).toBeNull();
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/infrastructure/audio/detection/estimatePitch.spec.ts`
Expected: FAIL, « Failed to resolve import "./estimatePitch" ».

- [ ] **Step 3: Écrire l'estimation**

Créer `src/lib/infrastructure/audio/detection/estimatePitch.ts` :

```ts
import { PitchDetector } from 'pitchy';

export function estimatePitch(
	samples: Float32Array,
	sampleRate: number,
	clarityThreshold: number
): { frequencyHz: number; clarity: number } | null {
	if (samples.length === 0) return null;
	const detector = PitchDetector.forFloat32Array(samples.length);
	const [frequencyHz, clarity] = detector.findPitch(samples, sampleRate);
	if (!(frequencyHz > 0) || clarity < clarityThreshold) return null;
	return { frequencyHz, clarity };
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/infrastructure/audio/detection/estimatePitch.spec.ts`
Expected: PASS (4 tests). Si le grave échoue à ±1 Hz près, élargir `toBeCloseTo` à la précision 0 tout en gardant l'absence d'erreur d'octave (`frequencyHz` entre 70 et 95).

- [ ] **Step 5: Commit**

```bash
git add src/lib/infrastructure/audio/detection/estimatePitch.ts \
  src/lib/infrastructure/audio/detection/estimatePitch.spec.ts
git commit -m "feat(detection): wrap pitchy for clarity-gated pitch"
```

---

### Task 3: Détecteur d'attaque

**Files:**
- Create: `src/lib/infrastructure/audio/detection/OnsetDetector.ts`
- Test: `src/lib/infrastructure/audio/detection/OnsetDetector.spec.ts`

**Interfaces:**
- Consumes: `DetectorConfig` (Task 1).
- Produces: `class OnsetDetector { constructor(config: DetectorConfig, sampleRate: number); push(frame: Float32Array, frameTime: number): number | null }` — renvoie l'heure audio d'attaque (s) ou `null`.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/infrastructure/audio/detection/OnsetDetector.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_DETECTOR_CONFIG } from './config';
import { OnsetDetector } from './OnsetDetector';

const SAMPLE_RATE = 48000;
const FRAME = 512;

function frameOf(rms: number): Float32Array {
	const samples = new Float32Array(FRAME);
	const amplitude = rms * Math.SQRT2;
	for (let i = 0; i < FRAME; i++) samples[i] = amplitude;
	return samples;
}

function silence(): Float32Array {
	return new Float32Array(FRAME);
}

describe('OnsetDetector', () => {
	it('returns null while the signal stays quiet', () => {
		const detector = new OnsetDetector(DEFAULT_DETECTOR_CONFIG, SAMPLE_RATE);
		for (let i = 0; i < 20; i++) {
			expect(detector.push(silence(), i * (FRAME / SAMPLE_RATE))).toBeNull();
		}
	});

	it('fires on a sharp RMS rise and respects the cooldown', () => {
		const detector = new OnsetDetector(DEFAULT_DETECTOR_CONFIG, SAMPLE_RATE);
		for (let i = 0; i < 30; i++) {
			detector.push(frameOf(0.005), i * (FRAME / SAMPLE_RATE));
		}
		const attackAt = 30 * (FRAME / SAMPLE_RATE);
		const onset = detector.push(frameOf(0.2), attackAt);
		expect(onset).not.toBeNull();
		expect(Math.abs(onset! - attackAt)).toBeLessThan(0.01);

		const next = detector.push(frameOf(0.25), attackAt + FRAME / SAMPLE_RATE);
		expect(next).toBeNull();
	});

	it('does not fire on a slow level creep', () => {
		const detector = new OnsetDetector(
			{ ...DEFAULT_DETECTOR_CONFIG, onsetRatio: 1.8, minRms: 0.02 },
			SAMPLE_RATE
		);
		let last: number | null = null;
		for (let i = 0; i < 80; i++) {
			const rms = 0.005 + i * 0.001;
			last = detector.push(frameOf(rms), i * (FRAME / SAMPLE_RATE));
		}
		expect(last).toBeNull();
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/infrastructure/audio/detection/OnsetDetector.spec.ts`
Expected: FAIL, « Failed to resolve import "./OnsetDetector" ».

- [ ] **Step 3: Écrire le détecteur d'attaque**

Créer `src/lib/infrastructure/audio/detection/OnsetDetector.ts` :

```ts
import type { DetectorConfig } from './config';

function rmsOf(frame: Float32Array): number {
	let sum = 0;
	for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
	return Math.sqrt(sum / Math.max(1, frame.length));
}

/** Finds a sharp RMS rise against a slow envelope; returns attack time (audio s) or null. */
export class OnsetDetector {
	private envelope = 0;
	private cooldownUntil = -Infinity;
	private readonly alpha: number;
	private readonly cooldownS: number;

	constructor(
		private readonly config: DetectorConfig,
		private readonly sampleRate: number
	) {
		// Slow envelope: ~200 ms time constant.
		const frameS = 512 / sampleRate;
		this.alpha = 1 - Math.exp(-frameS / 0.2);
		this.cooldownS = config.cooldownMs / 1000;
	}

	push(frame: Float32Array, frameTime: number): number | null {
		const rms = rmsOf(frame);
		const prevEnvelope = this.envelope;
		this.envelope = (1 - this.alpha) * this.envelope + this.alpha * rms;

		if (frameTime < this.cooldownUntil) return null;
		if (rms < this.config.minRms) return null;
		const floor = Math.max(this.config.minRms, prevEnvelope * this.config.onsetRatio);
		if (rms < floor) return null;

		const attackTime = this.refineAttackTime(frame, frameTime, floor);
		this.cooldownUntil = attackTime + this.cooldownS;
		return attackTime;
	}

	private refineAttackTime(frame: Float32Array, frameTime: number, threshold: number): number {
		const window = Math.min(64, frame.length);
		for (let i = 0; i + window <= frame.length; i += 16) {
			let sum = 0;
			for (let j = 0; j < window; j++) sum += frame[i + j] * frame[i + j];
			const local = Math.sqrt(sum / window);
			if (local >= threshold) {
				return frameTime + i / this.sampleRate;
			}
		}
		return frameTime;
	}
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/infrastructure/audio/detection/OnsetDetector.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/infrastructure/audio/detection/OnsetDetector.ts \
  src/lib/infrastructure/audio/detection/OnsetDetector.spec.ts
git commit -m "feat(detection): detect note onsets from RMS rises"
```

---

### Task 4: Suivi de note et signaux synthétiques

**Files:**
- Create: `src/lib/infrastructure/audio/detection/synth.ts`
- Create: `src/lib/infrastructure/audio/detection/NoteTracker.ts`
- Test: `src/lib/infrastructure/audio/detection/NoteTracker.spec.ts`

**Interfaces:**
- Consumes: `DetectorConfig`, `CONFIRM_CENTS` (Task 1) ; `midiFromFrequency` (Task 1) ; `estimatePitch` (Task 2) ; `OnsetDetector` (Task 3) ; `NoteOnset` de `$lib/application/ports`.
- Produces: `class NoteTracker { constructor(config: DetectorConfig, sampleRate: number); push(frame: Float32Array, frameTime: number): NoteOnset | null }` — un `NoteOnset` par attaque confirmée ; `time` = heure d'attaque. Helper de test `synthesizePluck` dans `synth.ts` (utilisé par le spec ; peut rester exporté pour réutilisation locale).

Règles du tracker :
1. Empile les trames dans un tampon circulaire d'échantillons horodatés.
2. Passe chaque trame à `OnsetDetector` ; si une attaque arrive et qu'aucune confirmation n'est en cours, mémorise `pendingOnsetTime`.
3. Dès que le tampon contient `2 × windowSize` échantillons à partir de l'attaque, estime le pitch sur `[attaque, attaque+W)` et `[attaque+W, attaque+2W)`.
4. Si les deux estimations passent clarté + accord ≤ 50 cents, émet `{ time: pendingOnsetTime, midi, frequencyHz, clarity }` (moyenne des deux fréquences, min des deux clarités, MIDI clampé) et arme le cooldown via l'onset déjà consommé.
5. Sinon abandonne cette attaque (pas d'émission) ; le prochain onset pourra réessayer.

- [ ] **Step 1: Écrire le générateur et le test**

Créer `src/lib/infrastructure/audio/detection/synth.ts` :

```ts
/**
 * Synthetic plucked string: sharp attack, decaying harmonics.
 * Silence before `attackSample`, then a ~1 ms rise and exponential decay.
 */
export function synthesizePluck(input: {
	frequencyHz: number;
	sampleRate: number;
	durationS: number;
	attackSample: number;
	amplitude?: number;
}): Float32Array {
	const { frequencyHz, sampleRate, durationS, attackSample } = input;
	const amplitude = input.amplitude ?? 0.35;
	const n = Math.floor(durationS * sampleRate);
	const out = new Float32Array(n);
	const harmonics = [1, 0.55, 0.3, 0.18, 0.1];
	const attackLen = Math.max(1, Math.floor(0.001 * sampleRate));
	for (let i = attackSample; i < n; i++) {
		const age = i - attackSample;
		const t = age / sampleRate;
		const attackEnv = Math.min(1, age / attackLen);
		const decay = Math.exp(-2.8 * t);
		let sample = 0;
		for (let h = 0; h < harmonics.length; h++) {
			sample += harmonics[h] * Math.sin(2 * Math.PI * frequencyHz * (h + 1) * t);
		}
		out[i] = sample * attackEnv * decay * amplitude;
	}
	return out;
}

export function pushAll(
	tracker: { push(frame: Float32Array, frameTime: number): unknown },
	signal: Float32Array,
	sampleRate: number,
	frameSize = 512,
	startTime = 0
): unknown[] {
	const emitted: unknown[] = [];
	for (let offset = 0; offset + frameSize <= signal.length; offset += frameSize) {
		const frame = signal.subarray(offset, offset + frameSize);
		const frameTime = startTime + offset / sampleRate;
		const result = tracker.push(frame, frameTime);
		if (result != null) emitted.push(result);
	}
	return emitted;
}
```

Créer `src/lib/infrastructure/audio/detection/NoteTracker.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { NoteOnset } from '$lib/application/ports';
import { DEFAULT_DETECTOR_CONFIG } from './config';
import { NoteTracker } from './NoteTracker';
import { pushAll, synthesizePluck } from './synth';

const NOTES = {
	E2: { hz: 82.40689, midi: 40 },
	A2: { hz: 110, midi: 45 },
	B3: { hz: 246.9417, midi: 59 },
	E4: { hz: 329.6276, midi: 64 },
	/** 12th fret on low E = E3 */
	E3: { hz: 164.8138, midi: 52 }
} as const;

function expectOnset(
	onsets: NoteOnset[],
	expectedMidi: number,
	attackSample: number,
	sampleRate: number,
	startTime = 0
) {
	expect(onsets.length).toBeGreaterThanOrEqual(1);
	const onset = onsets[0];
	const expectedTime = startTime + attackSample / sampleRate;
	expect(Math.abs(onset.time - expectedTime)).toBeLessThan(0.01);
	expect(onset.midi).toBe(expectedMidi);
}

function runPluck(frequencyHz: number, sampleRate: number, attackSample = 4800): NoteOnset[] {
	const tracker = new NoteTracker(DEFAULT_DETECTOR_CONFIG, sampleRate);
	const signal = synthesizePluck({
		frequencyHz,
		sampleRate,
		durationS: 1.2,
		attackSample
	});
	return pushAll(tracker, signal, sampleRate) as NoteOnset[];
}

describe.each([44100, 48000])('NoteTracker at %s Hz', (sampleRate) => {
	it('detects E2 (low E) with onset within 10 ms and no octave error', () => {
		const onsets = runPluck(NOTES.E2.hz, sampleRate);
		expectOnset(onsets, NOTES.E2.midi, 4800, sampleRate);
	});

	it('detects A2', () => {
		expectOnset(runPluck(NOTES.A2.hz, sampleRate), NOTES.A2.midi, 4800, sampleRate);
	});

	it('detects B3', () => {
		expectOnset(runPluck(NOTES.B3.hz, sampleRate), NOTES.B3.midi, 4800, sampleRate);
	});

	it('detects E4', () => {
		expectOnset(runPluck(NOTES.E4.hz, sampleRate), NOTES.E4.midi, 4800, sampleRate);
	});

	it('detects the 12th-fret E3 on the low string', () => {
		expectOnset(runPluck(NOTES.E3.hz, sampleRate), NOTES.E3.midi, 4800, sampleRate);
	});

	it('detects two notes in a row', () => {
		const tracker = new NoteTracker(DEFAULT_DETECTOR_CONFIG, sampleRate);
		const firstAttack = 4000;
		const secondAttack = Math.floor(sampleRate * 0.55);
		const total = Math.floor(sampleRate * 1.4);
		const signal = new Float32Array(total);
		const first = synthesizePluck({
			frequencyHz: NOTES.A2.hz,
			sampleRate,
			durationS: 0.5,
			attackSample: 0
		});
		const second = synthesizePluck({
			frequencyHz: NOTES.E4.hz,
			sampleRate,
			durationS: 0.7,
			attackSample: 0
		});
		signal.set(first.subarray(0, Math.min(first.length, secondAttack - firstAttack)), firstAttack);
		signal.set(second.subarray(0, Math.min(second.length, total - secondAttack)), secondAttack);
		const onsets = pushAll(tracker, signal, sampleRate) as NoteOnset[];
		expect(onsets.length).toBe(2);
		expect(onsets[0].midi).toBe(NOTES.A2.midi);
		expect(onsets[1].midi).toBe(NOTES.E4.midi);
		expect(Math.abs(onsets[0].time - firstAttack / sampleRate)).toBeLessThan(0.01);
		expect(Math.abs(onsets[1].time - secondAttack / sampleRate)).toBeLessThan(0.01);
	});

	it('emits nothing on silence', () => {
		const tracker = new NoteTracker(DEFAULT_DETECTOR_CONFIG, sampleRate);
		const silence = new Float32Array(sampleRate);
		expect(pushAll(tracker, silence, sampleRate)).toEqual([]);
	});

	it('emits nothing on broadband noise', () => {
		const tracker = new NoteTracker(DEFAULT_DETECTOR_CONFIG, sampleRate);
		const noise = new Float32Array(sampleRate);
		for (let i = 0; i < noise.length; i++) noise[i] = (Math.random() * 2 - 1) * 0.2;
		expect(pushAll(tracker, noise, sampleRate)).toEqual([]);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/infrastructure/audio/detection/NoteTracker.spec.ts`
Expected: FAIL, « Failed to resolve import "./NoteTracker" ».

- [ ] **Step 3: Écrire le tracker**

Créer `src/lib/infrastructure/audio/detection/NoteTracker.ts` :

```ts
import type { NoteOnset } from '$lib/application/ports';
import { CONFIRM_CENTS, type DetectorConfig } from './config';
import { estimatePitch } from './estimatePitch';
import { midiFromFrequency } from './frequencyToMidi';
import { OnsetDetector } from './OnsetDetector';

function centsBetween(a: number, b: number): number {
	return Math.abs(1200 * Math.log2(a / b));
}

/** Glues onset and pitch: emits one NoteOnset per attack, once the pitch is stable. */
export class NoteTracker {
	private readonly onset: OnsetDetector;
	private readonly samples: number[] = [];
	private readonly times: number[] = [];
	private pendingOnsetTime: number | null = null;
	private readonly maxBuffer: number;

	constructor(
		private readonly config: DetectorConfig,
		private readonly sampleRate: number
	) {
		this.onset = new OnsetDetector(config, sampleRate);
		this.maxBuffer = config.windowSize * 4;
	}

	push(frame: Float32Array, frameTime: number): NoteOnset | null {
		for (let i = 0; i < frame.length; i++) {
			this.samples.push(frame[i]);
			this.times.push(frameTime + i / this.sampleRate);
		}
		if (this.samples.length > this.maxBuffer) {
			const drop = this.samples.length - this.maxBuffer;
			this.samples.splice(0, drop);
			this.times.splice(0, drop);
		}

		if (this.pendingOnsetTime === null) {
			const attack = this.onset.push(frame, frameTime);
			if (attack !== null) this.pendingOnsetTime = attack;
		} else {
			// Keep the onset detector's envelope/cooldown updated while confirming.
			this.onset.push(frame, frameTime);
		}

		if (this.pendingOnsetTime === null) return null;
		return this.tryConfirm(this.pendingOnsetTime);
	}

	private tryConfirm(onsetTime: number): NoteOnset | null {
		const start = this.indexAtOrAfter(onsetTime);
		if (start < 0) return null;
		const need = this.config.windowSize * 2;
		if (this.samples.length - start < need) return null;

		const first = Float32Array.from(this.samples.slice(start, start + this.config.windowSize));
		const second = Float32Array.from(
			this.samples.slice(start + this.config.windowSize, start + need)
		);
		const a = estimatePitch(first, this.sampleRate, this.config.clarityThreshold);
		const b = estimatePitch(second, this.sampleRate, this.config.clarityThreshold);
		this.pendingOnsetTime = null;
		if (!a || !b) return null;
		if (centsBetween(a.frequencyHz, b.frequencyHz) > CONFIRM_CENTS) return null;

		const frequencyHz = (a.frequencyHz + b.frequencyHz) / 2;
		const clarity = Math.min(a.clarity, b.clarity);
		return {
			time: onsetTime,
			midi: midiFromFrequency(frequencyHz, this.config.minMidi, this.config.maxMidi),
			frequencyHz,
			clarity
		};
	}

	private indexAtOrAfter(time: number): number {
		for (let i = 0; i < this.times.length; i++) {
			if (this.times[i] >= time - 1e-9) return i;
		}
		return -1;
	}
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/infrastructure/audio/detection/NoteTracker.spec.ts`
Expected: PASS (16 tests : 8 cas × 2 taux d'échantillonnage). Si un grave échoue, vérifier `windowSize === 2048` et l'amplitude du synthé ; ne pas baisser `clarityThreshold` sous 0.8 sans cause.

- [ ] **Step 5: Commit**

```bash
git add src/lib/infrastructure/audio/detection/synth.ts \
  src/lib/infrastructure/audio/detection/NoteTracker.ts \
  src/lib/infrastructure/audio/detection/NoteTracker.spec.ts
git commit -m "feat(detection): confirm pitch on two windows after onset"
```

---

### Task 5: Worklet et adaptateur Web Audio

**Files:**
- Create: `src/lib/infrastructure/audio/detection/frame-processor.ts`
- Create: `src/lib/infrastructure/audio/detection/WebAudioNoteDetector.ts`
- Test: `src/lib/infrastructure/audio/detection/WebAudioNoteDetector.spec.ts`

**Interfaces:**
- Consumes: `NoteDetectorPort`, `NoteOnset`, `AudioInputDevice` (`$lib/application/ports`) ; `DetectorConfig`, `DEFAULT_DETECTOR_CONFIG` ; `NoteTracker`.
- Produces: `class WebAudioNoteDetector implements NoteDetectorPort { constructor(context: () => AudioContext, options?: Partial<DetectorConfig>); listInputs(): Promise<AudioInputDevice[]>; start(deviceId: string | null): Promise<void>; stop(): void; onNote(cb): () => void; onLevel(cb): () => void }`.

Chargement Vite 8 du worklet (à coller tel quel) :

```ts
import frameProcessorUrl from './frame-processor.ts?worker&url';
// …
await context.audioWorklet.addModule(new URL(frameProcessorUrl, import.meta.url));
```

- [ ] **Step 1: Écrire le processeur worklet**

Créer `src/lib/infrastructure/audio/detection/frame-processor.ts` :

```ts
const FRAME_SIZE = 512;

declare const currentTime: number;
declare const sampleRate: number;

registerProcessor(
	'note-frame-processor',
	class extends AudioWorkletProcessor {
		private readonly buffer = new Float32Array(FRAME_SIZE);
		private filled = 0;
		private frameStartTime = 0;

		process(inputs: Float32Array[][]): boolean {
			const channels = inputs[0];
			if (!channels?.length || channels[0].length === 0) return true;

			const frameLength = channels[0].length;
			const mixed = new Float32Array(frameLength);
			for (let i = 0; i < frameLength; i++) {
				let sum = 0;
				for (let ch = 0; ch < channels.length; ch++) sum += channels[ch][i];
				mixed[i] = sum / channels.length;
			}

			let offset = 0;
			while (offset < mixed.length) {
				if (this.filled === 0) {
					this.frameStartTime = currentTime + offset / sampleRate;
				}
				const space = FRAME_SIZE - this.filled;
				const take = Math.min(space, mixed.length - offset);
				this.buffer.set(mixed.subarray(offset, offset + take), this.filled);
				this.filled += take;
				offset += take;
				if (this.filled === FRAME_SIZE) {
					this.port.postMessage({
						samples: this.buffer.slice(),
						frameTime: this.frameStartTime
					});
					this.filled = 0;
				}
			}
			return true;
		}
	}
);
```

- [ ] **Step 2: Écrire le test de l'adaptateur**

Créer `src/lib/infrastructure/audio/detection/WebAudioNoteDetector.spec.ts` :

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./frame-processor.ts?worker&url', () => ({
	default: '/virtual/note-frame-processor.js'
}));

import { WebAudioNoteDetector } from './WebAudioNoteDetector';

class FakeNode {
	port = { onmessage: null as ((ev: MessageEvent) => void) | null };
	connect = vi.fn();
	disconnect = vi.fn();
}

class FakeContext {
	currentTime = 0;
	destination = {};
	audioWorklet = {
		addModule: vi.fn(async () => undefined)
	};
	createMediaStreamSource = vi.fn(() => ({
		connect: vi.fn(),
		disconnect: vi.fn()
	}));
	createGain = vi.fn(() => {
		const gain = { gain: { setValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
		return gain;
	});
}

function installMedia(devices: MediaDeviceInfo[] = []) {
	const track = { stop: vi.fn() };
	const stream = { getTracks: () => [track] } as unknown as MediaStream;
	const getUserMedia = vi.fn(async (constraints: MediaStreamConstraints) => {
		(installMedia as unknown as { lastConstraints: MediaStreamConstraints }).lastConstraints =
			constraints;
		return stream;
	});
	const enumerateDevices = vi.fn(async () => devices);
	Object.defineProperty(globalThis, 'navigator', {
		configurable: true,
		value: { mediaDevices: { getUserMedia, enumerateDevices } }
	});
	return { getUserMedia, stream, track };
}

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe('WebAudioNoteDetector', () => {
	it('lists audio inputs', async () => {
		installMedia([
			{
				deviceId: 'in-1',
				kind: 'audioinput',
				label: 'Interface',
				groupId: 'g',
				toJSON() {
					return this;
				}
			} as MediaDeviceInfo
		]);
		const detector = new WebAudioNoteDetector(() => new FakeContext() as unknown as AudioContext);
		await expect(detector.listInputs()).resolves.toEqual([{ id: 'in-1', label: 'Interface' }]);
	});

	it('opens getUserMedia with raw-input constraints and loads the worklet', async () => {
		const { getUserMedia } = installMedia();
		const fake = new FakeContext();
		const node = new FakeNode();
		vi.stubGlobal(
			'AudioWorkletNode',
			vi.fn(function AudioWorkletNode() {
				return node;
			})
		);
		const detector = new WebAudioNoteDetector(() => fake as unknown as AudioContext);
		await detector.start(null);
		expect(getUserMedia).toHaveBeenCalledOnce();
		const audio = getUserMedia.mock.calls[0][0].audio as MediaTrackConstraints;
		expect(audio.echoCancellation).toBe(false);
		expect(audio.noiseSuppression).toBe(false);
		expect(audio.autoGainControl).toBe(false);
		expect(fake.audioWorklet.addModule).toHaveBeenCalledOnce();
		detector.stop();
	});

	it('forwards worklet frames to note and level listeners', async () => {
		installMedia();
		const fake = new FakeContext();
		const node = new FakeNode();
		vi.stubGlobal(
			'AudioWorkletNode',
			vi.fn(function AudioWorkletNode() {
				return node;
			})
		);
		const detector = new WebAudioNoteDetector(() => fake as unknown as AudioContext, {
			clarityThreshold: 0.5,
			minRms: 0.001,
			onsetRatio: 1.2,
			cooldownMs: 50
		});
		const levels: number[] = [];
		detector.onLevel((rms) => levels.push(rms));
		await detector.start(null);
		expect(node.port.onmessage).toBeTypeOf('function');

		const frame = new Float32Array(512);
		for (let i = 0; i < 512; i++) frame[i] = 0.2;
		node.port.onmessage!({ data: { samples: frame, frameTime: 1 } } as MessageEvent);
		expect(levels.length).toBe(1);
		expect(levels[0]).toBeGreaterThan(0);
		detector.stop();
	});
});
```

- [ ] **Step 3: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/infrastructure/audio/detection/WebAudioNoteDetector.spec.ts`
Expected: FAIL, « Failed to resolve import "./WebAudioNoteDetector" ».

- [ ] **Step 4: Écrire l'adaptateur**

Créer `src/lib/infrastructure/audio/detection/WebAudioNoteDetector.ts` :

```ts
import type {
	AudioInputDevice,
	NoteDetectorPort,
	NoteOnset
} from '$lib/application/ports';
import frameProcessorUrl from './frame-processor.ts?worker&url';
import { DEFAULT_DETECTOR_CONFIG, type DetectorConfig } from './config';
import { NoteTracker } from './NoteTracker';

function rmsOf(frame: Float32Array): number {
	let sum = 0;
	for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
	return Math.sqrt(sum / Math.max(1, frame.length));
}

/** Single-note detection from the guitar input via AudioWorklet + pitchy. */
export class WebAudioNoteDetector implements NoteDetectorPort {
	private readonly config: DetectorConfig;
	private stream: MediaStream | null = null;
	private source: MediaStreamAudioSourceNode | null = null;
	private node: AudioWorkletNode | null = null;
	private gain: GainNode | null = null;
	private tracker: NoteTracker | null = null;
	private workletLoaded = false;
	private readonly noteListeners = new Set<(onset: NoteOnset) => void>();
	private readonly levelListeners = new Set<(rms: number) => void>();

	constructor(
		private readonly context: () => AudioContext,
		options?: Partial<DetectorConfig>
	) {
		this.config = { ...DEFAULT_DETECTOR_CONFIG, ...options };
	}

	async listInputs(): Promise<AudioInputDevice[]> {
		const devices = await navigator.mediaDevices.enumerateDevices();
		return devices
			.filter((d) => d.kind === 'audioinput')
			.map((d) => ({ id: d.deviceId, label: d.label || d.deviceId }));
	}

	async start(deviceId: string | null): Promise<void> {
		this.stop();
		const ctx = this.context();
		if (!this.workletLoaded) {
			await ctx.audioWorklet.addModule(new URL(frameProcessorUrl, import.meta.url));
			this.workletLoaded = true;
		}

		this.stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				...(deviceId ? { deviceId: { exact: deviceId } } : {}),
				channelCount: { ideal: 2 },
				echoCancellation: false,
				noiseSuppression: false,
				autoGainControl: false
			}
		});

		this.tracker = new NoteTracker(this.config, ctx.sampleRate);
		this.source = ctx.createMediaStreamSource(this.stream);
		this.node = new AudioWorkletNode(ctx, 'note-frame-processor', {
			channelCount: 2,
			channelCountMode: 'explicit',
			channelInterpretation: 'discrete'
		});
		this.gain = ctx.createGain();
		this.gain.gain.setValueAtTime(0, ctx.currentTime);
		this.source.connect(this.node);
		this.node.connect(this.gain);
		this.gain.connect(ctx.destination);

		this.node.port.onmessage = (event: MessageEvent) => {
			const { samples, frameTime } = event.data as {
				samples: Float32Array;
				frameTime: number;
			};
			const rms = rmsOf(samples);
			this.levelListeners.forEach((listener) => listener(rms));
			if (!this.tracker) return;
			const onset = this.tracker.push(samples, frameTime);
			if (onset) this.noteListeners.forEach((listener) => listener(onset));
		};
	}

	stop(): void {
		this.node?.port && (this.node.port.onmessage = null);
		this.node?.disconnect();
		this.source?.disconnect();
		this.gain?.disconnect();
		this.stream?.getTracks().forEach((track) => track.stop());
		this.node = null;
		this.source = null;
		this.gain = null;
		this.stream = null;
		this.tracker = null;
	}

	onNote(callback: (onset: NoteOnset) => void): () => void {
		this.noteListeners.add(callback);
		return () => this.noteListeners.delete(callback);
	}

	onLevel(callback: (rms: number) => void): () => void {
		this.levelListeners.add(callback);
		return () => this.levelListeners.delete(callback);
	}
}
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/infrastructure/audio/detection/WebAudioNoteDetector.spec.ts`
Expected: PASS (3 tests). Si le typage de `*?worker&url` échoue, s'assurer que `vite/client` est dans les types du `tsconfig` (déjà fourni par P0) — ne pas modifier `tsconfig`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/infrastructure/audio/detection/frame-processor.ts \
  src/lib/infrastructure/audio/detection/WebAudioNoteDetector.ts \
  src/lib/infrastructure/audio/detection/WebAudioNoteDetector.spec.ts
git commit -m "feat(detection): wire AudioWorklet capture to NoteTracker"
```

---

### Task 6: Page diagnostic, index et vérification

**Files:**
- Create: `src/lib/infrastructure/audio/detection/index.ts`
- Create: `src/routes/diagnostic/+page.svelte`

**Interfaces:**
- Consumes: tout le module détection ; `WebAudioNoteDetector` crée son propre contexte via `() => new AudioContext()` (page utilitaire, hors composition K).
- Produces: réexport public du README F ; route `/diagnostic` avec bouton Démarrer / Arrêter, sélecteur d'entrée, niveau, dernière note (nom+octave, cents), clarté, heure d'attaque, journal des 20 dernières attaques.

Affichage note : MIDI → nom dièse + octave (`octave = floor(midi/12) - 1`, C4 = 60). Cents = `100 * (frequencyToMidi(f) - midi)`.

- [ ] **Step 1: Écrire l'index**

Créer `src/lib/infrastructure/audio/detection/index.ts` :

```ts
export {
	CONFIRM_CENTS,
	DEFAULT_DETECTOR_CONFIG,
	type DetectorConfig
} from './config';
export { frequencyToMidi, midiFromFrequency } from './frequencyToMidi';
export { estimatePitch } from './estimatePitch';
export { OnsetDetector } from './OnsetDetector';
export { NoteTracker } from './NoteTracker';
export { WebAudioNoteDetector } from './WebAudioNoteDetector';
```

- [ ] **Step 2: Écrire la page diagnostic**

Créer `src/routes/diagnostic/+page.svelte` :

```svelte
<script lang="ts">
	import type { AudioInputDevice, NoteOnset } from '$lib/application/ports';
	import {
		WebAudioNoteDetector,
		frequencyToMidi
	} from '$lib/infrastructure/audio/detection';

	const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

	function formatNote(midi: number): string {
		const name = NOTE_NAMES[((midi % 12) + 12) % 12];
		const octave = Math.floor(midi / 12) - 1;
		return `${name}${octave}`;
	}

	function centsOff(frequencyHz: number, midi: number): number {
		return 100 * (frequencyToMidi(frequencyHz) - midi);
	}

	let devices = $state<AudioInputDevice[]>([]);
	let selectedId = $state<string | null>(null);
	let running = $state(false);
	let level = $state(0);
	let last = $state<NoteOnset | null>(null);
	let log = $state<NoteOnset[]>([]);
	let error = $state<string | null>(null);

	let context: AudioContext | null = null;
	let detector: WebAudioNoteDetector | null = null;
	let unsubNote: (() => void) | null = null;
	let unsubLevel: (() => void) | null = null;

	async function refreshDevices() {
		if (!detector) {
			context ??= new AudioContext();
			detector = new WebAudioNoteDetector(() => context!);
		}
		devices = await detector.listInputs();
		if (!selectedId && devices[0]) selectedId = devices[0].id;
	}

	async function start() {
		error = null;
		context ??= new AudioContext();
		if (context.state === 'suspended') await context.resume();
		detector ??= new WebAudioNoteDetector(() => context!);
		unsubNote?.();
		unsubLevel?.();
		unsubNote = detector.onNote((onset) => {
			last = onset;
			log = [onset, ...log].slice(0, 20);
		});
		unsubLevel = detector.onLevel((rms) => {
			level = rms;
		});
		await detector.start(selectedId);
		running = true;
		await refreshDevices();
	}

	function stop() {
		detector?.stop();
		unsubNote?.();
		unsubLevel?.();
		unsubNote = null;
		unsubLevel = null;
		running = false;
		level = 0;
	}

	$effect(() => {
		refreshDevices().catch((e) => {
			error = e instanceof Error ? e.message : String(e);
		});
		return () => stop();
	});
</script>

<main class="diag">
	<h1>Diagnostic détection</h1>
	<p class="hint">Entrée brute (echo / noise / AGC désactivés). Brancher une interface si possible.</p>

	{#if error}
		<p class="error">{error}</p>
	{/if}

	<label class="row">
		<span>Entrée</span>
		<select bind:value={selectedId} disabled={running}>
			<option value={null}>Par défaut</option>
			{#each devices as device (device.id)}
				<option value={device.id}>{device.label || device.id}</option>
			{/each}
		</select>
	</label>

	<div class="row actions">
		{#if running}
			<button type="button" onclick={stop}>Arrêter</button>
		{:else}
			<button type="button" onclick={() => start().catch((e) => (error = e.message))}>
				Démarrer
			</button>
		{/if}
		<button type="button" onclick={() => refreshDevices()} disabled={running}>Rafraîchir</button>
	</div>

	<label class="meter">
		<span>Niveau</span>
		<progress max="1" value={Math.min(1, level * 4)}></progress>
		<code>{level.toFixed(3)}</code>
	</label>

	<section class="last">
		<h2>Dernière note</h2>
		{#if last}
			<p>
				<strong>{formatNote(last.midi)}</strong>
				(MIDI {last.midi}) · {last.frequencyHz.toFixed(2)} Hz ·
				{centsOff(last.frequencyHz, last.midi).toFixed(1)} cents · clarté
				{last.clarity.toFixed(3)} · t={last.time.toFixed(3)} s
			</p>
		{:else}
			<p>—</p>
		{/if}
	</section>

	<section>
		<h2>Journal (20)</h2>
		<ol>
			{#each log as onset, i (onset.time + ':' + i)}
				<li>
					{formatNote(onset.midi)} · {onset.frequencyHz.toFixed(1)} Hz ·
					{centsOff(onset.frequencyHz, onset.midi).toFixed(1)} ¢ · t={onset.time.toFixed(3)}
				</li>
			{/each}
		</ol>
	</section>
</main>

<style>
	.diag {
		--ink: #1a1a1a;
		--muted: #666;
		--line: #ccc;
		--bg: #f7f7f5;
		--accent: #813b2a;
		font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, monospace;
		color: var(--ink);
		background: var(--bg);
		min-height: 100vh;
		margin: 0;
		padding: 1.5rem;
		line-height: 1.45;
		max-width: 40rem;
	}
	h1 {
		font-size: 1.25rem;
		margin: 0 0 0.5rem;
	}
	h2 {
		font-size: 1rem;
		margin: 1.25rem 0 0.5rem;
	}
	.hint {
		color: var(--muted);
		font-size: 0.85rem;
	}
	.error {
		color: #8b0000;
	}
	.row {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		margin: 0.75rem 0;
	}
	select,
	button {
		font: inherit;
		padding: 0.4rem 0.6rem;
	}
	button {
		background: var(--accent);
		color: #fff;
		border: none;
		cursor: pointer;
	}
	button:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.meter {
		display: grid;
		grid-template-columns: 4rem 1fr 4rem;
		gap: 0.5rem;
		align-items: center;
	}
	progress {
		width: 100%;
		height: 0.75rem;
	}
	ol {
		padding-left: 1.25rem;
		border-top: 1px solid var(--line);
	}
	li {
		font-size: 0.85rem;
		padding: 0.25rem 0;
		border-bottom: 1px solid var(--line);
	}
</style>
```

- [ ] **Step 3: Lancer tous les tests de détection et la vérif de types**

Run:

```bash
npx vitest run src/lib/infrastructure/audio/detection && npm run check
```

Expected: tous les specs du dossier PASS ; `svelte-check found 0 errors`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/infrastructure/audio/detection/index.ts \
  src/routes/diagnostic/+page.svelte
git commit -m "feat(detection): add public exports and /diagnostic page"
```

---

## Fin du plan

À la fin de ce plan, la branche `plan/f-detection-de-notes` expose `WebAudioNoteDetector` prêt à être câblé par K (même `AudioContext` que l'horloge) et une page `/diagnostic` pour valider à la guitare. Les plans G (calibration) et J (session) consomment le port, pas ces fichiers.

## Écarts notés à l'écriture

1. **`frequencyToMidi` vs cents** — le README F type le retour en `Midi` ; le plan renvoie le MIDI *continu* (alias `number`) pour que `/diagnostic` calcule les cents. L'arrondi + clamp vit dans `midiFromFrequency` (utilisé par `NoteTracker`).
2. **`vite.config.ts` intouchable** — impossible d'ajouter `worker.format: 'es'` ici (propriété P0). Le motif Neckspert `?worker&url` + `new URL(..., import.meta.url)` est celui à utiliser ; si un build de production cassait le worklet, ce serait un correctif P0/K, pas F.
3. **Tests Node + worklet** — l'import `?worker&url` est mocké dans `WebAudioNoteDetector.spec.ts` ; la précision pitch/onset est prouvée hors navigateur via `NoteTracker` + synthé.