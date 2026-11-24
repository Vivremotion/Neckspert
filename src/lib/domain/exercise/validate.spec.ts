import { registerTestSkills } from '$lib/testing/testSkills';
import { describe, expect, it } from 'vitest';
import { Fraction } from '$lib/domain/time/fraction';
import { parseLilyPond } from '$lib/domain/time/notation/lilypond';
import { allExercises } from './registry';
import { ARPEGGIO_EXERCISE, ARPEGGIO_ITEMS, FORM_EXERCISE } from '$lib/testing/arpeggioExercise';
import type { FigureExpectationTemplate, RoundTemplate } from './round/types';
import type { ExerciseDefinition, ItemEntry, Ladder } from './types';
import {
	MAX_EXERCISE_ITEMS,
	MAX_EXERCISE_LEVELS,
	MAX_LADDER_LEVELS,
	MAX_LEVEL_PARAMS,
	MAX_ROUND_CHECKS,
	validateExercise
} from './validate';
import { CheckBudget, levelsCheckCost, roundCheckCost } from './checkCost';
import { GESTURE_JAM, LOCATE_NECK, RHYTHM_OFFBEATS } from '$lib/testing/catalog';
import { wallClockMs } from '$lib/testing/wallClock';

registerTestSkills();

const withParams = (params: Record<string, unknown>): ExerciseDefinition => ({
	...LOCATE_NECK,
	params: { ...LOCATE_NECK.params, ...params }
});

/** Leads from 1 to 16 beats, rising: the answer always further from its prompt. */
const RISING: Ladder = [1, 2, 4, 8, 16].map((leadBeats) => ({
	params: { leadBeats }
}));

