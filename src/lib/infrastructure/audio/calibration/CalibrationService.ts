import type {
	AttackDetectorPort,
	AudioClockPort,
	AudioInputDevice,
	CalibrationOutcome,
	CalibrationPort,
	CalibrationProgress,
	NoteDetectorPort,
	SoundSchedulerPort
} from '$lib/application/ports';
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
	LISTEN_MIN_HEARD_RATIO,
	LISTEN_WINDOW_S,
	MIC_DISTANCE_MS,
	MIN_PAIRED_SHARE,
	PAIR_WINDOW_S,
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
	readonly cancelled = new Promise<CalibrationOutcome>((resolve) => {
		this.resolveCancel = resolve;
	});

	add(cleanup: () => void): void {
		if (this.closed) cleanup();
		else this.cleanups.push(cleanup);
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
 * 1. Listen: `BLEED_CHECK_CLICKS` clicks, the player silent. The playing input tells whether it
 *    hears the click (bleed). The computer's mic hears it: its loop latency `R` (output + mic).
 * 2. Compare: the player plays `CALIBRATION_ATTACKS` notes freely; the interface's attacks pair
 *    with the mic's, and `attack = R + median(t_interface − t_mic) + d`. When the playing input
 *    is the computer's mic, `attack = R` and this phase only serves the note detector.
 * 3. The note detector's own delay behind the attacks of the same input, measured on the same
 *    notes: `note = chord = attack + delay`.
 * 4. Fallback, when the mic does not open or hears nothing in 1: the player on the click,
 *    every latency of provenance `player`.
 */
export class CalibrationService implements CalibrationPort {
	private readonly config: CalibrationConfig;
	private active: Run | null = null;

	constructor(
		private readonly deps: {
			clock: AudioClockPort;
			sounds: SoundSchedulerPort;
			/** Opens the playing input (the shared one) and reads its notes. */
			detector: NoteDetectorPort;
			/** The attacks of the playing input. */
			attacks: AttackDetectorPort;
			deviceId: () => Promise<string | null>;
			/** Opens the computer's mic beside the playing input; throws when it cannot. */
			openSecondInput: (deviceId: string) => Promise<SecondInput>;
		},
		config?: Partial<CalibrationConfig>
	) {
		this.config = { ...DEFAULT_CALIBRATION_CONFIG, ...config };
	}

	async run(onProgress: (progress: CalibrationProgress) => void): Promise<CalibrationOutcome> {
		if (this.active) throw new Error('Calibration already running');
		const run = new Run();
		this.active = run;
		try {
			return await Promise.race([this.execute(run, onProgress), run.cancelled]);
		} finally {
			run.close();
			this.active = null;
		}
	}

	cancel(): void {
		this.active?.cancel();
	}

	private async execute(
		run: Run,
		onProgress: (progress: CalibrationProgress) => void
	): Promise<CalibrationOutcome> {
		const { clock, sounds, detector, attacks } = this.deps;
		await clock.resume();
		const id = await this.deps.deviceId();
		const devices = await detector.listInputs();
		if (run.closed) return CANCELLED;
		const playing = playingDevice(devices, id);
		const builtIn = playing !== null && isBuiltInMicLabel(playing.label);

		await detector.start(id);
		run.add(() => detector.stop());
		run.add(() => sounds.cancelAll());
		if (run.closed) return CANCELLED;

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

		let mic: SecondInput | null = null;
		const micDevice = builtIn ? null : computerMic(devices, playing?.id ?? id);
		if (micDevice) {
			try {
				mic = await this.deps.openSecondInput(micDevice.id);
			} catch (error) {
				console.warn('The computer mic did not open beside the playing input', error);
			}
		}
		if (mic) {
			const opened = mic;
			run.add(() => opened.close());
			run.add(opened.attacks.onAttack(({ time }) => heard.mic.push(time)));
		}
		if (run.closed) return CANCELLED;

		// A fresh output loses its first sounds: the first click must be heard.
		await clock.settle();
		if (run.closed) return CANCELLED;

		const clicks = await this.listen(run, onProgress);
		const clickBleed =
			loopLatency(clicks, heard.play, LISTEN_WINDOW_S).heardRatio >= CLICK_BLEED_RATIO;
		const reference = builtIn ? heard.play : mic ? heard.mic : null;
		const loop = reference ? loopLatency(clicks, reference, LISTEN_WINDOW_S) : null;
		const referenceMs = loop && loop.heardRatio >= LISTEN_MIN_HEARD_RATIO ? loop.ms : null;
		clear(heard);

		if (referenceMs === null) return this.playOnClick(run, heard, clickBleed, onProgress);

		const played = await this.compare(run, heard, onProgress);
		if (!played) return { ok: false, reason: 'no-sound' };
		let attackMs = referenceMs;
		if (mic) {
			if (heard.mic.length === 0) return { ok: false, reason: 'second-input' };
			const diff = pairedDelay(heard.play, heard.mic, PAIR_WINDOW_S);
			if (!diff || diff.pairs < COMPARE_MIN_PAIRS || diff.spreadMs > COMPARE_MAX_SPREAD_MS) {
				return { ok: false, reason: 'inconsistent' };
			}
			attackMs = referenceMs + diff.ms + MIC_DISTANCE_MS;
		}
		const delay = noteDelay(heard.notes, heard.play, heard.play.length);
		if (delay === null) return { ok: false, reason: 'inconsistent' };
		return { ok: true, latency: latencies(attackMs, attackMs + delay, 'system'), clickBleed };
	}

	/** Plays the clicks of the listen phase; resolves with their times once the last is heard. */
	private listen(run: Run, onProgress: (progress: CalibrationProgress) => void): Promise<number[]> {
		const { clock, sounds } = this.deps;
		const beatS = 60 / this.config.bpm;
		const first = clock.now() + CALIBRATION_START_DELAY_S;
		const clicks = Array.from({ length: BLEED_CHECK_CLICKS }, (_, i) => first + i * beatS);
		const needed = BLEED_CHECK_CLICKS;
		onProgress({ phase: 'listen', done: 0, needed });
		return new Promise((resolve) => {
			clicks.forEach((time, i) => {
				sounds.play(time, i % 4 === 0 ? 'click-accent' : 'click');
				run.add(sounds.at(time, () => onProgress({ phase: 'listen', done: i + 1, needed })));
			});
			run.add(sounds.at(clicks[clicks.length - 1] + LISTEN_WINDOW_S, () => resolve(clicks)));
		});
	}

	/**
	 * The player plays `CALIBRATION_ATTACKS` notes, counted on the playing input's attacks; the
	 * slower input's readings of the last one still arrive for `COMPARE_SETTLE_S`. False when
	 * nothing was played before `COMPARE_TIMEOUT_S`.
	 */
	private compare(
		run: Run,
		heard: Heard,
		onProgress: (progress: CalibrationProgress) => void
	): Promise<boolean> {
		const { clock, sounds } = this.deps;
		const needed = CALIBRATION_ATTACKS;
		onProgress({ phase: 'compare', done: 0, needed });
		return new Promise((resolve) => {
			run.add(sounds.at(clock.now() + COMPARE_TIMEOUT_S, () => resolve(heard.play.length > 0)));
			run.onPlayAttack = () => {
				const done = heard.play.length;
				if (done > needed) return;
				onProgress({ phase: 'compare', done, needed });
				if (done < needed) return;
				run.onPlayAttack = null;
				const last = Math.max(clock.now(), heard.play[done - 1]);
				run.add(sounds.at(last + COMPARE_SETTLE_S, () => resolve(true)));
			};
		});
	}

	/** The fallback: the player on the click, as before; every latency is the player's. */
	private playOnClick(
		run: Run,
		heard: Heard,
		clickBleed: boolean,
		onProgress: (progress: CalibrationProgress) => void
	): Promise<CalibrationOutcome> {
		const { clock, sounds } = this.deps;
		const { bpm, hitsNeeded, maxSpreadMs, noSoundBeats } = this.config;
		const beatS = 60 / bpm;
		const first = clock.now() + CALIBRATION_START_DELAY_S;
		const clicks = Array.from({ length: noSoundBeats }, (_, i) => first + i * beatS);
		const offsetsMs: number[] = [];
		onProgress({ phase: 'play', done: 0, needed: hitsNeeded });
		return new Promise((resolve) => {
			clicks.forEach((time, i) => sounds.play(time, i % 4 === 0 ? 'click-accent' : 'click'));
			run.add(
				sounds.at(clicks[clicks.length - 1] + beatS / 2, () =>
					resolve({ ok: false, reason: offsetsMs.length === 0 ? 'no-sound' : 'inconsistent' })
				)
			);
			run.onNote = (time) => {
				let index = 0;
				for (let i = 1; i < clicks.length; i++) {
					if (Math.abs(time - clicks[i]) < Math.abs(time - clicks[index])) index = i;
				}
				if (Math.abs(time - clicks[index]) > beatS / 2 || index < PLAY_SKIPPED_CLICKS) return;
				offsetsMs.push((time - clicks[index]) * 1000);
				onProgress({ phase: 'play', done: offsetsMs.length, needed: hitsNeeded });
				if (offsetsMs.length < hitsNeeded) return;
				run.onNote = null;
				const result = computeCalibration(offsetsMs, maxSpreadMs);
				if (result === null) {
					resolve({ ok: false, reason: 'inconsistent' });
					return;
				}
				// The attack sensor reads the same attacks ahead of the note detector.
				const delay = noteDelay(heard.notes, heard.play, heard.notes.length) ?? 0;
				resolve({
					ok: true,
					latency: latencies(result.offsetMs - delay, result.offsetMs, 'player'),
					clickBleed
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

/**
 * How long after the attack sensor the note detector reads the same attack, in ms; null when
 * fewer than `MIN_PAIRED_SHARE` of the `anchors` pair.
 */
function noteDelay(notes: number[], attacks: number[], anchors: number): number | null {
	const delay = pairedDelay(notes, attacks, PAIR_WINDOW_S);
	if (!delay || anchors === 0 || delay.pairs < Math.ceil(MIN_PAIRED_SHARE * anchors)) return null;
	return delay.ms;
}
