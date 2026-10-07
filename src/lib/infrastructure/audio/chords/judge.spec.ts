import { describe, expect, it } from 'vitest';
import { judgeWindow } from './judge';
import { DEFAULT_VARIANT } from './variants';
import { dCandidates, synthChordSpectrum } from './testing/synthChord';

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
