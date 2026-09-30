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
