import type { NoteOnset } from '$lib/application/ports';
import { confirmedPitch } from './confirmPitch';
import type { DetectorConfig } from './config';
import { readPitch } from './estimatePitch';
import { midiFromFrequency } from './frequencyToMidi';
import { OnsetDetector } from './OnsetDetector';

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
		const reading = confirmedPitch(
			readPitch(first, this.sampleRate),
			readPitch(second, this.sampleRate),
			{
				attackClarityThreshold: this.config.attackClarityThreshold,
				sustainClarityThreshold: this.config.clarityThreshold
			}
		);
		this.pendingOnsetTime = null;
		if (!reading) return null;

		return {
			time: onsetTime,
			midi: midiFromFrequency(reading.frequencyHz, this.config.minMidi, this.config.maxMidi),
			frequencyHz: reading.frequencyHz,
			clarity: reading.clarity
		};
	}

	private indexAtOrAfter(time: number): number {
		for (let i = 0; i < this.times.length; i++) {
			if (this.times[i] >= time - 1e-9) return i;
		}
		return -1;
	}
}
