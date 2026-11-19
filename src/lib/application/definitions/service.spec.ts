import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CATALOG_FILES } from '$lib/composition/catalogFiles';
import { loadDefinitions } from '$lib/composition/definitions';
import { allExercises } from '$lib/domain/exercise/registry';
import { hasSkill } from '$lib/domain/skill/registry';
import { ARPEGGIO_EXERCISE } from '$lib/testing/arpeggioExercise';
import { InMemoryDefinitionFileRepository } from '$lib/testing/fakes';
import { TEST_PLACED_VOICING_SKILL } from '$lib/testing/testSkills';
import { createDefinitionsService } from './service';

/** The public arpeggio exercise as a definition file writes it, under `id`. */
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

/** A definition file of the arpeggio exercises `ids`, with the skill they practise as `skill`. */
function file(ids: readonly string[], skill = TEST_PLACED_VOICING_SKILL.id): string {
	return JSON.stringify({
		format: 0,
		skills: [{ ...TEST_PLACED_VOICING_SKILL, id: skill }],
		exercises: ids.map((id) => ({ ...arpeggioJson(id), practices: skill }))
	});
}

const exerciseIds = () => allExercises().map((exercise) => exercise.id);

function setup(files = new InMemoryDefinitionFileRepository()) {
	let time = 100;
	const all = vi.spyOn(files, 'all');
	const service = createDefinitionsService({
		files,
		load: (imported) => loadDefinitions({ catalog: CATALOG_FILES, imported }),
		now: () => time++
	});
	return { service, files, all };
}

beforeEach(() => {
	vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
	loadDefinitions({ catalog: CATALOG_FILES });
});

describe('createDefinitionsService', () => {
	it('loads the stored files once, however often ready() is asked', async () => {
		const files = new InMemoryDefinitionFileRepository();
		await files.put({ name: 'a.json', text: file(['stored-arpeggio']), importedAt: 1 });
		const { service, all } = setup(files);

		await service.ready();
		await service.ready();

		expect(all).toHaveBeenCalledTimes(1);
		expect(exerciseIds()).toContain('stored-arpeggio');
		expect(await service.files()).toEqual([
			{
				name: 'a.json',
				importedAt: 1,
				skills: [TEST_PLACED_VOICING_SKILL.id],
				grids: [],
				exercises: ['stored-arpeggio'],
				refusals: []
			}
		]);
		expect(service.refusals()).toEqual([]);
	});

	it('stores what it imports, reloads, and tells each file what it gave', async () => {
		const { service, files } = setup();
		await service.ready();

		const tooLong = 'x'.repeat(1_000_001);
		const result = await service.import([
			{ name: 'a.json', text: file(['first-arpeggio', 'first-arpeggio']) },
			{ name: 'long.json', text: tooLong }
		]);

		expect(result.refused).toEqual([
			{
				file: 'long.json',
				kind: 'file',
				id: null,
				reason: 'the file is longer than 1000000 characters'
			}
		]);
		expect(result.stored).toHaveLength(1);
		expect(result.stored[0]).toMatchObject({
			name: 'a.json',
			skills: [TEST_PLACED_VOICING_SKILL.id],
			exercises: ['first-arpeggio']
		});
		expect(result.stored[0].refusals).toHaveLength(1);
		expect(result.stored[0].refusals[0]).toMatchObject({
			file: 'a.json',
			kind: 'exercise',
			id: 'first-arpeggio'
		});
		expect((await files.all()).map((stored) => stored.name)).toEqual(['a.json']);
		expect(exerciseIds()).toContain('first-arpeggio');
		expect(service.refusals()).toEqual(result.stored[0].refusals);
	});

	it('keeps the last of two files of one name in one import', async () => {
		const { service, files } = setup();
		await service.import([
			{ name: 'a.json', text: file(['early-arpeggio']) },
			{ name: 'a.json', text: file(['late-arpeggio']) }
		]);
		expect(await files.all()).toHaveLength(1);
		expect(exerciseIds()).toContain('late-arpeggio');
		expect(exerciseIds()).not.toContain('early-arpeggio');
	});

	it('forgets an exercise a file imported again no longer writes', async () => {
		const { service } = setup();
		await service.import([{ name: 'a.json', text: file(['kept-arpeggio', 'dropped-arpeggio']) }]);
		expect(exerciseIds()).toContain('dropped-arpeggio');

		const { stored } = await service.import([{ name: 'a.json', text: file(['kept-arpeggio']) }]);

		expect(stored[0].exercises).toEqual(['kept-arpeggio']);
		expect(exerciseIds()).toContain('kept-arpeggio');
		expect(exerciseIds()).not.toContain('dropped-arpeggio');
	});

	it("removes a file's objects and keeps another file's", async () => {
		const { service } = setup();
		await service.import([
			{ name: 'a.json', text: file(['a-arpeggio'], 'skill-a') },
			{ name: 'b.json', text: file(['b-arpeggio'], 'skill-b') }
		]);

		await service.remove('a.json');

		expect(exerciseIds()).not.toContain('a-arpeggio');
		expect(hasSkill('skill-a')).toBe(false);
		expect(exerciseIds()).toContain('b-arpeggio');
		expect((await service.files()).map((stored) => stored.name)).toEqual(['b.json']);
	});

	it('reads the table again on reload, after a direct write', async () => {
		const { service, files } = setup();
		await service.ready();
		await files.put({ name: 'b.json', text: file(['backup-arpeggio']), importedAt: 7 });
		expect(exerciseIds()).not.toContain('backup-arpeggio');

		await service.reload();

		expect(exerciseIds()).toContain('backup-arpeggio');
		expect((await service.files()).map((stored) => stored.name)).toEqual(['b.json']);
	});

	it('starts with an unreadable stored file, listed with its refusal', async () => {
		const catalogIds = exerciseIds();
		const files = new InMemoryDefinitionFileRepository();
		await files.put({ name: 'broken.json', text: '{ not json', importedAt: 3 });
		const { service } = setup(files);

		await expect(service.ready()).resolves.toBeUndefined();

		const [broken] = await service.files();
		expect(broken).toMatchObject({
			name: 'broken.json',
			importedAt: 3,
			skills: [],
			grids: [],
			exercises: []
		});
		expect(broken.refusals).toHaveLength(1);
		expect(broken.refusals[0]).toMatchObject({ file: 'broken.json', kind: 'file', id: null });
		expect(service.refusals()).toEqual(broken.refusals);
		expect(exerciseIds()).toEqual(catalogIds);
	});

	it('runs on the catalog alone when the table cannot be read, until a reload reads it', async () => {
		const files = new InMemoryDefinitionFileRepository();
		await files.put({ name: 'a.json', text: file(['hidden-arpeggio']), importedAt: 1 });
		const { service, all } = setup(files);
		all.mockRejectedValueOnce(new Error('blocked'));

		await expect(service.ready()).resolves.toBeUndefined();

		expect(service.refusals()).toEqual([
			{
				file: 'imported files',
				kind: 'file',
				id: null,
				reason: 'the imported files could not be read: blocked'
			}
		]);
		expect(await service.files()).toEqual([]);
		expect(exerciseIds()).not.toContain('hidden-arpeggio');
		expect(exerciseIds().length).toBeGreaterThan(0);

		await service.reload();

		expect(service.refusals()).toEqual([]);
		expect(exerciseIds()).toContain('hidden-arpeggio');
	});

	it("gives the catalog's refusals too when asked", async () => {
		const { service } = setup();
		await service.ready();
		expect(service.refusals({ catalog: true })).toEqual([]);
	});
});
