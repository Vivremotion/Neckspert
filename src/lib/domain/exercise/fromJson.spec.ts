import { registerTestSkills } from '$lib/testing/testSkills';
import { describe, expect, it } from 'vitest';
import { ARPEGGIO_EXERCISE, FORM_EXERCISE } from '$lib/testing/arpeggioExercise';
import { Fraction, METER_4_4, clickAccompaniment } from '$lib/domain/time';
import { exerciseFromJson } from './fromJson';
import { validateExercise } from './validate';

registerTestSkills();

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
		expect(() => exerciseFromJson({ ...arpeggioJson(), id: '' })).toThrow(
			'id must be a string, not empty'
		);
		expect(() => exerciseFromJson({ ...arpeggioJson(), figures: [{ id: 'a' }] })).toThrow(
			'figures[0].lilypond must be a string'
		);
	});

	it('reads shapes written in lilypond', () => {
		const exercise = exerciseFromJson({
			...arpeggioJson(),
			shapes: [{ id: 'maj7', symbol: 'maj7', lilypond: 'c\\5 e\\4 g\\4 b\\3' }]
		});
		expect(exercise.shapes).toEqual([
			{
				id: 'maj7',
				symbol: 'maj7',
				notes: [
					{ midi: 48, string: 5, name: 'C' },
					{ midi: 52, string: 4, name: 'E' },
					{ midi: 55, string: 4, name: 'G' },
					{ midi: 59, string: 3, name: 'B' }
				]
			}
		]);
	});

	it('reads a shape exercise the engine runs, the same as written in code', () => {
		const { figures: _figures, shapes: _shapes, ...rest } = FORM_EXERCISE;
		const exercise = exerciseFromJson({
			...JSON.parse(JSON.stringify(rest)),
			figures: arpeggioJson().figures,
			shapes: [{ id: 'maj7', symbol: 'maj7', lilypond: 'c\\5 e\\4 g\\4 b\\3' }]
		});
		expect(exercise.shapes).toEqual(FORM_EXERCISE.shapes);
		expect(validateExercise(exercise, { sensors: ['note'] })).toBeNull();
	});

	it('leaves the shapes out of an exercise that writes none', () => {
		expect('shapes' in exerciseFromJson(arpeggioJson())).toBe(false);
		expect(() => exerciseFromJson({ ...arpeggioJson(), forms: [] })).toThrow('unknown key "forms"');
	});

	it('names the shape that does not parse', () => {
		expect(() =>
			exerciseFromJson({
				...arpeggioJson(),
				shapes: [{ id: 'bad', symbol: 'maj7', lilypond: 'c\\5 r e\\4' }]
			})
		).toThrow(/shapes\[0\] \(bad\): lilypond: .*rest.* at offset 4/);
	});

	it('refuses a shape that is not { id, symbol, lilypond }, naming the field', () => {
		const withShapes = (shapes: unknown) => ({ ...arpeggioJson(), shapes });
		const shape = { id: 'a', symbol: 'm', lilypond: 'c\\5' };
		expect(() => exerciseFromJson(withShapes('c\\5'))).toThrow(
			'shapes must be a list of { id, symbol, lilypond }'
		);
		expect(() => exerciseFromJson(withShapes(['c\\5']))).toThrow(
			'shapes[0] must be { id, symbol, lilypond }'
		);
		expect(() => exerciseFromJson(withShapes([{ ...shape, id: 1 }]))).toThrow(
			'shapes[0].id must be a string'
		);
		expect(() => exerciseFromJson(withShapes([{ ...shape, symbol: 1 }]))).toThrow(
			'shapes[0].symbol must be a string'
		);
		expect(() => exerciseFromJson(withShapes([{ ...shape, lilypond: 1 }]))).toThrow(
			'shapes[0].lilypond must be a string'
		);
		expect(() => exerciseFromJson(withShapes([{ ...shape, notes: [] }]))).toThrow(
			'shapes[0]: unknown key "notes"'
		);
	});

	it('names the figure whose lilypond does not parse', () => {
		expect(() =>
			exerciseFromJson({ ...arpeggioJson(), figures: [{ id: 'bad', lilypond: 'c4 #(foo)' }] })
		).toThrow(/figures\[0\] \(bad\): lilypond:/);
	});

	describe('click accompaniment', () => {
		const withAccompanimentParam = () => {
			const json = arpeggioJson();
			return {
				...json,
				round: { ...(json.round as object), accompaniment: { param: 'accompaniment' } }
			};
		};
		const baseParams = () => arpeggioJson().params as Record<string, unknown>;

		it('reads a click accompaniment written in a param and in a level', () => {
			const exercise = exerciseFromJson({
				...withAccompanimentParam(),
				params: {
					...baseParams(),
					accompaniment: {
						clicks: { beats: [1, 2, 3, 4], accent: [1] },
						bars: ['on', 'on', 'on', 'off']
					}
				},
				levels: [{ params: { accompaniment: { clicks: { beats: [2, 4] }, bars: ['on'] } } }]
			});
			expect(exercise.params.accompaniment).toEqual(
				clickAccompaniment({
					meter: METER_4_4,
					beats: [1, 2, 3, 4],
					accent: [1],
					bars: ['on', 'on', 'on', 'off']
				})
			);
			expect(exercise.levels?.[0].params?.accompaniment).toEqual(
				clickAccompaniment({ meter: METER_4_4, beats: [2, 4], accent: [], bars: ['on'] })
			);
		});

		it('reads an accompaniment written in the round, on the exercise meter', () => {
			const json = arpeggioJson();
			const exercise = exerciseFromJson({
				...json,
				meter: { count: 3, unit: '1/4', grouping: [1, 1, 1] },
				round: {
					...(json.round as object),
					accompaniment: { clicks: { beats: [1, 2, 3] }, bars: ['on'] }
				}
			});
			expect(exercise.round?.accompaniment).toEqual(
				clickAccompaniment({
					meter: { count: 3, unit: Fraction.of(1, 4), grouping: [1, 1, 1] },
					beats: [1, 2, 3],
					accent: [],
					bars: ['on']
				})
			);
		});

		it('refuses an accompaniment that is not written as clicks', () => {
			expect(() =>
				exerciseFromJson({
					...withAccompanimentParam(),
					params: { ...baseParams(), accompaniment: { bars: ['on'] } }
				})
			).toThrow('params.accompaniment must be { clicks: { beats, accent? }, bars }');
		});

		it('refuses an unknown key, naming it', () => {
			expect(() =>
				exerciseFromJson({
					...withAccompanimentParam(),
					params: {
						...baseParams(),
						accompaniment: { clicks: { beats: [1], loud: true }, bars: ['on'] }
					}
				})
			).toThrow('params.accompaniment: unknown key "loud"');
		});

		it('names the level of a beat outside the bar', () => {
			expect(() =>
				exerciseFromJson({
					...withAccompanimentParam(),
					params: { ...baseParams() },
					levels: [{ params: { accompaniment: { clicks: { beats: [5] }, bars: ['on'] } } }]
				})
			).toThrow('levels[0].params.accompaniment: beat 5 is not in a bar of 4 beats');
		});

		it('refuses a param name that is not a top-level param', () => {
			const json = arpeggioJson();
			expect(() =>
				exerciseFromJson({
					...json,
					round: { ...(json.round as object), accompaniment: { param: 'sounds.click' } }
				})
			).toThrow('round.accompaniment.param must name a top-level param, got "sounds.click"');
		});

		it('leaves alone a param no accompaniment reads', () => {
			const written = { clicks: { beats: [1] }, bars: ['on'] };
			const exercise = exerciseFromJson({
				...arpeggioJson(),
				params: { ...baseParams(), accompaniment: written }
			});
			expect(exercise.params.accompaniment).toEqual(written);
		});
	});
});

