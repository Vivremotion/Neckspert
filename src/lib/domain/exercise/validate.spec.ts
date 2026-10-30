import { describe, expect, it } from 'vitest';
import { Fraction } from '$lib/domain/time/fraction';
import { parseLilyPond } from '$lib/domain/time/notation/lilypond';
import { EXERCISES, LOCATE_NECK } from './catalog';
import { ARPEGGIO_EXERCISE, ARPEGGIO_ITEMS, FORM_EXERCISE } from '$lib/testing/arpeggioExercise';
import type { RoundTemplate } from './round/types';
import type { ExerciseDefinition, Ladder } from './types';
import { validateExercise } from './validate';

const withParams = (params: Record<string, unknown>): ExerciseDefinition => ({
	...LOCATE_NECK,
	params: { ...LOCATE_NECK.params, ...params }
});

/** Leads from 1 to 16 beats, rising: the answer always further from its prompt. */
const RISING: Ladder = [1, 2, 4, 8, 16].map((leadBeats) => ({
	params: { leadBeats, aided: false }
}));

describe('validateExercise', () => {
	it('accepts every exercise of the catalog', () => {
		expect(EXERCISES.map((exercise) => [exercise.id, validateExercise(exercise)])).toEqual(
			EXERCISES.map((exercise) => [exercise.id, null])
		);
	});

	it('names the exercise and the field it cannot run', () => {
		expect(validateExercise({ ...LOCATE_NECK, tempo: 0 })).toMatch(/^locate-neck: tempo .*0/);
		expect(validateExercise(withParams({ ladder: [] }))).toBe(
			'locate-neck: params.ladder is empty'
		);
		expect(
			validateExercise(withParams({ ladder: [{ params: { leadBeats: -2, aided: false } }] }))
		).toMatch(/^locate-neck: params\.ladder level 0: the lead .*-2/);
		expect(validateExercise(withParams({ windows: { perfectMs: -1 } }))).toMatch(
			/^locate-neck: params\.windows\.perfectMs /
		);
		expect(validateExercise({ ...LOCATE_NECK, flow: { previewBeats: -1 } })).toMatch(
			/^locate-neck: flow\.previewBeats /
		);
		expect(
			validateExercise({
				...LOCATE_NECK,
				flow: { briefing: 'never' as unknown as 'each-series' }
			})
		).toBe('locate-neck: flow.briefing must be one of each-series, first-encounter, got never');
		expect(validateExercise({ ...LOCATE_NECK, flow: { briefing: 'first-encounter' } })).toBeNull();
		expect(validateExercise({ ...LOCATE_NECK, flow: { previewBeats: 1.5 } })).toMatch(
			/^locate-neck: flow\.previewBeats /
		);
		expect(
			validateExercise({
				...LOCATE_NECK,
				meter: { count: 3, unit: Fraction.of(1, 4), grouping: [1, 1] }
			})
		).toMatch(/^locate-neck: meter /);
		// A breath of 0 bars makes a round of length 0.
		expect(validateExercise(withParams({ pacing: { respirationBars: 0 } }))).toMatch(
			/^locate-neck: params\.pacing\.respirationBars .*0/
		);
		expect(validateExercise(withParams({ pacing: { roundsPerBreath: 0 } }))).toMatch(
			/^locate-neck: params\.pacing\.roundsPerBreath .*0/
		);
		expect(validateExercise(withParams({ pacing: { roundsPerBreath: 1.5 } }))).toMatch(
			/^locate-neck: params\.pacing\.roundsPerBreath /
		);
		expect(validateExercise(withParams({ pacing: { breathMinMs: -1 } }))).toMatch(
			/^locate-neck: params\.pacing\.breathMinMs .*-1/
		);
		// The breath between rounds keeps its default when only the runs are written.
		expect(
			validateExercise(withParams({ pacing: { roundsPerBreath: 2, breathMinMs: 0 } }))
		).toBeNull();
		expect(validateExercise(withParams({ learning: { retestGaps: [2] } }))).toMatch(
			/^locate-neck: params\.learning\.retestGaps /
		);
		expect(validateExercise(withParams({ learning: { aidFadeSuccesses: 1.5 } }))).toMatch(
			/^locate-neck: params\.learning\.aidFadeSuccesses /
		);
		expect(
			validateExercise(withParams({ ladder: [{ params: { leadBeats: 1.0001, aided: false } }] }))
		).toMatch(/^locate-neck: params\.ladder level 0: the lead .*1\.0001/);
		expect(validateExercise(withParams({ windows: { anchorChordFromBeats: 1.0001 } }))).toMatch(
			/^locate-neck: params\.windows\.anchorChordFromBeats /
		);
	});

	it('checks the round the exercise writes, against the sensors it is given', () => {
		const wrong = { ...LOCATE_NECK, round: { ...LOCATE_NECK.round!, extra: 1 } };
		expect(validateExercise(wrong as ExerciseDefinition)).toMatch(/^locate-neck: round\.extra /);
		expect(validateExercise(LOCATE_NECK, { sensors: ['chord'] })).toMatch(
			/^locate-neck: round\.expectations\[0\]\.sensor /
		);
		expect(validateExercise(LOCATE_NECK, { sensors: ['note'] })).toBeNull();
	});

	it('refuses a level path through a number, naming the exercise, the level and the path', () => {
		expect(
			validateExercise({
				...LOCATE_NECK,
				levels: [{ params: {} }, { params: { 'tempo.bpm': 90 } }]
			})
		).toMatch(/^locate-neck: levels\[1\] .*tempo\.bpm/);
		const ladder = [
			{ params: { leadBeats: 4, aided: false } },
			{ params: { leadBeats: 2, aided: false, 'windows.perfectMs.at': 60 } }
		];
		expect(validateExercise(withParams({ ladder }))).toMatch(
			/^locate-neck: params\.ladder level 1: .*windows\.perfectMs\.at/
		);
	});

	it('refuses an item level whose leadBeats is not a beat count', () => {
		expect(
			validateExercise(withParams({ ladder: [{ params: { leadBeats: '4', aided: false } }] }))
		).toMatch(/^locate-neck: params\.ladder level 0: the lead /);
		expect(
			validateExercise(withParams({ ladder: [{ params: { leadBeats: 4, aided: 'yes' } }] }))
		).toMatch(/^locate-neck: params\.ladder level 0: aided /);
	});

	it('accepts a level path no piece reads', () => {
		expect(
			validateExercise({
				...withParams({
					ladder: [{ params: { leadBeats: 4, aided: false, 'nothing.reads.this': 1 } }]
				}),
				levels: [{ params: { 'neither.this': 'at all', tempo: 95 } }]
			})
		).toBeNull();
	});

	it('accepts an exercise without pedagogical value', () => {
		expect(
			validateExercise({
				...withParams({ ladder: RISING, windows: { perfectMs: 5000 } }),
				tempo: 300
			})
		).toBeNull();
	});

	it('accepts figure entries, and refuses a written note impossible on its string', () => {
		const written = (text: string): ExerciseDefinition => ({
			id: 'theme',
			version: 1,
			mechanic: 'locate',
			figures: [{ id: 'theme', figure: parseLilyPond(text) }],
			params: { ladder: [{ params: { leadBeats: 4, aided: false } }] },
			round: {
				prompt: { lead: 4 },
				expectations: [
					{
						figure: { id: 'theme' },
						at: { bars: 0 },
						sensor: 'note',
						content: { from: 'figure' },
						window: { ms: 80 }
					}
				],
				length: { bars: 1 },
				policy: {
					unit: 'response',
					verdict: 'response',
					correction: false,
					pairing: {
						mode: 'first-answer',
						opens: { afterPromptMs: 100 },
						lateMs: 100,
						lateCapture: null
					}
				}
			}
		});
		expect(validateExercise(written("e'4\\1 g'\\1 c''\\2 e,"))).toBeNull();
		// Below the open high E: no fret of string 1 plays it.
		expect(validateExercise(written("e'4\\1 c\\1 c c"))).toMatch(
			/^theme: figures\[0\] \(theme\) note 1 has pitch 48, not on string 1 \(frets 0 to 24\)/
		);
		expect(validateExercise(written("e''''1\\1"))).toMatch(/^theme: figures\[0\] .*string 1/);
		// A string outside 1 to 6 is the figure's own refusal, not a fret that happens to pass.
		const outside: ExerciseDefinition = written("e'1\\1");
		const note = outside.figures![0].figure.voices[0].elements[0];
		if (note.kind !== 'note') throw new Error('expected a note');
		note.string = 7;
		expect(validateExercise(outside)).toMatch(
			/^theme: figures\[0\] \(theme\) .*string 7, not 1 to 6/
		);
	});
});

