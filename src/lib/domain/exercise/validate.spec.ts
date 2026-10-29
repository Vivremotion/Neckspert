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
		expect(validateExercise({ ...LOCATE_NECK, tempo: 0 })).toMatch(/^locate-neck: tempo .*0/);
		expect(validateExercise(withParams({ ladder: [] }))).toBe(
			'locate-neck: params.ladder is empty'
		);
		expect(
			validateExercise(withParams({ ladder: [{ params: { leadBeats: -2, aided: false } }] }))
		).toMatch(/^locate-neck: params\.ladder level 0: the lead .*-2/);
		expect(validateExercise(withParams({ windows: { perfectMs: -1 } }))).toMatch(
			/^locate-neck: params\.windows\.perfectMs /
		);
		expect(validateExercise({ ...LOCATE_NECK, flow: { previewBeats: -1 } })).toMatch(
			/^locate-neck: flow\.previewBeats /
		);
		expect(
			validateExercise({
				...LOCATE_NECK,
				flow: { briefing: 'never' as unknown as 'each-series' }
			})
		).toBe('locate-neck: flow.briefing must be one of each-series, first-encounter, got never');
		expect(validateExercise({ ...LOCATE_NECK, flow: { briefing: 'first-encounter' } })).toBeNull();
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
		expect(validateExercise(withParams({ pacing: { roundsPerBreath: 0 } }))).toMatch(
			/^locate-neck: params\.pacing\.roundsPerBreath .*0/
		);
		expect(validateExercise(withParams({ pacing: { roundsPerBreath: 1.5 } }))).toMatch(
			/^locate-neck: params\.pacing\.roundsPerBreath /
		);
		expect(validateExercise(withParams({ pacing: { breathMinMs: -1 } }))).toMatch(
			/^locate-neck: params\.pacing\.breathMinMs .*-1/
		);
		// The breath between rounds keeps its default when only the runs are written.
		expect(
			validateExercise(withParams({ pacing: { roundsPerBreath: 2, breathMinMs: 0 } }))
		).toBeNull();
		expect(validateExercise(withParams({ learning: { retestGaps: [2] } }))).toMatch(
			/^locate-neck: params\.learning\.retestGaps /
		);
		expect(validateExercise(withParams({ learning: { aidFadeSuccesses: 1.5 } }))).toMatch(
			/^locate-neck: params\.learning\.aidFadeSuccesses /
		);
		expect(
			validateExercise(withParams({ ladder: [{ params: { leadBeats: 1.0001, aided: false } }] }))
		).toMatch(/^locate-neck: params\.ladder level 0: the lead .*1\.0001/);
		expect(validateExercise(withParams({ windows: { anchorChordFromBeats: 1.0001 } }))).toMatch(
			/^locate-neck: params\.windows\.anchorChordFromBeats /
		);
	});

	it('checks the round the exercise writes, against the sensors it is given', () => {
		const wrong = { ...LOCATE_NECK, round: { ...LOCATE_NECK.round!, extra: 1 } };
		expect(validateExercise(wrong as ExerciseDefinition)).toMatch(/^locate-neck: round\.extra /);
		expect(validateExercise(LOCATE_NECK, { sensors: ['chord'] })).toMatch(
			/^locate-neck: round\.expectations\[0\]\.sensor /
		);
		expect(validateExercise(LOCATE_NECK, { sensors: ['note'] })).toBeNull();
	});

	it('refuses a level path through a number, naming the exercise, the level and the path', () => {
		expect(
			validateExercise({
				...LOCATE_NECK,
				levels: [{ params: {} }, { params: { 'tempo.bpm': 90 } }]
			})
		).toMatch(/^locate-neck: levels\[1\] .*tempo\.bpm/);
		const ladder = [
			{ params: { leadBeats: 4, aided: false } },
			{ params: { leadBeats: 2, aided: false, 'windows.perfectMs.at': 60 } }
		];
		expect(validateExercise(withParams({ ladder }))).toMatch(
			/^locate-neck: params\.ladder level 1: .*windows\.perfectMs\.at/
		);
	});

	it('refuses an item level whose leadBeats is not a beat count', () => {
		expect(
			validateExercise(withParams({ ladder: [{ params: { leadBeats: '4', aided: false } }] }))
		).toMatch(/^locate-neck: params\.ladder level 0: the lead /);
		expect(
			validateExercise(withParams({ ladder: [{ params: { leadBeats: 4, aided: 'yes' } }] }))
		).toMatch(/^locate-neck: params\.ladder level 0: aided /);
	});

	it('accepts a level path no piece reads', () => {
		expect(
			validateExercise({
				...withParams({
					ladder: [{ params: { leadBeats: 4, aided: false, 'nothing.reads.this': 1 } }]
				}),
				levels: [{ params: { 'neither.this': 'at all', tempo: 95 } }]
			})
		).toBeNull();
	});

	it('accepts an exercise without pedagogical value', () => {
		expect(
			validateExercise({
				...withParams({ ladder: RISING, windows: { perfectMs: 5000 } }),
				tempo: 300
			})
		).toBeNull();
	});
});
