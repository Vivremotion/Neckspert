# G — Calibration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mesurer la latence de détection en faisant jouer le guitariste sur le clic du métronome, et produire un écart médian (`offsetMs`) plus une dispersion (`spreadMs`) via `CalibrationService` et `computeCalibration`.

**Architecture:** Module d'infrastructure sous `src/lib/infrastructure/audio/calibration/`. Une fonction pure (`computeCalibration`) calcule la médiane et l'écart absolu médian (MAD). `CalibrationService` orchestre l'horloge, le métronome et le détecteur via les ports du socle uniquement : il reprend l'horloge, démarre le détecteur, lance le métronome à `clock.now() + 0.5`, collecte les attaques, ignore la première mesure et les attaques trop loin d'un temps annoncé, signale la progression, puis termine par `ok`, `inconsistent`, `no-sound` ou `cancelled`. Aucun minuteur : le temps avance uniquement par les événements `onBeat` (en test : `FakeClock.advance` + `FakeMetronome.flush`).

**Tech Stack:** TypeScript, Vitest (projet `server`, Node), doublures P0 (`FakeClock`, `FakeMetronome`, `FakeNoteDetector`).

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

- Branche `plan/g-calibration`, dans son propre worktree, créée depuis `main` une fois P0 fusionné.
- Ce plan ne crée et ne modifie que des fichiers sous `src/lib/infrastructure/audio/calibration/`. Il ne touche ni `package.json`, ni `package-lock.json`, ni `vite.config.ts`, ni les fichiers du socle, ni le README des plans.
- Imports autorisés hors de ce dossier : `$lib/application/ports` (types `AudioClockPort`, `MetronomePort`, `NoteDetectorPort`, `NoteOnset`, `BeatEvent`, `CalibrationPort`, `CalibrationProgress`, `CalibrationOutcome`), `$lib/domain/stats` (`median`). Rien des plans A à F ni H (pas d'`WebAudioMetronome`, pas de détecteur réel).
- Règles audio partagées (README) : démarrer le métronome au plus tôt à `clock.now() + 0.1` (ici `+ 0.5`) ; `onBeat` peut arriver jusqu'à 100 ms avant l'heure du temps — ne jamais exiger `clock.now() >= beat.time` ; comparer les index de temps avec `>=`, jamais `===` ; `setTempo` uniquement à l'arrêt.
- Pas de minuteur dans le service : l'abandon « no-sound » se décide sur le compteur de `onBeat`, pas sur `setTimeout`.
- `index.ts` réexporte exactement les signatures du README (section « G — Calibration »).

---

## Règles de calibration

Règles fixées par le README (section G) et par la requête de plan :

- **Config par défaut** : 80 bpm, 10 frappes acceptées (`hitsNeeded`), dispersion max 40 ms (`maxSpreadMs`), abandon après 32 temps sans frappe acceptée (`noSoundBeats`).
- **Démarrage de `run`** : `await clock.resume()` ; `await detector.start(await deviceId())` ; `metronome.setTempo(bpm)` pendant l'arrêt ; abonnements `onBeat` / `onNote` ; `metronome.start(clock.now() + 0.5)`.
- **Écart d'une attaque** : `offsetMs = (onset.time − nearestAnnouncedBeat.time) × 1000` (signé : positif = après le temps).
- **Première mesure** : les attaques dont le temps annoncé le plus proche a `index < 4` sont ignorées (ni progression, ni compteur de frappes).
- **Trop loin** : si `|onset.time − nearestAnnouncedBeat.time| > secondsPerBeat / 2`, l'attaque est ignorée.
- **Progression** : après chaque frappe acceptée, `onProgress({ hits, needed: hitsNeeded, lastOffsetMs })`.
- **Fin `ok`** : dès que `hits >= hitsNeeded`, appeler `computeCalibration(offsets, maxSpreadMs)` ; si le résultat est non nul → `{ ok: true, offsetMs, spreadMs }`.
- **Fin `inconsistent`** : `hits >= hitsNeeded` mais `computeCalibration` renvoie `null` (liste vide après filtrage interne, ou `spreadMs > maxSpreadMs`).
- **Fin `no-sound`** : un `onBeat` arrive avec `beat.index >= noSoundBeats - 1` et toujours zéro frappe acceptée.
- **Fin `cancelled`** : `cancel()` pendant un `run` en cours.
- **Nettoyage** : dans tous les cas, `metronome.stop()`, `detector.stop()`, désabonnement de `onBeat` et `onNote`. Le service n'écrit pas dans les réglages (I3 s'en charge).

