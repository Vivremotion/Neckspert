import { describe, expect, it } from 'vitest';
import { routineFromJson } from './fromJson';
import { MAX_OPENING_DEPTH, MAX_OPENING_TERMS, MAX_ROUTINE_EXERCISES } from './types';

const ROUTINE = {
	id: 'chords-zone',
	title: { fr: 'Triades vers une case', en: 'Triads around a fret' },
	exercises: ['chord-zone'],
	howTo: { fr: 'Joue.', en: 'Play.' },
	opens: { acquired: { skill: 'chord-anchor', atLeast: 6 } }
};

const refused = (json: unknown) => () => routineFromJson(json);
const leaf = { acquired: { skill: 's', atLeast: 1 } };
/** A predicate `depth` nodes deep, `all` around one leaf. */
const nested = (depth: number): unknown => (depth <= 1 ? leaf : { all: [nested(depth - 1)] });

describe('routineFromJson', () => {
	it('reads a routine', () => {
		expect(routineFromJson(ROUTINE)).toEqual(ROUTINE);
	});

	it('reads a routine without howTo nor opening', () => {
		const { howTo: _h, opens: _o, ...rest } = ROUTINE;
		expect(routineFromJson(rest)).toEqual(rest);
	});

	it('reads every form of opening', () => {
		const opens = {
			any: [
				{ level: { exercise: 'e', scope: 'grid=blues-f', atLeast: 3 } },
				{ all: [{ level: { exercise: 'e', atLeast: 1 } }, leaf] }
			]
		};
		expect(routineFromJson({ ...ROUTINE, opens }).opens).toEqual(opens);
	});

	it.each([[[]], [null], ['x']])('refuses %j', (json) => {
		expect(refused(json)).toThrow('a routine must be a JSON object');
	});

	it('refuses an unknown key', () => {
		expect(refused({ ...ROUTINE, colour: 'red' })).toThrow('unknown key "colour"');
	});

	it('refuses an id idProblem refuses', () => {
		expect(refused({ ...ROUTINE, id: '-x' })).toThrow(/^id must be made of/);
		expect(refused({ ...ROUTINE, id: '' })).toThrow('id must be a string, not empty');
	});

	it.each([
		['title', undefined],
		['title', { fr: 'x' }],
		['title', { fr: 'x', en: '' }],
		['title', { fr: 'x', en: 'y', de: 'z' }],
		['howTo', 'x'],
		['howTo', { fr: '', en: 'y' }]
	])('refuses %s written %j', (key, value) => {
		expect(refused({ ...ROUTINE, [key]: value })).toThrow(
			`${key} must be { fr, en }, each a text not empty`
		);
	});

	it('refuses exercises that are no list of ids', () => {
		expect(refused({ ...ROUTINE, exercises: 'chord-zone' })).toThrow(
			'exercises must be a list of exercise ids'
		);
		expect(refused({ ...ROUTINE, exercises: ['a', 3] })).toThrow('exercises[1] must be a string');
	});

	it('refuses an empty list of exercises', () => {
		expect(refused({ ...ROUTINE, exercises: [] })).toThrow('exercises is empty');
	});

	it('refuses more exercises than the limit, before reading them', () => {
		const exercises = Array.from({ length: 50_000 }, () => 3);
		expect(refused({ ...ROUTINE, exercises })).toThrow(
			`exercises has 50000 entries, more than ${MAX_ROUTINE_EXERCISES}`
		);
	});

	it('reads the most exercises allowed', () => {
		const exercises = Array.from({ length: MAX_ROUTINE_EXERCISES }, (_, i) => `e${i}`);
		expect(routineFromJson({ ...ROUTINE, exercises }).exercises).toEqual(exercises);
	});

	it('refuses an exercise listed twice', () => {
		expect(refused({ ...ROUTINE, exercises: ['a', 'b', 'a'] })).toThrow(
			'exercises[2] lists "a" a second time'
		);
	});

	it.each([
		[3, 'opens must be one of { acquired }, { level }, { all }, { any }'],
		[{}, 'opens must be one of { acquired }, { level }, { all }, { any }'],
		[
			{ acquired: leaf.acquired, any: [] },
			'opens must be one of { acquired }, { level }, { all }, { any }'
		],
		[{ acquired: { skill: 's' } }, 'opens.acquired.atLeast must be a positive integer'],
		[{ acquired: { skill: 's', atLeast: 0 } }, 'opens.acquired.atLeast must be a positive integer'],
		[
			{ acquired: { skill: 's', atLeast: 1.5 } },
			'opens.acquired.atLeast must be a positive integer'
		],
		[{ acquired: { skill: 3, atLeast: 1 } }, 'opens.acquired.skill must be a string'],
		[{ acquired: { skill: 's', atLeast: 1, item: 'x' } }, 'opens.acquired: unknown key "item"'],
		[{ level: { atLeast: 1 } }, 'opens.level.exercise must be a string'],
		[{ level: { exercise: 'e', scope: 3, atLeast: 1 } }, 'opens.level.scope must be a string'],
		[{ level: { exercise: 'e', atLeast: -1 } }, 'opens.level.atLeast must be a positive integer'],
		[{ all: leaf }, 'opens.all must be a list'],
		[{ any: [] }, 'opens.any is empty'],
		[{ all: [leaf, { any: [3] }] }, 'opens.all[1].any[0] must be one of']
	])('refuses the opening %j', (opens, reason) => {
		expect(refused({ ...ROUTINE, opens })).toThrow(reason);
	});

	it('reads an opening at the limits of its terms and its depth', () => {
		const wide = { all: Array.from({ length: MAX_OPENING_TERMS - 1 }, () => leaf) };
		expect(routineFromJson({ ...ROUTINE, opens: wide }).opens).toEqual(wide);
		const deep = nested(MAX_OPENING_DEPTH);
		expect(routineFromJson({ ...ROUTINE, opens: deep }).opens).toEqual(deep);
	});

	it('refuses an opening of more terms than the limit, before reading them', () => {
		const wide = { any: Array.from({ length: MAX_OPENING_TERMS }, () => leaf) };
		expect(refused({ ...ROUTINE, opens: wide })).toThrow(
			`opens has more than ${MAX_OPENING_TERMS} terms`
		);
		const huge = { any: Array.from({ length: 50_000 }, () => 3) };
		expect(refused({ ...ROUTINE, opens: huge })).toThrow(
			`opens has more than ${MAX_OPENING_TERMS} terms`
		);
	});

	it('refuses an opening deeper than the limit', () => {
		expect(refused({ ...ROUTINE, opens: nested(MAX_OPENING_DEPTH + 1) })).toThrow(
			`opens is deeper than ${MAX_OPENING_DEPTH} levels`
		);
	});
});
