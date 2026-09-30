import { describe, expect, it } from 'vitest';
import type {
	CardState,
	Curriculum,
	LocateTarget,
	Target
} from '$lib/domain/types';
import { DAILY_COLD_CAP, MIN_COLD_DELAY_MS, NEW_PER_SESSION } from './constants';
import { introduceCard } from './cards';
import {
	buildDailyPlan,
	buildFreePlan,
	buildPlacementPlan,
	nextSuggestedAt
} from './plans';

const NOW = Date.parse('2026-05-01T12:00:00.000Z');

const L1: Target = { direction: 'locate', string: 6, pitch: 'G' };
const L2: Target = { direction: 'locate', string: 6, pitch: 'A' };
const L3: Target = { direction: 'locate', string: 6, pitch: 'B' };
const L4: Target = { direction: 'locate', string: 6, pitch: 'E' };
const I1: Target = { direction: 'identify', string: 6, fret: 3 };

const FIXTURE: Curriculum = [
	{ id: 'locate-s6-a', direction: 'locate', requires: null, targets: [L1, L2, L3] },
	{ id: 'identify-s6-a', direction: 'identify', requires: 'locate-s6-a', targets: [I1] },
	{ id: 'locate-s6-b', direction: 'locate', requires: 'locate-s6-a', targets: [L4] }
];

function dueCard(target: Target, due: number, session = 's0'): CardState {
	const card = introduceCard(target, due - MIN_COLD_DELAY_MS, session);
	return { ...card, scheduling: { ...card.scheduling, due } };
}

describe('buildDailyPlan', () => {
	it('puts locate before identify when dues are equal, then learning', () => {
		// L1 and I1 due at the same time → locate first. L2 already introduced. L3 unseen → learning.
		const plan = buildDailyPlan({
			cards: [
				dueCard(L1, NOW - 500),
				dueCard(I1, NOW - 500),
				introduceCard(L2, NOW - MIN_COLD_DELAY_MS * 2, 'old')
			],
			curriculum: FIXTURE,
			now: NOW,
			sessionId: 'daily-1'
		});

		expect(plan.kind).toBe('daily');
		expect(plan.id).toBe('daily-1');
		expect(plan.items[0]).toMatchObject({
			target: L1,
			phase: 'review',
			temperature: 'cold',
			aid: 'none',
			repeatUntilCorrect: false,
			leadBeats: 8
		});
		expect(plan.items[1]).toMatchObject({
			target: I1,
			phase: 'review',
			temperature: 'cold',
			leadBeats: null
		});
		const learning = plan.items.filter((item) => item.phase === 'learning');
		expect(learning.length).toBeLessThanOrEqual(NEW_PER_SESSION);
		expect(learning[0]).toMatchObject({
			target: L3,
			phase: 'learning',
			temperature: 'hot',
			aid: 'show-position',
			leadBeats: 8,
			repeatUntilCorrect: true
		});
	});

	it('skips learning when asked and caps cold reviews', () => {
		const many = Array.from({ length: DAILY_COLD_CAP + 5 }, (_, i) => {
			const pitch = (['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const)[
				i % 12
			];
			const string = ((i % 6) + 1) as 1 | 2 | 3 | 4 | 5 | 6;
			return dueCard(
				{ direction: 'locate', string, pitch },
				NOW - (DAILY_COLD_CAP + 5 - i)
			);
		});
		const plan = buildDailyPlan({
			cards: many,
			curriculum: FIXTURE,
			now: NOW,
			sessionId: 'daily-2',
			skipLearning: true
		});
		expect(plan.items).toHaveLength(DAILY_COLD_CAP);
		expect(plan.items.every((item) => item.phase === 'review')).toBe(true);
	});
});

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
			now: NOW,
			sessionId: 'place-1',
			tempoBpm: 80,
			random: () => seq[i++] ?? 0
		});
		expect(plan.kind).toBe('placement');
		expect(plan.items).toHaveLength(3);
		expect(plan.items.every((item) => item.phase === 'placement')).toBe(true);
		expect(plan.items.every((item) => item.temperature === 'cold')).toBe(true);
		expect(plan.items.every((item) => item.aid === 'none')).toBe(true);
		expect(plan.items.every((item) => item.leadBeats === 2)).toBe(true);
		expect(plan.items.every((item) => item.repeatUntilCorrect === false)).toBe(true);
		expect(new Set(plan.items.map((item) => JSON.stringify(item.target))).size).toBe(3);
	});
});

describe('buildFreePlan', () => {
	it('samples existing cards as hot free items', () => {
		const cards = [introduceCard(L1, NOW, 's0'), introduceCard(I1, NOW, 's0')];
		const plan = buildFreePlan({
			cards,
			now: NOW,
			sessionId: 'free-1',
			count: 2,
			random: () => 0
		});
		expect(plan.kind).toBe('free');
		expect(plan.items).toHaveLength(2);
		expect(plan.items.every((item) => item.phase === 'free')).toBe(true);
		expect(plan.items.every((item) => item.temperature === 'hot')).toBe(true);
		const identify = plan.items.find((item) => item.target.direction === 'identify');
		expect(identify?.leadBeats).toBeNull();
	});
});

describe('nextSuggestedAt', () => {
	it('returns the earliest due, or null without cards', () => {
		expect(nextSuggestedAt([], NOW)).toBeNull();
		const cards = [dueCard(L1, NOW + 5000), dueCard(L2, NOW + 1000)];
		expect(nextSuggestedAt(cards, NOW)).toBe(NOW + 1000);
	});
});
