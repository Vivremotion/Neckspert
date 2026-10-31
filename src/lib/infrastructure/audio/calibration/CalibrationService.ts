import type {
	AttackDetectorPort,
	AudioClockPort,
	AudioInputDevice,
	CalibrationMeasure,
	CalibrationOutcome,
	CalibrationPhase,
	CalibrationPort,
	CalibrationProgress,
	NoteDetectorPort,
	SoundSchedulerPort
} from '$lib/application/ports';
import { median } from '$lib/domain/stats';
import type { LatencyProvenance, SensorLatency } from '$lib/domain/types';
import { isBuiltInMicLabel } from '../input/WebAudioInput';
import { loopLatency, pairedDelay } from './compare';
import { computeCalibration } from './computeCalibration';
import {
	BLEED_CHECK_CLICKS,
	CALIBRATION_ATTACKS,
	CALIBRATION_START_DELAY_S,
	CLICK_BLEED_RATIO,
	COMPARE_MAX_SPREAD_MS,
	COMPARE_MIN_PAIRS,
	COMPARE_SETTLE_S,
	COMPARE_TIMEOUT_S,
	DEFAULT_CALIBRATION_CONFIG,
	LISTEN_MAX_SPREAD_MS,
	LISTEN_MIN_HEARD_RATIO,
	LISTEN_WINDOW_S,
	MIC_DISTANCE_MS,
	MIN_PAIRED_SHARE,
	NOTE_DELAY_MIN_PAIRS,
	PAIR_WINDOW_S,
	PLAY_MAX_OFFSET_MS,
	PLAY_SKIPPED_CLICKS,
	type CalibrationConfig
} from './config';

/** A second input opened beside the playing one, in the same audio context. */
export interface SecondInput {
	attacks: AttackDetectorPort;
	close(): void;
}

/** Chrome's virtual entries: aliases of a real device, never a physical input of their own. */
const ALIAS_IDS = new Set(['default', 'communications']);

const CANCELLED: CalibrationOutcome = { ok: false, reason: 'cancelled' };

/** Thrown inside a run once it is closed: it stops there and touches no shared port again. */
class RunClosed extends Error {}

/** What the inputs heard during the current phase, in audio seconds. */
interface Heard {
	play: number[];
	mic: number[];
	notes: number[];
}

/** One run: what it opened, closed together at its end (or at once when opened after it). */
class Run {
	closed = false;
	onPlayAttack: (() => void) | null = null;
	onNote: ((time: number) => void) | null = null;
	private readonly cleanups: Array<() => void> = [];
	private resolveCancel: ((outcome: CalibrationOutcome) => void) | null = null;
	private resolveClosed: (() => void) | null = null;
	readonly cancelled = new Promise<CalibrationOutcome>((resolve) => {
		this.resolveCancel = resolve;
	});
	private readonly whenClosed = new Promise<void>((resolve) => {
		this.resolveClosed = resolve;
	});

	add(cleanup: () => void): void {
		if (this.closed) cleanup();
		else this.cleanups.push(cleanup);
	}

	/** Awaits `promise`, or the close of the run, whichever comes first; throws once closed. */
	async step<T>(promise: Promise<T>): Promise<T> {
		const value = await Promise.race([promise, this.whenClosed.then(() => undefined)]);
		this.check();
		return value as T;
	}

	/** Throws once closed. */
	check(): void {
		if (this.closed) throw new RunClosed();
	}

	cancel(): void {
		this.resolveCancel?.(CANCELLED);
	}

	close(): void {
		if (this.closed) return;
		this.closed = true;
		this.onPlayAttack = null;
		this.onNote = null;
		for (const cleanup of this.cleanups.reverse()) cleanup();
		this.cleanups.length = 0;
		this.resolveClosed?.();
	}
}

function latencies(attackMs: number, noteMs: number, provenance: LatencyProvenance) {
	const attack: SensorLatency = { ms: Math.round(attackMs), provenance };
	const note: SensorLatency = { ms: Math.round(noteMs), provenance };
	return { attack, note, chord: { ...note } };
}

