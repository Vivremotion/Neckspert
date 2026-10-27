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

	it('refuses a round judged as a whole cycle, naming the exercise and the field', () => {
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
		// The domain can run it, given thresholds: the series cannot.
		expect(validateExercise(cycle)).toBeNull();
		expect(seriesProblem(cycle)).toBe(
			'locate-neck: round.policy.unit "cycle" cannot be played by the response series, which closes a round on its answers (unit "response")'
		);
	});

	it('refuses a verdict that reads a level’s thresholds', () => {
		const thresholds = withRound((t) => ({ ...t, policy: { ...t.policy, verdict: 'cycle' } }));
		expect(seriesProblem(thresholds)).toBe(
			'locate-neck: round.policy.verdict "cycle" judges against a level\'s thresholds, which the response series does not give'
		);
	});

	it('refuses muted bars, and accepts none written', () => {
		expect(seriesProblem(withRound((t) => ({ ...t, mutedBars: [1] })))).toBe(
			'locate-neck: round.mutedBars [1] cannot be played by the response series, which never mutes its click'
		);
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
