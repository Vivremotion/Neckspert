import { describe, expect, it } from 'vitest';
import type { NoteLaneModel } from '$lib/application/mechanics/locate';
import type { LaneTile } from '../lane';
import { noteLaneTiles } from './noteLane';

const PROMPT = { primary: 'F', secondary: 'corde de B', aid: null, diagram: null };

/** A note prompted on beat 8 for beat 16, after a few rounds played. */
function model(overrides: Partial<NoteLaneModel> = {}): NoteLaneModel {
	return {
		prompt: PROMPT,
		anchorBeat: 16,
		promptBeat: 8,
		history: [
			{ beatIndex: 4, verdict: 'perfect' },
			{ beatIndex: 6, verdict: 'early' },
			{ beatIndex: 10, verdict: 'late' }
		],
		verdict: null,
		...overrides
	};
}

function byIndex(tiles: LaneTile[]): Map<number, LaneTile> {
	return new Map(tiles.map((t) => [t.beatIndex, t]));
}

describe('noteLaneTiles', () => {
	it('places the current beat as the first tile right of the hit line', () => {
		const tiles = noteLaneTiles(model(), { nowBeat: 10.25 });
		const current = tiles.filter((t) => t.current);
		expect(current.map((t) => t.beatIndex)).toEqual([11]);
		expect(current[0].offset).toBeGreaterThan(0);
	});

	it('shows one bar behind and holds the target ahead', () => {
		const tiles = noteLaneTiles(model(), { nowBeat: 10.25 });
		expect(tiles[0].beatIndex).toBe(7);
		expect(tiles.map((t) => t.beatIndex)).toContain(16);
	});

	it('puts the target on the anchor beat and the rounds played before on theirs', () => {
		const map = byIndex(noteLaneTiles(model(), { nowBeat: 10.25 }));
		expect(map.get(16)?.kind).toBe('target');
		expect(map.get(10)?.kind).toBe('history');
		expect(map.get(10)?.verdict).toBe('late');
		expect(map.get(11)?.kind).toBe('empty');
	});

	it('marks the latest round played at or left of the line', () => {
		const tiles = noteLaneTiles(model(), { nowBeat: 10.25 });
		expect(tiles.filter((t) => t.justPlayed).map((t) => t.beatIndex)).toEqual([10]);
	});

	it('marks the downbeats', () => {
		const map = byIndex(noteLaneTiles(model(), { nowBeat: 10.25 }));
		expect([8, 12, 16].map((i) => map.get(i)?.downbeat)).toEqual([true, true, true]);
		expect([9, 10, 11].map((i) => map.get(i)?.downbeat)).toEqual([false, false, false]);
	});

	it('holds a far target as soon as it is announced', () => {
		const tiles = noteLaneTiles(model({ promptBeat: 16, anchorBeat: 24, history: [] }), {
			nowBeat: 16
		});
		expect(tiles.some((t) => t.kind === 'target' && t.beatIndex === 24)).toBe(true);
	});

	it('keeps two bars ahead with a short lead', () => {
		const tiles = noteLaneTiles(model({ promptBeat: 20, anchorBeat: 24, history: [] }), {
			nowBeat: 22
		});
		expect(tiles.filter((t) => t.offset > 0)).toHaveLength(8);
	});

	it('draws no target while the note waits for its round', () => {
		const tiles = noteLaneTiles(model({ anchorBeat: null, promptBeat: null }), { nowBeat: 13 });
		expect(tiles.some((t) => t.kind === 'target')).toBe(false);
		expect(tiles.find((t) => t.beatIndex === 10)?.verdict).toBe('late');
	});
});