/** The device the player plays through: the one chosen, or the default one. */
function playingDevice(devices: AudioInputDevice[], id: string | null): AudioInputDevice | null {
	if (id !== null) return devices.find((d) => d.id === id) ?? null;
	return devices.find((d) => d.id === 'default') ?? devices[0] ?? null;
}

/** The computer's own mic, never the playing device nor an alias of a device. */
function computerMic(devices: AudioInputDevice[], playingId: string | null) {
	return (
		devices.find((d) => d.id !== playingId && !ALIAS_IDS.has(d.id) && isBuiltInMicLabel(d.label)) ??
		null
	);
}

/**
 * Measures the latency of the playing input without the player's timing in it.
 *
 * 1. Listen: `BLEED_CHECK_CLICKS` clicks, the player silent. The computer's mic hears them: its
 *    loop latency `R` (output + mic), from the clicks heard at one common delay
 *    (`loopLatency`). An interface tells at the same time whether it hears the click (bleed).
 * 1b. With the computer's mic as the playing input, its headphones were held against it: the
 *    bleed is told by `BLEED_CHECK_CLICKS` more clicks, headphones back on.
 * 2. Compare: the player plays `CALIBRATION_ATTACKS` notes freely; the interface's attacks pair
 *    with the mic's, and `attack = R + median(t_interface − t_mic) + d`. With the computer's mic
 *    as the playing input, `attack = R` and this phase only serves the note detector.
 * 3. The notes of the same input must be read and pair with its attacks: a note takes its
 *    attack's time, so the delay is 0 within a sample (`note = chord = attack + delay`). The chord
 *    verifier's onsets, its own rule, stay within 6 ms of the attacks, neglected.
 * 4. Fallback, when the mic does not open or does not hear the clicks in 1: the player on the
 *    click, every latency of provenance `player`.
 */
export class CalibrationService implements CalibrationPort {
	private readonly config: CalibrationConfig;
	private active: Run | null = null;
	/** Settles once the last run has let go of the shared ports, cancelled or not. */
	private settling: Promise<unknown> = Promise.resolve();

	constructor(
		private readonly deps: {
			clock: AudioClockPort;
			sounds: SoundSchedulerPort;
			/** Opens the playing input (the shared one) and reads its notes. */
			detector: NoteDetectorPort;
			/** The attacks of the playing input. */
			attacks: AttackDetectorPort;
			/** Opens the computer's mic beside the playing input; throws when it cannot. */
			openSecondInput: (deviceId: string) => Promise<SecondInput>;
			/** Each phase's raw data (dev builds), so a run on real hardware explains itself. */
			log?: (phase: string, data: Record<string, unknown>) => void;
		},
		config?: Partial<CalibrationConfig>
	) {
		this.config = { ...DEFAULT_CALIBRATION_CONFIG, ...config };
	}

	run(
		deviceId: string | null,
		onProgress: (progress: CalibrationProgress) => void
	): Promise<CalibrationOutcome> {
		return this.start((run) => this.measure(run, deviceId, onProgress));
	}

	runOnClick(
		deviceId: string | null,
		onProgress: (progress: CalibrationProgress) => void
	): Promise<CalibrationOutcome> {
		return this.start((run) => this.onClick(run, deviceId, onProgress));
	}

	cancel(): void {
		this.active?.cancel();
	}

	private async start(
		body: (run: Run) => Promise<CalibrationOutcome>
	): Promise<CalibrationOutcome> {
		if (this.active) throw new Error('Calibration already running');
		const run = new Run();
		this.active = run;
		// A cancelled run may still be opening an input: the next one starts once it let go.
		const execution = this.settling.then(async () => {
			try {
				return await body(run);
			} catch (error) {
				if (error instanceof RunClosed) return CANCELLED;
				throw error;
			}
		});
		this.settling = execution.catch(() => undefined);
		try {
			return await Promise.race([execution, run.cancelled]);
		} finally {
			run.close();
			this.active = null;
		}
	}

	private log(phase: string, data: Record<string, unknown>): void {
		this.deps.log?.(phase, data);
	}

