import { describe, expect, it } from 'vitest';
import type { PromptStageModel } from '$lib/application/presentation';
import { bandSpan, type LaneTile } from '../lane';
import { laneViewTiles } from './laneView';
import { presented, stageModel } from './testing/promptStage';

const PROMPT = presented({ primary: 'F', secondary: 'corde de B', preview: 'corde de B' });

/** A note prompted on beat 8 for beat 16, after a few rounds played. */
function model(overrides: Partial<PromptStageModel> = {}): PromptStageModel {
	return stageModel({
		prompt: PROMPT,
		anchorBeat: 16,
		promptBeat: 8,
		history: [
			{ beatIndex: 4, verdict: 'perfect' },
			{ beatIndex: 6, verdict: 'early' },
			{ beatIndex: 10, verdict: 'late' }
		],
		...overrides
	});
}

function byIndex(tiles: LaneTile[]): Map<number, LaneTile> {
	return new Map(tiles.map((t) => [t.beatIndex, t]));
}

describe('laneViewTiles', () => {
	it('places the current beat as the first tile right of the hit line', () => {
		const tiles = laneViewTiles(model(), { nowBeat: 10.25 });
		const current = tiles.filter((t) => t.current);
		expect(current.map((t) => t.beatIndex)).toEqual([11]);
		expect(current[0].offset).toBeGreaterThan(0);
	});

	it('shows one bar behind and holds the target ahead', () => {
		const tiles = laneViewTiles(model(), { nowBeat: 10.25 });
		expect(tiles[0].beatIndex).toBe(7);
		expect(tiles.map((t) => t.beatIndex)).toContain(16);
	});

	it('puts the target on the anchor beat and the rounds played before on theirs', () => {
		const map = byIndex(laneViewTiles(model(), { nowBeat: 10.25 }));
		expect(map.get(16)?.kind).toBe('target');
		expect(map.get(10)?.kind).toBe('history');
		expect(map.get(10)?.verdict).toBe('late');
		expect(map.get(11)?.kind).toBe('empty');
	});

	it('marks the latest round played at or left of the line', () => {
		const tiles = laneViewTiles(model(), { nowBeat: 10.25 });
		expect(tiles.filter((t) => t.justPlayed).map((t) => t.beatIndex)).toEqual([10]);
	});

	it('marks the downbeats', () => {
		const map = byIndex(laneViewTiles(model(), { nowBeat: 10.25 }));
		expect([8, 12, 16].map((i) => map.get(i)?.downbeat)).toEqual([true, true, true]);
		expect([9, 10, 11].map((i) => map.get(i)?.downbeat)).toEqual([false, false, false]);
	});

	it('marks the downbeats of bars of the model’s meter', () => {
		const map = byIndex(laneViewTiles(model({ beatsPerBar: 3 }), { nowBeat: 10.25 }));
		expect([9, 12, 15].map((i) => map.get(i)?.downbeat)).toEqual([true, true, true]);
		expect([8, 10, 11].map((i) => map.get(i)?.downbeat)).toEqual([false, false, false]);
	});

	it('holds a far target as soon as it is announced', () => {
		const tiles = laneViewTiles(model({ promptBeat: 16, anchorBeat: 24, history: [] }), {
			nowBeat: 16
		});
		expect(tiles.some((t) => t.kind === 'target' && t.beatIndex === 24)).toBe(true);
	});

	it('keeps two bars ahead with a short lead', () => {
		const tiles = laneViewTiles(model({ promptBeat: 20, anchorBeat: 24, history: [] }), {
			nowBeat: 22
		});
		expect(tiles.filter((t) => t.offset > 0)).toHaveLength(8);
	});

	it('draws no target while the note waits for its round', () => {
		const tiles = laneViewTiles(model({ anchorBeat: null, promptBeat: null }), { nowBeat: 13 });
		expect(tiles.some((t) => t.kind === 'target')).toBe(false);
		expect(tiles.find((t) => t.beatIndex === 10)?.verdict).toBe('late');
	});

	it('puts the target on its beat and the band on the beats after it', () => {
		const map = byIndex(
			laneViewTiles(model({ bands: [{ fromBeat: 17, untilBeat: 20 }] }), { nowBeat: 10.25 })
		);
		expect(map.get(16)?.kind).toBe('target');
		expect([17, 18, 19].map((i) => map.get(i)?.kind)).toEqual(['band', 'band', 'band']);
		expect(map.get(17)?.bandEdge).toBe('start');
		expect(map.get(19)?.bandEdge).toBe('end');
		expect(map.get(20)?.kind).toBe('empty');
	});

	it('draws every stretch as its own band, and holds the last on the lane', () => {
		const tiles = laneViewTiles(
			model({
				bands: [
					{ fromBeat: 17, untilBeat: 19 },
					{ fromBeat: 19, untilBeat: 21 },
					{ fromBeat: 30, untilBeat: 32 }
				]
			}),
			{ nowBeat: 10.25 }
		);
		const map = byIndex(tiles);
		expect([17, 18, 19, 20].map((i) => map.get(i)?.bandEdge)).toEqual([
			'start',
			'end',
			'start',
			'end'
		]);
		expect([30, 31].map((i) => map.get(i)?.kind)).toEqual(['band', 'band']);
		expect(map.get(21)?.kind).toBe('empty');
		// The band's name runs across the first stretch only.
		expect(bandSpan(tiles)).toEqual({
			start: tiles.findIndex((t) => t.beatIndex === 17),
			cells: 2
		});
	});

	it('holds the whole band on the lane, however far it ends', () => {
		const tiles = laneViewTiles(
			model({
				anchorBeat: 24,
				promptBeat: 16,
				history: [],
				bands: [{ fromBeat: 25, untilBeat: 32 }]
			}),
			{ nowBeat: 16 }
		);
		expect(tiles.map((t) => t.beatIndex)).toContain(31);
	});

	it('shows no target while the item waits', () => {
		const tiles = laneViewTiles(
			model({ anchorBeat: null, promptBeat: null, bands: [{ fromBeat: 17, untilBeat: 20 }] }),
			{ nowBeat: 13 }
		);
		expect(tiles.some((t) => t.kind === 'target' || t.kind === 'band')).toBe(false);
	});
});
