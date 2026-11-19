import { describe, expect, it } from 'vitest';
import type { PassageStageModel } from '$lib/application/presentation/passageStage';
import type { LaneEntry } from '$lib/application/session/contract';
import { LANE_BEATS_AFTER, LANE_BEATS_BEFORE, linkLaneLayout } from './linkLane';

/** A tour of D: a bar each, four shapes up then three down. */
const ROUNDS = [null, 'up', 'up', 'up', 'down', 'down', 'down'].map((way, i) => ({
	at: i * 4,
	length: 4,
	label: 'D',
	way: way as 'up' | 'down' | null
}));

/** Round `index` of the tour, its target on `anchorBeat` (null before its round opens). */
function model(
	index: number,
	place: { anchorBeat?: number | null; history?: LaneEntry[] } = {}
): Pick<PassageStageModel, 'rounds' | 'index' | 'beatsPerBar' | 'anchorBeat' | 'history'> {
	return {
		rounds: ROUNDS,
		index,
		beatsPerBar: 4,
		anchorBeat: place.anchorBeat ?? null,
		history: place.history ?? []
	};
}

/** Beat, symbol, due, label of each tile. */
const row = (tiles: ReturnType<typeof linkLaneLayout>) =>
	tiles.map((t) => [t.beatIndex, t.symbol, t.due, t.label]);

describe('linkLaneLayout', () => {
	it('shows the beats of the notes lane: LANE_BEATS_BEFORE past, LANE_BEATS_AFTER ahead', () => {
		expect([LANE_BEATS_BEFORE, LANE_BEATS_AFTER]).toEqual([4, 8]);
	});

	it('draws one tile per beat, the way only on the first beat of each bar, the change asked due', () => {
		// The passage starts on beat 0; change 2 falls on beat 8; it is beat 9.
		const tiles = linkLaneLayout(model(2, { anchorBeat: 8 }), { nowBeat: 9.4 });
		expect(row(tiles)).toEqual([
			[6, null, false, null],
			[7, null, false, null],
			[8, '↗', true, null],
			[9, null, false, null],
			[10, null, false, 3],
			[11, null, false, 4],
			[12, '↗', false, 1],
			[13, null, false, 2],
			[14, null, false, 3],
			[15, null, false, 4],
			[16, '↘', false, 1],
			[17, null, false, 2]
		]);
		expect(tiles.filter((t) => t.offset <= 0).map((t) => t.beatIndex)).toEqual([6, 7, 8, 9]);
	});

	it('draws nothing after the last bar: a tour never chains to the next', () => {
		const tiles = linkLaneLayout(model(6, { anchorBeat: 24 }), { nowBeat: 25 });
		expect(tiles.filter((t) => t.symbol).map((t) => [t.beatIndex, t.symbol, t.due])).toEqual([
			[24, '↘', true]
		]);
	});

	it('writes the words of a round that goes neither up nor down', () => {
		const rounds = ROUNDS.map((round, i) => (i === 1 ? { ...round, way: 'same' as const } : round));
		const tiles = linkLaneLayout({ ...model(0, { anchorBeat: 0 }), rounds }, { nowBeat: 0.5 });
		expect(tiles.filter((t) => t.symbol).map((t) => [t.beatIndex, t.symbol])).toEqual([
			[0, 'D'],
			[4, 'D'],
			[8, '↗']
		]);
	});

	it('carries the verdicts played, the latest one marked', () => {
		const history: LaneEntry[] = [
			{ beatIndex: 4, verdict: 'perfect' },
			{ beatIndex: 8, verdict: 'late' }
		];
		const tiles = linkLaneLayout(model(2, { anchorBeat: 8, history }), { nowBeat: 9 });
		expect(
			tiles.filter((t) => t.verdict).map((t) => [t.beatIndex, t.verdict, t.justPlayed])
		).toEqual([[8, 'late', true]]);
	});

	it('puts the first change ahead during the counted bar, counting to it', () => {
		// Its round not open yet: the change falls where the count ends.
		const tiles = linkLaneLayout(model(0), { nowBeat: 37.5, countedBeat: 40 });
		expect(tiles.find((t) => t.symbol === 'D')).toMatchObject({ beatIndex: 40, due: true });
		expect(tiles.filter((t) => t.beatIndex >= 38 && t.beatIndex <= 40).map((t) => t.label)).toEqual(
			[3, 4, 1]
		);
	});

	it('places the change on its own target once its round is open, whatever the count', () => {
		const tiles = linkLaneLayout(model(0, { anchorBeat: 40 }), { nowBeat: 39.5, countedBeat: 44 });
		expect(tiles.find((t) => t.symbol === 'D')).toMatchObject({ beatIndex: 40, due: true });
	});

	it('hides the verdicts while nothing is anchored', () => {
		const history: LaneEntry[] = [{ beatIndex: 2, verdict: 'perfect' }];
		const tiles = linkLaneLayout(model(0, { history }), { nowBeat: 3.2 });
		expect(tiles.some((t) => t.verdict)).toBe(false);
	});

	it('waits without an anchor: the first change next, nothing counted', () => {
		const tiles = linkLaneLayout(model(0), { nowBeat: 3.2 });
		expect(tiles.find((t) => t.symbol === 'D')).toMatchObject({ beatIndex: 4, due: true });
		expect(tiles.every((t) => t.label === null)).toBe(true);
	});
});
