import { describe, expect, it } from 'vitest';
import { EXERCISES, LOCATE_NECK, TRIADS_ANCHOR } from '$lib/domain/exercise/catalog';
import type { ExerciseDefinition, PromptPresentation } from '$lib/domain/exercise/types';
import { validateExercise } from '$lib/domain/exercise/validate';
import { GESTURE_PRESENTERS } from '$lib/application/mechanics/chordGrid';
import { NECK_PRESENTERS, TRIAD_PRESENTERS } from '$lib/application/mechanics';
import { presentationProblem, previewProblem, screenProblem } from './validate';

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

describe('screenProblem', () => {
	const presenters = { ...NECK_PRESENTERS, ...TRIAD_PRESENTERS, ...GESTURE_PRESENTERS };

	it('refuses a response exercise with neither a presentation nor a screen of its mechanic, naming the exercise', () => {
		expect(screenProblem({ ...LOCATE_NECK, presentation: undefined }, presenters)).toBe(
			'locate-neck: writes a round but no presentation, and locate draws no screen of its own'
		);
		expect(screenProblem({ ...TRIADS_ANCHOR, presentation: undefined }, {})).toBe(
			'triads-anchor: writes a round but no presentation, and triad-anchor draws no screen of its own'
		);
	});

	it('accepts the catalog: a presentation, a screen of its mechanic, or no round', () => {
		for (const exercise of EXERCISES) {
			expect(screenProblem(exercise, presenters)).toBeNull();
		}
		expect(
			screenProblem({ ...LOCATE_NECK, round: undefined, presentation: undefined }, {})
		).toBeNull();
	});
});

describe('previewProblem', () => {
	const presenters = { ...NECK_PRESENTERS, ...TRIAD_PRESENTERS, ...GESTURE_PRESENTERS };
	/** Locate on a round of one beat that stops listening its preview before its end. */
	const short = (flow?: ExerciseDefinition['flow']): ExerciseDefinition => ({
		...LOCATE_NECK,
		...(flow && { flow }),
		round: {
			...LOCATE_NECK.round!,
			length: { beats: 1 },
			listenBeforeEnd: { beats: { param: 'previewBeats' } }
		}
	});

	it('refuses a round its presenter’s preview leaves without listening, naming the exercise and the field', () => {
		// The domain cannot know the presenter's preview: it accepts the exercise.
		expect(validateExercise(short())).toBeNull();
		expect(previewProblem(short(), presenters)).toBe(
			"locate-neck: round.listenBeforeEnd must leave the round some listening: it lasts 1/4, got 1/4 (its preview is locate's, 1 beats)"
		);
	});

	it('leaves to validateExercise an exercise that writes its preview, and accepts the catalog', () => {
		expect(previewProblem(short({ previewBeats: 0 }), presenters)).toBeNull();
		for (const exercise of EXERCISES) {
			expect([exercise.id, previewProblem(exercise, presenters)]).toEqual([exercise.id, null]);
		}
	});
});
