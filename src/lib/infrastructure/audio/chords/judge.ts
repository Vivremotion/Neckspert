import type { ChordCandidate, ChordVariantReport } from '$lib/application/ports';
import { COMB_MAX_HZ, MIN_HZ, NOTE_HI, NOTE_LO, PRESENCE_RATIO } from './constants';
import { noteComb } from './comb';
import { nnls } from './nnls';
import { whiteningGains } from './whitening';
import type { JudgeVariant } from './variants';

const SCORE_DECIMALS = 4;

function inRange(midi: number): boolean {
	return midi >= NOTE_LO && midi <= NOTE_HI;
}

function round(value: number): number {
	const scale = 10 ** SCORE_DECIMALS;
	return Math.round(value * scale) / scale;
}

/**
 * How well each candidate explains a peak-held spectrum, for one variant: the spectrum is
 * whitened, each candidate's notes are fitted as harmonic combs with non-negative weights, and
 * the score is the explained energy, scaled down when one note carries too little of it. The
 * best candidate is retained when it reaches the threshold and leads the next by the margin.
 */
export function judgeWindow(
	pooled: Float64Array,
	sampleRate: number,
	candidates: readonly ChordCandidate[],
	variant: JudgeVariant
): ChordVariantReport {
	const bins = pooled.length;
	const binHz = sampleRate / (2 * bins);
	const k0 = Math.ceil(MIN_HZ / binHz);
	const k1 = Math.min(bins, Math.floor(COMB_MAX_HZ / binHz));
	const gains = whiteningGains(pooled, sampleRate);
	const target = new Float64Array(bins);
	let energy = 0;
	for (let k = k0; k < k1; k++) {
		target[k] = pooled[k] * gains[k];
		energy += target[k] * target[k];
	}

	const atoms = new Map<number, Float64Array>();
	const atomOf = (midi: number): Float64Array => {
		let atom = atoms.get(midi);
		if (!atom) {
			const comb = noteComb(midi, bins, sampleRate, variant.profile);
			atom = new Float64Array(bins);
			for (let k = k0; k < k1; k++) atom[k] = comb[k] * gains[k];
			atoms.set(midi, atom);
		}
		return atom;
	};
	const dot = (a: Float64Array, b: Float64Array): number => {
		let sum = 0;
		for (let k = k0; k < k1; k++) sum += a[k] * b[k];
		return sum;
	};

	const scores: Record<string, number> = {};
	for (const candidate of candidates) {
		const midis = [...new Set(candidate.notes.map((n) => n.midi))];
		if (midis.length === 0 || !midis.every(inRange) || energy <= 0) {
			scores[candidate.id] = 0;
			continue;
		}
		const own = midis.map(atomOf);
		const gram = own.map((a) => own.map((b) => dot(a, b)));
		const projections = own.map((a) => dot(a, target));
		const weights = nnls(gram, projections);
		let linear = 0;
		let quadratic = 0;
		for (let i = 0; i < weights.length; i++) {
			linear += weights[i] * projections[i];
			for (let j = 0; j < weights.length; j++) quadratic += weights[i] * gram[i][j] * weights[j];
		}
		const explained = Math.max(0, (2 * linear - quadratic) / energy);
		const noteEnergies = weights.map((w, i) => w * w * gram[i][i]);
		const presence = Math.min(...noteEnergies) / Math.max(...noteEnergies, 1e-12);
		scores[candidate.id] = round(explained * Math.min(1, presence / PRESENCE_RATIO));
	}

	const ranked = Object.entries(scores).sort(([, a], [, b]) => b - a);
	const [best, second] = ranked;
	const decided =
		best && best[1] >= variant.threshold && best[1] - (second?.[1] ?? 0) >= variant.margin
			? best[0]
			: null;
	return { id: variant.id, decided, scores };
}
