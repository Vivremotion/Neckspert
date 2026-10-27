import { describe, expect, it } from 'vitest';
import { EXERCISES, LOCATE_NECK, TRIADS_ANCHOR } from '$lib/domain/exercise/catalog';
import type { ExerciseDefinition, PromptPresentation } from '$lib/domain/exercise/types';
import { presentationProblem } from './validate';

const withPresentation = (
	base: ExerciseDefinition,
	presentation: PromptPresentation
): ExerciseDefinition => ({ ...base, presentation });

describe('presentationProblem', () => {
	it('accepts the catalog', () => {
		for (const exercise of EXERCISES) {
			expect(presentationProblem(exercise)).toBeNull();
		}
		expect(EXERCISES.filter((exercise) => exercise.presentation).length).toBeGreaterThanOrEqual(4);
	});

	it('refuses a field the mechanic does not have, naming the exercise and the field', () => {
		expect(presentationProblem(withPresentation(LOCATE_NECK, { primary: '{chord}' }))).toBe(
			'locate-neck: presentation.primary names field "chord", which locate does not have'
		);
		expect(
			presentationProblem(
				withPresentation(TRIADS_ANCHOR, {
					primary: '{chord}',
					aided: { line: { fr: 'case {fret}', en: 'fret {fret}' } }
				})
			)
		).toBe(
			'triads-anchor: presentation.aided.line names field "fret", which triad-anchor does not have'
		);
	});

	it('refuses a picture that does not read the mechanic', () => {
		expect(
			presentationProblem(
				withPresentation(LOCATE_NECK, { primary: '{note}', aided: { picture: 'lowest-shape' } })
			)
		).toBe(
			'locate-neck: presentation.aided.picture names picture "lowest-shape", which does not read locate'
		);
		expect(
			presentationProblem(
				withPresentation(LOCATE_NECK, { primary: '{note}', fading: { picture: 'nowhere' } })
			)
		).toBe(
			'locate-neck: presentation.fading.picture names picture "nowhere", which does not exist'
		);
	});

	it('is silent about an exercise that says nothing', () => {
		expect(presentationProblem({ ...LOCATE_NECK, presentation: undefined })).toBeNull();
	});
});