describe('validateExercise on how a run starts', () => {
	it('refuses a listen-in that is not a whole number of bars, and a count that is not a boolean', () => {
		expect(validateExercise(withParams({ pacing: { listenInBars: 1.5 } }))).toBe(
			'locate-neck: params.pacing.listenInBars must be a non-negative integer, got 1.5'
		);
		expect(validateExercise(withParams({ pacing: { listenInBars: -1 } }))).toMatch(
			/^locate-neck: params\.pacing\.listenInBars .*-1/
		);
		expect(validateExercise(withParams({ pacing: { countIn: 'yes' } }))).toBe(
			'locate-neck: params.pacing.countIn must be true or false, got yes'
		);
	});

	it('refuses no listen-in and no counted bar, at the level that resolves them', () => {
		// The listen-in is 0 by default: no counted bar leaves nothing to hear before playing.
		expect(validateExercise(withParams({ pacing: { countIn: false } }))).toBe(
			'locate-neck: params resolves params.pacing.countIn false with no listen-in bar: a run needs one or the other'
		);
		expect(
			validateExercise(withParams({ pacing: { countIn: false, listenInBars: 1 } }))
		).toBeNull();
		const levelled: ExerciseDefinition = {
			...ARPEGGIO_EXERCISE,
			params: { ...ARPEGGIO_EXERCISE.params, pacing: { roundsPerBreath: 3, listenInBars: 2 } },
			levels: [{ params: {} }, { params: { 'pacing.listenInBars': 0, 'pacing.countIn': false } }]
		};
		expect(validateExercise(levelled)).toBe(
			`${ARPEGGIO_EXERCISE.id}: levels[1] resolves params.pacing.countIn false with no listen-in bar: a run needs one or the other`
		);
		const fractional: ExerciseDefinition = {
			...levelled,
			levels: [{ params: {} }, { params: { 'pacing.listenInBars': 0.5 } }]
		};
		expect(validateExercise(fractional)).toBe(
			`${ARPEGGIO_EXERCISE.id}: levels[1] resolves params.pacing.listenInBars 0.5, not a non-negative integer`
		);
	});
});

