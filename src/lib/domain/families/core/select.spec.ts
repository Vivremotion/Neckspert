import { describe, expect, it } from 'vitest';
import { admitted, refusedBy, select as selectWith, selectionProblem } from './select';
import type { Family, Filter, Member, Selection } from './types';

/** A member of the test family: one note per string, at a fret. */
interface Spot extends Member {
	notes: readonly { string: number; fret: number }[];
	weight: number;
}

function spot(weight: number, ...notes: [number, number][]): Spot {
	return {
		id: notes.map(([s, f]) => `${s}:${f}`).join(','),
		notes: notes.map(([string, fret]) => ({ string, fret })),
		weight
	};
}

const SPOTS: readonly Spot[] = [
	spot(3, [3, 0], [2, 1]),
	spot(1, [3, 2], [2, 3]),
	spot(2, [3, 5], [2, 5]),
	spot(1, [2, 7], [1, 8]),
	spot(2, [3, 9], [2, 10])
];

const positionOf = (m: Spot) => Math.min(...m.notes.map((n) => n.fret).filter((f) => f > 0));

const FAMILY: Family<null, Spot> = {
	id: 't',
	indexProblem: () => null,
	members: () => [...SPOTS],
	attributes: {
		strings: (m) => m.notes.map((n) => n.string),
		frets: (m) => m.notes.map((n) => n.fret),
		position: positionOf,
		weight: (m) => m.weight
	},
	member: (id) => SPOTS.find((m) => m.id === id) ?? null,
	recognise: () => null,
	answer: () => null,
	confusion: () => null,
	heard: () => null,
	named: () => null
};

/** A family that knows only a weight: no strings, no frets, no position. */
const BARE: Family<null, Spot> = {
	...FAMILY,
	id: 't',
	attributes: { weight: (m) => m.weight }
};

const ids = (members: readonly Member[]) => members.map((m) => m.id);
const select = (selection: Omit<Selection, 'family'>, previous?: Spot | null) =>
	ids(admitted(FAMILY, null, { family: 't', ...selection }, { previous }));

