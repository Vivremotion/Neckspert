import type { NoteOnset, NoteRejection, NoteRejectionReason } from '$lib/application/ports';
import { describeFrequency, describeReading, logDetection } from '$lib/debug/detectionLog';
import { confirmedPitch } from './confirmPitch';
import { CONFIRM_CENTS, type PitchConfig } from './config';
import { readPitch } from './estimatePitch';
import { frequencyToMidi, midiIfInRange } from './frequencyToMidi';

function centsBetween(a: number, b: number): number {
	return Math.abs(1200 * Math.log2(a / b));
}

/** An attack is told within this of its onset (`PRE_ATTACK_MS` and the tracker's own lag). */
const TOLD_WITHIN_S = 0.2;

/** The level before an attack stops this long before it, its first sound left out. */
const BEFORE_GUARD_S = 0.005;

/**
 * Under this share of the level before the attack, the sound has fallen: a finger lifted leaves an
 * open string ringing, which is no note played. Real attacks stay above 0.9 on real takes, above
 * 0.5 on an export whose notes stop the last, and fall to 0.3 only with a note 6 dB softer.
 */
export const FALLEN_LEVEL_RATIO = 0.25;

/**
 * Under this share of the level before the attack, the pitch of the last note has not been played
 * again: a click or a touch over the note that still rings. A note played again raises its level.
 */
export const PLAYED_AGAIN_RATIO = 1;

function rmsOf(samples: readonly number[], from: number, to: number): number {
	let sum = 0;
	for (let i = from; i < to; i++) sum += samples[i] * samples[i];
	return Math.sqrt(sum / Math.max(1, to - from));
}

/**
 * A played note is an attack and a pitch: told of each attack (`attack`, by the attack sensor), it
 * reads the pitch of the two windows after it, and emits one NoteOnset once they have come, unless
 * the level after the attack says that no note was played there.
 */
export class NoteTracker {
	private readonly samples: number[] = [];
	private readonly times: number[] = [];
	/** The attacks whose two windows have not all come yet, oldest first. */
	private readonly pending: number[] = [];
	private readonly maxBuffer: number;
	private readonly guard: number;
	private lastMidi: number | null = null;

	constructor(
		private readonly config: PitchConfig,
		private readonly sampleRate: number,
		private readonly onRejected?: (rejection: NoteRejection) => void
	) {
		this.guard = Math.round(BEFORE_GUARD_S * sampleRate);
		// The wait before an attack is told, its two windows, and the level before it.
		this.maxBuffer = Math.ceil(TOLD_WITHIN_S * sampleRate) + config.windowSize * 3 + this.guard;
	}

	/** An attack at `time` (audio s). One older than the sound kept (an input reopened) is dropped. */
	attack(time: number): void {
		if (this.times.length === 0 || time < this.times[0]) return;
		this.pending.push(time);
		logDetection('attaque', [
			`t = ${time.toFixed(3)} s`,
			'en attente de deux fenêtres de hauteur stables'
		]);
	}

	/** Feeds one block of samples; returns the notes whose two windows it completes. */
	push(frame: Float32Array, frameTime: number): NoteOnset[] {
		for (let i = 0; i < frame.length; i++) {
			this.samples.push(frame[i]);
			this.times.push(frameTime + i / this.sampleRate);
		}
		const notes: NoteOnset[] = [];
		while (this.pending.length > 0) {
			const start = this.indexAtOrAfter(this.pending[0]);
			if (start < 0 || this.samples.length - start < this.config.windowSize * 2) break;
			const note = this.read(this.pending.shift()!, start);
			if (note) notes.push(note);
		}
		if (this.samples.length > this.maxBuffer) {
			const drop = this.samples.length - this.maxBuffer;
			this.samples.splice(0, drop);
			this.times.splice(0, drop);
		}
		return notes;
	}

	private read(onsetTime: number, start: number): NoteOnset | null {
		const need = this.config.windowSize * 2;
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

		const drift =
			a.frequencyHz > 0 && b.frequencyHz > 0 ? centsBetween(a.frequencyHz, b.frequencyHz) : null;
		const windowMs = (this.config.windowSize / this.sampleRate) * 1000;
		const windows = [
			`fenêtre A : ${describeReading(a, attackThreshold)}`,
			`fenêtre B : ${describeReading(b, sustainThreshold)}`,
			`analyse : 2 × ${this.config.windowSize} échantillons (${Math.round(windowMs)} ms chacune) après l’attaque`
		];

		const reject = (reason: NoteRejectionReason) =>
			this.onRejected?.({
				time: onsetTime,
				reason,
				attack: { frequencyHz: a.frequencyHz, clarity: a.clarity },
				sustain: { frequencyHz: b.frequencyHz, clarity: b.clarity }
			});

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
			reject(
				!(a.frequencyHz > 0) || !(b.frequencyHz > 0)
					? 'no-pitch'
					: !aPass || !bPass
						? 'unclear'
						: 'unstable'
			);
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
			reject('out-of-range');
			return null;
		}
		const levelAfter = rmsOf(this.samples, start + this.config.windowSize, start + need);
		const beforeEnd = Math.max(0, start - this.guard);
		const levelBefore = rmsOf(
			this.samples,
			Math.max(0, beforeEnd - this.config.windowSize),
			beforeEnd
		);
		if (
			levelAfter < levelBefore * FALLEN_LEVEL_RATIO ||
			(midi === this.lastMidi && levelAfter < levelBefore * PLAYED_AGAIN_RATIO)
		) {
			logDetection('attaque sans note jouée', [
				`attaque à ${onsetTime.toFixed(3)} s`,
				`MIDI ${midi}, niveau ${levelBefore.toFixed(3)} → ${levelAfter.toFixed(3)}`
			]);
			return null;
		}
		this.lastMidi = midi;
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
