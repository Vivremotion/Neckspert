import { registerTestSkills } from '$lib/testing/testSkills';
import { describe, expect, it } from 'vitest';
import { LOCATE_NECK } from '$lib/testing/catalog';
import { retiredProblem } from './retired';
import { validateExercise } from './validate';
import type { ExerciseDefinition } from './types';

registerTestSkills();

const ladder = (second: Record<string, unknown>) => [
	{ params: { leadBeats: 8 } },
	{ params: { leadBeats: 4, ...second } }
];

describe('retiredProblem', () => {
	it('lets a definition that writes no retired key through', () => {
		expect(retiredProblem(LOCATE_NECK)).toBeNull();
		expect(retiredProblem(null)).toBeNull();
		expect(retiredProblem({ params: { ladder: 'not a list' } })).toBeNull();
	});

	it('names the level of a ladder that writes aided, and says what to write instead', () => {
		expect(retiredProblem({ params: { ladder: ladder({ aided: false }) } })).toBe(
			'params.ladder[1].params.aided is no longer read: write what the level shows in the level, e.g. "presentation.detail" or "presentation.picture"'
		);
	});

	it('refuses an aided presentation, and says where its line or picture goes', () => {
		expect(retiredProblem({ presentation: { primary: '{note}', aided: { line: '{fret}' } } })).toBe(
			'presentation.aided is no longer read: write "presentation.detail" or "presentation.picture" in the params of the level that shows it'
		);
	});

	it('refuses a fading picture: no aid comes back after a miss', () => {
		expect(
			retiredProblem({ presentation: { primary: '{note}', fading: { picture: 'string' } } })
		).toBe(
			'presentation.fading is no longer read: no aid comes back after a miss; write "presentation.picture" in the params of the level that draws it'
		);
	});

	it.each(['presentAtOnce', 'aidFadeSuccesses'])('refuses params.learning.%s', (key) => {
		expect(retiredProblem({ params: { learning: { [key]: 1 } } })).toBe(
			`params.learning.${key} is no longer read: remove it`
		);
	});
});

describe('validateExercise on a retired key', () => {
	it('refuses it first, naming the exercise', () => {
		const definition = {
			...LOCATE_NECK,
			params: { ...LOCATE_NECK.params, ladder: ladder({ aided: true }) }
		} as ExerciseDefinition;
		expect(validateExercise(definition)).toBe(
			'locate-note-string: params.ladder[1].params.aided is no longer read: write what the level shows in the level, e.g. "presentation.detail" or "presentation.picture"'
		);
	});
});
