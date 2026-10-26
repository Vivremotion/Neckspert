import { describe, expect, it } from 'vitest';
import { Fraction } from '$lib/domain/time/fraction';
import { EXERCISES, LOCATE_NECK } from './catalog';
import type { ExerciseDefinition, Ladder } from './types';
import { validateExercise } from './validate';

const withParams = (params: Record<string, unknown>): ExerciseDefinition => ({
	...LOCATE_NECK,
	params: { ...LOCATE_NECK.params, ...params }
});

/** Leads from 1 to 16 beats, rising: the answer always further from its prompt. */
const RISING: Ladder = [1, 2, 4, 8, 16].map((leadBeats) => ({
	params: { leadBeats, aided: false }
}));

describe('validateExercise', () => {
	it('accepts every exercise of the catalog', () => {
		expect(EXERCISES.map((exercise) => [exercise.id, validateExercise(exercise)])).toEqual(
			EXERCISES.map((exercise) => [exercise.id, null])
		);
	});

	it('names the exercise and the field it cannot run', () => {
		expect(validateExercise({ ...LOCATE_NECK, tempo: { fixed: 0 } })).toMatch(
			/^locate-neck: tempo\.fixed .*0/
		);
		expect(validateExercise(withParams({ ladder: [] }))).toBe(
			'locate-neck: params.ladder is empty'
		);
		expect(
			validateExercise(withParams({ ladder: [{ params: { leadBeats: -2, aided: false } }] }))
		).toMatch(/^locate-neck: params\.ladder level 0: the lead .*-2/);
		// A range that cannot hold its start, a step that never moves it.
		const range = {
			start: 80,
			min: 90,
			max: 160,
			step: 5,
			raiseAt: 0.9,
			lowerAt: 0.7,
			minPrompts: 10
		};
		expect(validateExercise({ ...LOCATE_NECK, tempo: range })).toMatch(
			/^locate-neck: tempo\.start /
		);
		expect(validateExercise({ ...LOCATE_NECK, tempo: { ...range, min: 80, step: 0 } })).toMatch(
			/^locate-neck: tempo\.step /
		);
		expect(validateExercise(withParams({ windows: { perfectMs: -1 } }))).toMatch(
			/^locate-neck: params\.windows\.perfectMs /
		);
		expect(validateExercise({ ...LOCATE_NECK, flow: { previewBeats: -1 } })).toMatch(
			/^locate-neck: flow\.previewBeats /
		);
		expect(validateExercise({ ...LOCATE_NECK, flow: { previewBeats: 1.5 } })).toMatch(
			/^locate-neck: flow\.previewBeats /
		);
		expect(
			validateExercise({
				...LOCATE_NECK,
				meter: { count: 3, unit: Fraction.of(1, 4), grouping: [1, 1] }
			})
		).toMatch(/^locate-neck: meter /);
		// A breath of 0 bars makes a round of length 0.
		expect(validateExercise(withParams({ pacing: { respirationBars: 0 } }))).toMatch(
			/^locate-neck: params\.pacing\.respirationBars .*0/
		);
		expect(validateExercise(withParams({ learning: { retestGaps: [2] } }))).toMatch(
			/^locate-neck: params\.learning\.retestGaps /
		);
		expect(validateExercise(withParams({ learning: { aidFadeSuccesses: 1.5 } }))).toMatch(
			/^locate-neck: params\.learning\.aidFadeSuccesses /
		);
		expect(validateExercise(withParams({ targetBarOffset: '4/4' }))).toMatch(
			/^locate-neck: params\.targetBarOffset /
		);
	});

	it('accepts an exercise without pedagogical value', () => {
		expect(
			validateExercise({
				...withParams({ ladder: RISING, windows: { perfectMs: 5000 } }),
				tempo: { fixed: 300 }
			})
		).toBeNull();
	});
});