describe('validateExercise on listed items', () => {
	const withItems = (
		items: string[],
		over: Partial<ExerciseDefinition> = {}
	): ExerciseDefinition => ({
		...ARPEGGIO_EXERCISE,
		items,
		...over
	});

	it('accepts items its mechanic reads and its round compiles at every level', () => {
		expect(validateExercise(ARPEGGIO_EXERCISE)).toBeNull();
	});

	it('refuses an empty list, naming the field', () => {
		expect(validateExercise(withItems([]))).toBe(`${ARPEGGIO_EXERCISE.id}: items lists no item`);
	});

	it('refuses a key its mechanic cannot read, naming the item', () => {
		expect(validateExercise(withItems([ARPEGGIO_ITEMS[0], 'nonsense']))).toMatch(
			new RegExp(`^${ARPEGGIO_EXERCISE.id}: items\\[1\\] \\("nonsense"\\): .*nonsense`)
		);
	});

	it('refuses an occurrence the neck does not hold, naming the item and the level', () => {
		expect(validateExercise(withItems([ARPEGGIO_ITEMS[0], 'C|maj|3:1,2:3,1:5@9@4']))).toMatch(
			new RegExp(`^${ARPEGGIO_EXERCISE.id}: items\\[1\\] .* at exercise level -1: .*Occurrence 9`)
		);
	});

	it('refuses a pattern note beyond the shape at the level that reads it', () => {
		const round = ARPEGGIO_EXERCISE.round!;
		const [entry] = round.expectations;
		const beyond = withItems([...ARPEGGIO_ITEMS], {
			round: {
				...round,
				expectations: [{ ...entry, content: { from: 'voicing-notes', pattern: [1, 2, 3, 4] } }]
			} as RoundTemplate
		});
		expect(validateExercise(beyond)).toMatch(
			new RegExp(
				`^${ARPEGGIO_EXERCISE.id}: items\\[0\\] .* at exercise level -1: round\\.expectations\\[0\\]\\.content\\.pattern asks note 4`
			)
		);
	});
});