describe('admitted', () => {
	it('admits every member, in the family order, without filter, order or take', () => {
		expect(select({})).toEqual(ids(SPOTS));
	});

	it('keeps the members whose every note is on the strings and the frets of `in`', () => {
		expect(select({ where: [{ in: { strings: [3, 2] } }] })).toEqual([
			'3:0,2:1',
			'3:2,2:3',
			'3:5,2:5',
			'3:9,2:10'
		]);
		expect(select({ where: [{ in: { frets: [2, 6] } }] })).toEqual(['3:2,2:3', '3:5,2:5']);
	});

	it('admits nothing in a zone whose first fret is above the second, open strings included', () => {
		const open = spot(1, [3, 0], [2, 0]);
		const withOpen: Family<null, Spot> = { ...FAMILY, members: () => [...SPOTS, open] };
		const zone = (frets: [number, number]) =>
			admitted(withOpen, null, { family: 't', where: [{ in: { frets } }] });
		expect(ids(zone([1, 0]))).toEqual([]);
		expect(ids(zone([10, 5]))).toEqual([]);
		expect(ids(zone([0, 0]))).toEqual([open.id]);
	});

	it('counts an open string inside a zone that starts at fret 1 only', () => {
		expect(select({ where: [{ in: { frets: [1, 5] } }] })).toEqual([
			'3:0,2:1',
			'3:2,2:3',
			'3:5,2:5'
		]);
		expect(select({ where: [{ in: { frets: [0, 3] } }] })).toEqual(['3:0,2:1', '3:2,2:3']);
		expect(select({ where: [{ in: { frets: [2, 3] } }] })).toEqual(['3:2,2:3']);
	});

	it('keeps the members that cover the fret of `at`, from their lowest to their highest fret', () => {
		expect(select({ where: [{ at: 5 }] })).toEqual(['3:5,2:5']);
		expect(select({ where: [{ at: 0 }] })).toEqual(['3:0,2:1']);
		expect(select({ where: [{ at: 1 }] })).toEqual(['3:0,2:1']);
		expect(select({ where: [{ at: 4 }] })).toEqual([]);
		const gap = spot(0, [3, 5], [2, 5], [1, 3]);
		const withGap = { ...FAMILY, members: () => [gap] };
		expect(ids(admitted(withGap, null, { family: 't', where: [{ at: 4 }] }))).toEqual([gap.id]);
		expect(ids(admitted(withGap, null, { family: 't', where: [{ at: 6 }] }))).toEqual([]);
	});

	it('adds two filters up', () => {
		expect(select({ where: [{ in: { strings: [3, 2] } }, { in: { frets: [4, 12] } }] })).toEqual([
			'3:5,2:5',
			'3:9,2:10'
		]);
	});

	it('keeps what lies beyond the previous one, up or down', () => {
		const previous = SPOTS[2];
		expect(
			select({ where: [{ position: { beyond: 'previous', toward: 'up' } }] }, previous)
		).toEqual(['2:7,1:8', '3:9,2:10']);
		expect(
			select({ where: [{ position: { beyond: 'previous', toward: 'down' } }] }, previous)
		).toEqual(['3:0,2:1', '3:2,2:3']);
	});

	it('admits nothing past the end without `turns`, and turns with it', () => {
		const last = SPOTS[4];
		expect(select({ where: [{ position: { beyond: 'previous', toward: 'up' } }] }, last)).toEqual(
			[]
		);
		expect(
			select({ where: [{ position: { beyond: 'previous', toward: 'up', turns: true } }] }, last)
		).toEqual(['3:0,2:1', '3:2,2:3', '3:5,2:5', '2:7,1:8']);
		const first = SPOTS[0];
		expect(
			select({ where: [{ position: { beyond: 'previous', toward: 'down', turns: true } }] }, first)
		).toEqual(['3:2,2:3', '3:5,2:5', '2:7,1:8', '3:9,2:10']);
	});

	it('does not turn while something lies beyond', () => {
		expect(
			select({ where: [{ position: { beyond: 'previous', toward: 'up', turns: true } }] }, SPOTS[3])
		).toEqual(['3:9,2:10']);
	});

	it('leaves out the previous member with `other`', () => {
		expect(select({ where: [{ other: 'previous' }] }, SPOTS[1])).toEqual([
			'3:0,2:1',
			'3:5,2:5',
			'2:7,1:8',
			'3:9,2:10'
		]);
	});

	it('keeps the only member when `other` would leave none, in either order', () => {
		expect(select({ where: [{ at: 5 }, { other: 'previous' }] }, SPOTS[2])).toEqual(['3:5,2:5']);
		expect(select({ where: [{ other: 'previous' }, { at: 5 }] }, SPOTS[2])).toEqual(['3:5,2:5']);
	});

	it('reads the previous member as itself, even when this index does not give it', () => {
		const elsewhere = spot(0, [3, 4], [2, 4]);
		expect(
			select({ where: [{ position: { beyond: 'previous', toward: 'up' } }] }, elsewhere)
		).toEqual(['3:5,2:5', '2:7,1:8', '3:9,2:10']);
		expect(select({ where: [{ other: 'previous' }] }, elsewhere)).toEqual(ids(SPOTS));
	});

	it('gives the same members whatever order the filters are written in', () => {
		const filters: readonly Filter[] = [
			{ in: { frets: [1, 5] } },
			{ in: { strings: [3, 2] } },
			{ at: 5 },
			{ at: 9 },
			{ position: { beyond: 'previous', toward: 'up' } },
			{ position: { beyond: 'previous', toward: 'up', turns: true } },
			{ position: { beyond: 'previous', toward: 'down', turns: true } },
			{ other: 'previous' }
		];
		let compared = 0;
		for (const a of filters) {
			for (const b of filters) {
				for (const previous of [null, ...SPOTS]) {
					expect(select({ where: [a, b] }, previous), JSON.stringify([a, b, previous?.id])).toEqual(
						select({ where: [b, a] }, previous)
					);
					compared++;
				}
			}
		}
		expect(compared).toBe(filters.length ** 2 * (SPOTS.length + 1));
	});

	it('turns on what `in` and `at` left, written before or after', () => {
		const where = (first: boolean): Filter[] => {
			const turn: Filter = { position: { beyond: 'previous', toward: 'up', turns: true } };
			const zone: Filter = { in: { frets: [1, 5] } };
			return first ? [turn, zone] : [zone, turn];
		};
		for (const first of [true, false]) {
			expect(select({ where: where(first) }, SPOTS[2])).toEqual(['3:0,2:1', '3:2,2:3']);
		}
	});

	it('refuses a filter it does not know', () => {
		expect(() =>
			admitted(FAMILY, null, { family: 't', where: [{ near: 3 } as unknown as Filter] })
		).toThrow('unknown filter');
	});

	it('restricts nothing by the previous one when there is none', () => {
		const where = [
			{ position: { beyond: 'previous', toward: 'up' } } as const,
			{ other: 'previous' } as const
		];
		expect(select({ where })).toEqual(ids(SPOTS));
		expect(select({ where }, null)).toEqual(ids(SPOTS));
	});

	it('orders by the attributes named, in turn, rising; a list by its smallest element', () => {
		expect(select({ order: ['weight', 'position'] })).toEqual([
			'3:2,2:3',
			'2:7,1:8',
			'3:5,2:5',
			'3:9,2:10',
			'3:0,2:1'
		]);
		expect(select({ order: ['strings', 'frets'] })).toEqual([
			'2:7,1:8',
			'3:0,2:1',
			'3:2,2:3',
			'3:5,2:5',
			'3:9,2:10'
		]);
	});

	it('takes the first n', () => {
		expect(select({ order: ['weight'], take: 2 })).toEqual(['3:2,2:3', '2:7,1:8']);
		expect(select({ take: 0 })).toEqual([]);
	});
});

