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
