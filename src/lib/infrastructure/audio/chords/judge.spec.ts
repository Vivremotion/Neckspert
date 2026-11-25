import { describe, expect, it } from 'vitest';
import { MIN_HZ, NOTE_LO } from './constants';
import { midiToHz } from './comb';
import { judgeWindow } from './judge';
import { DEFAULT_VARIANT } from './variants';
import { dCandidates, synthChordSpectrum, triadCandidates } from './testing/synthChord';

const RATE = 48000;
const A3 = 57;
const D4 = 62;
const FS4 = 66;
const A4 = 69;

describe('judgeWindow', () => {
	const candidates = dCandidates();

	it('retains D 2-3-2 over its inversions and qualities', () => {
		const report = judgeWindow(
			synthChordSpectrum([A3, D4, FS4], RATE),
			RATE,
			candidates,
			DEFAULT_VARIANT
		);
		expect(report.id).toBe('default');
		expect(report.decided).toBe('2,3,2');
		for (const rival of ['7,7,5', '11,10,10', '2,3,1', '3,3,2']) {
			expect(report.scores['2,3,2']).toBeGreaterThan(report.scores[rival]);
		}
	});

	it('retains nothing when the low A is missing', () => {
		const report = judgeWindow(
			synthChordSpectrum([D4, FS4], RATE),
			RATE,
			candidates,
			DEFAULT_VARIANT
		);
		expect(report.decided).toBeNull();
	});

	it('settles the octave trap the other way when A4 replaces A3', () => {
		const report = judgeWindow(
			synthChordSpectrum([D4, FS4, A4], RATE),
			RATE,
			candidates,
			DEFAULT_VARIANT
		);
		expect(report.decided).toBe('7,7,5');
	});

	it('scores 0 a candidate with a note out of range', () => {
		const outOfRange = {
			id: 'high',
			kind: 'other',
			notes: [{ string: 1 as const, fret: 26, midi: 90 }]
		};
		const report = judgeWindow(
			synthChordSpectrum([A3, D4, FS4], RATE),
			RATE,
			[...candidates, outOfRange],
			DEFAULT_VARIANT
		);
		expect(report.scores.high).toBe(0);
		expect(report.decided).toBe('2,3,2');
	});
});

describe('judgeWindow in the bass', () => {
	it('explains the spectrum from the second partial of the lowest note at least', () => {
		expect(2 * midiToHz(NOTE_LO)).toBeGreaterThanOrEqual(MIN_HZ);
	});

	it('retains a triad on E-A-D over its inversions and qualities', () => {
		// G 3-2-0 on E-A-D: G2, B2, D3.
		const candidates = triadCandidates('G', 'maj', [6, 5, 4], 6, '3,2,0');
		const report = judgeWindow(
			synthChordSpectrum([43, 47, 50], RATE),
			RATE,
			candidates,
			DEFAULT_VARIANT
		);
		expect(report.decided).toBe('3,2,0');
		for (const [id, score] of Object.entries(report.scores)) {
			if (id !== '3,2,0') expect(report.scores['3,2,0']).toBeGreaterThan(score);
		}
	});

	it('retains a triad from B1, the seventh string, against its minor and its octave', () => {
		// The judge reads only the pitches: the strings and frets of a seven-string guitar, which
		// the domain does not know yet, are written as a placeholder.
		const sevenString = (id: string, midis: number[]) => ({
			id,
			kind: 'other',
			notes: midis.map((midi) => ({ string: 6 as const, fret: 0, midi }))
		});
		const candidates = [
			sevenString('B', [35, 39, 42]),
			sevenString('Bm', [35, 38, 42]),
			sevenString('B-octave', [47, 51, 54])
		];
		const report = judgeWindow(
			synthChordSpectrum([35, 39, 42], RATE),
			RATE,
			candidates,
			DEFAULT_VARIANT
		);
		expect(report.decided).toBe('B');
	});
});
