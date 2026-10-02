import { describe, expect, it } from 'vitest';
import { cardKey, type CardState, type LocateTarget, type Target } from '$lib/domain/types';
import { FREE_PLAY_COUNT, MIN_COLD_DELAY_MS } from './constants';
import { introduceCard } from './cards';
import { buildFreePlan, buildPlacementPlan } from './plans';

const NOW = Date.parse('2026-05-01T12:00:00.000Z');

const L1: Target = { direction: 'locate', string: 6, pitch: 'G' };
const L2: Target = { direction: 'locate', string: 6, pitch: 'A' };

function dueCard(target: Target, due: number, session = 's0'): CardState {
	const card = introduceCard(target, due - MIN_COLD_DELAY_MS, session);
	return { ...card, scheduling: { ...card.scheduling, due } };
}

describe('buildPlacementPlan', () => {
	it('plans every target cold, unaided, at the threshold lead, shuffled', () => {
		const targets: LocateTarget[] = [
			{ direction: 'locate', string: 6, pitch: 'E' },
			{ direction: 'locate', string: 6, pitch: 'F' },
			{ direction: 'locate', string: 5, pitch: 'A' }
		];
		const seq = [0.9, 0.1, 0.5];
		let i = 0;
		const plan = buildPlacementPlan({
			targets,
			tempoBpm: 80,
			random: () => seq[i++] ?? 0
		});
		expect(plan).toHaveLength(3);
		expect(plan.every((item) => item.phase === 'placement')).toBe(true);
		expect(plan.every((item) => item.temperature === 'cold')).toBe(true);
		expect(plan.every((item) => item.aid === 'none')).toBe(true);
		expect(plan.every((item) => item.leadBeats === 2)).toBe(true);
		expect(new Set(plan.map((item) => JSON.stringify(item.target))).size).toBe(3);
	});
});

describe('buildFreePlan', () => {
	it('draws from every position, including ones with no card yet', () => {
		const known = introduceCard(L1, NOW, 's0');
		known.leadBeats = 2;
		const plan = buildFreePlan({
			cards: [known],
			count: 1000,
			random: () => 0
		});

		expect(plan).toHaveLength(132);
		expect(plan.every((item) => item.phase === 'free')).toBe(true);
		expect(plan.every((item) => item.temperature === 'hot')).toBe(true);
		expect(plan.every((item) => item.aid === 'none')).toBe(true);
		expect(plan.filter((item) => item.target.direction === 'identify')).toHaveLength(66);
		expect(plan.find((item) => cardKey(item.target) === cardKey(L1))?.leadBeats).toBe(2);
		expect(plan.find((item) => cardKey(item.target) === cardKey(L2))?.leadBeats).toBe(8);
		expect(plan.find((item) => item.target.direction === 'identify')?.leadBeats).toBeNull();
	});

	it('plays one series of the free-play length by default', () => {
		const capped = buildFreePlan({
			cards: [],
			random: () => 0
		});
		expect(capped).toHaveLength(FREE_PLAY_COUNT);
	});
});