describe('validateExercise on the forms an exercise writes', () => {
	const [form] = FORM_EXERCISE.forms!;
	const withForms = (forms: ExerciseDefinition['forms']): ExerciseDefinition => ({
		...FORM_EXERCISE,
		forms
	});
	const withItems = (
		items: string[],
		rest: Partial<ExerciseDefinition> = {}
	): ExerciseDefinition => ({
		...FORM_EXERCISE,
		items,
		...rest
	});
	const id = FORM_EXERCISE.id;

	it('accepts a form moved on the neck', () => {
		expect(validateExercise(FORM_EXERCISE, { sensors: ['note'] })).toBeNull();
	});

	it('refuses two forms with one id, naming the second', () => {
		expect(validateExercise(withForms([form, { ...form, symbol: 'm7' }]))).toBe(
			`${id}: forms[1] (maj7) has the id of forms[0]`
		);
	});

	it('refuses an empty form, naming it', () => {
		expect(validateExercise(withForms([{ ...form, notes: [] }]))).toBe(
			`${id}: forms[0] (maj7) has no note`
		);
	});

	it('refuses a note not playable as written, naming the form and the note', () => {
		const below = [form.notes[0], { midi: 40, string: 4 }];
		expect(validateExercise(withForms([{ ...form, notes: below }]))).toBe(
			`${id}: forms[0] (maj7) note 1 (pitch 40) is below string 4 (50)`
		);
		const seventh = [{ midi: 60, string: 7 }];
		expect(validateExercise(withForms([{ ...form, notes: seventh }]))).toMatch(
			/^test-form-sequence: forms\[0\] \(maj7\) note 0 is on string 7/
		);
	});

	it('refuses an item naming a form the exercise does not write, naming the item', () => {
		expect(validateExercise(withItems(['maj7@c@4', 'nowhere@c@4']))).toMatch(
			new RegExp(`^${id}: items\\[1\\] \\("nowhere@c@4"\\) .*form "nowhere"`)
		);
	});

	it('refuses an item moving its form off the neck, naming the item', () => {
		expect(validateExercise(withItems(['maj7@c@4', "maj7@a'@4", 'maj7@g,@4']))).toMatch(
			new RegExp(`^${id}: items\\[1\\] \\("maj7@a'@4"\\) .*above the last fret`)
		);
		expect(validateExercise(withItems(['maj7@g,@4']))).toMatch(
			new RegExp(`^${id}: items\\[0\\] .*below string 5`)
		);
	});

	it('accepts such an item when the round does not derive its notes, or there is no round', () => {
		const round = FORM_EXERCISE.round!;
		const [entry] = round.expectations;
		const silent = {
			round: { ...round, expectations: [{ ...entry, content: null }] } as RoundTemplate
		};
		for (const rest of [silent, { round: undefined }]) {
			expect(validateExercise(withItems(['nowhere@c@4'], rest))).toBeNull();
			expect(validateExercise(withItems(['maj7@g,@4'], rest))).toBeNull();
		}
	});

	it('refuses a form whose id holds the separator of an item key, which no item could name', () => {
		expect(validateExercise(withForms([{ ...form, id: 'maj@7' }]))).toMatch(
			new RegExp(`^${id}: forms\\[0\\] \\(maj@7\\) has an id with "@"`)
		);
	});

	it('runs a voicing whose occurrence the neck does not hold when the round derives nothing', () => {
		const round = ARPEGGIO_EXERCISE.round!;
		const [entry] = round.expectations;
		const exercise: ExerciseDefinition = {
			...ARPEGGIO_EXERCISE,
			items: ['C|maj|3:1,2:3,1:5@9@4'],
			round: { ...round, expectations: [{ ...entry, content: null }] } as RoundTemplate
		};
		expect(validateExercise(exercise)).toBeNull();
	});
});
