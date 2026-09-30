import {
	createEmptyCard,
	fsrs,
	generatorParameters,
	Rating,
	type Card,
	type Grade
} from 'ts-fsrs';
import type { SchedulingState } from '$lib/domain/types';
import { MIN_COLD_DELAY_MS } from './constants';

const scheduler = fsrs(
	generatorParameters({
		enable_fuzz: false,
		relearning_steps: ['1h']
	})
);

export { Rating };

export function toScheduling(card: Card): SchedulingState {
	return {
		due: card.due.getTime(),
		stability: card.stability,
		difficulty: card.difficulty,
		elapsedDays: card.elapsed_days,
		scheduledDays: card.scheduled_days,
		learningSteps: card.learning_steps,
		reps: card.reps,
		lapses: card.lapses,
		state: card.state as SchedulingState['state'],
		lastReview: card.last_review ? card.last_review.getTime() : null
	};
}

export function fromScheduling(state: SchedulingState): Card {
	return {
		due: new Date(state.due),
		stability: state.stability,
		difficulty: state.difficulty,
		elapsed_days: state.elapsedDays,
		scheduled_days: state.scheduledDays,
		learning_steps: state.learningSteps,
		reps: state.reps,
		lapses: state.lapses,
		state: state.state,
		last_review: state.lastReview === null ? undefined : new Date(state.lastReview)
	};
}

/** New card whose first cold review is due after MIN_COLD_DELAY_MS. */
export function introScheduling(now: number): SchedulingState {
	const card = createEmptyCard(new Date(now));
	const state = toScheduling(card);
	return { ...state, due: now + MIN_COLD_DELAY_MS };
}

/** Placement shortcut: one internal Easy grade to enter Review immediately. */
export function graduateToReview(now: number): SchedulingState {
	const empty = createEmptyCard(new Date(now));
	const { card } = scheduler.next(empty, new Date(now), Rating.Easy);
	return toScheduling(card);
}

export function reviewScheduling(
	state: SchedulingState,
	grade: Grade,
	now: number
): SchedulingState {
	const { card } = scheduler.next(fromScheduling(state), new Date(now), grade);
	return toScheduling(card);
}
