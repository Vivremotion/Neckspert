import { describe, expect, it } from 'vitest';
import { admitted } from '../core/select';
import { gridChangesFamily as GRID_CHANGES, type GridChangeMember } from './gridChanges';

const sources = import.meta.glob('/src/lib/domain/families/music/**/*.ts', {
	query: '?raw',
	import: 'default',
	eager: true
}) as Record<string, string>;

const row = (member: GridChangeMember) =>
	[member.id, member.rank, member.at, member.length, member.symbol] as const;

describe('grid-changes members', () => {
	it('gives the changes of a grid in order, keyed by grid and rank, with their place and length', () => {
		expect(GRID_CHANGES.members({ grid: 'iohefy-a' }).map(row)).toEqual([
			['iohefy-a#0', 0, 0, 4, 'Dm7'],
			['iohefy-a#1', 1, 4, 4, 'G7'],
			['iohefy-a#2', 2, 8, 4, 'Dm7'],
			['iohefy-a#3', 3, 12, 4, 'G7'],
			['iohefy-a#4', 4, 16, 6, 'Cmaj7'],
			['iohefy-a#5', 5, 22, 2, 'F7'],
			['iohefy-a#6', 6, 24, 4, 'Em7'],
			['iohefy-a#7', 7, 28, 2, 'Ebm7'],
			['iohefy-a#8', 8, 30, 2, 'Ab7']
		]);
		expect(GRID_CHANGES.members({ grid: 'blues-f' }).map(row)).toEqual([
			['blues-f#0', 0, 0, 4, 'F7'],
			['blues-f#1', 1, 4, 4, 'Bb7'],
			['blues-f#2', 2, 8, 8, 'F7'],
			['blues-f#3', 3, 16, 8, 'Bb7'],
			['blues-f#4', 4, 24, 8, 'F7'],
			['blues-f#5', 5, 32, 4, 'C7'],
			['blues-f#6', 6, 36, 4, 'Bb7'],
			['blues-f#7', 7, 40, 4, 'F7'],
			['blues-f#8', 8, 44, 4, 'C7']
		]);
	});

	it('refuses an unknown grid, and gives it no member', () => {
		expect(GRID_CHANGES.indexProblem({ grid: 'iohefy-a' })).toBeNull();
		expect(GRID_CHANGES.indexProblem({ grid: 'nowhere' })).toBe(
			'grid-changes: unknown grid "nowhere"'
		);
		expect(GRID_CHANGES.members({ grid: 'nowhere' })).toEqual([]);
		for (const index of [null, {}, { grid: 3 }, 'iohefy-a']) {
			expect(GRID_CHANGES.indexProblem(index), JSON.stringify(index)).toBe(
				'grid-changes reads a grid { grid }'
			);
			expect(GRID_CHANGES.members(index as never)).toEqual([]);
		}
	});

	it('gives a change back from its id; null for an unknown grid or rank', () => {
		for (const grid of ['iohefy-a', 'blues-f']) {
			for (const change of GRID_CHANGES.members({ grid })) {
				expect(GRID_CHANGES.member(change.id)).toEqual(change);
			}
		}
		for (const id of ['iohefy-a#9', 'iohefy-a#-1', 'iohefy-a#1.5', 'nowhere#0', 'iohefy-a', '#0']) {
			expect(GRID_CHANGES.member(id), id).toBeNull();
		}
	});

	it('compares its changes by rank, place and length', () => {
		const members = GRID_CHANGES.members({ grid: 'blues-f' });
		expect(members.map((m) => GRID_CHANGES.attributes.rank(m))).toEqual([
			0, 1, 2, 3, 4, 5, 6, 7, 8
		]);
		expect(GRID_CHANGES.attributes.at(members[2])).toBe(8);
		expect(GRID_CHANGES.attributes.length(members[2])).toBe(8);
		const longest = admitted(
			GRID_CHANGES,
			{ grid: 'blues-f' },
			{ family: 'grid-changes', order: ['length', 'rank'], take: 3 }
		);
		expect(longest.map((m) => m.id)).toEqual(['blues-f#0', 'blues-f#1', 'blues-f#5']);
	});

	it('is never judged: it recognises nothing, keeps no answer, tells no confusion', () => {
		const members = GRID_CHANGES.members({ grid: 'iohefy-a' });
		expect(GRID_CHANGES.recognise(members, { decided: members[0].id })).toBeNull();
		expect(GRID_CHANGES.heard({ grid: 'iohefy-a' }, { decided: members[0].id })).toBeNull();
		expect(GRID_CHANGES.answer({ decided: members[0].id })).toBeNull();
		expect(GRID_CHANGES.confusion({ grid: 'iohefy-a' }, members, {}, null)).toBeNull();
	});

	it('is music: it names no guitar family and no voicing', () => {
		const offenders = Object.entries(sources)
			.filter(([path]) => !path.endsWith('.spec.ts'))
			.filter(([, text]) => /guitar|domain\/music|domain\/triads|domain\/sets/.test(text))
			.map(([path]) => path);
		expect(Object.keys(sources)).toContain('/src/lib/domain/families/music/gridChanges.ts');
		expect(offenders).toEqual([]);
	});
});
