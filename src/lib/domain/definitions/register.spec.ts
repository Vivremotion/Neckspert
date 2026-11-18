import { beforeEach, describe, expect, it } from 'vitest';
import { allExercises, clearExercises } from '$lib/domain/exercise/registry';
import { allGrids, clearGrids, gridById } from '$lib/domain/grid/registry';
import { registerFiles, type DefinitionChecks } from './register';
import { LOCATE_NECK, BLUES_F } from '$lib/testing/catalog';

const accept: DefinitionChecks = { exercise: () => null };
const file = (value: object) => JSON.stringify({ format: 0, ...value });
const exercise = (id: string) => ({ ...LOCATE_NECK, id });
const grid = (id: string) => ({ ...BLUES_F, id });

beforeEach(() => {
	clearExercises();
	clearGrids();
});

describe('registerFiles', () => {
	it('reads the files in the order of their names', () => {
		const refusals = registerFiles(
			{
				'b.json': file({ exercises: [exercise('from-b')] }),
				'a.json': file({ exercises: [exercise('from-a')] })
			},
			accept
		);
		expect(refusals).toEqual([]);
		expect(allExercises().map((e) => e.id)).toEqual(['from-a', 'from-b']);
	});

	it('refuses an id another file holds, naming it', () => {
		const refusals = registerFiles(
			{
				'a.json': file({ exercises: [exercise('x')] }),
				'b.json': file({ exercises: [exercise('x')] })
			},
			accept
		);
		expect(refusals).toEqual([
			{ file: 'b.json', kind: 'exercise', id: 'x', reason: 'this id is already defined in a.json' }
		]);
		expect(allExercises()).toHaveLength(1);
	});

	it('refuses a grid id another file holds', () => {
		const refusals = registerFiles(
			{ 'a.json': file({ grids: [grid('g')] }), 'b.json': file({ grids: [grid('g')] }) },
			accept
		);
		expect(refusals).toEqual([
			{ file: 'b.json', kind: 'grid', id: 'g', reason: 'this id is already defined in a.json' }
		]);
	});

	it('lets a grid and an exercise share an id', () => {
		const refusals = registerFiles(
			{ 'a.json': file({ grids: [grid('x')], exercises: [exercise('x')] }) },
			accept
		);
		expect(refusals).toEqual([]);
		expect(allGrids()).toHaveLength(1);
		expect(allExercises()).toHaveLength(1);
	});

	it('keeps the valid objects of a file that holds a refused one', () => {
		const refusals = registerFiles(
			{ 'a.json': file({ exercises: [exercise('bad'), exercise('good')] }) },
			{ exercise: (e) => (e.id === 'bad' ? 'bad: no good' : null) }
		);
		expect(refusals).toEqual([{ file: 'a.json', kind: 'exercise', id: 'bad', reason: 'no good' }]);
		expect(allExercises().map((e) => e.id)).toEqual(['good']);
	});

	it('checks an exercise after the grids of its file are registered', () => {
		const refusals = registerFiles(
			{ 'a.json': file({ exercises: [exercise('x')], grids: [grid('g')] }) },
			{ exercise: () => (gridById('g') ? null : 'unreachable') }
		);
		expect(refusals).toEqual([]);
		expect(allExercises()).toHaveLength(1);
	});

	it('never throws on a file that is no JSON', () => {
		const refusals = registerFiles(
			{ 'a.json': '{ nope', 'b.json': file({ exercises: [exercise('x')] }) },
			accept
		);
		expect(refusals).toHaveLength(1);
		expect(refusals[0]).toMatchObject({ file: 'a.json', kind: 'file', id: null });
		expect(allExercises().map((e) => e.id)).toEqual(['x']);
	});
});
