# E — Horloge, métronome et sons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implémenter l'horloge audio partagée (`WebAudioClock`), le métronome ordonnancé sur `AudioContext.currentTime` (`WebAudioMetronome`, `beatsToSchedule`) et les sons réservés aux quatre verdicts (`WebAudioCues`), conformes aux ports du socle.

**Architecture:** Adaptateurs d'infrastructure qui implémentent `AudioClockPort`, `MetronomePort` et `SoundCuePort` (P0). `WebAudioClock` possède l'unique `AudioContext`, créé au premier `resume()` ; le métronome et les sons ne reçoivent qu'un accesseur `() => AudioContext` et ne le lisent qu'au moment de jouer. Le métronome suit le modèle « lookahead » : un minuteur réveille l'ordonnanceur, une fonction pure (`beatsToSchedule`) décide quels temps entrent dans l'horizon, et chaque clic est programmé à son heure audio exacte. La logique pure est testée en Node ; les classes Web Audio sont testées avec un faux `AudioContext` écrit dans chaque fichier de test.

**Tech Stack:** TypeScript, Web Audio API (`AudioContext`, `OscillatorNode`, `GainNode`, `getOutputTimestamp`), Vitest (projet `server`, Node, minuteurs simulés `vi.useFakeTimers`).

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

- Branche `plan/e-horloge-metronome-sons`, créée depuis `main` après la fusion de P0.
- Chemins possédés : `src/lib/infrastructure/audio/clock/**` et `src/lib/infrastructure/audio/cues/**`. Aucun autre fichier n'est créé ni modifié : ni route, ni `package.json`, ni fichier du socle.
- Imports autorisés hors de ces dossiers : `$lib/application/ports` et `$lib/domain/types` (socle P0). Rien des plans A à D ni F à H.
- Seule exception aux horloges de performance : `WebAudioClock.toEpochMs`, conversion de stockage, lit `performance.timeOrigin` et `getOutputTimestamp().performanceTime`, ou `Date.now()` en repli. Aucune mesure musicale n'en dépend.
- Le minuteur du métronome (`setTimeout`, jamais `setInterval`) ne fait que réveiller l'ordonnanceur. L'heure d'un clic et le `time` d'un `BeatEvent` viennent toujours de `firstBeatTime + index * secondsPerBeat`.
- Tempo figé pendant la marche : `setTempo` lève une erreur si le métronome tourne. `beatTime(index)` reste linéaire pour toute la durée d'une marche.
- Aucun constructeur ne touche l'`AudioContext` : il n'est lu qu'au premier `resume()`, `start()` ou `play()`, pour que la composition (K) construise tout avant le geste de l'utilisateur.
- Clic du métronome sans hauteur nette : courte rafale de bruit (tampon généré une fois par contexte) passée dans un filtre passe-bande large (`BiquadFilterNode`, Q ≤ 2), puis une enveloppe de gain. Jamais d'oscillateur pour le clic. L'accent du temps fort passe par le niveau et un filtre plus brillant, pas par une fréquence tonale (README, « Règles audio partagées »).
- Sons des verdicts synthétisés (pas de fichier audio), chacun de moins de 150 ms, gain crête d'au plus 0,2.
- Les doublures Web Audio sont écrites dans chaque fichier de test ; `src/lib/testing/**` appartient à P0.

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `src/lib/infrastructure/audio/clock/WebAudioClock.ts` | `AudioClockPort` : crée et reprend l'unique `AudioContext`, lit l'heure audio, convertit vers l'epoch |
| `src/lib/infrastructure/audio/clock/WebAudioClock.spec.ts` | Tests avec un faux contexte minimal (état, reprise, horodatage de sortie) |
| `src/lib/infrastructure/audio/clock/beatsToSchedule.ts` | Étape pure de l'ordonnanceur : quels temps programmer dans `(now, now + horizon]` |
| `src/lib/infrastructure/audio/clock/beatsToSchedule.spec.ts` | Tests purs |
| `src/lib/infrastructure/audio/clock/WebAudioMetronome.ts` | `MetronomePort` : ordonnanceur lookahead, clics de bruit filtré, accent du temps fort, abonnés `onBeat` |
| `src/lib/infrastructure/audio/clock/WebAudioMetronome.spec.ts` | Tests avec un faux contexte enregistreur et des minuteurs simulés |
| `src/lib/infrastructure/audio/clock/index.ts` | Réexporte l'horloge, le métronome et `beatsToSchedule` |
| `src/lib/infrastructure/audio/cues/cueSpecs.ts` | Description pure des quatre sons (tons, glissandos, enveloppes, limites) |
| `src/lib/infrastructure/audio/cues/cueSpecs.spec.ts` | Tests des contraintes : durée, volume, formes distinctes |
| `src/lib/infrastructure/audio/cues/WebAudioCues.ts` | `SoundCuePort` : joue la description d'un verdict à son heure audio |
| `src/lib/infrastructure/audio/cues/WebAudioCues.spec.ts` | Tests avec un faux contexte enregistreur |
| `src/lib/infrastructure/audio/cues/index.ts` | Réexporte `WebAudioCues` et les descriptions |
| `src/lib/infrastructure/audio/cues/listen.ts` | Script d'écoute manuelle, appelé depuis la console du serveur de dev ; jamais importé par l'application |

## Décisions de ce plan

- **Tempo pendant la marche** : interdit. `setTempo` lève `Error('Stop the metronome before changing the tempo')` si le métronome tourne. Changer de tempo = `stop()`, `setTempo()`, `start()`. Ainsi `beatTime(index) = firstBeatTime + index * secondsPerBeat` reste vrai pour tout index d'une marche, passé ou futur.
- **Bornes du tempo** : `MIN_TEMPO_BPM = 20`, `MAX_TEMPO_BPM = 300` (celles de Neckspert), hors bornes → `RangeError`. Tempo par défaut : `DEFAULT_SETTINGS.tempoBpm` (80).
- **Temps manqués** : si l'ordonnanceur se réveille après l'heure d'un temps (onglet en arrière-plan, fil principal bloqué plus de 100 ms), ce temps est abandonné : ni clic, ni événement. Un clic en retard est pire qu'un clic absent dans un jeu de rythme. Les index reçus par `onBeat` peuvent donc sauter ; ils restent croissants.
- **`start(firstBeatTime)`** : `firstBeatTime` doit être dans le futur (par exemple `clock.now() + 0.1`) ; un temps 0 à l'heure courante ou avant est abandonné comme tout temps manqué. `start` pendant la marche redémarre à l'index 0.
- **`onBeat`** : appelé au moment de l'ordonnancement, jusqu'à `scheduleAheadS` (100 ms) avant l'heure du temps, avec l'heure audio exacte dans `beat.time`. Un abonné qui lève une exception est journalisé (`console.error`) sans arrêter le métronome.
- **`stop()`** : annule le minuteur ; les clics déjà confiés au fil audio (au plus 100 ms d'avance) sonnent encore.
- **Parité avec `FakeMetronome` (P0)** : la doublure refuse aussi `setTempo` pendant la marche et annonce les temps jusqu'à 0,1 s d'avance. `DEFAULT_SCHEDULE_AHEAD_S` reste donc à 0,1 s ; le changer demande de changer la doublure.
- **Clic** : rafale de bruit blanc de `CLICK_DURATION_S` (30 ms), générée une fois par `AudioContext` et rejouée par un `AudioBufferSourceNode`, filtrée en passe-bande large (`CLICK_FILTER_Q = 1`) puis enveloppée par un `GainNode`. Temps faible : filtre à 2 000 Hz, gain 0,25. Temps fort : filtre à 4 000 Hz, gain 0,4. Le détecteur de hauteur (F) n'y trouve pas de fondamentale stable.
- **Latence de sortie** : les temps publiés sont des heures d'ordonnancement du contexte, pas l'heure où le son sort des haut-parleurs. La calibration (G) mesure l'écart total contre ces mêmes clics ; ce plan n'ajoute donc pas `outputLatency`.
- **Sons** : parfait = deux notes brèves à la tierce majeure montante (C6 puis E6, onde triangle) ; en avance = glissando montant bref ; en retard = glissando descendant bref ; mauvaise note = bourdonnement grave et sourd (onde carrée vers 110 Hz, gain faible). Tous sous 150 ms et sous le gain des clics.

---

### Task 1: Horloge audio

**Files:**
- Create: `src/lib/infrastructure/audio/clock/WebAudioClock.ts`
- Test: `src/lib/infrastructure/audio/clock/WebAudioClock.spec.ts`

**Interfaces:**
- Consumes: `AudioClockPort` de `$lib/application/ports` (`resume(): Promise<void>`, `now(): number`, `toEpochMs(audioTime: number): number`).
- Produces: `class WebAudioClock implements AudioClockPort { constructor(createContext?: () => AudioContext); resume(): Promise<void>; context(): AudioContext; now(): number; toEpochMs(audioTime: number): number }`. `context()`, `now()` et `toEpochMs()` lèvent une `Error` dont le message contient « resume » tant que `resume()` n'a pas été appelé. Le câblage attendu (plan K) : `new WebAudioMetronome(() => clock.context())`, `new WebAudioCues(() => clock.context())`.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/infrastructure/audio/clock/WebAudioClock.spec.ts` :

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WebAudioClock } from './WebAudioClock';

