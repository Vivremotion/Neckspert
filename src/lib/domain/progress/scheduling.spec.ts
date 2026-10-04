import { describe, expect, it } from 'vitest';
import { Rating, State } from 'ts-fsrs';
import { MIN_COLD_DELAY_MS } from './constants';
import {
	fromScheduling,
	graduateToReview,
	introScheduling,
	reviewScheduling,
	toScheduling
} from './scheduling';

const NOW = Date.parse('2026-03-01T12:00:00.000Z');

describe('introScheduling', () => {
	it('starts in New with due after the cold delay', () => {
		const state = introScheduling(NOW);
		expect(state.state).toBe(State.New);
		expect(state.due).toBe(NOW + MIN_COLD_DELAY_MS);
		expect(state.reps).toBe(0);
		expect(state.lastReview).toBeNull();
	});
});

describe('graduateToReview', () => {
	it('lands in Review via an internal Easy grade', () => {
		const state = graduateToReview(NOW);
		expect(state.state).toBe(State.Review);
		expect(state.reps).toBe(1);
		expect(state.due).toBeGreaterThan(NOW);
	});
});

describe('reviewScheduling', () => {
	it('graduates a new card to Review on its first Good, with no learning steps', () => {
		const good = reviewScheduling(introScheduling(NOW), Rating.Good, NOW + MIN_COLD_DELAY_MS);
		expect(good.state).toBe(State.Review);
		expect(good.due - (NOW + MIN_COLD_DELAY_MS)).toBeGreaterThanOrEqual(24 * 60 * 60 * 1000);
	});

	it('moves a card stuck in Learning to Review on the next Good', () => {
		const stuck = {
			...introScheduling(NOW),
			state: State.Learning as 1,
			difficulty: 9.8,
			stability: 0.2,
			learningSteps: 1,
			reps: 10,
			lastReview: NOW - 24 * 60 * 60 * 1000,
			due: NOW
		};
		expect(reviewScheduling(stuck, Rating.Good, NOW).state).toBe(State.Review);
	});

	it('sends a missed Review card into Relearning due about one hour later', () => {
		const review = graduateToReview(NOW);
		const missed = reviewScheduling(review, Rating.Again, NOW + 8 * 24 * 60 * 60 * 1000);
		expect(missed.state).toBe(State.Relearning);
		expect(missed.lapses).toBe(1);
		expect(missed.due - (NOW + 8 * 24 * 60 * 60 * 1000)).toBe(60 * 60 * 1000);
	});

	it('round-trips through fromScheduling / toScheduling', () => {
		const state = graduateToReview(NOW);
		expect(toScheduling(fromScheduling(state))).toEqual(state);
	});
});
