import { describe, expect, it } from 'vitest';
import { EXERCISES, LOCATE_NECK } from '$lib/domain/exercise/catalog';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import type { RoundTemplate } from '$lib/domain/exercise/round';
import { validateExercise } from '$lib/domain/exercise/validate';
import { seriesProblem } from './seriesProblem';

const withRound = (change: (template: RoundTemplate) => RoundTemplate): ExerciseDefinition => ({
	...LOCATE_NECK,
	round: change(structuredClone(LOCATE_NECK.round!))
});

/** The thresholds a cycle verdict judges against. */
const thresholds = { regularity: 40, holdOffset: 60, holdDrift: 25, precision: 60 };

/** Locate's round with its note heard as a bare attack: what a cycle verdict may judge. */
const rhythmOnly = (template: RoundTemplate): RoundTemplate => ({
	...template,
	expectations: template.expectations.map((e) => ({ ...e, content: null }))
});

describe('seriesProblem', () => {
	it('accepts the catalog', () => {
		for (const exercise of EXERCISES) {
			expect([exercise.id, seriesProblem(exercise)]).toEqual([exercise.id, null]);
		}
	});

	it('accepts a round judged as a whole cycle: the series judges it over its capture', () => {
		const cycle = withRound((t) =>
			rhythmOnly({
				...t,
				policy: {
					unit: 'cycle',
					verdict: 'cycle',
					correction: false,
					pairing: { mode: 'alignment' }
				}
			})
		);
		expect(validateExercise({ ...cycle, params: { ...cycle.params, thresholds } })).toBeNull();
		expect(seriesProblem(cycle)).toBeNull();
	});

	it('accepts a verdict that reads a level’s thresholds: the series gives them', () => {
		const judged = withRound((t) => ({ ...t, policy: { ...t.policy, verdict: 'cycle' } }));
		expect(seriesProblem(judged)).toBeNull();
	});

	it('accepts muted bars: the series mutes its click there', () => {
		expect(seriesProblem(withRound((t) => ({ ...t, mutedBars: [1] })))).toBeNull();
		expect(seriesProblem(withRound((t) => ({ ...t, mutedBars: [] })))).toBeNull();
	});

	it('accepts a response round paired by the alignment', () => {
		const aligned = withRound((t) =>
			rhythmOnly({ ...t, policy: { ...t.policy, pairing: { mode: 'alignment' } } })
		);
		expect(validateExercise(aligned)).toBeNull();
		expect(seriesProblem(aligned)).toBeNull();
	});
});
