import type { NoteOnset } from '$lib/application/ports';
import { describeFrequency, describeReading, logDetection } from '$lib/debug/detectionLog';
import { confirmedPitch } from './confirmPitch';
import { CONFIRM_CENTS, type DetectorConfig } from './config';
import { readPitch } from './estimatePitch';
import { frequencyToMidi, midiIfInRange } from './frequencyToMidi';
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
			if (attack !== null) {
				this.pendingOnsetTime = attack;
				logDetection('attaque', [
					`t = ${attack.toFixed(3)} s`,
					'en attente de deux fenêtres de hauteur stables'
				]);
			}
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
		const a = readPitch(first, this.sampleRate);
		const b = readPitch(second, this.sampleRate);
		const attackThreshold = this.config.attackClarityThreshold;
		const sustainThreshold = this.config.clarityThreshold;
		const reading = confirmedPitch(a, b, {
			attackClarityThreshold: attackThreshold,
			sustainClarityThreshold: sustainThreshold
		});
		this.pendingOnsetTime = null;

		const drift =
			a.frequencyHz > 0 && b.frequencyHz > 0 ? centsBetween(a.frequencyHz, b.frequencyHz) : null;
		const windowMs = (this.config.windowSize / this.sampleRate) * 1000;
		const windows = [
			`fenêtre A : ${describeReading(a, attackThreshold)}`,
			`fenêtre B : ${describeReading(b, sustainThreshold)}`,
			`analyse : 2 × ${this.config.windowSize} échantillons (${Math.round(windowMs)} ms chacune) après l’attaque`
		];

		if (!reading) {
			const aPass = a.frequencyHz > 0 && a.clarity >= attackThreshold;
			const bPass = b.frequencyHz > 0 && b.clarity >= sustainThreshold;
			const reasons: string[] = [];
			if (!(a.frequencyHz > 0)) reasons.push('fenêtre A sans fréquence');
			else if (!aPass) {
				reasons.push(`fenêtre A : clarté ${a.clarity.toFixed(2)} < ${attackThreshold}`);
			}
			if (!(b.frequencyHz > 0)) reasons.push('fenêtre B sans fréquence');
			else if (!bPass) {
				reasons.push(`fenêtre B : clarté ${b.clarity.toFixed(2)} < ${sustainThreshold}`);
			}
			if (aPass && bPass && drift !== null) {
				reasons.push(`écart ${Math.round(drift)} ¢ > ${CONFIRM_CENTS} ¢`);
			}
			logDetection('hauteur rejetée — aucune note envoyée au jugement', [
				`attaque à ${onsetTime.toFixed(3)} s`,
				`raison : ${reasons.join(' ; ')}`,
				...windows
			]);
			return null;
		}

		const midi = midiIfInRange(reading.frequencyHz, this.config.minMidi, this.config.maxMidi);
		if (midi === null) {
			const rawMidi = Math.round(frequencyToMidi(reading.frequencyHz));
			logDetection('hauteur rejetée — hors de la plage guitare', [
				`attaque à ${onsetTime.toFixed(3)} s`,
				describeFrequency(reading.frequencyHz),
				`MIDI brut ${rawMidi}, plage ${this.config.minMidi}–${this.config.maxMidi}`,
				...windows
			]);
			return null;
		}
		logDetection('hauteur confirmée', [
			`attaque à ${onsetTime.toFixed(3)} s`,
			describeFrequency(reading.frequencyHz),
			`MIDI retenu : ${midi}`,
			`clarté : ${reading.clarity.toFixed(2)}`,
			`écart A/B : ${Math.round(drift ?? 0)} ¢ (max ${CONFIRM_CENTS})`,
			...windows
		]);
		return {
			time: onsetTime,
			midi,
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