Précisions tranchées par ce plan (le README ne les fixe pas) :

- **Temps de référence** : uniquement les temps déjà annoncés par `onBeat` (grille connue du service). On ne reconstruit pas une grille infinie à partir de `firstBeatTime` pour apparier une attaque : sans temps annoncé, l'attaque est ignorée.
- **`computeCalibration`** : `offsetMs = median(offsets)` ; `spreadMs = median(|o − offsetMs|)` (MAD). Renvoie `null` si la liste est vide ou si `spreadMs > maxSpreadMs`. Les valeurs renvoyées sont arrondies à l'entier le plus proche (`Math.round`) ; la comparaison à `maxSpreadMs` se fait sur la MAD non arrondie.
- **Filtrage « half a beat »** : appliqué dans le service à l'appariement (voir ci-dessus). `computeCalibration` reçoit déjà des écarts acceptés ; sa signature README n'a pas de durée de temps, donc elle ne peut pas re-filtrer sur une demi-mesure.
- **`run` concurrent** : un second `run` alors qu'un premier est en cours lève `Error('Calibration already running')`.
- **`cancel` hors course** : no-op.
- **Progression** : `lastOffsetMs` est arrondi à l'entier (`Math.round`) pour rester stable face à l'erreur flottante (`0.038 * 1000`).
- **Constante de démarrage** : `CALIBRATION_START_DELAY_S = 0.5` (≥ 0,1 s exigé par les règles audio partagées).

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `src/lib/infrastructure/audio/calibration/config.ts` | `CalibrationConfig`, `DEFAULT_CALIBRATION_CONFIG`, `CALIBRATION_START_DELAY_S` |
| `src/lib/infrastructure/audio/calibration/computeCalibration.ts` | Médiane + MAD → `{ offsetMs, spreadMs } \| null` |
| `src/lib/infrastructure/audio/calibration/computeCalibration.spec.ts` | Tests purs de `computeCalibration` |
| `src/lib/infrastructure/audio/calibration/CalibrationService.ts` | `CalibrationPort` : orchestration horloge / métronome / détecteur |
| `src/lib/infrastructure/audio/calibration/CalibrationService.spec.ts` | Tests avec `FakeClock`, `FakeMetronome`, `FakeNoteDetector` |
| `src/lib/infrastructure/audio/calibration/index.ts` | Point d'entrée `$lib/infrastructure/audio/calibration` |

---

### Task 1: Config et `computeCalibration`

**Files:**
- Create: `src/lib/infrastructure/audio/calibration/config.ts`
- Create: `src/lib/infrastructure/audio/calibration/computeCalibration.ts`
- Test: `src/lib/infrastructure/audio/calibration/computeCalibration.spec.ts`

**Interfaces:**
- Consumes: `median` de `$lib/domain/stats` (P0).
- Produces:
  - `interface CalibrationConfig { bpm: number; hitsNeeded: number; maxSpreadMs: number; noSoundBeats: number }`
  - `DEFAULT_CALIBRATION_CONFIG` : `{ bpm: 80, hitsNeeded: 10, maxSpreadMs: 40, noSoundBeats: 32 }`
  - `CALIBRATION_START_DELAY_S = 0.5`
  - `computeCalibration(offsetsMs: readonly number[], maxSpreadMs: number): { offsetMs: number; spreadMs: number } | null`

- [ ] **Step 1: Écrire le test**

Créer `src/lib/infrastructure/audio/calibration/computeCalibration.spec.ts` :

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_CALIBRATION_CONFIG } from './config';
import { computeCalibration } from './computeCalibration';

describe('DEFAULT_CALIBRATION_CONFIG', () => {
	it('matches the README defaults', () => {
		expect(DEFAULT_CALIBRATION_CONFIG).toEqual({
			bpm: 80,
			hitsNeeded: 10,
			maxSpreadMs: 40,
			noSoundBeats: 32
		});
	});
});

