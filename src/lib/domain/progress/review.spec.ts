import { describe, expect, it } from 'vitest';
import { cardKey, type Attempt, type CardState, type Target } from '$lib/domain/types';
import { introduceCard, markLearned } from './cards';
import { MIN_COLD_DELAY_MS } from './constants';
import { lastAttemptByCard, nextReviewAt, reviewableAt, reviewableCards } from './review';

const NOW = Date.parse('2026-10-02T10:00:00.000Z');
const G: Target = { direction: 'locate', string: 6, pitch: 'G' };
const A: Target = { direction: 'locate', string: 6, pitch: 'A' };
const I: Target = { direction: 'identify', string: 6, fret: 3 };

function learned(target: Target, due: number): CardState {
	const card = markLearned(introduceCard(target, NOW - 10 * MIN_COLD_DELAY_MS, 's0'), NOW, 80);
	return { ...card, scheduling: { ...card.scheduling, due } };
}

function attemptOn(target: Target, promptedAt: number, phase: Attempt['phase']): Attempt {
	return {
		sessionId: 's-free',
		cardKey: cardKey(target),
		target,
		phase,
		temperature: 'hot',
		aid: 'none',
		leadBeats: 2,
		promptedAt,
		answer: null,
		correct: false,
		verdict: 'wrong',
		timingOffsetMs: null,
		reactionMs: null,
		confusion: null
	};
}

describe('lastAttemptByCard', () => {
	it('keeps the latest prompt time of each card, whatever the phase', () => {
		const last = lastAttemptByCard([
			attemptOn(G, NOW - 5000, 'review'),
			attemptOn(G, NOW - 1000, 'free'),
			attemptOn(A, NOW - 3000, 'learning')
		]);
		expect(last.get(cardKey(G))).toBe(NOW - 1000);
		expect(last.get(cardKey(A))).toBe(NOW - 3000);
	});
});

describe('reviewableAt', () => {
	it('waits for the cold delay after a recent free-play attempt on a due card', () => {
		const card = learned(G, NOW - 1000);
		const last = NOW - 10 * 60 * 1000;
		expect(reviewableAt(card, last)).toBe(last + MIN_COLD_DELAY_MS);
		expect(reviewableCards([card], lastAttemptByCard([attemptOn(G, last, 'free')]), NOW)).toEqual(
			[]
		);
	});

	it('is null for a card still being learned', () => {
		const card = { ...introduceCard(G, NOW - MIN_COLD_DELAY_MS * 2, 's0') };
		expect(reviewableAt(card, undefined)).toBeNull();
		expect(reviewableCards([card], new Map(), NOW)).toEqual([]);
	});

	it('is the due time when the card was not played recently', () => {
		expect(reviewableAt(learned(G, NOW + 5000), undefined)).toBe(NOW + 5000);
	});
});

describe('reviewableCards', () => {
	it('sorts by due time, then locate before identify, then key', () => {
		const cards = [learned(I, NOW - 500), learned(A, NOW - 500), learned(G, NOW - 900)];
		expect(reviewableCards(cards, new Map(), NOW).map((card) => card.key)).toEqual([
			'locate:6:G',
			'locate:6:A',
			'identify:6:3'
		]);
	});
});

describe('nextReviewAt', () => {
	it('is the earliest reviewable time of the learned cards', () => {
		const cards = [learned(G, NOW + 9000), learned(A, NOW + 4000)];
		const last = lastAttemptByCard([attemptOn(A, NOW, 'free')]);
		expect(nextReviewAt(cards, last)).toBe(NOW + 9000);
	});

	it('is null without a learned card', () => {
		expect(nextReviewAt([introduceCard(G, NOW, 's0')], new Map())).toBeNull();
	});
});
