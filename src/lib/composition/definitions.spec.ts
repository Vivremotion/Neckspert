import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ARPEGGIO_EXERCISE } from '$lib/testing/arpeggioExercise';
import { LOCATE_NECK } from '$lib/testing/catalog';
import { TEST_PLACED_VOICING_SKILL, registerTestSkills } from '$lib/testing/testSkills';
import { CATALOG_FILES } from './catalogFiles';

registerTestSkills();

/** The public arpeggio exercise as a definition file writes it: its figures in LilyPond. */
function arpeggioJson(id: string): Record<string, unknown> {
	const { figures: _figures, ...rest } = ARPEGGIO_EXERCISE;
	return {
		...JSON.parse(JSON.stringify(rest)),
		id,
		figures: [
			{ id: 'quarters', lilypond: 'c4 c c c' },
			{ id: 'eighths', lilypond: 'c8 c c c c c c c' }
		]
	};
}

/** A definition file of `exercises`, with the skill the arpeggios practise, which no catalog file holds. */
const file = (exercises: unknown[]) =>
	JSON.stringify({ format: 0, skills: [TEST_PLACED_VOICING_SKILL], exercises });

let errors: string[];

/** A fresh module graph: registries empty, nothing loaded yet. */
async function fresh() {
	vi.resetModules();
	const definitions = await import('./definitions');
	const exercises = await import('$lib/domain/exercise/registry');
	return { ...definitions, ...exercises };
}

beforeEach(() => {
	errors = [];
	vi.spyOn(console, 'error').mockImplementation((line: string) => {
		errors.push(line);
	});
});

afterEach(() => vi.restoreAllMocks());

describe('loadDefinitions', () => {
	it('loads the catalog, then the local files', async () => {
		const { loadDefinitions, allExercises } = await fresh();
		const refusals = loadDefinitions({
			catalog: CATALOG_FILES,
			local: { '/exercises.local/a.json': file([arpeggioJson('local-arpeggio')]) }
		});
		expect(refusals).toEqual([]);
		expect(errors).toEqual([]);
		const ids = allExercises().map((exercise) => exercise.id);
		expect(ids).toHaveLength(12);
		expect(ids.at(-1)).toBe('local-arpeggio');
	});

	it('refuses a local id the catalog holds', async () => {
		const { loadDefinitions, exerciseById } = await fresh();
		const refusals = loadDefinitions({
			catalog: CATALOG_FILES,
			local: { '/exercises.local/a.json': file([JSON.parse(JSON.stringify(LOCATE_NECK))]) }
		});
		expect(refusals).toEqual([
			{
				file: '/exercises.local/a.json',
				kind: 'exercise',
				id: 'locate-note-string',
				reason: 'this id is already defined in /catalog/notes.json'
			}
		]);
		expect(errors).toEqual([
			'[exercises.local] /exercises.local/a.json, exercise locate-note-string refused: this id is already defined in /catalog/notes.json'
		]);
		expect(exerciseById('locate-note-string').practices).toBe('locate-note-string');
	});

	it('starts with the other files when a catalog file is refused', async () => {
		const { loadDefinitions, allExercises } = await fresh();
		loadDefinitions({
			catalog: {
				'/catalog/a.json': 'not json',
				'/catalog/b.json': file([arpeggioJson('from-b')])
			}
		});
		expect(allExercises().map((exercise) => exercise.id)).toEqual(['from-b']);
		expect(errors).toEqual([
			expect.stringMatching(/^\[catalog\] \/catalog\/a\.json refused: the file is not JSON: \S/)
		]);
	});

	it('reports a refused local file without throwing', async () => {
		const { loadDefinitions } = await fresh();
		const refusals = loadDefinitions({
			catalog: CATALOG_FILES,
			local: {
				'/exercises.local/list.json': '[]',
				'/exercises.local/number.json': file([42])
			}
		});
		expect(refusals.map((refusal) => refusal.file)).toEqual([
			'/exercises.local/list.json',
			'/exercises.local/number.json'
		]);
		expect(errors).toEqual([
			'[exercises.local] /exercises.local/list.json refused: the file must be a JSON object { format, grids, exercises }',
			'[exercises.local] /exercises.local/number.json, exercise refused: an exercise must be a JSON object'
		]);
	});

	it('reads the files once', async () => {
		const { loadDefinitions, refusedDefinitions, allExercises } = await fresh();
		expect(refusedDefinitions()).toEqual([]);
		const first = loadDefinitions({
			catalog: CATALOG_FILES,
			local: { '/exercises.local/list.json': '[]' }
		});
		const second = loadDefinitions({
			catalog: CATALOG_FILES,
			local: { '/exercises.local/a.json': file([arpeggioJson('too-late')]) }
		});
		expect(second).toEqual(first);
		expect(refusedDefinitions()).toEqual(first);
		expect(allExercises()).toHaveLength(11);
		expect(errors).toHaveLength(1);
	});
});

const DOC = import.meta.glob<string>('/docs/exercices-locaux.md', {
	query: '?raw',
	import: 'default',
	eager: true
});

describe('docs/exercices-locaux.md', () => {
	it('gives an example file that loads', async () => {
		const { loadDefinitions, allExercises } = await fresh();
		const doc = DOC['/docs/exercices-locaux.md'] ?? '';
		const block = /```json\n([\s\S]*?)\n```/.exec(doc)?.[1] ?? '';
		const refusals = loadDefinitions({
			catalog: CATALOG_FILES,
			local: { '/exercises.local/example.json': block }
		});
		expect(refusals).toEqual([]);
		expect(allExercises().at(-1)?.view).toBe('figure');
	});
});
