import { describe, expect, it } from 'vitest';
import { definitionChecks } from '$lib/application/definitions/checks';
import { registerFiles } from '$lib/domain/definitions/register';
import { allExercises, clearExercises } from '$lib/domain/exercise';
import { allGrids, clearGrids } from '$lib/domain/grid';
import { idProblem, RESERVED_IDS } from '$lib/domain/definitions/ids';
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

	it('names every skill, grid and exercise with an id a file may write', () => {
		load();
		const problems = [
			...allSkills().map((s) => idProblem(s.id, { reserved: RESERVED_IDS })),
			...allExercises().map((e) => idProblem(e.id, { reserved: RESERVED_IDS })),
			...allGrids().map((g) => idProblem(g.id))
		];
		expect(problems.filter((p) => p !== null)).toEqual([]);
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

	it('names eight exercises after the skill they practise, the rhythm keeping its own ids', () => {
		expect(load()).toEqual([]);
		const named = Object.fromEntries(allExercises().map((e) => [e.id, e.practices]));
		expect(named).toEqual({
			'locate-note-string': 'locate-note-string',
			'identify-note': 'identify-note',
			'chord-anchor': 'chord-anchor',
			'chord-zone': 'chord-zone',
			'inversion-run': 'inversion-run',
			'grid-in-direction': 'grid-in-direction',
			'grid-in-zone': 'grid-in-zone',
			'grid-reading': 'grid-reading',
			'rhythm-silent-bars': 'inner-pulse',
			'rhythm-two-four': 'displaced-pulse',
			'rhythm-offbeats': 'figure-independence'
		});
	});
});