describe('computeCalibration', () => {
	it('returns null for an empty list', () => {
		expect(computeCalibration([], 40)).toBeNull();
	});

	it('returns the median offset and MAD spread, rounded', () => {
		// offsets around 38 ms with a little jitter
		const offsets = [36, 38, 37, 40, 39, 38, 41, 35, 38, 37];
		const result = computeCalibration(offsets, 40);
		expect(result).not.toBeNull();
		expect(result!.offsetMs).toBe(38);
		expect(result!.spreadMs).toBeLessThanOrEqual(40);
		expect(result!.spreadMs).toBe(1);
	});

	it('returns null when the MAD exceeds maxSpreadMs', () => {
		const offsets = [0, 10, 20, 80, 90, 100];
		expect(computeCalibration(offsets, 40)).toBeNull();
	});

	it('accepts a spread equal to maxSpreadMs', () => {
		// median = 50; deviations = [20, 10, 0, 10, 20] → MAD = 10
		const offsets = [30, 40, 50, 60, 70];
		expect(computeCalibration(offsets, 10)).toEqual({ offsetMs: 50, spreadMs: 10 });
	});

	it('does not mutate its input', () => {
		const offsets = [3, 1, 2];
		computeCalibration(offsets, 40);
		expect(offsets).toEqual([3, 1, 2]);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/infrastructure/audio/calibration/computeCalibration.spec.ts`
Expected: FAIL, module introuvable (« Failed to resolve import "./computeCalibration" » ou « Failed to resolve import "./config" »).

- [ ] **Step 3: Écrire la config**

Créer `src/lib/infrastructure/audio/calibration/config.ts` :

```ts
export interface CalibrationConfig {
	bpm: number;
	hitsNeeded: number;
	maxSpreadMs: number;
	noSoundBeats: number;
}

export const DEFAULT_CALIBRATION_CONFIG: CalibrationConfig = {
	bpm: 80,
	hitsNeeded: 10,
	maxSpreadMs: 40,
	noSoundBeats: 32
};

/** Audio seconds after `clock.now()` before beat 0 (must be ≥ 0.1). */
export const CALIBRATION_START_DELAY_S = 0.5;
```

- [ ] **Step 4: Écrire `computeCalibration`**

Créer `src/lib/infrastructure/audio/calibration/computeCalibration.ts` :

```ts
import { median } from '$lib/domain/stats';

/**
 * Median offset and median absolute deviation.
 * Returns null when `offsetsMs` is empty or the MAD exceeds `maxSpreadMs`.
 * Callers must already drop offsets farther than half a beat.
 */
export function computeCalibration(
	offsetsMs: readonly number[],
	maxSpreadMs: number
): { offsetMs: number; spreadMs: number } | null {
	if (offsetsMs.length === 0) return null;

	const offset = median(offsetsMs);
	if (offset === null) return null;

	const deviations = offsetsMs.map((value) => Math.abs(value - offset));
	const spread = median(deviations);
	if (spread === null) return null;
	if (spread > maxSpreadMs) return null;

	return {
		offsetMs: Math.round(offset),
		spreadMs: Math.round(spread)
	};
}
```

- [ ] **Step 5: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/infrastructure/audio/calibration/computeCalibration.spec.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/infrastructure/audio/calibration/config.ts \
  src/lib/infrastructure/audio/calibration/computeCalibration.ts \
  src/lib/infrastructure/audio/calibration/computeCalibration.spec.ts
git commit -m "$(cat <<'EOF'
feat: add calibration config and computeCalibration

EOF
)"
```

---

### Task 2: `CalibrationService` — chemin heureux

**Files:**
- Create: `src/lib/infrastructure/audio/calibration/CalibrationService.ts`
- Test: `src/lib/infrastructure/audio/calibration/CalibrationService.spec.ts`

**Interfaces:**
- Consumes: `CalibrationConfig`, `DEFAULT_CALIBRATION_CONFIG`, `CALIBRATION_START_DELAY_S` (Task 1) ; `computeCalibration` (Task 1) ; ports P0 ; `FakeClock`, `FakeMetronome`, `FakeNoteDetector` de `$lib/testing/fakes` (tests seulement).
- Produces: `class CalibrationService implements CalibrationPort` avec
  - `constructor(deps: { clock: AudioClockPort; metronome: MetronomePort; detector: NoteDetectorPort; deviceId: () => Promise<string | null> }, config?: Partial<CalibrationConfig>)`
  - `run(onProgress: (progress: CalibrationProgress) => void): Promise<CalibrationOutcome>`
  - `cancel(): void`

- [ ] **Step 1: Écrire le test du chemin heureux**

Créer `src/lib/infrastructure/audio/calibration/CalibrationService.spec.ts` :

```ts
import { describe, expect, it, vi } from 'vitest';
import type { CalibrationProgress } from '$lib/application/ports';
import { FakeClock, FakeMetronome, FakeNoteDetector } from '$lib/testing/fakes';
import { CalibrationService } from './CalibrationService';
import { CALIBRATION_START_DELAY_S, DEFAULT_CALIBRATION_CONFIG } from './config';

function setup(config?: Partial<typeof DEFAULT_CALIBRATION_CONFIG>) {
	const clock = new FakeClock();
	const metronome = new FakeMetronome(clock);
	const detector = new FakeNoteDetector();
	const deviceId = vi.fn(async () => 'input-1');
	const service = new CalibrationService(
		{ clock, metronome, detector, deviceId },
		config
	);
	return { clock, metronome, detector, deviceId, service };
}

/** Advance the clock and flush until beat `index` has been announced (lookahead 0.1 s). */
function announceThrough(
	clock: FakeClock,
	metronome: FakeMetronome,
	index: number
): void {
	const need = metronome.beatTime(index) - 0.1;
	if (clock.now() < need) clock.advance(need - clock.now());
	metronome.flush();
}

describe('CalibrationService.run', () => {
	it('resumes, starts the detector with deviceId, sets tempo, and starts later than now', async () => {
		const { clock, metronome, detector, deviceId, service } = setup({
			hitsNeeded: 1,
			noSoundBeats: 64
		});
		const resume = vi.spyOn(clock, 'resume');
		const progress: { hits: number; needed: number; lastOffsetMs: number | null }[] = [];

		const runPromise = service.run((p) => progress.push({ ...p }));

		// Beat 0 announced ~0.1 s before 0.5 → clock at 0.4
		announceThrough(clock, metronome, 0);
		expect(resume).toHaveBeenCalledOnce();
		expect(deviceId).toHaveBeenCalledOnce();
		expect(detector.running).toBe(true);
		expect(detector.deviceId).toBe('input-1');
		expect(metronome.getTempo()).toBe(80);
		expect(metronome.isRunning()).toBe(true);
		expect(metronome.beatTime(0)).toBeCloseTo(CALIBRATION_START_DELAY_S);

		// Skip first bar (beats 0..3); accept on beat 4
		announceThrough(clock, metronome, 4);
		detector.emitNote({
			time: metronome.beatTime(4) + 0.038,
			midi: 40,
			frequencyHz: 82.4,
			clarity: 0.95
		});

		await expect(runPromise).resolves.toEqual({
			ok: true,
			offsetMs: 38,
			spreadMs: 0
		});
		expect(progress).toEqual([{ hits: 1, needed: 1, lastOffsetMs: 38 }]);
		expect(metronome.isRunning()).toBe(false);
		expect(detector.running).toBe(false);
	});

	it('collects ten ~38 ms hits after the first bar and reports offsetMs near 38', async () => {
		const { clock, metronome, detector, service } = setup();
		const progress: number[] = [];

		const runPromise = service.run((p) => {
			if (p.lastOffsetMs !== null) progress.push(p.lastOffsetMs);
		});

		for (let index = 0; index < 4 + 10; index++) {
			announceThrough(clock, metronome, index);
			if (index < 4) continue;
			detector.emitNote({
				time: metronome.beatTime(index) + 0.038,
				midi: 40,
				frequencyHz: 82.4,
				clarity: 0.95
			});
		}

		const outcome = await runPromise;
		expect(outcome).toEqual({ ok: true, offsetMs: 38, spreadMs: 0 });
		expect(progress).toHaveLength(10);
		expect(progress.every((ms) => ms === 38)).toBe(true);
	});
});
```

- [ ] **Step 2: Lancer le test pour vérifier qu'il échoue**

Run: `npx vitest run src/lib/infrastructure/audio/calibration/CalibrationService.spec.ts`
Expected: FAIL, « Failed to resolve import "./CalibrationService" ».

- [ ] **Step 3: Écrire `CalibrationService` (chemin heureux + squelette des issues)**

Créer `src/lib/infrastructure/audio/calibration/CalibrationService.ts` :

```ts
import type {
	AudioClockPort,
	BeatEvent,
	CalibrationOutcome,
	CalibrationPort,
	CalibrationProgress,
	MetronomePort,
	NoteDetectorPort,
	NoteOnset
} from '$lib/application/ports';
import {
	CALIBRATION_START_DELAY_S,
	DEFAULT_CALIBRATION_CONFIG,
	type CalibrationConfig
} from './config';
import { computeCalibration } from './computeCalibration';

export class CalibrationService implements CalibrationPort {
	private readonly config: CalibrationConfig;
	private readonly clock: AudioClockPort;
	private readonly metronome: MetronomePort;
	private readonly detector: NoteDetectorPort;
	private readonly deviceId: () => Promise<string | null>;

	private running = false;
	private cancelled = false;
	private offsetsMs: number[] = [];
	private announced = new Map<number, number>();
	private unsubBeat: (() => void) | null = null;
	private unsubNote: (() => void) | null = null;
	private resolveRun: ((outcome: CalibrationOutcome) => void) | null = null;
	private onProgress: ((progress: CalibrationProgress) => void) | null = null;

	constructor(
		deps: {
			clock: AudioClockPort;
			metronome: MetronomePort;
			detector: NoteDetectorPort;
			deviceId: () => Promise<string | null>;
		},
		config?: Partial<CalibrationConfig>
	) {
		this.clock = deps.clock;
		this.metronome = deps.metronome;
		this.detector = deps.detector;
		this.deviceId = deps.deviceId;
		this.config = { ...DEFAULT_CALIBRATION_CONFIG, ...config };
	}

	async run(onProgress: (progress: CalibrationProgress) => void): Promise<CalibrationOutcome> {
		if (this.running) throw new Error('Calibration already running');

		this.running = true;
		this.cancelled = false;
		this.offsetsMs = [];
		this.announced = new Map();
		this.onProgress = onProgress;

		const outcomePromise = new Promise<CalibrationOutcome>((resolve) => {
			this.resolveRun = resolve;
		});

		try {
			await this.clock.resume();
			const id = await this.deviceId();
			await this.detector.start(id);

			this.metronome.setTempo(this.config.bpm);

			this.unsubBeat = this.metronome.onBeat((beat) => this.handleBeat(beat));
			this.unsubNote = this.detector.onNote((onset) => this.handleNote(onset));

			this.metronome.start(this.clock.now() + CALIBRATION_START_DELAY_S);
		} catch (error) {
			this.cleanup();
			this.resolveRun = null;
			this.onProgress = null;
			this.running = false;
			throw error;
		}

		return outcomePromise;
	}

	cancel(): void {
		if (!this.running) return;
		this.cancelled = true;
		this.finish({ ok: false, reason: 'cancelled' });
	}

	private handleBeat(beat: BeatEvent): void {
		if (!this.running || this.cancelled) return;

		this.announced.set(beat.index, beat.time);

		if (this.offsetsMs.length === 0 && beat.index >= this.config.noSoundBeats - 1) {
			this.finish({ ok: false, reason: 'no-sound' });
		}
	}

	private handleNote(onset: NoteOnset): void {
		if (!this.running || this.cancelled) return;
		if (this.announced.size === 0) return;

		let nearestIndex = -1;
		let nearestTime = 0;
		let nearestDistance = Number.POSITIVE_INFINITY;
		for (const [index, time] of this.announced) {
			const distance = Math.abs(onset.time - time);
			if (distance < nearestDistance) {
				nearestDistance = distance;
				nearestIndex = index;
				nearestTime = time;
			}
		}

		const halfBeatS = this.metronome.secondsPerBeat() / 2;
		if (nearestDistance > halfBeatS) return;
		if (nearestIndex < 4) return;

		const offsetMs = Math.round((onset.time - nearestTime) * 1000);
		this.offsetsMs.push(offsetMs);
		this.onProgress?.({
			hits: this.offsetsMs.length,
			needed: this.config.hitsNeeded,
			lastOffsetMs: offsetMs
		});

		if (this.offsetsMs.length >= this.config.hitsNeeded) {
			const result = computeCalibration(this.offsetsMs, this.config.maxSpreadMs);
			if (result === null) {
				this.finish({ ok: false, reason: 'inconsistent' });
				return;
			}
			this.finish({ ok: true, offsetMs: result.offsetMs, spreadMs: result.spreadMs });
		}
	}

	private finish(outcome: CalibrationOutcome): void {
		if (!this.running) return;
		this.cleanup();
		const resolve = this.resolveRun;
		this.resolveRun = null;
		this.onProgress = null;
		this.running = false;
		resolve?.(outcome);
	}

	private cleanup(): void {
		this.unsubBeat?.();
		this.unsubNote?.();
		this.unsubBeat = null;
		this.unsubNote = null;
		this.metronome.stop();
		this.detector.stop();
	}
}
```

- [ ] **Step 4: Lancer le test pour vérifier qu'il passe**

Run: `npx vitest run src/lib/infrastructure/audio/calibration/CalibrationService.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/infrastructure/audio/calibration/CalibrationService.ts \
  src/lib/infrastructure/audio/calibration/CalibrationService.spec.ts
git commit -m "$(cat <<'EOF'
feat: add CalibrationService happy path

EOF
)"
```

---

### Task 3: Issues, ignore, annulation et nettoyage

**Files:**
- Modify: `src/lib/infrastructure/audio/calibration/CalibrationService.spec.ts`
- Modify: `src/lib/infrastructure/audio/calibration/CalibrationService.ts` (seulement si un test révèle un trou ; le code de la Task 2 doit déjà couvrir ces cas)

**Interfaces:**
- Consumes: les mêmes que la Task 2.
- Produces: aucun symbole nouveau ; comportement complet des quatre issues et du nettoyage systématique.

- [ ] **Step 1: Étendre le fichier de test**

Ajouter à la fin de `src/lib/infrastructure/audio/calibration/CalibrationService.spec.ts` (conserver les helpers et les tests de la Task 2) :

```ts
describe('CalibrationService outcomes', () => {
	it('ignores the first bar and onsets farther than half a beat', async () => {
		const { clock, metronome, detector, service } = setup({
			hitsNeeded: 2,
			noSoundBeats: 64
		});
		const progress: CalibrationProgress[] = [];
		const runPromise = service.run((p) => progress.push({ ...p }));

		// First bar: emit on every beat — must be ignored
		for (let index = 0; index < 4; index++) {
			announceThrough(clock, metronome, index);
			detector.emitNote({
				time: metronome.beatTime(index) + 0.02,
				midi: 40,
				frequencyHz: 82.4,
				clarity: 0.95
			});
		}
		expect(progress).toEqual([]);

		// Beat 4: onset more than half a beat away (half beat at 80 bpm = 0.375 s)
		announceThrough(clock, metronome, 4);
		detector.emitNote({
			time: metronome.beatTime(4) + 0.4,
			midi: 40,
			frequencyHz: 82.4,
			clarity: 0.95
		});
		expect(progress).toEqual([]);

		// Two accepted hits
		detector.emitNote({
			time: metronome.beatTime(4) + 0.038,
			midi: 40,
			frequencyHz: 82.4,
			clarity: 0.95
		});
		announceThrough(clock, metronome, 5);
		detector.emitNote({
			time: metronome.beatTime(5) + 0.038,
			midi: 40,
			frequencyHz: 82.4,
			clarity: 0.95
		});

		await expect(runPromise).resolves.toMatchObject({ ok: true, offsetMs: 38 });
		expect(progress).toHaveLength(2);
	});

	it('returns inconsistent when the spread exceeds maxSpreadMs', async () => {
		const { clock, metronome, detector, service } = setup({
			hitsNeeded: 5,
			maxSpreadMs: 5,
			noSoundBeats: 64
		});
		const runPromise = service.run(() => {});

		const offsetsS = [0.0, 0.05, 0.1, 0.0, 0.08];
		for (let i = 0; i < 4 + offsetsS.length; i++) {
			announceThrough(clock, metronome, i);
			if (i < 4) continue;
			detector.emitNote({
				time: metronome.beatTime(i) + offsetsS[i - 4],
				midi: 40,
				frequencyHz: 82.4,
				clarity: 0.95
			});
		}

		await expect(runPromise).resolves.toEqual({ ok: false, reason: 'inconsistent' });
		expect(metronome.isRunning()).toBe(false);
		expect(detector.running).toBe(false);
	});

	it('returns no-sound after noSoundBeats beats with no accepted hit', async () => {
		const { clock, metronome, detector, service } = setup({
			hitsNeeded: 10,
			noSoundBeats: 8
		});
		const runPromise = service.run(() => {});

		for (let index = 0; index < 8; index++) {
			announceThrough(clock, metronome, index);
			// Onsets only in the first bar — never accepted
			if (index < 4) {
				detector.emitNote({
					time: metronome.beatTime(index) + 0.01,
					midi: 40,
					frequencyHz: 82.4,
					clarity: 0.95
				});
			}
		}

		await expect(runPromise).resolves.toEqual({ ok: false, reason: 'no-sound' });
		expect(metronome.isRunning()).toBe(false);
		expect(detector.running).toBe(false);
	});

	it('returns cancelled when cancel() is called mid-run', async () => {
		const { clock, metronome, service } = setup({ noSoundBeats: 64 });
		const runPromise = service.run(() => {});
		announceThrough(clock, metronome, 0);
		service.cancel();
		await expect(runPromise).resolves.toEqual({ ok: false, reason: 'cancelled' });
		expect(metronome.isRunning()).toBe(false);
	});

	it('cancel is a no-op when idle, and a second run throws while busy', async () => {
		const { clock, metronome, detector, service } = setup({
			hitsNeeded: 1,
			noSoundBeats: 64
		});
		service.cancel();

		const first = service.run(() => {});
		announceThrough(clock, metronome, 0);
		await expect(service.run(() => {})).rejects.toThrow('Calibration already running');

		announceThrough(clock, metronome, 4);
		detector.emitNote({
			time: metronome.beatTime(4) + 0.038,
			midi: 40,
			frequencyHz: 82.4,
			clarity: 0.95
		});
		await first;
	});
});
```

- [ ] **Step 2: Lancer les tests pour vérifier qu'ils passent**

Run: `npx vitest run src/lib/infrastructure/audio/calibration/CalibrationService.spec.ts`
Expected: PASS (7 tests au total : 2 de la Task 2 + 5 nouveaux). Si un cas échoue, corriger uniquement `CalibrationService.ts` (logique déjà prévue dans la Task 2).

- [ ] **Step 3: Commit**

```bash
git add src/lib/infrastructure/audio/calibration/CalibrationService.ts \
  src/lib/infrastructure/audio/calibration/CalibrationService.spec.ts
git commit -m "$(cat <<'EOF'
test: cover calibration outcomes and cleanup

EOF
)"
```

---

### Task 4: Point d'entrée et vérification

**Files:**
- Create: `src/lib/infrastructure/audio/calibration/index.ts`

**Interfaces:**
- Consumes: Task 1 et Task 2.
- Produces: réexport public exact du README G :
  - `CalibrationConfig`, `DEFAULT_CALIBRATION_CONFIG`
  - `computeCalibration`
  - `CalibrationService`

- [ ] **Step 1: Écrire `index.ts`**

Créer `src/lib/infrastructure/audio/calibration/index.ts` :

```ts
export { DEFAULT_CALIBRATION_CONFIG, type CalibrationConfig } from './config';
export { computeCalibration } from './computeCalibration';
export { CalibrationService } from './CalibrationService';
```

(`CALIBRATION_START_DELAY_S` reste un détail d'implémentation, importé seulement par `CalibrationService`.)

- [ ] **Step 2: Lancer tous les tests du module et la vérification de types**

Run: `npx vitest run src/lib/infrastructure/audio/calibration && npm run check`
Expected: tous les tests du dossier PASS ; `svelte-check found 0 errors`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/infrastructure/audio/calibration/index.ts
git commit -m "$(cat <<'EOF'
feat: export calibration module entry point

EOF
)"
```

---

## Fin du plan

À la fin de ce plan, la branche `plan/g-calibration` expose `CalibrationService` et `computeCalibration` sous `src/lib/infrastructure/audio/calibration/`, testés uniquement avec les doublures P0. L'écran `/calibration` (plan I3) branchera `run` / `cancel` et enregistrera `offsetMs` dans les réglages.
