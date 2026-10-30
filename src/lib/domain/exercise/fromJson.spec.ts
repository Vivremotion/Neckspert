import { describe, expect, it } from 'vitest';
import { ARPEGGIO_EXERCISE } from '$lib/testing/arpeggioExercise';
import { Fraction } from '$lib/domain/time';
import { exerciseFromJson } from './fromJson';

/** The public arpeggio exercise, as a JSON file writes it: its figures in LilyPond. */
function arpeggioJson(): Record<string, unknown> {
	const { figures: _figures, ...rest } = ARPEGGIO_EXERCISE;
	return {
		...JSON.parse(JSON.stringify(rest)),
		figures: [
			{ id: 'quarters', lilypond: 'c4 c c c' },
			{ id: 'eighths', lilypond: 'c8 c c c c c c c' }
		]
	};
}

describe('exerciseFromJson', () => {
	it('reads figures written in lilypond', () => {
		const exercise = exerciseFromJson(arpeggioJson());
		expect(exercise.figures?.map((entry) => entry.id)).toEqual(['quarters', 'eighths']);
		const [quarters, eighths] = exercise.figures ?? [];
		expect(quarters.figure.bars).toBe(1);
		expect(quarters.figure.voices[0].elements).toHaveLength(4);
		expect(eighths.figure.voices[0].elements).toHaveLength(8);
		// Everything but the figures is the definition the JSON wrote.
		expect({ ...exercise, figures: undefined }).toEqual({
			...ARPEGGIO_EXERCISE,
			figures: undefined
		});
	});

	it('reads a meter written with a fraction as text', () => {
		const exercise = exerciseFromJson({
			...arpeggioJson(),
			meter: { count: 3, unit: '1/4', grouping: [1, 1, 1] }
		});
		expect(exercise.meter).toEqual({ count: 3, unit: Fraction.of(1, 4), grouping: [1, 1, 1] });
	});

	it('refuses an unknown key naming it', () => {
		expect(() => exerciseFromJson({ ...arpeggioJson(), tempoBpm: 60 })).toThrow(
			'unknown key "tempoBpm"'
		);
	});

	it('refuses a value that is no exercise, naming the field', () => {
		expect(() => exerciseFromJson(null)).toThrow('an exercise must be a JSON object');
		expect(() => exerciseFromJson({ ...arpeggioJson(), params: [] })).toThrow(
			'params must be an object'
		);
		expect(() => exerciseFromJson({ ...arpeggioJson(), figures: [{ id: 'a' }] })).toThrow(
			'figures[0].lilypond must be a string'
		);
	});

	it('names the figure whose lilypond does not parse', () => {
		expect(() =>
			exerciseFromJson({ ...arpeggioJson(), figures: [{ id: 'bad', lilypond: 'c4 #(foo)' }] })
		).toThrow(/figures\[0\] \(bad\): lilypond:/);
	});
});
