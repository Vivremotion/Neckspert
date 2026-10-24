import { describe, expect, it } from 'vitest';
import type { LinkLaneModel } from '$lib/application/mechanics/chordGrid';
import { LANE_BEATS_AFTER, LANE_BEATS_BEFORE, linkLaneLayout } from './linkLane';

const CHANGES = [0, 4, 8, 12, 16, 20, 24].map((at) => ({ at, length: 4, symbol: 'D' }));

function model(index: number): LinkLaneModel {
	return {
		kind: 'link-lane',
		root: 'D',
		quality: 'majeur',
		set: 'sol · si · mi',
		strings: [],
		tiles: ['root', 'up', 'up', 'up', 'down', 'down', 'down'],
		following: ['up', 'up', 'up', 'down', 'down', 'down'],
		changes: CHANGES,
		index,
		beatsPerBar: 4,
		aid: null,
		anchorBeat: null,
		history: []
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
		const tiles = linkLaneLayout(model(2), { anchorBeat: 8, nowBeat: 9.4, history: [] });
		expect(row(tiles)).toEqual([
			[6, null, false, null],
			[7, null, false, null],
			[8, 'up', true, null],
			[9, null, false, null],
			[10, null, false, 3],
			[11, null, false, 4],
			[12, 'up', false, 1],
			[13, null, false, 2],
			[14, null, false, 3],
			[15, null, false, 4],
			[16, 'down', false, 1],
			[17, null, false, 2]
		]);
		expect(tiles.filter((t) => t.offset <= 0).map((t) => t.beatIndex)).toEqual([6, 7, 8, 9]);
	});

	it('draws the next tour after the last bar, as if the tour went on', () => {
		const tiles = linkLaneLayout(model(6), { anchorBeat: 24, nowBeat: 25, history: [] });
		expect(tiles.filter((t) => t.symbol).map((t) => [t.beatIndex, t.symbol, t.due])).toEqual([
			[24, 'down', true],
			[28, 'up', false],
			[32, 'up', false]
		]);
	});

	it('carries the verdicts played, the latest one marked', () => {
		const tiles = linkLaneLayout(model(2), {
			anchorBeat: 8,
			nowBeat: 9,
			history: [
				{ beatIndex: 4, verdict: 'perfect' },
				{ beatIndex: 8, verdict: 'late' }
			]
		});
		expect(
			tiles.filter((t) => t.verdict).map((t) => [t.beatIndex, t.verdict, t.justPlayed])
		).toEqual([[8, 'late', true]]);
	});

	it('puts the first change ahead during the counted bar, counting to it', () => {
		const tiles = linkLaneLayout(model(0), { anchorBeat: 40, nowBeat: 37.5, history: [] });
		expect(tiles.find((t) => t.symbol === 'root')).toMatchObject({ beatIndex: 40, due: true });
		expect(tiles.filter((t) => t.beatIndex >= 38 && t.beatIndex <= 40).map((t) => t.label)).toEqual(
			[3, 4, 1]
		);
	});

	it('waits without an anchor: the first change next, nothing counted', () => {
		const tiles = linkLaneLayout(model(0), { anchorBeat: null, nowBeat: 3.2, history: [] });
		expect(tiles.find((t) => t.symbol === 'root')).toMatchObject({ beatIndex: 4, due: true });
		expect(tiles.every((t) => t.label === null)).toBe(true);
	});
});