describe('select', () => {
	const run = (where: readonly Filter[], previous: Spot | null) =>
		selectWith(FAMILY, null, { family: 't', where }, { previous });
	const up = (turns?: boolean): Filter => ({
		position: { beyond: 'previous', toward: 'up', ...(turns && { turns }) }
	});

	it('admits what `admitted` admits', () => {
		for (const previous of [null, ...SPOTS]) {
			for (const where of [[], [up(true)], [{ in: { frets: [1, 5] } }, up(true)]] as Filter[][]) {
				expect(ids(run(where, previous).admitted)).toEqual(
					ids(admitted(FAMILY, null, { family: 't', where }, { previous }))
				);
			}
		}
	});

	it('tells it turned only when a `position` with `turns` found nothing beyond', () => {
		expect(run([up(true)], SPOTS[4]).turned).toBe(true);
		expect(run([up(true)], SPOTS[3]).turned).toBe(false);
		expect(run([up()], SPOTS[4]).turned).toBe(false);
		expect(run([up(true)], null).turned).toBe(false);
		expect(run([{ other: 'previous' }], SPOTS[4]).turned).toBe(false);
		// Turned on what the zone left: nothing above fret 5 in it.
		expect(run([up(true), { in: { frets: [1, 5] } }], SPOTS[2]).turned).toBe(true);
	});
});