	/** Opens the playing input and listens to its attacks and notes. */
	private async open(run: Run, id: string | null) {
		const { clock, sounds, detector, attacks } = this.deps;
		run.check();
		await run.step(clock.resume());
		const devices = await run.step(detector.listInputs());
		const playing = playingDevice(devices, id);
		const builtIn = playing !== null && isBuiltInMicLabel(playing.label);

		// Not raced: an input opened after a cancel is closed here, by `add`.
		await detector.start(id);
		run.add(() => detector.stop());
		run.check();
		run.add(() => sounds.cancelAll());

		const heard: Heard = { play: [], mic: [], notes: [] };
		run.add(
			attacks.onAttack(({ time }) => {
				heard.play.push(time);
				run.onPlayAttack?.();
			})
		);
		run.add(
			detector.onNote(({ time }) => {
				heard.notes.push(time);
				run.onNote?.(time);
			})
		);
		return { devices, playing, builtIn, heard };
	}

	private async measure(
		run: Run,
		id: string | null,
		onProgress: (progress: CalibrationProgress) => void
	): Promise<CalibrationOutcome> {
		const { clock } = this.deps;
		const { devices, playing, builtIn, heard } = await this.open(run, id);

		let mic: SecondInput | null = null;
		const micDevice = builtIn ? playing : computerMic(devices, playing?.id ?? id);
		if (micDevice && !builtIn) {
			try {
				mic = await this.deps.openSecondInput(micDevice.id);
			} catch (error) {
				console.warn('The computer mic did not open beside the playing input', error);
			}
		}
		if (mic) {
			const opened = mic;
			run.add(() => opened.close());
			run.check();
			run.add(opened.attacks.onAttack(({ time }) => heard.mic.push(time)));
		}
		run.check();

		// A fresh output loses its first sounds: the first click must be heard.
		await run.step(clock.settle());

		const clicks = await run.step(this.clicks(run, 'listen', onProgress));
		const reference = builtIn ? heard.play : mic ? heard.mic : null;
		const loop = loopLatency(clicks, reference ?? [], LISTEN_WINDOW_S);
		this.log('listen', {
			referenceMic: micDevice?.label ?? null,
			opened: builtIn || mic !== null,
			clicks: [...clicks],
			play: [...heard.play],
			mic: [...heard.mic],
			loop
		});
		const referenceMs = reference ? heardAt(loop) : null;
		let clickBleed = isBleed(clicks, heard.play);
		clear(heard);
		if (referenceMs === null) {
			return {
				ok: false,
				reason: 'reference',
				detail: {
					mic: micDevice?.label ?? null,
					opened: builtIn || mic !== null,
					heard: Math.round(loop.heardRatio * clicks.length),
					clicks: clicks.length,
					delayMs: tenth(loop.ms),
					spreadMs: tenth(loop.spreadMs)
				}
			};
		}
		if (builtIn) {
			const again = await run.step(this.clicks(run, 'bleed', onProgress));
			this.log('bleed', { clicks: [...again], play: [...heard.play] });
			clickBleed = isBleed(again, heard.play);
			clear(heard);
		}

		// The computer's mic as the playing input hears the room: its notes are counted.
		const counted = builtIn ? heard.notes : heard.play;
		const played = await run.step(this.compare(run, heard, counted, builtIn, onProgress));
		const diff = mic ? pairedDelay(heard.play, heard.mic, PAIR_WINDOW_S) : null;
		const delay = noteDelay(heard.notes, heard.play);
		this.log('compare', {
			play: [...heard.play],
			mic: [...heard.mic],
			notes: [...heard.notes],
			diff,
			noteDelay: delay
		});
		if (!played) return { ok: false, reason: 'no-sound' };
		const measure = (latencyMs: number | null): CalibrationMeasure => ({
			referenceMs: tenth(referenceMs),
			referenceSpreadMs: tenth(loop.spreadMs),
			offsetMs: tenth(diff?.ms ?? null),
			pairs: mic ? (diff?.pairs ?? 0) : (delay?.pairs ?? 0),
			played: counted.length,
			spreadMs: tenth(mic ? (diff?.spreadMs ?? null) : (delay?.spreadMs ?? null)),
			latencyMs: latencyMs === null ? null : Math.round(latencyMs)
		});
		let attackMs = referenceMs;
		if (mic) {
			if (heard.mic.length === 0) return { ok: false, reason: 'second-input' };
			if (!diff || diff.pairs < COMPARE_MIN_PAIRS || diff.spreadMs > COMPARE_MAX_SPREAD_MS) {
				return { ok: false, reason: 'inconsistent', measure: measure(null) };
			}
			attackMs = referenceMs + diff.ms + MIC_DISTANCE_MS;
		}
		if (delay === null) return { ok: false, reason: 'inconsistent', measure: measure(null) };
		return {
			ok: true,
			latency: latencies(attackMs, attackMs + delay.ms, 'system'),
			clickBleed,
			measure: measure(attackMs)
		};
	}

