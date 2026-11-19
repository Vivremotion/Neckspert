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
	it('loads the catalog, then the imported files', async () => {
		const { loadDefinitions, allExercises } = await fresh();
		const {
			imported: { refusals }
		} = loadDefinitions({
			catalog: CATALOG_FILES,
			imported: { '/imported/a.json': file([arpeggioJson('local-arpeggio')]) }
		});
		expect(refusals).toEqual([]);
		expect(errors).toEqual([]);
		const ids = allExercises().map((exercise) => exercise.id);
		expect(ids).toHaveLength(12);
		expect(ids.at(-1)).toBe('local-arpeggio');
	});

	it('refuses an imported id the catalog holds', async () => {
		const { loadDefinitions, exerciseById } = await fresh();
		const {
			imported: { refusals }
		} = loadDefinitions({
			catalog: CATALOG_FILES,
			imported: { '/imported/a.json': file([JSON.parse(JSON.stringify(LOCATE_NECK))]) }
		});
		expect(refusals).toEqual([
			{
				file: '/imported/a.json',
				kind: 'exercise',
				id: 'locate-note-string',
				reason: 'this id is already defined in /catalog/notes.json'
			}
		]);
		expect(errors).toEqual([
			'[imported] /imported/a.json, exercise locate-note-string refused: this id is already defined in /catalog/notes.json'
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

	it('reports a refused imported file without throwing', async () => {
		const { loadDefinitions } = await fresh();
		const {
			imported: { refusals }
		} = loadDefinitions({
			catalog: CATALOG_FILES,
			imported: {
				'/imported/list.json': '[]',
				'/imported/number.json': file([42])
			}
		});
		expect(refusals.map((refusal) => refusal.file)).toEqual([
			'/imported/list.json',
			'/imported/number.json'
		]);
		expect(errors).toEqual([
			'[imported] /imported/list.json refused: the file must be a JSON object { format, skills, grids, exercises }',
			'[imported] /imported/number.json, exercise refused: an exercise must be a JSON object'
		]);
	});

	it('refuses the exercise that practises a refused skill of its file, and keeps the rest', async () => {
		const { loadDefinitions, allExercises } = await fresh();
		const broken = { ...TEST_PLACED_VOICING_SKILL, id: 'broken-skill', items: 'no-such-set' };
		const {
			imported: { refusals }
		} = loadDefinitions({
			catalog: CATALOG_FILES,
			imported: {
				'/imported/a.json': JSON.stringify({
					format: 0,
					skills: [TEST_PLACED_VOICING_SKILL, broken],
					exercises: [
						{ ...arpeggioJson('on-broken'), practices: 'broken-skill' },
						arpeggioJson('kept')
					]
				})
			}
		});
		expect(refusals.map(({ file, kind, id }) => ({ file, kind, id }))).toEqual([
			{ file: '/imported/a.json', kind: 'skill', id: 'broken-skill' },
			{ file: '/imported/a.json', kind: 'exercise', id: 'on-broken' }
		]);
		expect(refusals[1].reason).toContain('broken-skill');
		const ids = allExercises().map((exercise) => exercise.id);
		expect(ids).toContain('kept');
		expect(ids).not.toContain('on-broken');
	});

	it('empties the registries before filling them: a file left out takes its objects with it', async () => {
		const { loadDefinitions, allExercises } = await fresh();
		loadDefinitions({
			catalog: CATALOG_FILES,
			imported: { '/imported/a.json': file([arpeggioJson('first')]) }
		});
		expect(allExercises().map((exercise) => exercise.id)).toContain('first');
		loadDefinitions({ catalog: CATALOG_FILES });
		const ids = allExercises().map((exercise) => exercise.id);
		expect(ids).not.toContain('first');
		expect(ids).toHaveLength(11);
	});

	it('lets an imported file and a catalog file share a name', async () => {
		const { loadDefinitions, allExercises } = await fresh();
		const { catalog, imported } = loadDefinitions({
			catalog: { '/catalog/notes.json': file([arpeggioJson('in-catalog')]) },
			imported: { 'notes.json': file([arpeggioJson('in-import')]) }
		});
		expect(catalog.registered).toEqual([
			{ file: '/catalog/notes.json', kind: 'skill', id: TEST_PLACED_VOICING_SKILL.id },
			{ file: '/catalog/notes.json', kind: 'exercise', id: 'in-catalog' }
		]);
		expect(imported.registered).toEqual([
			{ file: 'notes.json', kind: 'exercise', id: 'in-import' }
		]);
		expect(imported.refusals).toEqual([
			expect.objectContaining({ file: 'notes.json', kind: 'skill' })
		]);
		expect(allExercises().map((exercise) => exercise.id)).toEqual(['in-catalog', 'in-import']);
	});

	it('names the catalog file that holds a colliding id', async () => {
		const { loadDefinitions } = await fresh();
		const { imported } = loadDefinitions({
			catalog: CATALOG_FILES,
			imported: { 'notes.json': file([JSON.parse(JSON.stringify(LOCATE_NECK))]) }
		});
		expect(imported.refusals).toEqual([
			{
				file: 'notes.json',
				kind: 'exercise',
				id: 'locate-note-string',
				reason: 'this id is already defined in /catalog/notes.json'
			}
		]);
	});

	it('returns the last load, null before any', async () => {
		const { loadDefinitions, loadedDefinitions } = await fresh();
		expect(loadedDefinitions()).toBeNull();
		loadDefinitions({ catalog: CATALOG_FILES, imported: { 'a.json': '[]' } });
		const last = loadDefinitions({ catalog: CATALOG_FILES });
		expect(loadedDefinitions()).toBe(last);
		expect(last.imported).toEqual({ refusals: [], registered: [] });
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
		const {
			imported: { refusals }
		} = loadDefinitions({
			catalog: CATALOG_FILES,
			imported: { '/imported/example.json': block }
		});
		expect(refusals).toEqual([]);
		expect(allExercises().at(-1)?.view).toBe('figure');
	});
});
