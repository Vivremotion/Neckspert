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
		changes: CHANGES,
		index,
		beatsPerBar: 4,
		aid: null
	};
}

describe('linkLaneLayout', () => {
	it('shows LANE_BARS_BEFORE bars past and LANE_BARS_AFTER to come', () => {
		expect([LANE_BARS_BEFORE, LANE_BARS_AFTER]).toEqual([2, 4]);
	});

	it('places each change by its bar, the one asked on the bar', () => {
		// The passage starts on beat 0; change 2 falls on beat 8, and it is beat 9.
		const { tiles } = linkLaneLayout(model(2), { anchorBeat: 8, nowBeat: 9, history: [] });
		const by = (symbol: string, state: string) =>
			tiles.find((t) => t.symbol === symbol && t.state === state);
		expect(tiles.map((t) => [t.symbol, t.state, t.offset])).toEqual([
			['root', 'past', -2.25],
			['up', 'past', -1.25],
			['up', 'now', -0.25],
			['up', 'next', 0.75],
			['down', 'later', 1.75],
			['down', 'later', 2.75],
			['down', 'later', 3.75]
		]);
		expect(by('up', 'now')).toBeTruthy();
	});

	it('counts the beat of the bar over the first tile still to reach the bar', () => {
		const at = (nowBeat: number) =>
			linkLaneLayout(model(2), { anchorBeat: 8, nowBeat, history: [] });
		expect(at(9).beat).toBe(2);
		expect(at(9).tiles.find((t) => t.labelled)?.state).toBe('next');
		expect(at(7.2).beat).toBe(4);
		expect(at(7.2).tiles.find((t) => t.labelled)?.state).toBe('now');
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

	it('places the tiles on the count before the passage', () => {
		const { tiles, beat } = linkLaneLayout(model(0), { anchorBeat: 40, nowBeat: 38, history: [] });
		expect(tiles[0]).toMatchObject({ symbol: 'root', state: 'now', offset: 0.5 });
		expect(beat).toBe(3);
	});

	it('draws earlier bars from the history, without a symbol', () => {
		const { tiles } = linkLaneLayout(model(0), {
			anchorBeat: 40,
			nowBeat: 40.5,
			history: [
				{ beatIndex: 32, verdict: 'wrong' },
				{ beatIndex: 36, verdict: 'perfect' },
				{ beatIndex: 0, verdict: 'perfect' }
			]
		});
		expect(tiles.filter((t) => t.symbol === null).map((t) => [t.offset, t.verdict])).toEqual([
			[-2.125, 'wrong'],
			[-1.125, 'perfect']
		]);
	});

	it('places nothing in time without an anchor', () => {
		const { tiles, beat } = linkLaneLayout(model(0), { anchorBeat: null, nowBeat: 3, history: [] });
		expect(tiles[0]).toMatchObject({ state: 'now', offset: 0 });
		expect(beat).toBeNull();
	});
});
