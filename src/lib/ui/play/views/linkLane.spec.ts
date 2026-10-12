import { describe, expect, it } from 'vitest';
import type { LinkLaneModel } from '$lib/application/mechanics/chordGrid';
import { LANE_BARS_AFTER, LANE_BARS_BEFORE, linkLaneLayout } from './linkLane';

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
		aid: null
	};
}

const placed = (layout: ReturnType<typeof linkLaneLayout>) =>
	layout.tiles.map((t) => [t.symbol, t.state, t.offset]);

describe('linkLaneLayout', () => {
	it('shows LANE_BARS_BEFORE bars past and LANE_BARS_AFTER to come', () => {
		expect([LANE_BARS_BEFORE, LANE_BARS_AFTER]).toEqual([2, 4]);
	});

	it('moves bar by bar: the bar under way ends on the bar line, the next starts there', () => {
		// The passage starts on beat 0; change 2 falls on beat 8. Beats 8 to 11: the same places.
		for (const nowBeat of [8, 9.5, 10.99]) {
			expect(placed(linkLaneLayout(model(2), { anchorBeat: 8, nowBeat, history: [] }))).toEqual([
				['root', 'past', -3],
				['up', 'past', -2],
				['up', 'now', -1],
				['up', 'next', 0],
				['down', 'later', 1],
				['down', 'later', 2],
				['down', 'later', 3]
			]);
		}
	});

	it('counts the beat of the bar over the tile right of the bar line', () => {
		const at = (nowBeat: number) =>
			linkLaneLayout(model(2), { anchorBeat: 8, nowBeat, history: [] });
		expect(at(9).beat).toBe(2);
		expect(at(9).tiles.find((t) => t.labelled)?.offset).toBe(0);
		// Beat 4 of bar 1: change 2 is asked already, still right of the line.
		expect(at(7.2).beat).toBe(4);
		expect(at(7.2).tiles.find((t) => t.labelled)).toMatchObject({ state: 'now', offset: 0 });
	});

	it('draws the next tour after the last bar, as if the tour went on', () => {
		const layout = linkLaneLayout(model(6), { anchorBeat: 24, nowBeat: 25, history: [] });
		expect(placed(layout).slice(-4)).toEqual([
			['up', 'next', 0],
			['up', 'later', 1],
			['up', 'later', 2],
			['down', 'later', 3]
		]);
	});

	it('carries the verdicts of the changes played', () => {
		const { tiles } = linkLaneLayout(model(2), {
			anchorBeat: 8,
			nowBeat: 9,
			history: [
				{ beatIndex: 4, verdict: 'perfect' },
				{ beatIndex: 8, verdict: 'late' }
			]
		});
		expect(tiles.filter((t) => t.verdict).map((t) => [t.state, t.verdict])).toEqual([
			['past', 'perfect'],
			['now', 'late']
		]);
	});

	it('puts the first change right of the line during the counted bar', () => {
		const { tiles, beat } = linkLaneLayout(model(0), { anchorBeat: 40, nowBeat: 38, history: [] });
		expect(tiles[0]).toMatchObject({ symbol: 'root', state: 'now', offset: 0, labelled: true });
		expect(beat).toBe(3);
	});

	it('draws earlier bars from the history, one tile per bar, without a symbol', () => {
		const { tiles } = linkLaneLayout(model(0), {
			anchorBeat: 40,
			nowBeat: 40.5,
			history: [
				{ beatIndex: 32, verdict: 'wrong' },
				{ beatIndex: 34, verdict: 'late' },
				{ beatIndex: 36, verdict: 'perfect' },
				{ beatIndex: 0, verdict: 'perfect' }
			]
		});
		expect(tiles.filter((t) => t.symbol === null).map((t) => [t.offset, t.verdict])).toEqual([
			[-3, 'late'],
			[-2, 'perfect']
		]);
	});

	it('places nothing in time without an anchor', () => {
		const { tiles, beat } = linkLaneLayout(model(0), { anchorBeat: null, nowBeat: 3, history: [] });
		expect(tiles[0]).toMatchObject({ state: 'now', offset: 0 });
		expect(beat).toBeNull();
	});
});
