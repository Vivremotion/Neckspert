import { synthesizePluck } from '../../detection/synth';
import type { DetectedAttack } from '../AttackTracker';

/** Partials of the synthetic held notes, as `synthesizePluck` uses. */
const HARMONICS = [1, 0.55, 0.3, 0.18, 0.1];
/** A held note fades slower than a plain pluck: the vibrato and the bend have time to show. */
const HELD_DECAY_PER_S = 1.2;
/** A bend starts once the note has sounded for this long. */
const BEND_DELAY_S = 0.25;
/** Jump of `frameTime` that `feed` makes after `gapAfterS`. */
const GAP_JUMP_S = 0.5;

/** Plucks of one note, summed, one at each instant. */
export function plucks(input: {
	rate: number;
	durationS: number;
	attacksS: number[];
	hz?: number;
	amplitude?: number;
}): Float32Array {
	const { rate, durationS, attacksS } = input;
	const out = new Float32Array(Math.floor(durationS * rate));
	for (const at of attacksS) {
		const pluck = synthesizePluck({
			frequencyHz: input.hz ?? 220,
			sampleRate: rate,
			durationS,
			attackSample: Math.round(at * rate),
			amplitude: input.amplitude
		});
		for (let i = 0; i < out.length; i++) out[i] += pluck[i];
	}
	return out;
}

/** Deterministic uniform numbers in [0, 1) (mulberry32). */
function seeded(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/** A muted strum: 15 ms of white noise decaying with τ = 4 ms, no pitch. */
export function mutedBurst(input: {
	rate: number;
	durationS: number;
	atS: number;
	amplitude?: number;
}): Float32Array {
	const { rate, durationS, atS } = input;
	const amplitude = input.amplitude ?? 0.5;
	const out = new Float32Array(Math.floor(durationS * rate));
	const random = seeded(7);
	const start = Math.round(atS * rate);
	const length = Math.round(0.015 * rate);
	for (let i = 0; i < length && start + i < out.length; i++) {
		out[start + i] = amplitude * (2 * random() - 1) * Math.exp(-i / rate / 0.004);
	}
	return out;
}

/** A plucked note whose frequency follows `hzAt(seconds since the attack)`, phase integrated. */
function heldNote(
	rate: number,
	durationS: number,
	atS: number,
	hzAt: (t: number) => number,
	amplitude = 0.35
): Float32Array {
	const out = new Float32Array(Math.floor(durationS * rate));
	const start = Math.round(atS * rate);
	const rise = Math.max(1, Math.floor(0.001 * rate));
	let phase = 0;
	for (let i = start; i < out.length; i++) {
		const age = i - start;
		const t = age / rate;
		let sample = 0;
		for (let h = 0; h < HARMONICS.length; h++) sample += HARMONICS[h] * Math.sin((h + 1) * phase);
		out[i] = sample * Math.min(1, age / rise) * Math.exp(-HELD_DECAY_PER_S * t) * amplitude;
		phase += (2 * Math.PI * hzAt(t)) / rate;
	}
	return out;
}

/** A held note with vibrato: ±`depthCents` around `hz`, `rateHz` times a second. */
export function vibratoNote(input: {
	rate: number;
	durationS: number;
	atS: number;
	hz: number;
	depthCents: number;
	rateHz: number;
}): Float32Array {
	const { hz, depthCents, rateHz } = input;
	return heldNote(
		input.rate,
		input.durationS,
		input.atS,
		(t) => hz * 2 ** ((depthCents / 1200) * Math.sin(2 * Math.PI * rateHz * t))
	);
}

/** A held note bent from `fromHz` to `toHz`, linearly over `glideS`, once it has sounded a while. */
export function glide(input: {
	rate: number;
	durationS: number;
	atS: number;
	fromHz: number;
	toHz: number;
	glideS: number;
}): Float32Array {
	const { fromHz, toHz, glideS } = input;
	return heldNote(input.rate, input.durationS, input.atS, (t) => {
		const progress = Math.min(1, Math.max(0, (t - BEND_DELAY_S) / glideS));
		return fromHz + (toHz - fromHz) * progress;
	});
}

/** Mains hum: 50 Hz with its harmonics 2 and 3, peaking at `amplitude`. */
export function hum(input: { rate: number; durationS: number; amplitude: number }): Float32Array {
	const { rate, durationS, amplitude } = input;
	const weights = [1, 0.5, 0.25];
	const total = weights.reduce((a, b) => a + b, 0);
	const out = new Float32Array(Math.floor(durationS * rate));
	for (let i = 0; i < out.length; i++) {
		let sample = 0;
		for (let h = 0; h < weights.length; h++) {
			sample += weights[h] * Math.sin(2 * Math.PI * 50 * (h + 1) * (i / rate));
		}
		out[i] = (amplitude * sample) / total;
	}
	return out;
}

/**
 * Pushes `signal` in blocks and gathers the attacks. With `gapAfterS`, `frameTime` jumps by
 * half a second from the first block starting at or after it (the samples stay contiguous).
 */
export function feed(
	tracker: { push(samples: Float32Array, frameTime: number): DetectedAttack[] },
	signal: Float32Array,
	rate: number,
	blockSize = 512,
	start = 0,
	gapAfterS?: number
): DetectedAttack[] {
	const attacks: DetectedAttack[] = [];
	for (let offset = 0; offset < signal.length; offset += blockSize) {
		const block = signal.subarray(offset, Math.min(signal.length, offset + blockSize));
		const at = offset / rate;
		const jump = gapAfterS !== undefined && at >= gapAfterS ? GAP_JUMP_S : 0;
		attacks.push(...tracker.push(block, start + at + jump));
	}
	return attacks;
}
