import { describe, expect, it } from 'vitest';
import { ARPEGGIO_EXERCISE, FORM_EXERCISE } from '$lib/testing/arpeggioExercise';
import { Fraction } from '$lib/domain/time';
import { exerciseFromJson } from './fromJson';
import { validateExercise } from './validate';

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

	it('reads forms written in lilypond', () => {
		const exercise = exerciseFromJson({
			...arpeggioJson(),
			forms: [{ id: 'maj7', symbol: 'maj7', lilypond: 'c\\5 e\\4 g\\4 b\\3' }]
		});
		expect(exercise.forms).toEqual([
			{
				id: 'maj7',
				symbol: 'maj7',
				notes: [
					{ midi: 48, string: 5 },
					{ midi: 52, string: 4 },
					{ midi: 55, string: 4 },
					{ midi: 59, string: 3 }
				]
			}
		]);
	});

	it('reads a form exercise the engine runs, the same as written in code', () => {
		const { figures: _figures, forms: _forms, ...rest } = FORM_EXERCISE;
		const exercise = exerciseFromJson({
			...JSON.parse(JSON.stringify(rest)),
			figures: arpeggioJson().figures,
			forms: [{ id: 'maj7', symbol: 'maj7', lilypond: 'c\\5 e\\4 g\\4 b\\3' }]
		});
		expect(exercise.forms).toEqual(FORM_EXERCISE.forms);
		expect(validateExercise(exercise, { sensors: ['note'] })).toBeNull();
	});

	it('leaves the forms out of an exercise that writes none', () => {
		expect('forms' in exerciseFromJson(arpeggioJson())).toBe(false);
	});

	it('names the form that does not parse', () => {
		expect(() =>
			exerciseFromJson({
				...arpeggioJson(),
				forms: [{ id: 'bad', symbol: 'maj7', lilypond: 'c\\5 r e\\4' }]
			})
		).toThrow(/forms\[0\] \(bad\): lilypond: .*rest.* at offset 4/);
	});

	it('refuses a form that is not { id, symbol, lilypond }, naming the field', () => {
		const withForms = (forms: unknown) => ({ ...arpeggioJson(), forms });
		const form = { id: 'a', symbol: 'm', lilypond: 'c\\5' };
		expect(() => exerciseFromJson(withForms('c\\5'))).toThrow(
			'forms must be a list of { id, symbol, lilypond }'
		);
		expect(() => exerciseFromJson(withForms(['c\\5']))).toThrow(
			'forms[0] must be { id, symbol, lilypond }'
		);
		expect(() => exerciseFromJson(withForms([{ ...form, id: 1 }]))).toThrow(
			'forms[0].id must be a string'
		);
		expect(() => exerciseFromJson(withForms([{ ...form, symbol: 1 }]))).toThrow(
			'forms[0].symbol must be a string'
		);
		expect(() => exerciseFromJson(withForms([{ ...form, lilypond: 1 }]))).toThrow(
			'forms[0].lilypond must be a string'
		);
		expect(() => exerciseFromJson(withForms([{ ...form, notes: [] }]))).toThrow(
			'forms[0]: unknown key "notes"'
		);
	});

	it('names the figure whose lilypond does not parse', () => {
		expect(() =>
			exerciseFromJson({ ...arpeggioJson(), figures: [{ id: 'bad', lilypond: 'c4 #(foo)' }] })
		).toThrow(/figures\[0\] \(bad\): lilypond:/);
	});
});
