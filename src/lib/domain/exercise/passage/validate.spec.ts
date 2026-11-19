import { describe, expect, it } from 'vitest';
import { registerGrid } from '$lib/domain/grid/registry';
import type { ChordGrid } from '$lib/domain/grid';
import {
	CLIMB_PASSAGES,
	LINK_PASSAGES,
	PASSAGE_EXERCISES,
	ZONE_PASSAGES
} from '$lib/testing/changesPassages';
import type { ExerciseDefinition } from '../types';
import { validateExercise } from '../validate';
import { MAX_PASSAGE_EACH, MAX_PASSAGE_INDICES, MAX_PASSAGE_MEMBERS } from './validate';

/** `exercise` with its passages changed by `change` (a key set to undefined is left out). */
function passing(
	exercise: ExerciseDefinition,
	change: Record<string, unknown>
): ExerciseDefinition {
	const passages = { ...exercise.passages, ...change };
	for (const key of Object.keys(change)) {
		if (change[key] === undefined) delete (passages as Record<string, unknown>)[key];
	}
	return { ...exercise, passages } as ExerciseDefinition;
}

const refusal = (exercise: ExerciseDefinition) =>
	validateExercise(exercise)?.replace(`${exercise.id}: `, '') ?? null;

describe('the passages an exercise writes', () => {
	it('accepts the four exercises of the changes as plan 4b writes them', () => {
		expect(PASSAGE_EXERCISES.map((e) => [e.id, refusal(e)])).toEqual(
			PASSAGE_EXERCISES.map((e) => [e.id, null])
		);
	});

	it('refuses passages and items written together', () => {
		expect(refusal({ ...LINK_PASSAGES, items: ['C|maj|3:1,2:3,1:5@8-8-8'] })).toBe(
			'an exercise writes passages or items, not both'
		);
	});

	it('refuses a key it does not know', () => {
		expect(refusal(passing(LINK_PASSAGES, { x: 1 }))).toBe('passages has an unknown key "x"');
	});

	it.each([
		[{}, 'passages.of names no list of values'],
		[{ chord: [] }, 'passages.of.chord must be a list, not empty'],
		[{ chord: 'C' }, 'passages.of.chord must be a list, not empty']
	])('refuses the values %j', (of, reason) => {
		expect(refusal(passing(LINK_PASSAGES, { of }))).toBe(reason);
	});

	it('refuses an `of` that is no object', () => {
		expect(refusal(passing(LINK_PASSAGES, { of: [['C']] }))).toBe(
			'passages.of must map names to lists of values'
		);
	});

	it('refuses more indices than the limit, before reading a value', () => {
		const chord = Array.from({ length: 600 }, () => ({ deep: true }));
		expect(
			refusal(
				passing(LINK_PASSAGES, {
					of: {
						chord,
						strings: [
							[3, 2, 1],
							[4, 3, 2]
						]
					}
				})
			)
		).toBe(`passages.of gives 1200 indices, more than ${MAX_PASSAGE_INDICES}`);
	});

	it.each([
		[
			{ chord: ['C', 'D', { x: 1 }] },
			'passages.of.chord[2] must be a text, a number or a list of them'
		],
		[{ chord: [[['C']]] }, 'passages.of.chord[0] must be a text, a number or a list of them'],
		[{ chord: ['C;D'] }, 'passages.of.chord[0] may not hold ";" or "="'],
		[{ chord: [['C', 'a=b']] }, 'passages.of.chord[0] may not hold ";" or "="'],
		[{ 'a;b': ['C'] }, 'passages.of name "a;b" may not hold ";" or "="'],
		[
			{
				strings: [
					[3, 2, 1],
					[3, 2, 1]
				]
			},
			'passages.of.strings[1] has the key of passages.of.strings[0]'
		]
	])('refuses the values %j', (of, reason) => {
		expect(refusal(passing(LINK_PASSAGES, { of }))).toBe(reason);
	});

	it('refuses members the selection module refuses, naming its field', () => {
		expect(refusal(passing(LINK_PASSAGES, { members: { family: 'chord-shapes', take: 0 } }))).toBe(
			'passages.members.take must be a positive whole number'
		);
		expect(refusal(passing(LINK_PASSAGES, { members: { family: 'nope' } }))).toBe(
			'passages.members names family "nope", which is not registered'
		);
		expect(refusal(passing(LINK_PASSAGES, { members: undefined }))).toMatch(
			/^passages.members must be a selection/
		);
	});

	it('refuses an `of` among the members, whose index the passage gives, and an item value', () => {
		expect(
			refusal(passing(LINK_PASSAGES, { members: { family: 'chord-shapes', of: 'placed' } }))
		).toMatch(/^passages.members.of is not a key of its place/);
		expect(
			refusal(
				passing(LINK_PASSAGES, {
					members: { family: 'chord-shapes', where: [{ at: { item: 'fret' } }] }
				})
			)
		).toBe('passages.members.where[0] reads item value "fret", which a passage does not have');
	});

	it('refuses an `andBack` that is no boolean', () => {
		expect(
			refusal(passing(LINK_PASSAGES, { members: { family: 'chord-shapes', andBack: 1 } }))
		).toBe('passages.members.andBack must be true or false');
	});

	it('refuses a family that gives no members from a passage index', () => {
		expect(refusal(passing(LINK_PASSAGES, { members: { family: 'note-places' } }))).toBe(
			'passages.members names family "note-places", which gives no members from a passage’s index'
		);
	});

	it('refuses a family whose members are no items of the skill’s set', () => {
		expect(
			refusal(
				passing(LINK_PASSAGES, {
					of: { grid: ['iohefy-a'] },
					members: { family: 'grid-changes' }
				})
			)
		).toBe(
			'passages.members names family "grid-changes", whose members are no items of placed-voicing'
		);
	});

	it('refuses an index the family cannot read, checked on every index', () => {
		expect(refusal(passing(ZONE_PASSAGES, { of: { grid: ['iohefy-a', 'nowhere'] } }))).toBe(
			'passages.of gives no index of grid-changes: grid-changes: unknown grid "nowhere"'
		);
		expect(
			refusal(passing(LINK_PASSAGES, { of: { chord: ['C', 'H'], strings: [[3, 2, 1]] } }))
		).toMatch(/^passages.of gives no index of chord-shapes: /);
		expect(refusal(passing(LINK_PASSAGES, { of: { chord: ['C'] } }))).toMatch(
			/^passages.of gives no index of chord-shapes: .*strings/
		);
		expect(refusal(passing(LINK_PASSAGES, { of: { chord: ['C'], strings: [[3, 1]] } }))).toMatch(
			/^passages.of gives no index of chord-shapes: chord-shapes needs three/
		);
	});

	it('refuses a passage of more members than the limit, naming its index', () => {
		const long: ChordGrid = {
			id: 'test-long',
			title: 'Long',
			beatsPerBar: 4,
			bars: 300,
			chords: Array.from({ length: 300 }, (_, i) => ({
				bar: i + 1,
				beat: 1,
				symbol: i % 2 === 0 ? 'C' : 'F'
			}))
		} as ChordGrid;
		registerGrid(long, 'test');
		expect(refusal(passing(ZONE_PASSAGES, { of: { grid: ['iohefy-a', 'test-long'] } }))).toBe(
			`passages.members gives 300 members for index grid=test-long, more than ${MAX_PASSAGE_MEMBERS}`
		);
	});

	it.each([
		[[], 'passages.each.direction must be a list, not empty'],
		['up', 'passages.each.direction must be a list, not empty'],
		[
			Array.from({ length: 100 }, () => 'up'),
			`passages.each.direction has 100 values, more than ${MAX_PASSAGE_EACH}`
		]
	])('refuses the passage params of case %#', (values, reason) => {
		expect(refusal(passing(CLIMB_PASSAGES, { each: { direction: values } }))).toBe(reason);
	});

	it('refuses passage params that are no object', () => {
		expect(refusal(passing(CLIMB_PASSAGES, { each: [['up']] }))).toBe(
			'passages.each must map names to lists of values'
		);
	});

	it('refuses a passage param written in the params too', () => {
		expect(refusal({ ...CLIMB_PASSAGES, params: { direction: 'up' } })).toBe(
			'passages.each.direction is also written in params'
		);
		expect(refusal(passing(CLIMB_PASSAGES, { each: { tempo: [80] } }))).toBe(
			'passages.each.tempo is also written in params'
		);
	});

	it('refuses a passage param that does not fit where the round reads it', () => {
		expect(refusal(passing(CLIMB_PASSAGES, { each: { direction: ['up', 'sideways'] } }))).toBe(
			'round.expectations[0].content.where[0].position.toward reads param "direction", which passages.each.direction[1] gives as "sideways", not up or down'
		);
		expect(
			refusal(
				passing(ZONE_PASSAGES, {
					each: {
						zone: [
							[1, 5],
							[9, 3]
						]
					}
				})
			)
		).toBe(
			'round.expectations[0].content.where[0] reads param "zone", which passages.each.zone[1] gives as [9,3], whose first fret is above the second'
		);
	});

	it.each([
		[
			{ acquired: { skill: 'chord-anchor' } },
			'passages.opens must be { acquired: { skill, item, need? } }'
		],
		['chord-anchor', 'passages.opens must be { acquired: { skill, item, need? } }'],
		[
			{ acquired: { skill: 'chord-anchor', item: 'voicing', need: 'all' } },
			'passages.opens.acquired.need must be "every-group" or "one-group"'
		]
	])('refuses the opening %j', (opens, reason) => {
		expect(refusal(passing(LINK_PASSAGES, { opens }))).toBe(reason);
	});

	it.each([
		[{ again: 'always' }, 'passages.again must be "until-passed"'],
		[{ restBars: -1 }, 'passages.restBars must be a non-negative integer'],
		[{ restBars: 1.5 }, 'passages.restBars must be a non-negative integer'],
		[{ passes: 0 }, 'passages.passes must be a number above 0 and at most 1'],
		[{ passes: 1.2 }, 'passages.passes must be a number above 0 and at most 1'],
		[{ passes: '1' }, 'passages.passes must be a number above 0 and at most 1'],
		[{ scope: 3 }, 'passages.scope must name a key of passages.of'],
		[{ scope: 'grid' }, 'passages.scope names "grid", which passages.of does not write']
	])('refuses %j', (change, reason) => {
		expect(refusal(passing(LINK_PASSAGES, change))).toBe(reason);
	});

	it('accepts a restBars of 0 and passes of 1', () => {
		expect(refusal(passing(LINK_PASSAGES, { restBars: 0, passes: 1 }))).toBeNull();
	});
});
