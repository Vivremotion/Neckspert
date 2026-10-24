import { describe, expect, it } from 'vitest';
import { asNeckCard, neckCardKey, type NeckCard } from '$lib/domain/music';
import { FREE_PLAY_COUNT } from './constants';
import { introduceCard } from './cards';
import { keyed } from './neck';
import { buildFreePlan } from './plans';

const NOW = Date.parse('2026-05-01T12:00:00.000Z');

const L1: NeckCard = { mechanic: 'locate', item: { string: 6, pitch: 'G' } };
const L2: NeckCard = { mechanic: 'locate', item: { string: 6, pitch: 'A' } };

describe('buildFreePlan', () => {
	it('draws from every position, including ones with no card yet', () => {
		const known = introduceCard(keyed(L1), NOW, 's0');
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
		expect(plan.filter((item) => item.mechanic === 'identify')).toHaveLength(66);
		const keyOf = (item: (typeof plan)[number]) => neckCardKey(asNeckCard(item));
		expect(plan.find((item) => keyOf(item) === neckCardKey(L1))?.leadBeats).toBe(2);
		expect(plan.find((item) => keyOf(item) === neckCardKey(L2))?.leadBeats).toBe(8);
		expect(plan.find((item) => item.mechanic === 'identify')?.leadBeats).toBeNull();
		expect(plan.find((item) => item.mechanic === 'locate')?.exerciseId).toBe('locate-neck');
		expect(plan.find((item) => item.mechanic === 'identify')?.exerciseId).toBe('identify-neck');
	});

	it('plays one series of the free-play length by default', () => {
		const capped = buildFreePlan({
			cards: [],
			random: () => 0
		});
		expect(capped).toHaveLength(FREE_PLAY_COUNT);
	});
});
