import { describe, expect, it } from 'vitest';
import { gridById, gridChanges, triadOf } from '$lib/domain/grid';
import { chordShapes } from '$lib/domain/families/guitar/chordShapes';
import type { StringNumber } from '$lib/domain/music';
import {
	CLIMB_PASSAGES,
	JAM_PASSAGES,
	LINK_CHORDS,
	LINK_PASSAGES,
	STRING_GROUPS,
	ZONE_PASSAGES
} from '$lib/testing/changesPassages';
import type { ExerciseDefinition } from '../types';
import { passageIndexKey, passageIndices, passageMembers } from './indices';

const ids = (members: readonly { id: string }[]) => members.map((member) => member.id);

/**
 * A link tour (frozen against the old rule in `testing/catalogChanges.spec.ts`): the chord's first
 * four shapes on its strings by position, then back down without the highest twice.
 */
function tour(chord: string, strings: readonly StringNumber[]): string[] {
	const up = ids(chordShapes.members({ chord: triadOf(chord), strings }).slice(0, 4));
	return [...up, ...up.slice(0, -1).reverse()];
}

describe('passageIndices', () => {
	it('gives the product of the lists of `of`, the first name outermost', () => {
		expect(passageIndices(LINK_PASSAGES)).toHaveLength(48);
		expect(passageIndices(CLIMB_PASSAGES)).toHaveLength(4);
		expect(passageIndices(ZONE_PASSAGES)).toHaveLength(2);
		expect(passageIndices(JAM_PASSAGES)).toHaveLength(2);
		expect(passageIndices(LINK_PASSAGES).slice(0, 3)).toEqual([
			{ key: 'chord=C;strings=3,2,1', of: { chord: 'C', strings: [3, 2, 1] } },
			{ key: 'chord=C;strings=4,3,2', of: { chord: 'C', strings: [4, 3, 2] } },
			{ key: 'chord=Cm;strings=3,2,1', of: { chord: 'Cm', strings: [3, 2, 1] } }
		]);
		expect(passageIndices(CLIMB_PASSAGES).map((index) => index.key)).toEqual([
			'grid=iohefy-a;strings=3,2,1',
			'grid=iohefy-a;strings=4,3,2',
			'grid=blues-f;strings=3,2,1',
			'grid=blues-f;strings=4,3,2'
		]);
		expect(passageIndices(ZONE_PASSAGES).map((index) => index.key)).toEqual([
			'grid=iohefy-a',
			'grid=blues-f'
		]);
	});

	it('keys an index by its values in the order written, each key distinct', () => {
		expect(passageIndexKey({ strings: [4, 3, 2], chord: 'C#m' })).toBe('strings=4,3,2;chord=C#m');
		expect(passageIndexKey({ n: 3, name: 'x' })).toBe('n=3;name=x');
		const keys = passageIndices(LINK_PASSAGES).map((index) => index.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('gives no index to an exercise that writes no passages', () => {
		const { passages: _passages, ...rest } = JAM_PASSAGES;
		expect(passageIndices(rest as ExerciseDefinition)).toEqual([]);
	});
});

describe('passageMembers', () => {
	it('gives the changes of a grid, in order', () => {
		for (const exercise of [CLIMB_PASSAGES, ZONE_PASSAGES, JAM_PASSAGES]) {
			for (const index of passageIndices(exercise)) {
				const grid = index.of.grid as string;
				const changes = gridChanges(gridById(grid));
				const each = exercise === CLIMB_PASSAGES ? { direction: 'up' } : {};
				expect(ids(passageMembers(exercise, index, each))).toEqual(
					changes.map((_, rank) => `${grid}#${rank}`)
				);
			}
		}
	});

	it('gives a chord’s first four shapes by position on a group, then back down without the highest twice, as the link does', () => {
		const indices = passageIndices(LINK_PASSAGES);
		expect(indices).toHaveLength(LINK_CHORDS.length * STRING_GROUPS.length);
		for (const index of indices) {
			const strings = index.of.strings as StringNumber[];
			expect(ids(passageMembers(LINK_PASSAGES, index, {})), index.key).toEqual(
				tour(index.of.chord as string, strings)
			);
		}
		const [first] = indices;
		expect(passageMembers(LINK_PASSAGES, first, {})).toHaveLength(7);
	});

	it('gives fewer shapes where the neck holds fewer than four, as the link does', () => {
		for (const [chord, strings] of [
			['Ebm', [5, 4, 3]],
			['B', [5, 4, 3]],
			['F#', [6, 5, 4]]
		] as const) {
			const index = { key: `chord=${chord}`, of: { chord, strings } };
			const shapes = tour(chord, strings);
			expect(shapes).toHaveLength(5);
			expect(ids(passageMembers(LINK_PASSAGES, index, {}))).toEqual(shapes);
		}
	});

	it('goes back down without `andBack` only when the exercise writes it', () => {
		const once: ExerciseDefinition = {
			...LINK_PASSAGES,
			passages: {
				...LINK_PASSAGES.passages!,
				members: { family: 'chord-shapes', order: ['position'], take: 4 }
			}
		};
		const [first] = passageIndices(once);
		expect(ids(passageMembers(once, first, {}))).toEqual(
			ids(passageMembers(LINK_PASSAGES, first, {})).slice(0, 4)
		);
	});

	it('reads its params in the exercise’s and in the passage params', () => {
		const taking: ExerciseDefinition = {
			...LINK_PASSAGES,
			params: { shapes: 2 },
			passages: {
				...LINK_PASSAGES.passages!,
				members: {
					family: 'chord-shapes',
					order: ['position'],
					take: { param: 'shapes' },
					where: [{ in: { frets: { param: 'zone' } } }]
				},
				each: { zone: [[0, 24]] }
			}
		};
		const [first] = passageIndices(taking);
		expect(passageMembers(taking, first, { zone: [0, 24] })).toHaveLength(2);
		expect(passageMembers(taking, first, { zone: [20, 24] }).length).toBeLessThan(2);
	});
});