	/** The player on the click, chosen by the player: every latency is the player's. */
	private async onClick(
		run: Run,
		id: string | null,
		onProgress: (progress: CalibrationProgress) => void
	): Promise<CalibrationOutcome> {
		const { heard } = await this.open(run, id);
		await run.step(this.deps.clock.settle());
		return run.step(this.playOnClick(run, heard, onProgress));
	}

	/** Plays `BLEED_CHECK_CLICKS` clicks, the player silent; resolves once the last is heard. */
	private clicks(
		run: Run,
		phase: CalibrationPhase,
		onProgress: (progress: CalibrationProgress) => void
	): Promise<number[]> {
		const { clock, sounds } = this.deps;
		const beatS = 60 / this.config.bpm;
		const first = clock.now() + CALIBRATION_START_DELAY_S;
		const clicks = Array.from({ length: BLEED_CHECK_CLICKS }, (_, i) => first + i * beatS);
		const needed = BLEED_CHECK_CLICKS;
		onProgress({ phase, done: 0, needed });
		return new Promise((resolve) => {
			clicks.forEach((time, i) => {
				sounds.play(time, i % 4 === 0 ? 'click-accent' : 'click');
				run.add(sounds.at(time, () => onProgress({ phase, done: i + 1, needed })));
			});
			run.add(sounds.at(clicks[clicks.length - 1] + LISTEN_WINDOW_S, () => resolve(clicks)));
		});
	}

	/**
	 * The player plays `CALIBRATION_ATTACKS` notes, no click, counted on `counted` (the
	 * interface's attacks, or the notes of the computer's mic); the slower input's readings of
	 * the last one still arrive for `COMPARE_SETTLE_S`. False when nothing was played before
	 * `COMPARE_TIMEOUT_S`.
	 */
	private compare(
		run: Run,
		heard: Heard,
		counted: number[],
		onNotes: boolean,
		onProgress: (progress: CalibrationProgress) => void
	): Promise<boolean> {
		const { clock, sounds } = this.deps;
		const needed = CALIBRATION_ATTACKS;
		onProgress({ phase: 'compare', done: 0, needed });
		return new Promise((resolve) => {
			run.add(sounds.at(clock.now() + COMPARE_TIMEOUT_S, () => resolve(counted.length > 0)));
			const count = () => {
				const done = counted.length;
				if (done > needed) return;
				onProgress({ phase: 'compare', done, needed });
				if (done < needed) return;
				run.onPlayAttack = null;
				run.onNote = null;
				const last = Math.max(clock.now(), counted[done - 1], ...heard.play.slice(-1));
				run.add(sounds.at(last + COMPARE_SETTLE_S, () => resolve(true)));
			};
			if (onNotes) run.onNote = count;
			else run.onPlayAttack = count;
		});
	}

