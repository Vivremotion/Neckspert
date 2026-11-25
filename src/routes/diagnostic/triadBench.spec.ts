import { describe, expect, it } from 'vitest';
import {
	benchExpectation,
	benchOccurrences,
	fretsOf,
	inversionIndex,
	STRING_NAMES,
	STRING_SETS
} from './triadBench';

describe('the triad bench of the diagnostic page', () => {
	it('offers the four sets of three adjacent strings, lowest string first', () => {
		expect(STRING_SETS.map((s) => s.label)).toEqual([
			'sol-si-mi',
			'ré-sol-si',
			'la-ré-sol',
			'mi-la-ré'
		]);
		expect(STRING_SETS.map((s) => s.strings)).toEqual([
			[3, 2, 1],
			[4, 3, 2],
			[5, 4, 3],
			[6, 5, 4]
		]);
	});

	it('tells the two E strings apart', () => {
		expect(STRING_NAMES[1]).not.toBe(STRING_NAMES[6]);
	});

	it('finds the close voicing by the string that carries the root', () => {
		expect(inversionIndex([6, 5, 4], 6)).toBe(0);
		expect(inversionIndex([6, 5, 4], 4)).toBe(1);
		expect(inversionIndex([6, 5, 4], 5)).toBe(2);
	});

	it('gives the places of a triad on E-A-D from the lowest, with their pitches', () => {
		const places = benchOccurrences('G', 'maj', [6, 5, 4], 6);
		expect(places[0].notes.map((n) => n.fret)).toEqual([3, 2, 0]);
		expect(places[0].notes.map((n) => n.midi)).toEqual([43, 47, 50]);
		expect(fretsOf(places[0])).toBe('3-2-0');
	});

	it('expects the chosen place among its inversions, octaves and qualities', () => {
		const places = benchOccurrences('G', 'maj', [6, 5, 4], 6);
		const { expectation, label } = benchExpectation('G', 'maj', [6, 5, 4], places[0], 12.5);
		expect(expectation.opensAt).toBe(12.5);
		expect(expectation.expected).toEqual(['3-2-0']);
		expect(expectation.candidates[0]).toEqual({
			id: '3-2-0',
			kind: 'expected',
			notes: [
				{ string: 6, fret: 3, midi: 43 },
				{ string: 5, fret: 2, midi: 47 },
				{ string: 4, fret: 0, midi: 50 }
			]
		});
		const kinds = new Set(expectation.candidates.map((c) => c.kind));
		expect(kinds).toEqual(
			new Set(['expected', 'other-octave', 'other-inversion', 'other-quality'])
		);
		expect(new Set(expectation.candidates.map((c) => c.id)).size).toBe(
			expectation.candidates.length
		);
		expect(label).toBe('G 3-2-0');
	});

	it('writes a minor chord with its m', () => {
		const places = benchOccurrences('A', 'min', [3, 2, 1], 3);
		expect(benchExpectation('A', 'min', [3, 2, 1], places[0], 0).label).toBe('Am 2-1-0');
	});
});
