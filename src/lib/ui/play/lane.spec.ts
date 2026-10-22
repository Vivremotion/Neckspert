import { describe, expect, it } from 'vitest';
import { bandSpan, justPlayedBack, laneTiles, laneWindow, type LaneTile } from './lane';

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

	it('marks downbeats', () => {
		const map = byIndex(laneTiles({ ...base, nowBeat: 1.5, beatsBefore: 4, beatsAfter: 12 }));
		for (const i of [0, 4, 8]) expect(map.get(i)?.downbeat).toBe(true);
		for (const i of [1, 2, 3, 5, 6, 7, 9]) expect(map.get(i)?.downbeat).toBe(false);
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

describe('laneWindow', () => {
	const none = { beatsPerBar: 4, targetBeatIndex: null, followUp: null };

	it('shows one bar behind and two ahead without a target', () => {
		expect(laneWindow({ ...none, nowBeat: 10.25 })).toEqual({ beatsBefore: 4, beatsAfter: 8 });
	});

	it('holds the target as soon as it is announced', () => {
		const w = laneWindow({ ...none, nowBeat: 16, targetBeatIndex: 24 });
		expect(w.beatsAfter).toBeGreaterThanOrEqual(9);
		const tiles = laneTiles({
			...base,
			nowBeat: 16,
			promptBeatIndex: 8,
			targetBeatIndex: 24,
			history: [],
			...w
		});
		expect(tiles.some((t) => t.kind === 'target')).toBe(true);
	});

	it('keeps two bars ahead with a short lead', () => {
		expect(laneWindow({ ...none, nowBeat: 22, targetBeatIndex: 24 }).beatsAfter).toBe(8);
	});

	it('holds a whole band', () => {
		const w = laneWindow({
			...none,
			nowBeat: 20,
			targetBeatIndex: 24,
			followUp: { fromBeat: 25, untilBeat: 36 }
		});
		const tiles = laneTiles({
			...base,
			nowBeat: 20,
			targetBeatIndex: 24,
			followUp: { fromBeat: 25, untilBeat: 36 },
			history: [],
			...w
		});
		expect(tiles[tiles.length - 1].beatIndex).toBeGreaterThanOrEqual(35);
	});
});

describe('justPlayedBack', () => {
	const tiles = (nowBeat: number, played: number) =>
		laneTiles({
			...base,
			nowBeat,
			history: [{ beatIndex: played, verdict: 'late' as const }]
		});

	it('puts the cell just played right before the now line on its beat', () => {
		expect(justPlayedBack(tiles(14, 14))).toBe(0);
	});

	it('counts the cells it slid back through the breathing bar, to the leftmost', () => {
		expect(justPlayedBack(tiles(15.5, 14))).toBe(1);
		expect(justPlayedBack(tiles(17, 14))).toBe(3);
	});

	it('gives nothing once the cell has left the lane', () => {
		expect(justPlayedBack(tiles(18, 14))).toBeNull();
	});
});

describe('bandSpan', () => {
	const tiles = (nowBeat: number) =>
		laneTiles({
			...base,
			nowBeat,
			history: [],
			followUp: { fromBeat: 17, untilBeat: 20 },
			beatsAfter: 12
		});

	it('starts at the first band cell, after the target, and spans the band', () => {
		const lane = tiles(12);
		const span = bandSpan(lane)!;
		expect(lane[span.start - 1].kind).toBe('target');
		expect(span).toEqual({ start: 8, cells: 3 });
	});

	it('keeps to the cells still on the lane once the band slides out on the left', () => {
		expect(bandSpan(tiles(21.5))).toEqual({ start: 0, cells: 2 });
	});

	it('gives nothing without a band', () => {
		expect(bandSpan(laneTiles({ ...base, nowBeat: 12 }))).toBeNull();
	});
});
