import { describe, expect, it } from 'vitest';
import { ARPEGGIO_EXERCISE } from '$lib/testing/arpeggioExercise';
import { GESTURE_ZONE, LOCATE_NECK } from '$lib/testing/catalog';
import {
	CheckBudget,
	CheckBudgetExceeded,
	compiledExtra,
	MAX_FILE_CHECK_COST,
	roundCheckWeight
} from './checkCost';
import type { RoundTemplate } from './round/types';

describe('roundCheckWeight', () => {
	it('weighs a round 1, plus each expectation, plus the filters of each selection', () => {
		// One expectation, a selection without filters.
		expect(roundCheckWeight(LOCATE_NECK.round)).toBe(2);
		// One expectation, a selection of one filter.
		expect(roundCheckWeight(GESTURE_ZONE.round)).toBe(3);
		const [expectation] = LOCATE_NECK.round!.expectations;
		const round: RoundTemplate = {
			...LOCATE_NECK.round!,
			expectations: [
				{
					...expectation,
					content: {
						family: 'note-places',
						where: [{ in: { frets: [0, 5] } }, { in: { frets: [0, 7] } }]
					}
				},
				{ ...expectation, content: { from: 'name-of-item' } },
				{ ...expectation, content: null }
			]
		};
		expect(roundCheckWeight(round)).toBe(1 + 3 + 2);
	});

	it('weighs a figure entry as one expectation, its notes charged once compiled', () => {
		expect(roundCheckWeight(ARPEGGIO_EXERCISE.round)).toBe(2);
		expect(compiledExtra(ARPEGGIO_EXERCISE.round, 8)).toBe(7);
		expect(compiledExtra(LOCATE_NECK.round, 1)).toBe(0);
	});

	it('weighs what it cannot read as a round of nothing', () => {
		expect(roundCheckWeight(undefined)).toBe(1);
		expect(roundCheckWeight({ expectations: 'x' } as unknown as RoundTemplate)).toBe(1);
	});
});

describe('CheckBudget', () => {
	it('charges up to its most, then refuses in words, the cost reached and the most named', () => {
		const budget = new CheckBudget(10);
		budget.charge(6);
		budget.charge(4);
		expect(budget.spent).toBe(10);
		expect(budget.refusal).toBeNull();
		expect(() => budget.charge(3)).toThrow(CheckBudgetExceeded);
		expect(budget.refusal).toBe(
			'this file asks more checking than a start can afford (cost 13, at most 10)'
		);
		// Over once, over for good: the same words.
		expect(() => budget.charge(0)).toThrow(budget.refusal!);
		expect(budget.spent).toBe(10);
	});

	it('holds a file’s budget by default', () => {
		expect(new CheckBudget().max).toBe(MAX_FILE_CHECK_COST);
	});
});