describe('exerciseFromJson practices', () => {
	const base = { id: 'x', practices: 'locate-note-string', params: {} };

	it('reads the skill an exercise practises', () => {
		expect(exerciseFromJson({ ...base, practices: 'inner-pulse' }).practices).toBe('inner-pulse');
	});

	it('refuses a practices that is not a string', () => {
		expect(() => exerciseFromJson({ ...base, practices: 3 })).toThrow('practices must be a string');
	});

	it('requires practices', () => {
		const { practices: _practices, ...rest } = base;
		expect(() => exerciseFromJson(rest)).toThrow('practices must be a string');
	});

	it.each(['mechanic', 'version'])('refuses %s as an unknown key', (key) => {
		expect(() => exerciseFromJson({ ...base, [key]: 1 })).toThrow(`unknown key "${key}"`);
	});

	describe('what a file may write', () => {
		const refused = (extra: Record<string, unknown>) => () =>
			exerciseFromJson({ ...arpeggioJson(), ...extra });

		it.each(['', 3])('refuses the id %j', (id) => {
			expect(refused({ id })).toThrow('id must be a string, not empty');
		});

		it.each(['a:b', 'a#b', 'a b', '-a', 'é'])('refuses the id %j for its shape', (id) => {
			expect(refused({ id })).toThrow(
				'id must be made of letters, digits, "-", "_" or ".", and start with a letter or a digit'
			);
		});

		it('refuses the reserved id', () => {
			expect(refused({ id: 'unknown' })).toThrow('id "unknown" is reserved');
		});

		it.each([
			['presentation', 3],
			['flow', 'x'],
			['round', []],
			['params', null]
		])('refuses %s written as %j', (key, value) => {
			expect(refused({ [key]: value })).toThrow(`${key} must be an object`);
		});

		it('refuses a pick that is neither loop nor next', () => {
			expect(refused({ pick: 'weird' })).toThrow('pick must be "loop" or "next"');
		});

		it.each([
			['howTo', 3],
			['title', { fr: 'x' }]
		])('refuses %s written as %j', (key, value) => {
			expect(refused({ [key]: value })).toThrow(`${key} must be { fr, en }`);
		});

		it('refuses a view that is no string', () => {
			expect(refused({ view: 3 })).toThrow('view must be a string');
		});

		it('refuses a tempo that is no number', () => {
			expect(refused({ tempo: '80' })).toThrow('tempo must be a number');
		});

		it.each([
			['levels', {}],
			['items', 'a'],
			['figures', {}],
			['shapes', {}]
		])('refuses %s written as %j', (key, value) => {
			expect(refused({ [key]: value })).toThrow(`${key} must be a list`);
		});
	});
});