class FakeContext {
	currentTime = 0;
	resumeCalls = 0;

	constructor(public state: AudioContextState = 'suspended') {}

	async resume(): Promise<void> {
		this.resumeCalls++;
		this.state = 'running';
	}
}

class FakeContextWithTimestamp extends FakeContext {
	timestamp: AudioTimestamp = { contextTime: 0, performanceTime: 0 };

	getOutputTimestamp(): AudioTimestamp {
		return this.timestamp;
	}
}

function clockWith(fake: FakeContext) {
	const factory = vi.fn(() => fake as unknown as AudioContext);
	return { clock: new WebAudioClock(factory), factory };
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe('WebAudioClock', () => {
	it('does not create the AudioContext before resume()', () => {
		const { clock, factory } = clockWith(new FakeContext());
		expect(factory).not.toHaveBeenCalled();
		expect(() => clock.context()).toThrow(/resume/);
		expect(() => clock.now()).toThrow(/resume/);
		expect(() => clock.toEpochMs(0)).toThrow(/resume/);
	});

	it('can be constructed with the default factory outside a browser', () => {
		expect(() => new WebAudioClock()).not.toThrow();
	});

	it('creates one context and resumes it when suspended', async () => {
		const fake = new FakeContext('suspended');
		const { clock, factory } = clockWith(fake);
		await Promise.all([clock.resume(), clock.resume()]);
		expect(factory).toHaveBeenCalledTimes(1);
		expect(clock.context()).toBe(fake);
		expect(fake.state).toBe('running');
	});

	it('does not resume a running context', async () => {
		const fake = new FakeContext('running');
		const { clock } = clockWith(fake);
		await clock.resume();
		expect(fake.resumeCalls).toBe(0);
	});

	it('reads the audio time from the context', async () => {
		const fake = new FakeContext();
		const { clock } = clockWith(fake);
		await clock.resume();
		fake.currentTime = 12.5;
		expect(clock.now()).toBe(12.5);
	});
});

describe('WebAudioClock.toEpochMs', () => {
	it('uses the output timestamp when the context provides one', async () => {
		const fake = new FakeContextWithTimestamp('running');
		fake.currentTime = 10.2;
		fake.timestamp = { contextTime: 10, performanceTime: 5000 };
		const { clock } = clockWith(fake);
		await clock.resume();
		const expected = performance.timeOrigin + 5000 + (10.5 - 10) * 1000;
		expect(clock.toEpochMs(10.5)).toBeCloseTo(expected, 2);
	});

	it('falls back to Date.now() while the output timestamp is not ready', async () => {
		vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000);
		const fake = new FakeContextWithTimestamp('running');
		fake.currentTime = 20;
		const { clock } = clockWith(fake);
		await clock.resume();
		expect(clock.toEpochMs(19.5)).toBe(1_790_000_000_000 - 500);
	});

	it('falls back to Date.now() without getOutputTimestamp', async () => {
		vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000);
		const fake = new FakeContext('running');
		fake.currentTime = 3;
		const { clock } = clockWith(fake);
		await clock.resume();
		expect(clock.toEpochMs(4)).toBe(1_790_000_000_000 + 1000);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/infrastructure/audio/clock/WebAudioClock.spec.ts`
Expected: FAIL, « Failed to resolve import "./WebAudioClock" ».

- [ ] **Step 3: Écrire l'horloge**

Créer `src/lib/infrastructure/audio/clock/WebAudioClock.ts` :

```ts
import type { AudioClockPort } from '$lib/application/ports';

/** The shared audio clock. Owns the single AudioContext, created on the first resume(). */
export class WebAudioClock implements AudioClockPort {
	private audioContext: AudioContext | null = null;

	constructor(private readonly createContext: () => AudioContext = () => new AudioContext()) {}

	async resume(): Promise<void> {
		if (!this.audioContext) this.audioContext = this.createContext();
		// Safari reports 'interrupted' after a phone call; it needs resume() too.
		if (this.audioContext.state !== 'running') await this.audioContext.resume();
	}

	/** The shared AudioContext. Throws until resume() has been called. */
	context(): AudioContext {
		if (!this.audioContext) {
			throw new Error('AudioContext not created yet: call resume() from a user gesture first');
		}
		return this.audioContext;
	}

	now(): number {
		return this.context().currentTime;
	}

	/** Storage conversion only: musical timing never leaves the audio clock. */
	toEpochMs(audioTime: number): number {
		const context = this.context();
		if (typeof context.getOutputTimestamp === 'function') {
			const { contextTime, performanceTime } = context.getOutputTimestamp();
			if (contextTime !== undefined && performanceTime) {
				return performance.timeOrigin + performanceTime + (audioTime - contextTime) * 1000;
			}
		}
		return Date.now() - (context.currentTime - audioTime) * 1000;
	}
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/infrastructure/audio/clock/WebAudioClock.spec.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Vérifier les types**

Run: `npm run check`
Expected: `svelte-check found 0 errors`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/infrastructure/audio/clock/WebAudioClock.ts src/lib/infrastructure/audio/clock/WebAudioClock.spec.ts
git commit -m "feat: add web audio clock"
```

---

### Task 2: Étape pure de l'ordonnanceur

**Files:**
- Create: `src/lib/infrastructure/audio/clock/beatsToSchedule.ts`
- Test: `src/lib/infrastructure/audio/clock/beatsToSchedule.spec.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `beatsToSchedule(input: { nextIndex: number; firstBeatTime: number; secondsPerBeat: number; now: number; horizon: number }): number[]` — index croissants `i ≥ nextIndex` tels que `firstBeatTime + i * secondsPerBeat` soit dans `(now, now + horizon]`. Les temps déjà passés sont sautés. `RangeError` si `secondsPerBeat ≤ 0`. Le métronome (Task 3) calcule l'heure d'un temps avec la même expression `firstBeatTime + index * secondsPerBeat`.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/infrastructure/audio/clock/beatsToSchedule.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { beatsToSchedule } from './beatsToSchedule';

const base = { nextIndex: 0, firstBeatTime: 1, secondsPerBeat: 0.5, horizon: 0.1 };

describe('beatsToSchedule', () => {
	it('schedules the first beat once it enters the horizon', () => {
		expect(beatsToSchedule({ ...base, now: 0.5 })).toEqual([]);
		expect(beatsToSchedule({ ...base, now: 0.95 })).toEqual([0]);
	});

	it('returns every beat inside the horizon, in order', () => {
		expect(beatsToSchedule({ ...base, now: 0.95, horizon: 1.2 })).toEqual([0, 1, 2]);
	});

	it('never returns a beat before nextIndex', () => {
		expect(beatsToSchedule({ ...base, nextIndex: 1, now: 0.95, horizon: 1.2 })).toEqual([1, 2]);
		expect(beatsToSchedule({ ...base, nextIndex: 3, now: 0.95, horizon: 1.2 })).toEqual([]);
	});

	it('excludes a beat at now and includes a beat at now + horizon', () => {
		expect(beatsToSchedule({ ...base, nextIndex: 1, now: 1.5, horizon: 0.5 })).toEqual([2]);
	});

	it('skips beats whose time has already passed', () => {
		expect(beatsToSchedule({ ...base, now: 2.2 })).toEqual([]);
		expect(beatsToSchedule({ ...base, now: 2.45 })).toEqual([3]);
	});

	it('rejects a non-positive beat duration', () => {
		expect(() => beatsToSchedule({ ...base, secondsPerBeat: 0, now: 0 })).toThrow(RangeError);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/infrastructure/audio/clock/beatsToSchedule.spec.ts`
Expected: FAIL, « Failed to resolve import "./beatsToSchedule" ».

- [ ] **Step 3: Écrire la fonction**

Créer `src/lib/infrastructure/audio/clock/beatsToSchedule.ts` :

```ts
/**
 * Pure scheduling step: indexes ≥ nextIndex whose beat time lies in (now, now + horizon].
 * Beats already in the past are skipped: a late click is worse than a missing one.
 */
export function beatsToSchedule(input: {
	nextIndex: number;
	firstBeatTime: number;
	secondsPerBeat: number;
	now: number;
	horizon: number;
}): number[] {
	const { nextIndex, firstBeatTime, secondsPerBeat, now, horizon } = input;
	if (!(secondsPerBeat > 0)) {
		throw new RangeError(`secondsPerBeat must be positive, got ${secondsPerBeat}`);
	}
	const timeOf = (index: number) => firstBeatTime + index * secondsPerBeat;
	const end = now + horizon;
	let index = Math.max(nextIndex, Math.floor((now - firstBeatTime) / secondsPerBeat));
	while (timeOf(index) <= now) index++;
	const indexes: number[] = [];
	for (; timeOf(index) <= end; index++) indexes.push(index);
	return indexes;
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/infrastructure/audio/clock/beatsToSchedule.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/infrastructure/audio/clock/beatsToSchedule.ts src/lib/infrastructure/audio/clock/beatsToSchedule.spec.ts
git commit -m "feat: add pure beat scheduling step"
```

---

### Task 3: Métronome

**Files:**
- Create: `src/lib/infrastructure/audio/clock/WebAudioMetronome.ts`
- Create: `src/lib/infrastructure/audio/clock/index.ts`
- Test: `src/lib/infrastructure/audio/clock/WebAudioMetronome.spec.ts`

**Interfaces:**
- Consumes: `beatsToSchedule` (Task 2) ; `BeatEvent`, `MetronomePort` de `$lib/application/ports` ; `DEFAULT_SETTINGS` de `$lib/domain/types`.
- Produces:
  - `class WebAudioMetronome implements MetronomePort { constructor(context: () => AudioContext, options?: MetronomeOptions) }` avec `setTempo(bpm)`, `getTempo()`, `secondsPerBeat()`, `start(firstBeatTime)`, `stop()`, `isRunning()`, `beatTime(index)`, `onBeat(callback): () => void`.
  - `interface MetronomeOptions { beatsPerBar?: number; lookaheadMs?: number; scheduleAheadS?: number }`.
  - Constantes : `MIN_TEMPO_BPM = 20`, `MAX_TEMPO_BPM = 300`, `DEFAULT_BEATS_PER_BAR = 4`, `DEFAULT_LOOKAHEAD_MS = 25`, `DEFAULT_SCHEDULE_AHEAD_S = 0.1`, `CLICK_DURATION_S = 0.03`, `CLICK_SILENCE = 0.001`, `CLICK_FILTER_Q = 1`, `DOWNBEAT_CLICK = { filterHz: 4000, gain: 0.4 }`, `BEAT_CLICK = { filterHz: 2000, gain: 0.25 }`.
  - Le clic : un `AudioBufferSourceNode` rejoue un tampon de bruit blanc (1 canal, `Math.round(sampleRate * CLICK_DURATION_S)` échantillons dans [-1, 1]), généré une seule fois par `AudioContext`, vers un `BiquadFilterNode` passe-bande, puis un `GainNode`, puis `destination`. Aucun oscillateur.
  - `src/lib/infrastructure/audio/clock/index.ts` réexporte `WebAudioClock`, `beatsToSchedule`, `WebAudioMetronome`, `MetronomeOptions` et les constantes de tempo et d'ordonnancement.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/infrastructure/audio/clock/WebAudioMetronome.spec.ts` :

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BeatEvent } from '$lib/application/ports';
import {
	BEAT_CLICK,
	CLICK_DURATION_S,
	CLICK_FILTER_Q,
	CLICK_SILENCE,
	DEFAULT_LOOKAHEAD_MS,
	DOWNBEAT_CLICK,
	MAX_TEMPO_BPM,
	MIN_TEMPO_BPM,
	WebAudioMetronome,
	type MetronomeOptions
} from './WebAudioMetronome';

type AutomationMethod =
	| 'setValueAtTime'
	| 'linearRampToValueAtTime'
	| 'exponentialRampToValueAtTime';

interface AutomationCall {
	method: AutomationMethod;
	value: number;
	time: number;
}

class FakeParam {
	value = 0;
	readonly calls: AutomationCall[] = [];

	setValueAtTime(value: number, time: number): this {
		this.calls.push({ method: 'setValueAtTime', value, time });
		return this;
	}

	linearRampToValueAtTime(value: number, time: number): this {
		this.calls.push({ method: 'linearRampToValueAtTime', value, time });
		return this;
	}

	exponentialRampToValueAtTime(value: number, time: number): this {
		this.calls.push({ method: 'exponentialRampToValueAtTime', value, time });
		return this;
	}
}

class FakeNode {
	readonly connections: unknown[] = [];

	connect<T>(destination: T): T {
		this.connections.push(destination);
		return destination;
	}
}

class FakeBuffer {
	private readonly channels: Float32Array[];

	constructor(
		readonly numberOfChannels: number,
		readonly length: number,
		readonly sampleRate: number
	) {
		this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
	}

	getChannelData(channel: number): Float32Array {
		return this.channels[channel];
	}
}

class FakeBufferSource extends FakeNode {
	buffer: FakeBuffer | null = null;
	startTime: number | null = null;
	stopTime: number | null = null;

	start(when = 0): void {
		this.startTime = when;
	}

	stop(when = 0): void {
		this.stopTime = when;
	}
}

class FakeFilter extends FakeNode {
	type = 'lowpass';
	readonly frequency = new FakeParam();
	readonly Q = new FakeParam();
}

class FakeGain extends FakeNode {
	readonly gain = new FakeParam();
}

class FakeAudioContext {
	currentTime = 0;
	readonly sampleRate = 48000;
	readonly destination = { name: 'destination' };
	readonly buffers: FakeBuffer[] = [];
	readonly sources: FakeBufferSource[] = [];
	readonly filters: FakeFilter[] = [];
	readonly gains: FakeGain[] = [];
	oscillatorCount = 0;

	createBuffer(numberOfChannels: number, length: number, sampleRate: number): FakeBuffer {
		const buffer = new FakeBuffer(numberOfChannels, length, sampleRate);
		this.buffers.push(buffer);
		return buffer;
	}

	createBufferSource(): FakeBufferSource {
		const source = new FakeBufferSource();
		this.sources.push(source);
		return source;
	}

	createBiquadFilter(): FakeFilter {
		const filter = new FakeFilter();
		this.filters.push(filter);
		return filter;
	}

	createGain(): FakeGain {
		const gain = new FakeGain();
		this.gains.push(gain);
		return gain;
	}

	createOscillator(): never {
		this.oscillatorCount++;
		throw new Error('The click must not use an oscillator');
	}
}

function setup(options?: MetronomeOptions) {
	const audio = new FakeAudioContext();
	const metronome = new WebAudioMetronome(() => audio as unknown as AudioContext, options);
	const beats: BeatEvent[] = [];
	metronome.onBeat((beat) => beats.push(beat));
	return { audio, metronome, beats };
}

/** Moves the audio clock, then lets the wake-up timer fire once. */
function wakeAt(audio: FakeAudioContext, time: number): void {
	audio.currentTime = time;
	vi.advanceTimersByTime(DEFAULT_LOOKAHEAD_MS);
}

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	vi.restoreAllMocks();
});

describe('WebAudioMetronome tempo', () => {
	it('starts at the default tempo', () => {
		const { metronome } = setup();
		expect(metronome.getTempo()).toBe(80);
		expect(metronome.secondsPerBeat()).toBe(0.75);
	});

	it('rejects tempos outside the supported range', () => {
		const { metronome } = setup();
		expect(() => metronome.setTempo(MIN_TEMPO_BPM - 1)).toThrow(RangeError);
		expect(() => metronome.setTempo(MAX_TEMPO_BPM + 1)).toThrow(RangeError);
		expect(() => metronome.setTempo(Number.NaN)).toThrow(RangeError);
		metronome.setTempo(120);
		expect(metronome.secondsPerBeat()).toBe(0.5);
	});

	it('refuses a tempo change while running, so beat times stay linear', () => {
		const { audio, metronome } = setup();
		metronome.setTempo(120);
		audio.currentTime = 0.95;
		metronome.start(1);
		expect(() => metronome.setTempo(90)).toThrow(/Stop the metronome/);
		expect(metronome.beatTime(10)).toBe(6);
		metronome.stop();
		metronome.setTempo(90);
		expect(metronome.getTempo()).toBe(90);
	});

	it('rejects invalid options', () => {
		const audio = new FakeAudioContext();
		const context = () => audio as unknown as AudioContext;
		expect(() => new WebAudioMetronome(context, { lookaheadMs: 200, scheduleAheadS: 0.1 })).toThrow(
			RangeError
		);
		expect(() => new WebAudioMetronome(context, { beatsPerBar: 0 })).toThrow(RangeError);
	});
});

describe('WebAudioMetronome scheduling', () => {
	it('does not touch the audio context before start()', () => {
		const context = vi.fn((): AudioContext => {
			throw new Error('not resumed');
		});
		const metronome = new WebAudioMetronome(context);
		metronome.setTempo(100);
		expect(context).not.toHaveBeenCalled();
		expect(metronome.isRunning()).toBe(false);
	});

	it('schedules the first beat as soon as it enters the horizon', () => {
		const { audio, metronome, beats } = setup();
		metronome.setTempo(120);
		audio.currentTime = 0.95;
		metronome.start(1);
		expect(metronome.isRunning()).toBe(true);
		expect(beats).toEqual([{ index: 0, time: 1, isDownbeat: true }]);
		expect(audio.sources).toHaveLength(1);
		expect(audio.sources[0].startTime).toBe(1);
	});

	it('gives each beat its exact audio time, ahead of it, whenever the timer wakes', () => {
		const { audio, metronome, beats } = setup();
		const calledAt: number[] = [];
		metronome.onBeat(() => calledAt.push(audio.currentTime));
		metronome.setTempo(120);
		audio.currentTime = 0.95;
		metronome.start(1);
		wakeAt(audio, 1.2);
		wakeAt(audio, 1.47);
		wakeAt(audio, 1.93);
		expect(beats.map((b) => [b.index, b.time])).toEqual([
			[0, 1],
			[1, 1.5],
			[2, 2]
		]);
		expect(calledAt).toEqual([0.95, 1.47, 1.93]);
		expect(audio.sources.map((s) => s.startTime)).toEqual([1, 1.5, 2]);
		expect(metronome.beatTime(3)).toBe(2.5);
	});

	it('accents the downbeat with level and a brighter filter, not with a pitch', () => {
		const { audio, metronome, beats } = setup({ beatsPerBar: 3 });
		metronome.setTempo(120);
		audio.currentTime = 0.95;
		metronome.start(1);
		for (const time of [1.45, 1.95, 2.45]) wakeAt(audio, time);
		expect(beats.map((b) => b.isDownbeat)).toEqual([true, false, false, true]);
		expect(audio.filters.map((f) => f.frequency.calls[0].value)).toEqual([
			DOWNBEAT_CLICK.filterHz,
			BEAT_CLICK.filterHz,
			BEAT_CLICK.filterHz,
			DOWNBEAT_CLICK.filterHz
		]);
		expect(audio.gains.map((g) => g.gain.calls[0].value)).toEqual([
			DOWNBEAT_CLICK.gain,
			BEAT_CLICK.gain,
			BEAT_CLICK.gain,
			DOWNBEAT_CLICK.gain
		]);
		expect(DOWNBEAT_CLICK.filterHz).toBeGreaterThan(BEAT_CLICK.filterHz);
		expect(DOWNBEAT_CLICK.gain).toBeGreaterThan(BEAT_CLICK.gain);
		expect(audio.oscillatorCount).toBe(0);
	});

	it('plays a short band-passed noise burst routed to the speakers', () => {
		const { audio, metronome } = setup();
		metronome.setTempo(120);
		audio.currentTime = 0.95;
		metronome.start(1);
		const [source] = audio.sources;
		const [filter] = audio.filters;
		const [gain] = audio.gains;
		expect(source.buffer).toBe(audio.buffers[0]);
		expect(source.connections[0]).toBe(filter);
		expect(filter.connections[0]).toBe(gain);
		expect(gain.connections[0]).toBe(audio.destination);
		expect(filter.type).toBe('bandpass');
		expect(filter.Q.calls).toEqual([{ method: 'setValueAtTime', value: CLICK_FILTER_Q, time: 1 }]);
		expect(CLICK_FILTER_Q).toBeLessThanOrEqual(2);
		expect(source.stopTime).toBe(1 + CLICK_DURATION_S);
		expect(gain.gain.calls).toEqual([
			{ method: 'setValueAtTime', value: DOWNBEAT_CLICK.gain, time: 1 },
			{ method: 'exponentialRampToValueAtTime', value: CLICK_SILENCE, time: 1 + CLICK_DURATION_S }
		]);
	});

	it('generates one white-noise buffer per context and reuses it for every click', () => {
		const { audio, metronome } = setup();
		metronome.setTempo(120);
		audio.currentTime = 0.95;
		metronome.start(1);
		wakeAt(audio, 1.45);
		wakeAt(audio, 1.95);
		expect(audio.buffers).toHaveLength(1);
		const [buffer] = audio.buffers;
		expect(buffer.numberOfChannels).toBe(1);
		expect(buffer.sampleRate).toBe(audio.sampleRate);
		expect(buffer.length).toBe(Math.round(audio.sampleRate * CLICK_DURATION_S));
		const samples = [...buffer.getChannelData(0)];
		expect(samples.every((sample) => sample >= -1 && sample <= 1)).toBe(true);
		expect(new Set(samples).size).toBeGreaterThan(samples.length / 2);
		expect(audio.sources.map((s) => s.buffer)).toEqual([buffer, buffer, buffer]);
	});

	it('drops beats that are already in the past', () => {
		const { audio, metronome, beats } = setup();
		metronome.setTempo(120);
		audio.currentTime = 1.2;
		metronome.start(1);
		wakeAt(audio, 1.45);
		expect(beats.map((b) => b.index)).toEqual([1]);
		expect(audio.sources.map((s) => s.startTime)).toEqual([1.5]);
	});

	it('stops scheduling and cancels its timer on stop()', () => {
		const { audio, metronome, beats } = setup();
		metronome.setTempo(120);
		audio.currentTime = 0.95;
		metronome.start(1);
		metronome.stop();
		expect(metronome.isRunning()).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
		wakeAt(audio, 1.45);
		expect(beats).toHaveLength(1);
		expect(() => metronome.beatTime(0)).toThrow(/not running/);
	});

	it('restarts from beat 0 when started again', () => {
		const { audio, metronome, beats } = setup();
		metronome.setTempo(120);
		audio.currentTime = 0.95;
		metronome.start(1);
		audio.currentTime = 2.95;
		metronome.start(3);
		expect(beats.map((b) => [b.index, b.time])).toEqual([
			[0, 1],
			[0, 3]
		]);
		expect(metronome.beatTime(1)).toBe(3.5);
		expect(vi.getTimerCount()).toBe(1);
	});

	it('stops calling a listener after it unsubscribes', () => {
		const { audio, metronome } = setup();
		const seen: number[] = [];
		const unsubscribe = metronome.onBeat((beat) => seen.push(beat.index));
		metronome.setTempo(120);
		audio.currentTime = 0.95;
		metronome.start(1);
		unsubscribe();
		wakeAt(audio, 1.45);
		expect(seen).toEqual([0]);
	});

	it('keeps the click track going when a listener throws', () => {
		const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { audio, metronome, beats } = setup();
		metronome.onBeat(() => {
			throw new Error('listener bug');
		});
		metronome.setTempo(120);
		audio.currentTime = 0.95;
		metronome.start(1);
		wakeAt(audio, 1.45);
		expect(beats.map((b) => b.index)).toEqual([0, 1]);
		expect(errors).toHaveBeenCalledTimes(2);
	});

	it('lets a listener stop the metronome from inside a beat', () => {
		const { audio, metronome, beats } = setup({ scheduleAheadS: 1.2 });
		metronome.onBeat((beat) => {
			if (beat.index === 1) metronome.stop();
		});
		metronome.setTempo(120);
		audio.currentTime = 0.95;
		metronome.start(1);
		expect(beats.map((b) => b.index)).toEqual([0, 1]);
		expect(metronome.isRunning()).toBe(false);
		expect(vi.getTimerCount()).toBe(0);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/infrastructure/audio/clock/WebAudioMetronome.spec.ts`
Expected: FAIL, « Failed to resolve import "./WebAudioMetronome" ».

- [ ] **Step 3: Écrire le métronome**

Créer `src/lib/infrastructure/audio/clock/WebAudioMetronome.ts` :

```ts
import type { BeatEvent, MetronomePort } from '$lib/application/ports';
import { DEFAULT_SETTINGS } from '$lib/domain/types';
import { beatsToSchedule } from './beatsToSchedule';

export const MIN_TEMPO_BPM = 20;
export const MAX_TEMPO_BPM = 300;
export const DEFAULT_BEATS_PER_BAR = 4;
/** How often the timer wakes the scheduler. It never decides when a beat sounds. */
export const DEFAULT_LOOKAHEAD_MS = 25;
/** How far past the current audio time beats are scheduled; must exceed the wake-up period. */
export const DEFAULT_SCHEDULE_AHEAD_S = 0.1;
export const CLICK_DURATION_S = 0.03;
export const CLICK_SILENCE = 0.001;
/** A wide band keeps the burst pitchless, so the pitch detector never reads it as a note. */
export const CLICK_FILTER_Q = 1;
/** The accent is level and brightness, never a tonal frequency. */
export const DOWNBEAT_CLICK = { filterHz: 4000, gain: 0.4 } as const;
export const BEAT_CLICK = { filterHz: 2000, gain: 0.25 } as const;

export interface MetronomeOptions {
	beatsPerBar?: number;
	lookaheadMs?: number;
	scheduleAheadS?: number;
}

/**
 * Click track scheduled on the audio clock.
 * The tempo is locked while running: beatTime(index) = firstBeatTime + index * secondsPerBeat.
 * Beats already past when the scheduler wakes (throttled tab) are dropped, not played late,
 * so the indexes seen by listeners can skip.
 * stop() does not cancel clicks already handed to the audio thread (at most scheduleAheadS ahead).
 */
export class WebAudioMetronome implements MetronomePort {
	private bpm: number = DEFAULT_SETTINGS.tempoBpm;
	private firstBeatTime: number | null = null;
	private nextIndex = 0;
	private run = 0;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private noise: { context: AudioContext; buffer: AudioBuffer } | null = null;
	private readonly listeners = new Set<(beat: BeatEvent) => void>();
	private readonly beatsPerBar: number;
	private readonly lookaheadMs: number;
	private readonly scheduleAheadS: number;

	constructor(
		private readonly context: () => AudioContext,
		options: MetronomeOptions = {}
	) {
		this.beatsPerBar = options.beatsPerBar ?? DEFAULT_BEATS_PER_BAR;
		this.lookaheadMs = options.lookaheadMs ?? DEFAULT_LOOKAHEAD_MS;
		this.scheduleAheadS = options.scheduleAheadS ?? DEFAULT_SCHEDULE_AHEAD_S;
		if (!Number.isInteger(this.beatsPerBar) || this.beatsPerBar < 1) {
			throw new RangeError(`beatsPerBar must be a positive integer, got ${this.beatsPerBar}`);
		}
		if (!(this.lookaheadMs > 0)) {
			throw new RangeError(`lookaheadMs must be positive, got ${this.lookaheadMs}`);
		}
		if (!(this.scheduleAheadS > this.lookaheadMs / 1000)) {
			throw new RangeError('scheduleAheadS must be longer than the lookahead period');
		}
	}

	setTempo(bpm: number): void {
		if (this.isRunning()) throw new Error('Stop the metronome before changing the tempo');
		if (!Number.isFinite(bpm) || bpm < MIN_TEMPO_BPM || bpm > MAX_TEMPO_BPM) {
			throw new RangeError(
				`Tempo must be between ${MIN_TEMPO_BPM} and ${MAX_TEMPO_BPM} bpm, got ${bpm}`
			);
		}
		this.bpm = bpm;
	}

	getTempo(): number {
		return this.bpm;
	}

	secondsPerBeat(): number {
		return 60 / this.bpm;
	}

	/** `firstBeatTime` must be in the future, e.g. clock.now() + 0.1; a past beat is dropped. */
	start(firstBeatTime: number): void {
		this.stop();
		this.firstBeatTime = firstBeatTime;
		this.nextIndex = 0;
		this.tick(this.run);
	}

	stop(): void {
		this.run++;
		if (this.timer !== null) clearTimeout(this.timer);
		this.timer = null;
		this.firstBeatTime = null;
	}

	isRunning(): boolean {
		return this.firstBeatTime !== null;
	}

	beatTime(index: number): number {
		if (this.firstBeatTime === null) throw new Error('Metronome not running');
		return this.firstBeatTime + index * this.secondsPerBeat();
	}

	onBeat(callback: (beat: BeatEvent) => void): () => void {
		this.listeners.add(callback);
		return () => {
			this.listeners.delete(callback);
		};
	}

	private tick(run: number): void {
		if (run !== this.run || this.firstBeatTime === null) return;
		const context = this.context();
		const due = beatsToSchedule({
			nextIndex: this.nextIndex,
			firstBeatTime: this.firstBeatTime,
			secondsPerBeat: this.secondsPerBeat(),
			now: context.currentTime,
			horizon: this.scheduleAheadS
		});
		for (const index of due) {
			const beat: BeatEvent = {
				index,
				time: this.beatTime(index),
				isDownbeat: index % this.beatsPerBar === 0
			};
			this.nextIndex = index + 1;
			this.click(context, beat);
			this.emit(beat);
			// A listener may have stopped or restarted the metronome.
			if (run !== this.run) return;
		}
		this.timer = setTimeout(() => this.tick(run), this.lookaheadMs);
	}

	private click(context: AudioContext, beat: BeatEvent): void {
		const { filterHz, gain: level } = beat.isDownbeat ? DOWNBEAT_CLICK : BEAT_CLICK;
		const end = beat.time + CLICK_DURATION_S;
		const source = context.createBufferSource();
		const filter = context.createBiquadFilter();
		const gain = context.createGain();
		source.buffer = this.noiseBuffer(context);
		filter.type = 'bandpass';
		filter.frequency.setValueAtTime(filterHz, beat.time);
		filter.Q.setValueAtTime(CLICK_FILTER_Q, beat.time);
		gain.gain.setValueAtTime(level, beat.time);
		gain.gain.exponentialRampToValueAtTime(CLICK_SILENCE, end);
		source.connect(filter);
		filter.connect(gain);
		gain.connect(context.destination);
		source.start(beat.time);
		source.stop(end);
	}

	/** White noise, generated once per AudioContext and shared by every click. */
	private noiseBuffer(context: AudioContext): AudioBuffer {
		if (this.noise?.context === context) return this.noise.buffer;
		const length = Math.round(context.sampleRate * CLICK_DURATION_S);
		const buffer = context.createBuffer(1, length, context.sampleRate);
		const samples = buffer.getChannelData(0);
		for (let i = 0; i < length; i++) samples[i] = Math.random() * 2 - 1;
		this.noise = { context, buffer };
		return buffer;
	}

	private emit(beat: BeatEvent): void {
		for (const listener of [...this.listeners]) {
			try {
				listener(beat);
			} catch (error) {
				// A failing listener must not stop the click track.
				console.error('Metronome beat listener failed', error);
			}
		}
	}
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/infrastructure/audio/clock/WebAudioMetronome.spec.ts`
Expected: PASS (16 tests).

- [ ] **Step 5: Écrire l'index du dossier**

Créer `src/lib/infrastructure/audio/clock/index.ts` :

```ts
export { WebAudioClock } from './WebAudioClock';
export { beatsToSchedule } from './beatsToSchedule';
export {
	DEFAULT_BEATS_PER_BAR,
	DEFAULT_LOOKAHEAD_MS,
	DEFAULT_SCHEDULE_AHEAD_S,
	MAX_TEMPO_BPM,
	MIN_TEMPO_BPM,
	WebAudioMetronome,
	type MetronomeOptions
} from './WebAudioMetronome';
```

- [ ] **Step 6: Lancer les tests du dossier et la vérification de types**

Run: `npx vitest run src/lib/infrastructure/audio/clock && npm run check`
Expected: PASS (3 fichiers, 30 tests), `svelte-check found 0 errors`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/infrastructure/audio/clock/WebAudioMetronome.ts src/lib/infrastructure/audio/clock/WebAudioMetronome.spec.ts src/lib/infrastructure/audio/clock/index.ts
git commit -m "feat: add lookahead web audio metronome"
```

---

### Task 4: Dessin des sons de verdict

**Files:**
- Create: `src/lib/infrastructure/audio/cues/cueSpecs.ts`
- Test: `src/lib/infrastructure/audio/cues/cueSpecs.spec.ts`

**Interfaces:**
- Consumes: `Verdict` de `$lib/domain/types`.
- Produces:
  - `type Waveform = 'sine' | 'triangle' | 'square' | 'sawtooth'`.
  - `interface ToneSpec { waveform: Waveform; offset: number; duration: number; startHz: number; endHz: number; peakGain: number }` (secondes, hertz, gain linéaire ; `offset` depuis l'heure du son ; `endHz !== startHz` = glissando exponentiel).
  - `CUE_SPECS: Readonly<Record<Verdict, readonly ToneSpec[]>>`.
  - `MAX_CUE_DURATION_S = 0.15`, `MAX_CUE_GAIN = 0.2`, `CUE_ATTACK_S = 0.005`, `CUE_SILENCE = 0.0001`.
  - `cueDuration(tones: readonly ToneSpec[]): number` (fin du dernier ton, en secondes).

- [ ] **Step 1: Écrire le test**

Créer `src/lib/infrastructure/audio/cues/cueSpecs.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import type { Verdict } from '$lib/domain/types';
import {
	CUE_ATTACK_S,
	CUE_SPECS,
	MAX_CUE_DURATION_S,
	MAX_CUE_GAIN,
	cueDuration
} from './cueSpecs';

const VERDICTS: Verdict[] = ['perfect', 'early', 'late', 'wrong'];

describe('CUE_SPECS', () => {
	it('keeps every cue shorter than 150 ms', () => {
		expect(MAX_CUE_DURATION_S).toBe(0.15);
		for (const verdict of VERDICTS) {
			expect(cueDuration(CUE_SPECS[verdict])).toBeLessThan(MAX_CUE_DURATION_S);
		}
	});

	it('keeps every tone quiet and long enough for its envelope', () => {
		for (const tone of VERDICTS.flatMap((verdict) => CUE_SPECS[verdict])) {
			expect(tone.peakGain).toBeGreaterThan(0);
			expect(tone.peakGain).toBeLessThanOrEqual(MAX_CUE_GAIN);
			expect(tone.duration).toBeGreaterThan(CUE_ATTACK_S);
			expect(tone.startHz).toBeGreaterThan(0);
			expect(tone.endHz).toBeGreaterThan(0);
		}
	});

	it('plays perfect as two rising notes a major third apart', () => {
		expect(CUE_SPECS.perfect).toHaveLength(2);
		const [root, third] = CUE_SPECS.perfect;
		expect(third.offset).toBeGreaterThan(root.offset);
		expect(third.startHz / root.startHz).toBeCloseTo(2 ** (4 / 12), 3);
		expect(root.endHz).toBe(root.startHz);
		expect(third.endHz).toBe(third.startHz);
	});

	it('glides up for early and down for late', () => {
		const [early] = CUE_SPECS.early;
		const [late] = CUE_SPECS.late;
		expect(early.endHz).toBeGreaterThan(early.startHz);
		expect(late.endHz).toBeLessThan(late.startHz);
	});

	it('makes wrong a low buzz, far below every other cue', () => {
		const [wrong] = CUE_SPECS.wrong;
		const others = (['perfect', 'early', 'late'] as const).flatMap((verdict) => CUE_SPECS[verdict]);
		const lowestOther = Math.min(...others.map((tone) => Math.min(tone.startHz, tone.endHz)));
		expect(wrong.waveform).toBe('square');
		expect(Math.max(wrong.startHz, wrong.endHz)).toBeLessThan(lowestOther / 4);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/infrastructure/audio/cues/cueSpecs.spec.ts`
Expected: FAIL, « Failed to resolve import "./cueSpecs" ».

- [ ] **Step 3: Écrire les descriptions**

Créer `src/lib/infrastructure/audio/cues/cueSpecs.ts` :

```ts
import type { Verdict } from '$lib/domain/types';

export type Waveform = 'sine' | 'triangle' | 'square' | 'sawtooth';

/** One oscillator of a cue. Times in seconds from the cue time; gain is linear. */
export interface ToneSpec {
	waveform: Waveform;
	offset: number;
	duration: number;
	startHz: number;
	/** Equal to startHz for a steady tone; otherwise an exponential glide. */
	endHz: number;
	peakGain: number;
}

/** A cue must end before the next beat can matter and never mask the guitar. To calibrate. */
export const MAX_CUE_DURATION_S = 0.15;
/** Below the metronome clicks (0.25 to 0.4). To calibrate. */
export const MAX_CUE_GAIN = 0.2;
export const CUE_ATTACK_S = 0.005;
/** Exponential ramps cannot reach 0. */
export const CUE_SILENCE = 0.0001;

const C6_HZ = 1046.5;
const E6_HZ = 1318.51;

/** One reserved sound per verdict, recognizable without looking. */
export const CUE_SPECS: Readonly<Record<Verdict, readonly ToneSpec[]>> = {
	perfect: [
		{
			waveform: 'triangle',
			offset: 0,
			duration: 0.06,
			startHz: C6_HZ,
			endHz: C6_HZ,
			peakGain: 0.16
		},
		{
			waveform: 'triangle',
			offset: 0.05,
			duration: 0.07,
			startHz: E6_HZ,
			endHz: E6_HZ,
			peakGain: 0.16
		}
	],
	early: [
		{ waveform: 'triangle', offset: 0, duration: 0.09, startHz: 660, endHz: 990, peakGain: 0.14 }
	],
	late: [
		{ waveform: 'triangle', offset: 0, duration: 0.09, startHz: 990, endHz: 660, peakGain: 0.14 }
	],
	wrong: [
		{ waveform: 'square', offset: 0, duration: 0.14, startHz: 110, endHz: 98, peakGain: 0.05 }
	]
};

export function cueDuration(tones: readonly ToneSpec[]): number {
	return Math.max(...tones.map((tone) => tone.offset + tone.duration));
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/infrastructure/audio/cues/cueSpecs.spec.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/infrastructure/audio/cues/cueSpecs.ts src/lib/infrastructure/audio/cues/cueSpecs.spec.ts
git commit -m "feat: design verdict sound cues"
```

---

### Task 5: Lecture des sons de verdict

**Files:**
- Create: `src/lib/infrastructure/audio/cues/WebAudioCues.ts`
- Create: `src/lib/infrastructure/audio/cues/index.ts`
- Test: `src/lib/infrastructure/audio/cues/WebAudioCues.spec.ts`

**Interfaces:**
- Consumes: `CUE_SPECS`, `CUE_ATTACK_S`, `CUE_SILENCE`, `ToneSpec` (Task 4) ; `SoundCuePort` de `$lib/application/ports` (`play(verdict: Verdict, time?: number): void`) ; `Verdict` de `$lib/domain/types`.
- Produces: `class WebAudioCues implements SoundCuePort { constructor(context: () => AudioContext); play(verdict: Verdict, time?: number): void }`. Sans `time`, ou avec un `time` passé, le son part à `context.currentTime`. `src/lib/infrastructure/audio/cues/index.ts` réexporte `WebAudioCues`, `CUE_SPECS`, `MAX_CUE_DURATION_S`, `MAX_CUE_GAIN`, `ToneSpec`, `Waveform`.

- [ ] **Step 1: Écrire le test**

Créer `src/lib/infrastructure/audio/cues/WebAudioCues.spec.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import type { Verdict } from '$lib/domain/types';
import { CUE_ATTACK_S, CUE_SILENCE, CUE_SPECS } from './cueSpecs';
import { WebAudioCues } from './WebAudioCues';

type AutomationMethod =
	| 'setValueAtTime'
	| 'linearRampToValueAtTime'
	| 'exponentialRampToValueAtTime';

interface AutomationCall {
	method: AutomationMethod;
	value: number;
	time: number;
}

class FakeParam {
	value = 0;
	readonly calls: AutomationCall[] = [];

	setValueAtTime(value: number, time: number): this {
		this.calls.push({ method: 'setValueAtTime', value, time });
		return this;
	}

	linearRampToValueAtTime(value: number, time: number): this {
		this.calls.push({ method: 'linearRampToValueAtTime', value, time });
		return this;
	}

	exponentialRampToValueAtTime(value: number, time: number): this {
		this.calls.push({ method: 'exponentialRampToValueAtTime', value, time });
		return this;
	}
}

class FakeNode {
	readonly connections: unknown[] = [];

	connect<T>(destination: T): T {
		this.connections.push(destination);
		return destination;
	}
}

class FakeOscillator extends FakeNode {
	type = 'sine';
	readonly frequency = new FakeParam();
	startTime: number | null = null;
	stopTime: number | null = null;

	start(when = 0): void {
		this.startTime = when;
	}

	stop(when = 0): void {
		this.stopTime = when;
	}
}

class FakeGain extends FakeNode {
	readonly gain = new FakeParam();
}

class FakeAudioContext {
	currentTime = 0;
	readonly destination = { name: 'destination' };
	readonly oscillators: FakeOscillator[] = [];
	readonly gains: FakeGain[] = [];

	createOscillator(): FakeOscillator {
		const oscillator = new FakeOscillator();
		this.oscillators.push(oscillator);
		return oscillator;
	}

	createGain(): FakeGain {
		const gain = new FakeGain();
		this.gains.push(gain);
		return gain;
	}
}

const VERDICTS: Verdict[] = ['perfect', 'early', 'late', 'wrong'];

function setup() {
	const audio = new FakeAudioContext();
	const cues = new WebAudioCues(() => audio as unknown as AudioContext);
	return { audio, cues };
}

describe('WebAudioCues', () => {
	it('does not touch the audio context until a cue plays', () => {
		const context = vi.fn((): AudioContext => {
			throw new Error('not resumed');
		});
		expect(() => new WebAudioCues(context)).not.toThrow();
		expect(context).not.toHaveBeenCalled();
	});

	it('plays one oscillator per tone of the verdict', () => {
		for (const verdict of VERDICTS) {
			const { audio, cues } = setup();
			cues.play(verdict, 2);
			expect(audio.oscillators.map((o) => o.type)).toEqual(
				CUE_SPECS[verdict].map((tone) => tone.waveform)
			);
		}
	});

	it('starts and stops each tone at its exact audio time', () => {
		const { audio, cues } = setup();
		cues.play('perfect', 2);
		const [root, third] = CUE_SPECS.perfect;
		expect(audio.oscillators.map((o) => [o.startTime, o.stopTime])).toEqual([
			[2 + root.offset, 2 + root.offset + root.duration],
			[2 + third.offset, 2 + third.offset + third.duration]
		]);
	});

	it('shapes each tone with a fast attack and a decay to silence', () => {
		const { audio, cues } = setup();
		cues.play('wrong', 1);
		const [tone] = CUE_SPECS.wrong;
		const start = 1 + tone.offset;
		expect(audio.gains[0].gain.calls).toEqual([
			{ method: 'setValueAtTime', value: 0, time: start },
			{ method: 'linearRampToValueAtTime', value: tone.peakGain, time: start + CUE_ATTACK_S },
			{ method: 'exponentialRampToValueAtTime', value: CUE_SILENCE, time: start + tone.duration }
		]);
		expect(audio.oscillators[0].connections[0]).toBe(audio.gains[0]);
		expect(audio.gains[0].connections[0]).toBe(audio.destination);
	});

	it('glides the pitch of early and holds the pitch of perfect', () => {
		const { audio, cues } = setup();
		cues.play('early', 1);
		cues.play('perfect', 1);
		const [early] = CUE_SPECS.early;
		const start = 1 + early.offset;
		expect(audio.oscillators[0].frequency.calls).toEqual([
			{ method: 'setValueAtTime', value: early.startHz, time: start },
			{ method: 'exponentialRampToValueAtTime', value: early.endHz, time: start + early.duration }
		]);
		expect(audio.oscillators[1].frequency.calls).toHaveLength(1);
	});

	it('plays immediately without a time, and never in the past', () => {
		const { audio, cues } = setup();
		audio.currentTime = 5;
		cues.play('late');
		cues.play('late', 4);
		const [late] = CUE_SPECS.late;
		expect(audio.oscillators.map((o) => o.startTime)).toEqual([5 + late.offset, 5 + late.offset]);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/infrastructure/audio/cues/WebAudioCues.spec.ts`
Expected: FAIL, « Failed to resolve import "./WebAudioCues" ».

- [ ] **Step 3: Écrire la lecture des sons**

Créer `src/lib/infrastructure/audio/cues/WebAudioCues.ts` :

```ts
import type { SoundCuePort } from '$lib/application/ports';
import type { Verdict } from '$lib/domain/types';
import { CUE_ATTACK_S, CUE_SILENCE, CUE_SPECS, type ToneSpec } from './cueSpecs';

/** Plays the reserved verdict sounds on the shared audio clock. */
export class WebAudioCues implements SoundCuePort {
	constructor(private readonly context: () => AudioContext) {}

	play(verdict: Verdict, time?: number): void {
		const context = this.context();
		// A start time in the past would cut the envelope short.
		const at = Math.max(time ?? context.currentTime, context.currentTime);
		for (const tone of CUE_SPECS[verdict]) scheduleTone(context, tone, at);
	}
}

function scheduleTone(context: AudioContext, tone: ToneSpec, at: number): void {
	const start = at + tone.offset;
	const end = start + tone.duration;
	const oscillator = context.createOscillator();
	const gain = context.createGain();
	oscillator.type = tone.waveform;
	oscillator.frequency.setValueAtTime(tone.startHz, start);
	if (tone.endHz !== tone.startHz) {
		oscillator.frequency.exponentialRampToValueAtTime(tone.endHz, end);
	}
	gain.gain.setValueAtTime(0, start);
	gain.gain.linearRampToValueAtTime(tone.peakGain, start + CUE_ATTACK_S);
	gain.gain.exponentialRampToValueAtTime(CUE_SILENCE, end);
	oscillator.connect(gain);
	gain.connect(context.destination);
	oscillator.start(start);
	oscillator.stop(end);
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/infrastructure/audio/cues/WebAudioCues.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Écrire l'index du dossier**

Créer `src/lib/infrastructure/audio/cues/index.ts` :

```ts
export { WebAudioCues } from './WebAudioCues';
export {
	CUE_SPECS,
	MAX_CUE_DURATION_S,
	MAX_CUE_GAIN,
	type ToneSpec,
	type Waveform
} from './cueSpecs';
```

- [ ] **Step 6: Lancer les tests du dossier et la vérification de types**

Run: `npx vitest run src/lib/infrastructure/audio/cues && npm run check`
Expected: PASS (2 fichiers, 11 tests), `svelte-check found 0 errors`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/infrastructure/audio/cues/WebAudioCues.ts src/lib/infrastructure/audio/cues/WebAudioCues.spec.ts src/lib/infrastructure/audio/cues/index.ts
git commit -m "feat: play verdict cues with web audio"
```

---

### Task 6: Écoute manuelle et vérification finale

Ce plan ne possède aucune route. L'écoute se fait avec un module appelé depuis la console du navigateur, sur le serveur de développement (Vite sert les sources sous `/src/…`). L'application ne l'importe jamais : il n'entre pas dans le build. Pas de test automatique pour ce script ; `npm run check` vérifie ses types.

**Files:**
- Create: `src/lib/infrastructure/audio/cues/listen.ts`

**Interfaces:**
- Consumes: `WebAudioClock`, `WebAudioMetronome` de `$lib/infrastructure/audio/clock` (Tasks 1 et 3) ; `WebAudioCues` (Task 5) ; `Verdict` de `$lib/domain/types`.
- Produces: `listen(options?: { tempoBpm?: number; shuffle?: boolean }): Promise<() => void>` — lance le clic, joue les quatre sons sur les contretemps une mesure sur deux, et renvoie une fonction d'arrêt. Réservé à la vérification manuelle.

- [ ] **Step 1: Écrire le script d'écoute**

Créer `src/lib/infrastructure/audio/cues/listen.ts` :

```ts
import type { Verdict } from '$lib/domain/types';
import { WebAudioClock, WebAudioMetronome } from '$lib/infrastructure/audio/clock';
import { WebAudioCues } from './WebAudioCues';

const VERDICTS: readonly Verdict[] = ['perfect', 'early', 'late', 'wrong'];
const BEATS_PER_BAR = 4;

/**
 * Manual listening check; the app never imports this module.
 * With `npm run dev`, click once on the page, then in the browser console:
 *   const { listen } = await import('/src/lib/infrastructure/audio/cues/listen.ts');
 *   const stop = await listen({ shuffle: true });
 * Bars 1, 3, 5… click alone; bars 2, 4, 6… add the four cues on the off-beats,
 * in the order logged to the console.
 */
export async function listen(
	options: { tempoBpm?: number; shuffle?: boolean } = {}
): Promise<() => void> {
	const clock = new WebAudioClock();
	await clock.resume();
	const metronome = new WebAudioMetronome(() => clock.context());
	const cues = new WebAudioCues(() => clock.context());
	metronome.setTempo(options.tempoBpm ?? 80);
	let order = [...VERDICTS];
	const unsubscribe = metronome.onBeat((beat) => {
		const bar = Math.floor(beat.index / BEATS_PER_BAR);
		const beatInBar = beat.index % BEATS_PER_BAR;
		if (bar % 2 === 0) return;
		if (beatInBar === 0) {
			order = options.shuffle ? shuffled(VERDICTS) : [...VERDICTS];
			console.info(`Bar ${bar + 1}: ${order.join(', ')}`);
		}
		cues.play(order[beatInBar], beat.time + metronome.secondsPerBeat() / 2);
	});
	metronome.start(clock.now() + 0.2);
	return () => {
		unsubscribe();
		metronome.stop();
		void clock.context().close();
	};
}

function shuffled<T>(items: readonly T[]): T[] {
	const copy = [...items];
	for (let i = copy.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[copy[i], copy[j]] = [copy[j], copy[i]];
	}
	return copy;
}
```

- [ ] **Step 2: Vérifier les types**

Run: `npm run check`
Expected: `svelte-check found 0 errors`.

- [ ] **Step 3: Lancer tous les tests du plan, puis toute la suite**

Run: `npx vitest run src/lib/infrastructure/audio`
Expected: PASS (5 fichiers, 41 tests).

Run: `npm test && npm run check`
Expected: tous les tests PASS, `svelte-check found 0 errors`.

- [ ] **Step 4: Vérifier que le plan n'a touché que ses chemins**

Run: `git status --porcelain && git diff --name-only main...HEAD`
Expected: seul `src/lib/infrastructure/audio/cues/listen.ts` apparaît comme non suivi dans `git status` ; tous les fichiers listés par `git diff` commencent par `src/lib/infrastructure/audio/clock/` ou `src/lib/infrastructure/audio/cues/`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/infrastructure/audio/cues/listen.ts
git commit -m "chore: add manual listening script for clock and cues"
```

- [ ] **Step 6: Écoute manuelle (par l'auteur, avec la guitare ; ne bloque pas la fusion)**

Lancer `npm run dev`, ouvrir la page affichée par Vite dans Chrome, cliquer une fois dans la page, ouvrir la console, puis exécuter les deux lignes du commentaire de `listen.ts`. Arrêter avec `stop()`.

Critères, à cocher :

1. Pendant 2 minutes, onglet au premier plan : le clic reste régulier, sans trou ni dérive audible ; le temps fort se distingue des trois autres ; le clic sonne comme un bruit bref, sans note audible.
2. Guitare branchée, volume de travail habituel : chaque son reste sous la guitare et ne masque aucune note jouée en même temps.
3. `listen({ shuffle: true })`, yeux fermés ou console cachée, pendant 3 mesures sonores : nommer chaque son à voix haute, puis comparer à l'ordre écrit dans la console. Objectif : 12 sur 12.
4. Aucun son ne traîne : chacun est fini bien avant le temps suivant, même à 160 bpm (`listen({ tempoBpm: 160, shuffle: true })`).
5. Passer l'onglet en arrière-plan 10 s puis revenir : le clic reprend proprement, sans rafale de clics en retard (les temps manqués sont abandonnés).
6. Après la fusion de la vague 1 (page `/diagnostic` du plan F disponible) : avec le micro de l'appareil, sans interface audio, noter si les clics ou les sons déclenchent une détection de note. Reporter le résultat au plan K.

Si un son est ajusté, ne modifier que les valeurs de `CUE_SPECS` (ou les constantes de clic du métronome), relancer `npx vitest run src/lib/infrastructure/audio`, puis committer avec `git commit -m "tune: adjust verdict cues after listening"`.

---

## Fin du plan

À la fin de ce plan, la branche `plan/e-horloge-metronome-sons` porte l'horloge, le métronome et les sons, prêts à être fusionnés dans `main` (`npm test && npm run check` après fusion). Câblage attendu par la composition (plan K), avec un seul `AudioContext` partagé :

```ts
const clock = new WebAudioClock();
const metronome = new WebAudioMetronome(() => clock.context());
const cues = new WebAudioCues(() => clock.context());
// clock.resume() depuis un geste de l'utilisateur, avant metronome.start() ou cues.play().
```