	/**
	 * `hitsNeeded` notes on the click, as before, but a note counts only within
	 * `PLAY_MAX_OFFSET_MS` of a click: an offbeat is not a latency.
	 */
	private playOnClick(
		run: Run,
		heard: Heard,
		onProgress: (progress: CalibrationProgress) => void
	): Promise<CalibrationOutcome> {
		const { clock, sounds } = this.deps;
		const { bpm, hitsNeeded, maxSpreadMs, noSoundBeats } = this.config;
		const beatS = 60 / bpm;
		const first = clock.now() + CALIBRATION_START_DELAY_S;
		const clicks = Array.from({ length: noSoundBeats }, (_, i) => first + i * beatS);
		const offsetsMs: number[] = [];
		const measure = (latencyMs: number | null): CalibrationMeasure => {
			const centre = median(offsetsMs);
			return {
				referenceMs: null,
				referenceSpreadMs: null,
				offsetMs: null,
				pairs: offsetsMs.length,
				played: offsetsMs.length,
				spreadMs:
					centre === null ? null : tenth(median(offsetsMs.map((o) => Math.abs(o - centre)))),
				latencyMs
			};
		};
		onProgress({ phase: 'play', done: 0, needed: hitsNeeded });
		return new Promise((resolve) => {
			clicks.forEach((time, i) => sounds.play(time, i % 4 === 0 ? 'click-accent' : 'click'));
			run.add(
				sounds.at(clicks[clicks.length - 1] + beatS / 2, () =>
					resolve(
						offsetsMs.length === 0
							? { ok: false, reason: 'no-sound' }
							: { ok: false, reason: 'inconsistent', measure: measure(null) }
					)
				)
			);
			run.onNote = (time) => {
				let index = 0;
				for (let i = 1; i < clicks.length; i++) {
					if (Math.abs(time - clicks[i]) < Math.abs(time - clicks[index])) index = i;
				}
				const offsetMs = (time - clicks[index]) * 1000;
				if (Math.abs(offsetMs) > PLAY_MAX_OFFSET_MS || index < PLAY_SKIPPED_CLICKS) return;
				offsetsMs.push(offsetMs);
				onProgress({ phase: 'play', done: offsetsMs.length, needed: hitsNeeded });
				if (offsetsMs.length < hitsNeeded) return;
				run.onNote = null;
				this.log('play', {
					clicks: [...clicks],
					notes: [...heard.notes],
					offsetsMs: [...offsetsMs]
				});
				const result = computeCalibration(offsetsMs, maxSpreadMs);
				if (result === null) {
					resolve({ ok: false, reason: 'inconsistent', measure: measure(null) });
					return;
				}
				// A note takes its attack's time: the two latencies differ by what this measures, nothing.
				const delay = noteDelay(heard.notes, heard.play)?.ms ?? 0;
				const attackMs = result.offsetMs - delay;
				resolve({
					ok: true,
					latency: latencies(attackMs, result.offsetMs, 'player'),
					clickBleed: null,
					measure: measure(Math.round(attackMs))
				});
			};
		});
	}
}

function clear(heard: Heard): void {
	heard.play.length = 0;
	heard.mic.length = 0;
	heard.notes.length = 0;
}

/** A measure shown to the player: to a tenth of a millisecond. */
function tenth(ms: number | null): number | null {
	return ms === null ? null : Math.round(ms * 10) / 10;
}

/** The loop latency of an input that heard the clicks at a steady delay; null otherwise. */
function heardAt(loop: ReturnType<typeof loopLatency>): number | null {
	if (loop.heardRatio < LISTEN_MIN_HEARD_RATIO) return null;
	if (loop.spreadMs === null || loop.spreadMs > LISTEN_MAX_SPREAD_MS) return null;
	return loop.ms;
}

/** The input hears the click: enough clicks heard at one common delay. */
function isBleed(clicks: number[], heard: number[]): boolean {
	return loopLatency(clicks, heard, LISTEN_WINDOW_S).heardRatio >= CLICK_BLEED_RATIO;
}

/**
 * How far from the attack sensor the note detector dates the same attack, anchored on the notes:
 * an attack with no note (a breath, a fret noise) does not count against it. Null when
 * fewer than `NOTE_DELAY_MIN_PAIRS`, or than `MIN_PAIRED_SHARE` of the notes, pair.
 */
function noteDelay(notes: number[], attacks: number[]): ReturnType<typeof pairedDelay> {
	const delay = pairedDelay(notes, attacks, PAIR_WINDOW_S);
	const needed = Math.max(NOTE_DELAY_MIN_PAIRS, Math.ceil(MIN_PAIRED_SHARE * notes.length));
	if (!delay || delay.pairs < needed) return null;
	return delay;
}
