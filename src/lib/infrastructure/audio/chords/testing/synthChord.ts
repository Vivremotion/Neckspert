import type { ChordCandidate } from '$lib/application/ports';
import {
	closeTriadVoicings,
	parseSpelledNote,
	qualityById,
	voicingCandidates,
	voicingOccurrences,
	type VoicingCandidate
} from '$lib/domain/music';
import { fftSizeFor, hopSizeFor } from '../constants';
import { magnitudeSpectrum } from '../fft';
import { hannWindow, maxPool } from '../spectrum';
import { midiToHz } from '../comb';

/** Deterministic noise and phases, so tests do not depend on Math.random. */
function seeded(seed: number): () => number {
	let state = seed >>> 0;
	return () => {
		state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
		return state / 2 ** 32;
	};
}

/**
 * Plucked strings struck together at `attackS`, like the spike's synthesizer for a direct input:
 * inharmonic partials up to 9 kHz in 1/h, each decaying faster than the one below, over a faint
 * noise floor.
 */
export function synthChordSignal(
	midis: readonly number[],
	sampleRate: number,
	options: { durationS?: number; attackS?: number } = {}
): Float32Array {
	const durationS = options.durationS ?? 1;
	const attack = Math.floor((options.attackS ?? 0) * sampleRate);
	const random = seeded(midis.reduce((sum, m) => sum * 131 + m, 7));
	const out = new Float32Array(Math.floor(durationS * sampleRate));
	for (const midi of midis) {
		const f0 = midiToHz(midi);
		const partials: { w: number; a: number; d: number; p: number }[] = [];
		for (let h = 1; h <= 30; h++) {
			const f = h * f0 * Math.sqrt(1 + 8e-5 * h * h);
			if (f > 9000) break;
			partials.push({ w: 2 * Math.PI * f, a: 1 / h, d: 1.2 + 0.5 * h, p: random() * 2 * Math.PI });
		}
		for (let i = attack; i < out.length; i++) {
			const t = (i - attack) / sampleRate;
			let sample = 0;
			for (const q of partials) sample += q.a * Math.exp(-q.d * t) * Math.sin(q.w * t + q.p);
			out[i] += sample * Math.min(1, t / 0.002) * 0.12;
		}
	}
	for (let i = 0; i < out.length; i++) out[i] += (random() * 2 - 1) * 0.0005;
	return out;
}

/** Peak-held spectrum of a synthetic chord over `durationS` from its attack. */
export function synthChordSpectrum(
	midis: readonly number[],
	sampleRate: number,
	options: { durationS?: number } = {}
): Float64Array {
	const signal = synthChordSignal(midis, sampleRate, { durationS: options.durationS ?? 0.5 });
	const n = fftSizeFor(sampleRate);
	const hop = hopSizeFor(sampleRate);
	const window = hannWindow(n);
	const pooled = new Float64Array(n / 2);
	for (let start = 0; start + n <= signal.length; start += hop) {
		const frame = new Float64Array(n);
		for (let i = 0; i < n; i++) frame[i] = signal[start + i] * window[i];
		maxPool(pooled, magnitudeSpectrum(frame));
	}
	return pooled;
}

export function toCandidate(candidate: VoicingCandidate): ChordCandidate {
	const notes = candidate.occurrence.notes.map(({ string, fret, midi }) => ({
		string,
		fret,
		midi
	}));
	return { id: notes.map((n) => n.fret).join(','), kind: candidate.kind, notes };
}

/** Candidates of D with the root on the B string at `frets`, on G-B-E. */
export function dCandidates(frets = '2,3,2'): ChordCandidate[] {
	const d = { root: parseSpelledNote('D'), quality: qualityById('maj') };
	const inversions = closeTriadVoicings(d, [3, 2, 1]);
	const occurrence = voicingOccurrences(inversions[2]).find(
		(o) => o.notes.map((n) => n.fret).join(',') === frets
	);
	if (!occurrence) throw new Error(`No D occurrence at ${frets}`);
	return voicingCandidates(occurrence, inversions).map(toCandidate);
}
