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
