import { describe, expect, it } from 'vitest';
import type { Attempt, PlannedItem } from '$lib/domain/types';
import { createListSelector } from './selector';

const CONTEXT = { now: 0, elapsedMs: 0, fatigued: false };

function item(pitch: 'F' | 'G'): PlannedItem {
	return {
		target: { direction: 'locate', string: 6, pitch },
		phase: 'free',
		temperature: 'hot',
		aid: 'none',
		leadBeats: 2
	};
}

describe('createListSelector', () => {
	it('serves the items in order, then null', () => {
		const selector = createListSelector([item('F'), item('G')]);
		expect(selector.next(CONTEXT)).toEqual(item('F'));
		expect(selector.next(CONTEXT)).toEqual(item('G'));
		expect(selector.next(CONTEXT)).toBeNull();
	});

	it('learns nothing from attempts', () => {
		const selector = createListSelector([item('F')]);
		expect(selector.record({} as Attempt, 0)).toBeNull();
	});
});
