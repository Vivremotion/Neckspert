import { describe, expect, it } from 'vitest';
import type { Attempt, CardState, PlannedItem } from '$lib/domain/types';
import { createListSource } from './selector';

const CONTEXT = { now: 0, elapsedMs: 0, fatigued: false };

function item(pitch: 'F' | 'G'): PlannedItem {
	return {
		exerciseId: 'locate-neck',
		mechanic: 'locate',
		exerciseLevel: 0,
		item: { string: 6, pitch },
		phase: 'free',
		temperature: 'hot',
		aid: 'none',
		leadBeats: 2
	};
}

describe('createListSource', () => {
	it('serves a fixed list in order', () => {
		const source = createListSource([item('F'), item('G')]);
		expect(source.next(CONTEXT)).toEqual(item('F'));
		expect(source.next(CONTEXT)).toEqual(item('G'));
		expect(source.next(CONTEXT)).toBeNull();
	});

	it('learns nothing from attempts', () => {
		const source = createListSource([item('F')]);
		expect(source.record({} as Attempt, 0)).toBeNull();
		expect(() => source.cardChanged({} as CardState)).not.toThrow();
	});
});
