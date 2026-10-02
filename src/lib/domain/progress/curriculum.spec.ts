import { describe, expect, it } from 'vitest';
import { cardKey, type CardState, type Curriculum, type Target } from '$lib/domain/types';
import { introduceCard } from './cards';
import { nextNewTargets, unlockedSets } from './curriculum';

const T1: Target = { direction: 'locate', string: 6, pitch: 'G' };
const T2: Target = { direction: 'locate', string: 6, pitch: 'A' };
const T3: Target = { direction: 'locate', string: 6, pitch: 'B' };
const T4: Target = { direction: 'locate', string: 6, pitch: 'E' };
const T5: Target = { direction: 'identify', string: 6, fret: 3 };

const FIXTURE: Curriculum = [
	{ id: 'locate-s6-a', direction: 'locate', requires: null, targets: [T1, T2, T3] },
	{ id: 'identify-s6-a', direction: 'identify', requires: 'locate-s6-a', targets: [T5] },
	{ id: 'locate-s6-b', direction: 'locate', requires: 'locate-s6-a', targets: [T4] }
];

function acquired(target: Target, now = 1): CardState {
	return { ...introduceCard(target, now, 's0'), acquiredAt: now };
}

describe('unlockedSets', () => {
	it('always unlocks sets with requires null', () => {
		expect(unlockedSets(FIXTURE, []).map((set) => set.id)).toEqual(['locate-s6-a']);
	});

	it('unlocks dependents at 80 % acquired of the required set', () => {
		// 2/3 ≈ 0.666 < 0.8
		expect(unlockedSets(FIXTURE, [acquired(T1), acquired(T2)]).map((set) => set.id)).toEqual([
			'locate-s6-a'
		]);
		// 3/3 = 1 ≥ 0.8
		const open = unlockedSets(FIXTURE, [acquired(T1), acquired(T2), acquired(T3)]);
		expect(open.map((set) => set.id)).toEqual(['locate-s6-a', 'identify-s6-a', 'locate-s6-b']);
	});
});

describe('nextNewTargets', () => {
	it('walks unlocked sets in order and skips existing cards', () => {
		const cards = [introduceCard(T1, 1, 's0')];
		expect(nextNewTargets(FIXTURE, cards, 2)).toEqual([T2, T3]);
	});

	it('does not reach locked sets', () => {
		expect(nextNewTargets(FIXTURE, [], 10)).toEqual([T1, T2, T3]);
	});

	it('offers identify targets once their locate set is acquired', () => {
		const cards = [acquired(T1), acquired(T2), acquired(T3)];
		expect(nextNewTargets(FIXTURE, cards, 2).map((t) => cardKey(t))).toEqual([
			cardKey(T5),
			cardKey(T4)
		]);
	});
});
