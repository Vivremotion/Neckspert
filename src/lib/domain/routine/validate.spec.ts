import { describe, expect, it } from 'vitest';
import { findExercise, registerExercise } from '$lib/domain/exercise/registry';
import type { RoutineDefinition } from './types';
import { routineProblem } from './validate';

const routine = (exercises: string[], opens?: RoutineDefinition['opens']): RoutineDefinition => ({
	id: 'r',
	title: { fr: 'R', en: 'R' },
	exercises,
	...(opens !== undefined && { opens })
});

describe('routineProblem, on the catalog the test setup loads', () => {
	it('accepts memory exercises on different skills', () => {
		expect(routineProblem(routine(['identify-note', 'locate-note-string']))).toBeNull();
	});

	it('accepts exercises without memory that write passages', () => {
		expect(
			routineProblem(
				routine(['inversion-run', 'grid-in-direction', 'grid-in-zone', 'grid-reading'])
			)
		).toBeNull();
	});

	it('refuses an exercise no file defines, naming it', () => {
		expect(routineProblem(routine(['identify-note', 'nowhere']))).toBe(
			'exercises[1]: no file defines the exercise "nowhere"'
		);
	});

	it('refuses exercises with memory and without', () => {
		expect(routineProblem(routine(['identify-note', 'inversion-run']))).toBe(
			'exercises[1] practises a skill without memory, exercises[0] one with memory: a routine does not mix them'
		);
	});

	it('refuses two exercises on one skill', () => {
		const identify = findExercise('identify-note')!;
		expect(registerExercise({ ...identify, id: 'identify-twin' }, 'test')).toBeNull();
		expect(routineProblem(routine(['identify-note', 'identify-twin']))).toBe(
			'exercises[1] practises the skill "identify-note", as exercises[0] does'
		);
	});

	it('refuses an exercise without memory that writes no passages', () => {
		expect(routineProblem(routine(['rhythm-silent-bars']))).toBe(
			'exercises[0]: "rhythm-silent-bars" practises a skill without memory and writes no passages'
		);
	});

	it('accepts an opening naming a registered skill and exercise', () => {
		expect(
			routineProblem(
				routine(['chord-zone'], {
					all: [
						{ acquired: { skill: 'chord-anchor', atLeast: 6 } },
						{ level: { exercise: 'grid-reading', scope: 'grid=blues-f', atLeast: 2 } }
					]
				})
			)
		).toBeNull();
	});

	it('refuses an opening naming an unknown skill or exercise, naming the field', () => {
		expect(
			routineProblem(
				routine(['chord-zone'], {
					any: [
						{ acquired: { skill: 'chord-anchor', atLeast: 6 } },
						{ acquired: { skill: 'nowhere', atLeast: 6 } }
					]
				})
			)
		).toBe('opens.any[1].acquired.skill: no file defines the skill "nowhere"');
		expect(
			routineProblem(routine(['chord-zone'], { level: { exercise: 'nowhere', atLeast: 1 } }))
		).toBe('opens.level.exercise: no file defines the exercise "nowhere"');
	});
});