describe('validateExercise', () => {
	it('accepts every exercise of the catalog', () => {
		expect(allExercises().map((exercise) => [exercise.id, validateExercise(exercise)])).toEqual(
			allExercises().map((exercise) => [exercise.id, null])
		);
	});

	it('names the exercise and the field it cannot run', () => {
		expect(validateExercise({ ...LOCATE_NECK, tempo: 0 })).toMatch(
			/^locate-note-string: tempo .*0/
		);
		expect(validateExercise(withParams({ ladder: [] }))).toBe(
			'locate-note-string: params.ladder is empty'
		);
		expect(validateExercise(withParams({ ladder: [{ params: { leadBeats: -2 } }] }))).toMatch(
			/^locate-note-string: params\.ladder level 0: the lead .*-2/
		);
		expect(validateExercise(withParams({ windows: { perfectMs: -1 } }))).toMatch(
			/^locate-note-string: params\.windows\.perfectMs /
		);
		expect(validateExercise({ ...LOCATE_NECK, flow: { previewBeats: -1 } })).toMatch(
			/^locate-note-string: flow\.previewBeats /
		);
		expect(
			validateExercise({
				...LOCATE_NECK,
				flow: { briefing: 'never' as unknown as 'each-series' }
			})
		).toBe(
			'locate-note-string: flow.briefing must be one of each-series, first-encounter, got never'
		);
		expect(validateExercise({ ...LOCATE_NECK, flow: { briefing: 'first-encounter' } })).toBeNull();
		expect(validateExercise({ ...LOCATE_NECK, flow: { previewBeats: 1.5 } })).toMatch(
			/^locate-note-string: flow\.previewBeats /
		);
		expect(
			validateExercise({
				...LOCATE_NECK,
				meter: { count: 3, unit: Fraction.of(1, 4), grouping: [1, 1] }
			})
		).toMatch(/^locate-note-string: meter /);
		// A breath of 0 bars makes a round of length 0.
		expect(validateExercise(withParams({ pacing: { respirationBars: 0 } }))).toMatch(
			/^locate-note-string: params\.pacing\.respirationBars .*0/
		);
		expect(validateExercise(withParams({ pacing: { roundsPerBreath: 0 } }))).toMatch(
			/^locate-note-string: params\.pacing\.roundsPerBreath .*0/
		);
		expect(validateExercise(withParams({ pacing: { roundsPerBreath: 1.5 } }))).toMatch(
			/^locate-note-string: params\.pacing\.roundsPerBreath /
		);
		expect(validateExercise(withParams({ pacing: { breathMinMs: -1 } }))).toMatch(
			/^locate-note-string: params\.pacing\.breathMinMs .*-1/
		);
		// The breath between rounds keeps its default when only the runs are written.
		expect(
			validateExercise(withParams({ pacing: { roundsPerBreath: 2, breathMinMs: 0 } }))
		).toBeNull();
		expect(validateExercise(withParams({ learning: { retestGaps: [2] } }))).toMatch(
			/^locate-note-string: params\.learning\.retestGaps /
		);
		expect(validateExercise(withParams({ ladder: [{ params: { leadBeats: 1.0001 } }] }))).toMatch(
			/^locate-note-string: params\.ladder level 0: the lead .*1\.0001/
		);
		expect(validateExercise(withParams({ windows: { anchorChordFromBeats: 1.0001 } }))).toMatch(
			/^locate-note-string: params\.windows\.anchorChordFromBeats /
		);
	});

	it('checks the round the exercise writes, against the sensors it is given', () => {
		const wrong = { ...LOCATE_NECK, round: { ...LOCATE_NECK.round!, extra: 1 } };
		expect(validateExercise(wrong as ExerciseDefinition)).toMatch(
			/^locate-note-string: round\.extra /
		);
		expect(validateExercise(LOCATE_NECK, { sensors: ['chord'] })).toMatch(
			/^locate-note-string: round\.expectations\[0\]\.sensor /
		);
		expect(validateExercise(LOCATE_NECK, { sensors: ['note'] })).toBeNull();
	});

	it('refuses a level path through a number, naming the exercise, the level and the path', () => {
		expect(
			validateExercise({
				...LOCATE_NECK,
				levels: [{ params: {} }, { params: { 'tempo.bpm': 90 } }]
			})
		).toMatch(/^locate-note-string: levels\[1\] .*tempo\.bpm/);
		const ladder = [
			{ params: { leadBeats: 4 } },
			{ params: { leadBeats: 2, 'windows.perfectMs.at': 60 } }
		];
		expect(validateExercise(withParams({ ladder }))).toMatch(
			/^locate-note-string: params\.ladder level 1: .*windows\.perfectMs\.at/
		);
	});

	it('refuses an item level whose leadBeats is not a beat count', () => {
		expect(validateExercise(withParams({ ladder: [{ params: { leadBeats: '4' } }] }))).toMatch(
			/^locate-note-string: params\.ladder level 0: the lead /
		);
	});

	it('accepts a level path no piece reads', () => {
		expect(
			validateExercise({
				...withParams({
					ladder: [{ params: { leadBeats: 4, 'nothing.reads.this': 1 } }]
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
			practices: 'locate-note-string',
			figures: [{ id: 'theme', figure: parseLilyPond(text) }],
			params: { ladder: [{ params: { leadBeats: 4 } }] },
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

describe('validateExercise on what a file could break in play', () => {
	const levelled = (params: Record<string, unknown>): ExerciseDefinition => ({
		...LOCATE_NECK,
		levels: [{ params }]
	});
	const expectRefusal = (problem: string | null, ...fragments: string[]) => {
		expect(problem).toMatch(/^locate-note-string: /);
		for (const fragment of fragments) expect(problem).toContain(fragment);
	};

	it('checks a value an exercise level writes as the same value written in the params', () => {
		expectRefusal(
			validateExercise(levelled({ 'windows.perfectMs': 'x' })),
			'levels[0]',
			'windows.perfectMs'
		);
	});

	it('checks the tempo an item level writes', () => {
		const ladder = [{ params: { leadBeats: 4, tempo: -3 } }];
		expectRefusal(
			validateExercise(withParams({ ladder })),
			'ladder',
			'tempo must be a positive number'
		);
	});

	it('refuses a level path written undefined', () => {
		expectRefusal(
			validateExercise(levelled({ cursor: undefined })),
			'levels[0]',
			'"cursor" is undefined'
		);
	});

	it('passes the learning settings at a level, read from the params alone', () => {
		const ladder = [{ params: { leadBeats: 4, 'learning.retestGaps': [2] } }];
		expect(validateExercise(withParams({ ladder }))).toBeNull();
		expect(validateExercise(levelled({ 'learning.retestGaps': [2] }))).toBeNull();
		expect(validateExercise(withParams({ learning: { retestGaps: [2] } }))).toMatch(
			/^locate-note-string: params\.learning\.retestGaps /
		);
	});

	it('refuses a level that writes an object and one of its sub-paths', () => {
		expectRefusal(
			validateExercise(levelled({ windows: { perfectMs: 60 }, 'windows.lateMs': 200 })),
			'levels[0] writes "windows" and its sub-path "windows.lateMs"'
		);
	});

	it.each([0, -1, 1.5])('refuses %s rounds per breath', (rounds) => {
		expectRefusal(
			validateExercise(withParams({ pacing: { roundsPerBreath: rounds } })),
			'params.pacing.roundsPerBreath must be a positive integer'
		);
	});

	it('checks the rounds per breath an exercise level writes', () => {
		expectRefusal(
			validateExercise(levelled({ 'pacing.roundsPerBreath': 0 })),
			'levels[0]',
			'pacing.roundsPerBreath'
		);
	});

	it('refuses pacing that is not an object', () => {
		expectRefusal(validateExercise(withParams({ pacing: 3 })), 'params.pacing must be an object');
	});

	it('passes a recall threshold written in the params: no piece reads it', () => {
		expect(validateExercise(withParams({ recallThresholdMs: 0 }))).toBeNull();
	});

	it('refuses a memory skill practised with a round judged by cycle', () => {
		const remembered: ExerciseDefinition = { ...ARPEGGIO_EXERCISE, practices: 'chord-anchor' };
		expect(validateExercise(remembered)).toBe(
			`${ARPEGGIO_EXERCISE.id}: practices a memory skill with a round judged by cycle`
		);
		expect(validateExercise(ARPEGGIO_EXERCISE)).toBeNull();
	});

	it('refuses a round judged by cycle with no rounds per breath', () => {
		const endless: ExerciseDefinition = {
			...ARPEGGIO_EXERCISE,
			params: { ...ARPEGGIO_EXERCISE.params, pacing: { breathMinMs: 4000 } }
		};
		expect(validateExercise(ARPEGGIO_EXERCISE)).toBeNull();
		const problem = validateExercise(endless);
		expect(problem).toMatch(new RegExp(`^${ARPEGGIO_EXERCISE.id}: `));
		expect(problem).toContain(
			'params.pacing.roundsPerBreath is required for a round judged by cycle'
		);
	});
});

describe('validateExercise on how a run starts', () => {
	it('refuses a listen-in that is not a whole number of bars, and a count that is not a boolean', () => {
		expect(validateExercise(withParams({ pacing: { listenInBars: 1.5 } }))).toBe(
			'locate-note-string: params.pacing.listenInBars must be a non-negative integer, got 1.5'
		);
		expect(validateExercise(withParams({ pacing: { listenInBars: -1 } }))).toMatch(
			/^locate-note-string: params\.pacing\.listenInBars .*-1/
		);
		expect(validateExercise(withParams({ pacing: { countIn: 'yes' } }))).toBe(
			'locate-note-string: params.pacing.countIn must be true or false, got yes'
		);
	});

	it('refuses no listen-in and no counted bar, at the level that resolves them', () => {
		// The listen-in is 0 by default: no counted bar leaves nothing to hear before playing.
		expect(validateExercise(withParams({ pacing: { countIn: false } }))).toBe(
			'locate-note-string: params resolves params.pacing.countIn false with no listen-in bar: a run needs one or the other'
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
			`${ARPEGGIO_EXERCISE.id}: levels[1]: params.pacing.listenInBars must be a non-negative integer, got 0.5`
		);
	});
});

describe('validateExercise on a presentation written in levels', () => {
	const unpresented: ExerciseDefinition = { ...LOCATE_NECK, presentation: undefined };

	it('refuses a presentation path at an exercise level of an exercise that writes none, naming the level', () => {
		expect(
			validateExercise({
				...unpresented,
				levels: [{ params: {} }, { params: { 'presentation.detail': '{fret}' } }]
			})
		).toBe(
			'locate-note-string: levels[1] writes "presentation.detail", and the exercise writes no presentation'
		);
		expect(
			validateExercise({ ...unpresented, levels: [{ params: { presentation: { primary: 'x' } } }] })
		).toBe(
			'locate-note-string: levels[0] writes "presentation", and the exercise writes no presentation'
		);
	});

	it('refuses a presentation path at an item level of an exercise that writes none, naming the level', () => {
		expect(
			validateExercise({
				...unpresented,
				params: {
					...LOCATE_NECK.params,
					ladder: [
						{ params: { leadBeats: 4, 'presentation.picture': 'string' } },
						{ params: { leadBeats: 2 } }
					]
				}
			})
		).toBe(
			'locate-note-string: params.ladder[0] writes "presentation.picture", and the exercise writes no presentation'
		);
	});

	it('accepts presentation paths at any level of an exercise that writes one', () => {
		expect(
			validateExercise({
				...LOCATE_NECK,
				levels: [{ params: {} }, { params: {} }, { params: { 'presentation.detail': '{fret}' } }],
				params: {
					...LOCATE_NECK.params,
					ladder: [
						{ params: { leadBeats: 4 } },
						{ params: { leadBeats: 2, 'presentation.picture': 'string' } }
					]
				}
			})
		).toBeNull();
	});

	it('refuses a presentation written in the params, which nothing reads', () => {
		expect(validateExercise(withParams({ presentation: { primary: '{note}' } }))).toBe(
			'locate-note-string: params.presentation is not read: write presentation at the exercise\'s root, or "presentation.<slot>" in a level'
		);
	});
});

describe('validateExercise on levels a file writes wrong', () => {
	it('refuses a level that is not an object', () => {
		expect(
			validateExercise({
				...LOCATE_NECK,
				levels: [null] as unknown as ExerciseDefinition['levels']
			})
		).toBe('locate-note-string: levels[0] must be an object');
	});

	it('refuses a level without params', () => {
		expect(
			validateExercise({ ...LOCATE_NECK, levels: [{}] as unknown as ExerciseDefinition['levels'] })
		).toBe('locate-note-string: levels[0].params must be an object');
	});
});

describe('validateExercise on listed items', () => {
	const withItems = (
		items: ItemEntry[],
		over: Partial<ExerciseDefinition> = {}
	): ExerciseDefinition => ({
		...ARPEGGIO_EXERCISE,
		items,
		...over
	});

	it('accepts items its set reads and its round compiles at every level', () => {
		expect(validateExercise(ARPEGGIO_EXERCISE)).toBeNull();
	});

	it('refuses an empty list, naming the field', () => {
		expect(validateExercise(withItems([]))).toBe(`${ARPEGGIO_EXERCISE.id}: items lists no item`);
	});

	it('refuses items that are not a list', () => {
		expect(validateExercise(withItems('abc' as unknown as string[]))).toBe(
			`${ARPEGGIO_EXERCISE.id}: items must be a list`
		);
	});

	it('refuses a key its set cannot read, naming the item', () => {
		expect(validateExercise(withItems([ARPEGGIO_EXERCISE.items![0], 'nonsense']))).toMatch(
			new RegExp(`^${ARPEGGIO_EXERCISE.id}: items\\[1\\] \\("nonsense"\\): .*nonsense`)
		);
	});

	it('refuses a change of a grid no file defines, naming the item', () => {
		const [entry] = RHYTHM_OFFBEATS.round!.expectations as FigureExpectationTemplate[];
		const onChanges = (key: string): ExerciseDefinition => ({
			...RHYTHM_OFFBEATS,
			id: 'test-changes',
			practices: GESTURE_JAM.practices,
			items: [key],
			view: 'figure',
			round: {
				...RHYTHM_OFFBEATS.round!,
				expectations: [{ ...entry, figure: { id: RHYTHM_OFFBEATS.figures![0].id } }]
			}
		});
		expect(validateExercise(onChanges('iohefy-a#0'))).toBeNull();
		expect(validateExercise(onChanges('nowhere#0'))).toBe(
			'test-changes: items[0] ("nowhere#0"): names grid "nowhere", which no file defines'
		);
	});

	it('refuses frets where the voicing has no place, naming the item', () => {
		expect(
			validateExercise(withItems([ARPEGGIO_EXERCISE.items![0], 'C|maj|3:1,2:3,1:5@9-9-9']))
		).toBe(
			`${ARPEGGIO_EXERCISE.id}: items[1] ("C|maj|3:1,2:3,1:5@9-9-9"): the voicing has no place at frets 9-9-9`
		);
	});

	it('refuses a key that still ends with a length, like any key its set cannot read', () => {
		expect(validateExercise(withItems([`${ARPEGGIO_ITEMS[0]}@4`]))).toMatch(
			new RegExp(`^${ARPEGGIO_EXERCISE.id}: items\\[0\\] \\(".*@4"\\): `)
		);
	});

	it('accepts an entry that gives its item a length, and a key alone when the round reads none', () => {
		expect(validateExercise(withItems([{ item: ARPEGGIO_ITEMS[1], beats: 2 }]))).toBeNull();
		const barLong = {
			round: { ...ARPEGGIO_EXERCISE.round!, length: { bars: 1 } } as RoundTemplate
		};
		expect(validateExercise(withItems([...ARPEGGIO_ITEMS], barLong))).toBeNull();
	});

	it('refuses a key alone when the round reads the length of its item', () => {
		expect(validateExercise(withItems([ARPEGGIO_ITEMS[0]]))).toMatch(
			new RegExp(`^${ARPEGGIO_EXERCISE.id}: items\\[0\\] .* does not compile .*no length in beats`)
		);
	});

	it('refuses a length that is not a positive number, naming items[i].beats', () => {
		for (const beats of [0, -4, Number.NaN, '4']) {
			const entry = { item: ARPEGGIO_ITEMS[0], beats } as unknown as ItemEntry;
			expect(validateExercise(withItems([entry]))).toBe(
				`${ARPEGGIO_EXERCISE.id}: items[0].beats must be a positive number`
			);
		}
	});

	it('refuses an entry that is neither a key nor { item, beats }, naming it', () => {
		const odd = [
			{ beats: 4 },
			{ item: 4, beats: 4 },
			7,
			{ item: ARPEGGIO_ITEMS[0], beats: 4, x: 1 }
		];
		for (const entry of odd) {
			expect(validateExercise(withItems([entry as unknown as ItemEntry]))).toMatch(
				new RegExp(`^${ARPEGGIO_EXERCISE.id}: items\\[0\\]`)
			);
		}
	});

	it('refuses a pattern note beyond the shape at the level that reads it', () => {
		const round = ARPEGGIO_EXERCISE.round!;
		const [entry] = round.expectations;
		const beyond = withItems([...ARPEGGIO_EXERCISE.items!], {
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

describe('validateExercise on the shapes an exercise writes', () => {
	const [form] = FORM_EXERCISE.shapes!;
	const withForms = (shapes: ExerciseDefinition['shapes']): ExerciseDefinition => ({
		...FORM_EXERCISE,
		shapes
	});
	const withItems = (
		items: ItemEntry[],
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
			`${id}: shapes[1] (maj7) has the id of shapes[0]`
		);
	});

	it('refuses an empty form, naming it', () => {
		expect(validateExercise(withForms([{ ...form, notes: [] }]))).toBe(
			`${id}: shapes[0] (maj7) has no note`
		);
	});

	it('refuses a flow it cannot follow, naming the field', () => {
		const flowed = (flow: object) => ({ ...withForms([form]), flow }) as ExerciseDefinition;
		expect(validateExercise(flowed({ levelChange: 'soon' }))).toBe(
			`${id}: flow.levelChange must be one of breath, next-round, got soon`
		);
		expect(validateExercise(flowed({ demonstration: 'no' }))).toBe(
			`${id}: flow.demonstration must be true or false, got no`
		);
		expect(
			validateExercise(flowed({ levelChange: 'next-round', demonstration: false }))
		).toBeNull();
	});

	it('refuses a note not playable as written, naming the form and the note', () => {
		const below = [form.notes[0], { midi: 40, string: 4, name: 'E' }];
		expect(validateExercise(withForms([{ ...form, notes: below }]))).toBe(
			`${id}: shapes[0] (maj7) note 1 (pitch 40) is below string 4 (50)`
		);
		const seventh = [{ midi: 60, string: 7, name: 'C' }];
		expect(validateExercise(withForms([{ ...form, notes: seventh }]))).toMatch(
			/^test-form-sequence: shapes\[0\] \(maj7\) note 0 is on string 7/
		);
	});

	const long = (item: string): ItemEntry => ({ item, beats: 4 });

	it('refuses an item naming a shape the exercise does not write, naming the item', () => {
		expect(validateExercise(withItems([long('maj7@c'), long('nowhere@c')]))).toMatch(
			new RegExp(`^${id}: items\\[1\\] \\("nowhere@c"\\) .*shape "nowhere"`)
		);
	});

	it('refuses an item moving its shape off the neck, naming the item', () => {
		expect(validateExercise(withItems([long('maj7@c'), long("maj7@a'"), long('maj7@g,')]))).toMatch(
			new RegExp(`^${id}: items\\[1\\] \\("maj7@a'"\\) .*above the last fret`)
		);
		expect(validateExercise(withItems([long('maj7@g,')]))).toMatch(
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
			expect(validateExercise(withItems([long('nowhere@c')], rest))).toBeNull();
			expect(validateExercise(withItems([long('maj7@g,')], rest))).toBeNull();
		}
	});

	it('refuses a shape whose id holds the separator of an item key, which no item could name', () => {
		expect(validateExercise(withForms([{ ...form, id: 'maj@7' }]))).toMatch(
			new RegExp(`^${id}: shapes\\[0\\] \\(maj@7\\) has an id with "@"`)
		);
	});

	it('refuses frets where the voicing has no place even when the round derives nothing', () => {
		const round = ARPEGGIO_EXERCISE.round!;
		const [entry] = round.expectations;
		const exercise: ExerciseDefinition = {
			...ARPEGGIO_EXERCISE,
			items: [long('C|maj|3:1,2:3,1:5@9-9-9')],
			round: { ...round, expectations: [{ ...entry, content: null }] } as RoundTemplate
		};
		expect(validateExercise(exercise)).toMatch(/no place at frets 9-9-9/);
	});
});

describe('validateExercise limits', () => {
	const plainLevels = (count: number) => Array.from({ length: count }, () => ({ params: {} }));
	const manyParams = (count: number) =>
		Object.fromEntries(Array.from({ length: count }, (_, i) => [`free.p${i}`, i]));
	const ladderOf = (count: number): Ladder =>
		Array.from({ length: count }, () => ({ params: { leadBeats: 2 } }));

	it('refuses more exercise levels than MAX_EXERCISE_LEVELS', () => {
		expect(MAX_EXERCISE_LEVELS).toBe(100);
		expect(validateExercise({ ...LOCATE_NECK, levels: plainLevels(1000) })).toBe(
			'locate-note-string: levels has 1000 entries, more than 100'
		);
		expect(validateExercise({ ...LOCATE_NECK, levels: plainLevels(100) })).toBeNull();
	});

	it('refuses a ladder of more levels than MAX_LADDER_LEVELS', () => {
		expect(MAX_LADDER_LEVELS).toBe(100);
		expect(validateExercise(withParams({ ladder: ladderOf(101) }))).toBe(
			'locate-note-string: params.ladder has 101 levels, more than 100'
		);
		expect(validateExercise(withParams({ ladder: ladderOf(100) }))).toBeNull();
	});

	it('refuses a level writing more params than MAX_LEVEL_PARAMS', () => {
		expect(MAX_LEVEL_PARAMS).toBe(200);
		const levels = [...plainLevels(3), { params: manyParams(201) }];
		expect(validateExercise({ ...LOCATE_NECK, levels })).toBe(
			'locate-note-string: levels[3].params has 201 entries, more than 200'
		);
		const ladder: Ladder = [...ladderOf(2), { params: { leadBeats: 2, ...manyParams(200) } }];
		expect(validateExercise(withParams({ ladder }))).toBe(
			'locate-note-string: params.ladder[2].params has 201 entries, more than 200'
		);
		expect(validateExercise({ ...LOCATE_NECK, levels: [{ params: manyParams(200) }] })).toBeNull();
	});

	it('refuses more items than MAX_EXERCISE_ITEMS', () => {
		expect(MAX_EXERCISE_ITEMS).toBe(2000);
		const items = Array.from({ length: 2001 }, () => ARPEGGIO_EXERCISE.items![0]);
		expect(validateExercise({ ...ARPEGGIO_EXERCISE, items })).toBe(
			'test-arpeggio-sequence: items has 2001 entries, more than 2000'
		);
	});

	it('refuses figures × levels asking more round checks than MAX_ROUND_CHECKS, for an exercise that serves its figures', () => {
		const figures = Array.from({ length: 201 }, (_, i) => ({
			...RHYTHM_OFFBEATS.figures![0],
			id: `f${i}`
		}));
		const levels = plainLevels(100);
		const start = performance.now();
		expect(validateExercise({ ...RHYTHM_OFFBEATS, figures, levels })).toBe(
			'rhythm-offbeats: figures × levels asks 20100 round checks, more than 20000'
		);
		expect(performance.now() - start).toBeLessThan(wallClockMs(200));
	});

	it('refuses an exercise that serves its figures when none fits its round at a level, naming the level', () => {
		// A figure of two bars: a round of three bars plays it no whole number of times.
		const twoBars = { id: 'two', figure: parseLilyPond('c8 c c c c c c c | c8 c c c c c c c') };
		const levels = [...plainLevels(2), { params: { cycleBars: 3 } }];
		const exercise = {
			...RHYTHM_OFFBEATS,
			figures: [twoBars],
			params: { ...RHYTHM_OFFBEATS.params, cycleBars: 4 },
			levels
		};
		expect(validateExercise(exercise)).toBe(
			'rhythm-offbeats: no figure fits the round at exercise level 2'
		);
		expect(validateExercise({ ...exercise, levels: plainLevels(3) })).toBeNull();
	});

	it('refuses items × levels asking more round checks than MAX_ROUND_CHECKS, before any', () => {
		expect(MAX_ROUND_CHECKS).toBe(20_000);
		// 201 items at 100 exercise levels (one an aid level): 20 100 rounds to compile.
		const items = Array.from({ length: 201 }, () => ARPEGGIO_EXERCISE.items![0]);
		const levels = [ARPEGGIO_EXERCISE.levels![0], ...plainLevels(99)];
		const start = performance.now();
		expect(validateExercise({ ...ARPEGGIO_EXERCISE, items, levels })).toBe(
			'test-arpeggio-sequence: items × levels asks 20100 round checks, more than 20000'
		);
		expect(performance.now() - start).toBeLessThan(wallClockMs(200));
		expect(
			validateExercise({ ...ARPEGGIO_EXERCISE, items: items.slice(0, 200), levels })
		).toBeNull();
	});

	it('charges its levels, then each round it compiles, to the budget given, and refuses past it in the budget’s words', () => {
		// Its levels resolved, then 66 items at one level.
		const levels = levelsCheckCost(LOCATE_NECK);
		const round = roundCheckCost(LOCATE_NECK);
		const budget = new CheckBudget(Infinity);
		expect(validateExercise(LOCATE_NECK, { budget })).toBeNull();
		expect(budget.spent).toBe(levels + LOCATE_NECK.items!.length * round);
		const tight = new CheckBudget(levels + 10 * round);
		expect(validateExercise(LOCATE_NECK, { budget: tight })).toBe(
			`locate-note-string: this file asks more checking than a start can afford (cost ${levels + 11 * round}, at most ${levels + 10 * round})`
		);
	});

	it('charges the levels resolved before resolving them', () => {
		const many = { ...LOCATE_NECK, levels: [{ params: manyParams(200) }, ...plainLevels(99)] };
		expect(levelsCheckCost(many)).toBeGreaterThan(levelsCheckCost(LOCATE_NECK));
		const budget = new CheckBudget(levelsCheckCost(many) - 1);
		const start = performance.now();
		expect(validateExercise(many, { budget })).toMatch(/can afford \(cost \d+, at most \d+\)$/);
		expect(budget.spent).toBe(0);
		expect(performance.now() - start).toBeLessThan(wallClockMs(50));
	});

	it('charges the notes a figure entry expands to once compiled', () => {
		// 200 items at 100 levels, quarters: a round plus 3 notes more.
		const items = Array.from({ length: 200 }, () => ARPEGGIO_EXERCISE.items![0]);
		const levels = [ARPEGGIO_EXERCISE.levels![0], ...plainLevels(99)];
		const exercise = { ...ARPEGGIO_EXERCISE, items, levels };
		const budget = new CheckBudget(Infinity);
		expect(validateExercise(exercise, { budget })).toBeNull();
		expect(budget.spent).toBe(
			levelsCheckCost(exercise) + 200 * 100 * (roundCheckCost(exercise) + 3)
		);
	});

	it('refuses a figure that would expand past what the budget leaves, before expanding it, in the budget’s words', () => {
		const item = ARPEGGIO_EXERCISE.items![0] as { item: string };
		const exercise = { ...ARPEGGIO_EXERCISE, items: [{ item: item.item, beats: 4_000 }] };
		const spent = levelsCheckCost(exercise) + roundCheckCost(exercise);
		const budget = new CheckBudget(spent + 999);
		const start = performance.now();
		// 4 000 notes over 1 000 bars, charged as they would have been: past the budget.
		expect(validateExercise(exercise, { budget })).toBe(
			`test-arpeggio-sequence: this file asks more checking than a start can afford (cost ${spent + 4_000}, at most ${spent + 999})`
		);
		expect(performance.now() - start).toBeLessThan(wallClockMs(50));
	});

	it('refuses at once, compiling nothing, with a budget already spent', () => {
		const budget = new CheckBudget(1);
		expect(() => budget.charge(2)).toThrow();
		const start = performance.now();
		expect(validateExercise(LOCATE_NECK, { budget })).toBe(
			'locate-note-string: this file asks more checking than a start can afford (cost 2, at most 1)'
		);
		expect(performance.now() - start).toBeLessThan(wallClockMs(50));
	});

	it('charges the rounds of the first passages it compiles', () => {
		const budget = new CheckBudget(Infinity);
		expect(validateExercise(GESTURE_JAM, { budget })).toBeNull();
		expect(budget.spent).toBeGreaterThan(0);
		const refused = new CheckBudget(budget.spent - 1);
		expect(validateExercise(GESTURE_JAM, { budget: refused })).toMatch(
			/^grid-reading: this file asks more checking than a start can afford \(cost \d+, at most \d+\)$/
		);
	});
});