describe('refusedBy', () => {
	const refused = (where: readonly Filter[], member: Spot, previous: Spot | null = null) =>
		refusedBy(FAMILY, null, { family: 't', where }, member, { previous });
	const zone: Filter = { in: { frets: [1, 5] } };
	const strings: Filter = { in: { strings: [3, 2] } };
	const at: Filter = { at: 9 };
	const up: Filter = { position: { beyond: 'previous', toward: 'up' } };
	const down: Filter = { position: { beyond: 'previous', toward: 'down' } };
	const other: Filter = { other: 'previous' };

	it('gives null for an admitted member, and for one that is no member of the index', () => {
		expect(refused([zone], SPOTS[1])).toBeNull();
		expect(refused([], SPOTS[0])).toBeNull();
		expect(refused([zone], spot(0, [3, 9], [2, 9]))).toBeNull();
	});

	it('names the `in` or `at` filter that leaves the member out, in written order', () => {
		expect(refused([zone], SPOTS[4])).toBe(zone);
		expect(refused([strings, zone], SPOTS[3])).toBe(strings);
		expect(refused([zone, strings], SPOTS[3])).toBe(zone);
		expect(refused([zone, at], SPOTS[4])).toBe(zone);
		expect(refused([at, zone], SPOTS[2])).toBe(at);
	});

	it('names `in` and `at` before `position`, whatever the order written', () => {
		expect(refused([up, zone], SPOTS[4], SPOTS[4])).toBe(zone);
		expect(refused([up, zone], SPOTS[1], SPOTS[2])).toBe(up);
	});

	it('names the first `position` that leaves the member out, in written order', () => {
		expect(refused([up], SPOTS[0], SPOTS[2])).toBe(up);
		expect(refused([down, up], SPOTS[3], SPOTS[2])).toBe(down);
		expect(refused([up, down], SPOTS[3], SPOTS[2])).toBe(down);
		expect(refused([up], SPOTS[0], null)).toBeNull();
	});

	it('names a `position` that turned as it was applied, the other way', () => {
		const turning: Filter = { position: { beyond: 'previous', toward: 'up', turns: true } };
		expect(refused([turning], SPOTS[3], SPOTS[4])).toBeNull();
		expect(refused([turning], SPOTS[4], SPOTS[4])).toEqual({
			position: { beyond: 'previous', toward: 'down', turns: true }
		});
		expect(refused([turning], SPOTS[4], SPOTS[2])).toBeNull();
		expect(refused([turning], SPOTS[0], SPOTS[2])).toBe(turning);
	});

	it('names `other` for the previous member, unless nothing else is left, as `admitted` does', () => {
		expect(refused([other], SPOTS[1], SPOTS[1])).toBe(other);
		expect(refused([{ at: 5 }, other], SPOTS[2], SPOTS[2])).toBeNull();
		expect(refused([other, zone], SPOTS[4], SPOTS[4])).toBe(zone);
	});

	it('agrees with `admitted` on every member, filters and previous', () => {
		const filters: readonly Filter[] = [zone, strings, { at: 5 }, at, up, down, other];
		const turning: Filter = { position: { beyond: 'previous', toward: 'up', turns: true } };
		let compared = 0;
		for (const a of [...filters, turning]) {
			for (const b of [...filters, turning]) {
				for (const previous of [null, ...SPOTS]) {
					const where = [a, b];
					const kept = new Set(ids(admitted(FAMILY, null, { family: 't', where }, { previous })));
					for (const member of SPOTS) {
						expect(
							refused(where, member, previous) === null,
							JSON.stringify([where, member.id, previous?.id])
						).toBe(kept.has(member.id));
						compared++;
					}
				}
			}
		}
		expect(compared).toBe(8 * 8 * 6 * 5);
	});
});

describe('selectionProblem', () => {
	it('accepts a selection the family can run', () => {
		expect(
			selectionProblem(FAMILY, {
				family: 't',
				where: [
					{ in: { frets: [1, 5] } },
					{ at: 3 },
					{ position: { beyond: 'previous', toward: 'up' } },
					{ other: 'previous' }
				],
				order: ['weight', 'position'],
				take: 3
			})
		).toBeNull();
		expect(selectionProblem(BARE, { family: 't', where: [{ other: 'previous' }] })).toBeNull();
	});

	it('names an attribute the family does not have', () => {
		expect(selectionProblem(FAMILY, { family: 't', order: ['x'] })).toBe(
			'order names attribute "x", which family "t" does not have'
		);
	});

	it('refuses frets whose bounds are inverted', () => {
		expect(selectionProblem(FAMILY, { family: 't', where: [{ in: { frets: [5, 1] } }] })).toBe(
			'filter "in" has frets [5, 1]: the first is above the second'
		);
		expect(
			selectionProblem(FAMILY, { family: 't', where: [{ in: { frets: [5, 5] } }] })
		).toBeNull();
	});

	it('names the attributes a filter needs', () => {
		expect(selectionProblem(BARE, { family: 't', where: [{ in: { strings: [1] } }] })).toBe(
			'filter "in" needs the attributes strings and frets, which family "t" does not have'
		);
		expect(selectionProblem(BARE, { family: 't', where: [{ at: 1 }] })).toBe(
			'filter "at" needs the attributes strings and frets, which family "t" does not have'
		);
		expect(
			selectionProblem(BARE, {
				family: 't',
				where: [{ position: { beyond: 'previous', toward: 'up' } }]
			})
		).toBe('filter "position" needs the attribute position, which family "t" does not have');
	});
});
