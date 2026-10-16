import type { BeatEvent, MetronomePort } from '$lib/application/ports';
import { DEFAULT_TEMPO_BPM } from '$lib/domain/exercise';
import {
	BEAT_CLICK,
	CLICK_DURATION_S,
	DOWNBEAT_CLICK,
	NoiseBuffers,
	playBurst
} from '../sounds/clickSound';
import { beatsToSchedule } from './beatsToSchedule';

export {
	BEAT_CLICK,
	CLICK_DURATION_S,
	CLICK_FILTER_Q,
	CLICK_SILENCE,
	DOWNBEAT_CLICK
} from '../sounds/clickSound';

export const MIN_TEMPO_BPM = 20;
export const MAX_TEMPO_BPM = 300;
export const DEFAULT_BEATS_PER_BAR = 4;
/** How often the timer wakes the scheduler. It never decides when a beat sounds. */
export const DEFAULT_LOOKAHEAD_MS = 25;
/** How far past the current audio time beats are scheduled; must exceed the wake-up period. */
export const DEFAULT_SCHEDULE_AHEAD_S = 0.1;
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
	private bpm: number = DEFAULT_TEMPO_BPM;
	private firstBeatTime: number | null = null;
	private nextIndex = 0;
	private run = 0;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private readonly noise = new NoiseBuffers();
	private audible = true;
	private readonly listeners = new Set<(beat: BeatEvent) => void>();
	/** Wake-ups waiting for the audio clock, called after the beats of a scheduler wake-up. */
	private wakeUps: { time: number; callback: () => void }[] = [];
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

	setAudible(audible: boolean): void {
		this.audible = audible;
	}

	stop(): void {
		this.run++;
		if (this.timer !== null) clearTimeout(this.timer);
		this.timer = null;
		this.firstBeatTime = null;
		this.wakeUps = [];
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

	at(time: number, callback: () => void): () => void {
		if (this.firstBeatTime === null) throw new Error('Metronome not running');
		const wakeUp = { time, callback };
		this.wakeUps.push(wakeUp);
		return () => {
			this.wakeUps = this.wakeUps.filter((w) => w !== wakeUp);
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
		if (!this.wakeDue(context.currentTime, run)) return;
		this.timer = setTimeout(() => this.tick(run), this.lookaheadMs);
	}

	/** Calls the wake-ups due at `now`, earliest first; false when one stopped or restarted it. */
	private wakeDue(now: number, run: number): boolean {
		for (;;) {
			const due = this.wakeUps
				.filter((w) => w.time <= now)
				.reduce<{ time: number; callback: () => void } | null>(
					(earliest, w) => (!earliest || w.time < earliest.time ? w : earliest),
					null
				);
			if (!due) return true;
			this.wakeUps = this.wakeUps.filter((w) => w !== due);
			try {
				due.callback();
			} catch (error) {
				console.error('Metronome wake-up failed', error);
			}
			if (run !== this.run) return false;
		}
	}

	private click(context: AudioContext, beat: BeatEvent): void {
		if (!this.audible) return;
		const { filterHz, gain } = beat.isDownbeat ? DOWNBEAT_CLICK : BEAT_CLICK;
		playBurst(context, this.noise, beat.time, { filterHz, gain, durationS: CLICK_DURATION_S });
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
