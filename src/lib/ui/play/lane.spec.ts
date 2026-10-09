import { describe, expect, it } from 'vitest';
import { laneTiles, type LaneTile } from './lane';

const base = {
	beatsPerBar: 4 as const,
	promptBeatIndex: 8,
	targetBeatIndex: 16,
	beatsBefore: 4,
	beatsAfter: 8,
	history: [
		{ beatIndex: 4, verdict: 'perfect' as const },
		{ beatIndex: 5, verdict: 'perfect' as const },
		{ beatIndex: 6, verdict: 'early' as const },
		{ beatIndex: 7, verdict: 'wrong' as const },
		{ beatIndex: 10, verdict: 'late' as const }
	]
};

function byIndex(tiles: LaneTile[]): Map<number, LaneTile> {
	return new Map(tiles.map((t) => [t.beatIndex, t]));
}

describe('laneTiles', () => {
	it('places the current beat as the first tile right of the hit line', () => {
		const tiles = laneTiles({ ...base, nowBeat: 10.25 });
		const current = tiles.find((t) => t.current);
		expect(current?.beatIndex).toBe(11);
		expect(current!.offset).toBeGreaterThan(0);
		expect(tiles.filter((t) => t.current)).toHaveLength(1);
	});

	it('marks the latest history tile at or left of the line as justPlayed', () => {
		const tiles = laneTiles({ ...base, nowBeat: 10.25 });
		const just = tiles.find((t) => t.justPlayed);
		expect(just?.beatIndex).toBe(10);
		expect(just!.offset).toBeLessThanOrEqual(0);
		expect(just!.verdict).toBe('late');
		expect(tiles.filter((t) => t.justPlayed)).toHaveLength(1);
	});

	it('numbers only the eight upcoming beats 1–4 cycling; past and far tiles stay unlabeled', () => {
		const tiles = laneTiles({ ...base, nowBeat: 10.25 });
		const upcoming = tiles.filter((t) => t.offset > 0);
		expect(upcoming).toHaveLength(8);
		expect(upcoming.map((t) => t.label)).toEqual([4, 1, 2, 3, 4, 1, 2, 3]);
		expect(tiles.filter((t) => t.offset <= 0).every((t) => t.label === null)).toBe(true);
		expect(tiles.every((t) => t.label === null || (t.label >= 1 && t.label <= 4))).toBe(true);
	});

	it('exposes beatsBefore past slots and beatsAfter upcoming slots', () => {
		const tiles = laneTiles({ ...base, nowBeat: 10.25 });
		expect(tiles.map((t) => t.beatIndex)).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
		expect(tiles).toHaveLength(12);
	});

	it('tags the target beat and history kinds', () => {
		const map = byIndex(laneTiles({ ...base, nowBeat: 10.25 }));
		expect(map.get(16)?.kind).toBe('target');
		expect(map.get(10)?.kind).toBe('history');
		expect(map.get(11)?.kind).toBe('empty');
		expect(map.get(11)?.current).toBe(true);
	});

	it('has no justPlayed when no history has crossed the line', () => {
		const tiles = laneTiles({
			...base,
			nowBeat: 3.1,
			history: [{ beatIndex: 8, verdict: 'perfect' }],
			targetBeatIndex: 8,
			promptBeatIndex: 0
		});
		expect(tiles.every((t) => !t.justPlayed)).toBe(true);
		expect(tiles.find((t) => t.current)?.beatIndex).toBe(4);
	});

	it('draws a follow-up span after the target as one band, with its ends marked', () => {
		const map = byIndex(
			laneTiles({
				...base,
				nowBeat: 10.25,
				followUp: { fromBeat: 17, untilBeat: 20 },
				beatsAfter: 12
			})
		);
		expect(map.get(16)?.kind).toBe('target');
		expect([17, 18, 19].map((i) => map.get(i)?.kind)).toEqual(['band', 'band', 'band']);
		expect([17, 18, 19].map((i) => map.get(i)?.bandEdge)).toEqual(['start', null, 'end']);
		expect(map.get(20)?.kind).toBe('empty');
		expect(map.get(20)?.bandEdge).toBeNull();
	});

	it('keeps a played verdict over the band', () => {
		const map = byIndex(
			laneTiles({
				...base,
				nowBeat: 10.25,
				followUp: { fromBeat: 9, untilBeat: 12 },
				history: [{ beatIndex: 10, verdict: 'late' }]
			})
		);
		expect(map.get(10)?.kind).toBe('history');
		expect(map.get(11)?.kind).toBe('band');
	});
});
