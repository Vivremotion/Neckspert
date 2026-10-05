import { describe, expect, it } from 'vitest';
import { neckCardKey, type NeckCard } from '$lib/domain/music';
import type { Attempt, CardState } from '$lib/domain/types';
import { introduceCard, markLearned } from './cards';
import { MIN_COLD_DELAY_MS } from './constants';
import { keyed, neckExerciseId, neckTiming } from './neck';
import { lastAttemptByCard, nextReviewAt, reviewableAt, reviewableCards } from './review';

const NOW = Date.parse('2026-10-02T10:00:00.000Z');
const G: NeckCard = { mechanic: 'locate', item: { string: 6, pitch: 'G' } };
const A: NeckCard = { mechanic: 'locate', item: { string: 6, pitch: 'A' } };
const I: NeckCard = { mechanic: 'identify', item: { string: 6, fret: 3 } };

function introduced(card: NeckCard, now: number): CardState {
	return introduceCard(keyed(card), now, 's0', neckTiming(card.mechanic));
}

function learned(card: NeckCard, due: number): CardState {
	const timing = neckTiming(card.mechanic);
	const state = markLearned(introduced(card, NOW - 10 * MIN_COLD_DELAY_MS), NOW, timing, 80);
	return { ...state, scheduling: { ...state.scheduling, due } };
}

/** An unanswered hot attempt on `card`, at 80 bpm. */
function attemptOn(card: NeckCard, promptedAt: number, phase: Attempt['phase']): Attempt {
	return {
		sessionId: 's-free',
		exerciseId: neckExerciseId(card.mechanic),
		mechanic: card.mechanic,
		cardKey: neckCardKey(card),
		phase,
		temperature: 'hot',
		aid: 'none',
		promptedAt,
		tempoBpm: 80,
		leadBeats: 2,
		timingOffsetMs: null,
		reactionMs: null,
		correct: false,
		verdict: 'wrong',
		data: { item: card.item, answer: null, confusion: null }
	};
}

describe('lastAttemptByCard', () => {
	it('keeps the latest prompt time of each card, whatever the phase', () => {
		const last = lastAttemptByCard([
			attemptOn(G, NOW - 5000, 'review'),
			attemptOn(G, NOW - 1000, 'free'),
			attemptOn(A, NOW - 3000, 'learning')
		]);
		expect(last.get(neckCardKey(G))).toBe(NOW - 1000);
		expect(last.get(neckCardKey(A))).toBe(NOW - 3000);
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
		const card = { ...introduced(G, NOW - MIN_COLD_DELAY_MS * 2) };
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
		expect(nextReviewAt([introduced(G, NOW)], new Map())).toBeNull();
	});
});
