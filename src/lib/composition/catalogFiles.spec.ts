import { describe, expect, it } from 'vitest';
import { definitionChecks } from '$lib/application/definitions/checks';
import { registerFiles } from '$lib/domain/definitions/register';
import { allExercises, clearExercises } from '$lib/domain/exercise';
import { allGrids, clearGrids } from '$lib/domain/grid';
import { allSkills, clearSkills, hasSkill } from '$lib/domain/skill';
import { CATALOG_FILES } from './catalogFiles';

function load() {
	clearSkills();
	clearExercises();
	clearGrids();
	return registerFiles(CATALOG_FILES, definitionChecks());
}

describe('the catalog files', () => {
	it('holds the four files', () => {
		expect(Object.keys(CATALOG_FILES).sort()).toEqual([
			'/catalog/changes.json',
			'/catalog/chords.json',
			'/catalog/notes.json',
			'/catalog/rhythm.json'
		]);
	});

	it('loads without a single refusal', () => {
		expect(load()).toEqual([]);
		expect(allExercises()).toHaveLength(11);
		expect(allGrids().map((grid) => grid.id)).toEqual(['iohefy-a', 'blues-f']);
	});

	it('writes the eleven skills, each exercise practising a registered one', () => {
		expect(load()).toEqual([]);
		expect(
			allSkills()
				.map((skill) => skill.id)
				.sort()
		).toEqual(
			[
				'locate-note-string',
				'identify-note',
				'chord-anchor',
				'chord-zone',
				'inversion-run',
				'grid-in-direction',
				'grid-in-zone',
				'grid-reading',
				'inner-pulse',
				'displaced-pulse',
				'figure-independence'
			].sort()
		);
		for (const exercise of allExercises()) {
			expect(exercise.practices, exercise.id).toBeDefined();
			expect(hasSkill(exercise.practices!), exercise.id).toBe(true);
		}
	});
});
