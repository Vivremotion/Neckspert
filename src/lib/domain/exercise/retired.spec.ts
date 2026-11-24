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

	it('refuses flow.antiBlocking: nothing is triggered after failures', () => {
		expect(retiredProblem({ flow: { antiBlocking: true } })).toBe(
			'flow.antiBlocking is no longer read: nothing is triggered after failures; a level says what it shows and plays, and its "drop" when the player leaves it'
		);
		expect(retiredProblem({ flow: { antiBlocking: false } })).not.toBeNull();
	});

	it('refuses a listen worth an aid, in the params or at any level', () => {
		expect(retiredProblem({ params: { listen: 'aid' } })).toBe(
			'params.listen "aid" is no longer read: write "free"'
		);
		expect(retiredProblem({ levels: [{ params: {} }, { params: { listen: 'aid' } }] })).toBe(
			'levels[1].params.listen "aid" is no longer read: write "free"'
		);
		expect(
			retiredProblem({ params: { listen: 'free' }, levels: [{ params: { listen: 'none' } }] })
		).toBeNull();
	});

	it.each([
		[
			'presentation.aided.line',
			'presentation.aided is no longer read: write "presentation.detail" or "presentation.picture" in the params of the level that shows it'
		],
		[
			'presentation.aided',
			'presentation.aided is no longer read: write "presentation.detail" or "presentation.picture" in the params of the level that shows it'
		],
		[
			'presentation.fading',
			'presentation.fading is no longer read: no aid comes back after a miss; write "presentation.picture" in the params of the level that draws it'
		],
		[
			'presentation.fading.picture',
			'presentation.fading is no longer read: no aid comes back after a miss; write "presentation.picture" in the params of the level that draws it'
		]
	])('refuses a level that writes %s, naming the level', (path, advice) => {
		expect(retiredProblem({ levels: [{ params: {} }, { params: { [path]: 'x' } }] })).toBe(
			`levels[1].params["${path}"]: ${advice}`
		);
		expect(retiredProblem({ params: { ladder: ladder({ [path]: 'x' }) } })).toBe(
			`params.ladder[1].params["${path}"]: ${advice}`
		);
	});

	it('lets a level rewrite another slot of the presentation', () => {
		expect(
			retiredProblem({
				levels: [{ params: { 'presentation.detail': '{fret}', 'presentation.aidedness': 1 } }]
			})
		).toBeNull();
	});

	it('refuses a level that writes aid: a level is its place in the list', () => {
		expect(retiredProblem({ levels: [{ params: {} }, { aid: true, params: { tempo: 70 } }] })).toBe(
			'levels[1].aid is no longer read: a level is its place in the list, the first is level 1; remove "aid"'
		);
		expect(
			retiredProblem({ params: { ladder: [{ aid: true, params: {} }, { params: {} }] } })
		).toBe(
			'params.ladder[0].aid is no longer read: a level is its place in the list, the first is level 1; remove "aid"'
		);
	});

	it.each(['presentAtOnce', 'aidFadeSuccesses'])('refuses params.learning.%s', (key) => {
		expect(retiredProblem({ params: { learning: { [key]: 1 } } })).toBe(
			`params.learning.${key} is no longer read: remove it`
		);
	});
});

describe('validateExercise on a retired key', () => {
	it('refuses an exercise level that writes aid, naming the exercise', () => {
		const definition = {
			...LOCATE_NECK,
			levels: [{ aid: true, params: {} }, { params: {} }]
		} as unknown as ExerciseDefinition;
		expect(validateExercise(definition)).toBe(
			'locate-note-string: levels[0].aid is no longer read: a level is its place in the list, the first is level 1; remove "aid"'
		);
	});

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
