import { describe, expect, it } from 'vitest';
import { ARPEGGIO_EXERCISE } from '$lib/testing/arpeggioExercise';
import { MAX_DEFINITION_FILE_CHARS, readDefinitionFile } from './file';

function arpeggioJson(): Record<string, unknown> {
	const { figures: _figures, ...rest } = ARPEGGIO_EXERCISE;
	return {
		...JSON.parse(JSON.stringify(rest)),
		figures: [
			{ id: 'quarters', lilypond: 'c4 c c c' },
			{ id: 'eighths', lilypond: 'c8 c c c c c c c' }
		]
	};
}

const GRID = {
	id: 'blues',
	title: 'Blues',
	beatsPerBar: 4,
	bars: 2,
	chords: [
		{ bar: 1, beat: 1, symbol: 'F7' },
		{ bar: 2, beat: 1, symbol: 'Bb7' }
	]
};

const read = (text: string) => readDefinitionFile('a.json', text);
const fileRefusal = (text: string) => {
	const result = read(text);
	expect(result.grids).toEqual([]);
	expect(result.exercises).toEqual([]);
	expect(result.refusals).toHaveLength(1);
	return result.refusals[0];
};

describe('readDefinitionFile', () => {
	it('refuses a file that is too long', () => {
		const refusal = fileRefusal(' '.repeat(MAX_DEFINITION_FILE_CHARS + 1));
		expect(refusal).toEqual({
			file: 'a.json',
			kind: 'file',
			id: null,
			reason: 'the file is longer than 1000000 characters'
		});
	});

	it('refuses text that is not JSON', () => {
		for (const text of ['', '{"format": 0,']) {
			const refusal = fileRefusal(text);
			expect(refusal.kind).toBe('file');
			expect(refusal.id).toBeNull();
			expect(refusal.reason.startsWith('the file is not JSON: ')).toBe(true);
		}
	});

	it('refuses JSON that is no object', () => {
		for (const text of ['null', '[]', '"x"']) {
			expect(fileRefusal(text).reason).toBe(
				'the file must be a JSON object { format, grids, exercises }'
			);
		}
	});

	it('refuses a missing or wrong format', () => {
		expect(fileRefusal('{}').reason).toBe('format must be 0, got undefined');
		expect(fileRefusal('{"format": "0"}').reason).toBe('format must be 0, got "0"');
	});

	it('refuses an unknown key', () => {
		expect(fileRefusal('{"format": 0, "exercices": []}').reason).toBe('unknown key "exercices"');
	});

	it('refuses a list that is not a list', () => {
		expect(fileRefusal('{"format": 0, "exercises": {}}').reason).toBe('exercises must be a list');
	});

	it('refuses skills and routines that are not empty', () => {
		expect(fileRefusal('{"format": 0, "skills": [{}]}').reason).toBe(
			'skills are not read by this version'
		);
		expect(fileRefusal('{"format": 0, "routines": [{}]}').reason).toBe(
			'routines are not read by this version'
		);
	});

	it('refuses a grid that gridFromJson refuses, with its id', () => {
		const result = read(JSON.stringify({ format: 0, grids: [{ ...GRID, beatsPerBar: 3 }] }));
		expect(result.grids).toEqual([]);
		expect(result.refusals).toEqual([
			{ file: 'a.json', kind: 'grid', id: 'blues', reason: 'beatsPerBar must be 4' }
		]);
	});

	it('refuses an exercise that exerciseFromJson refuses, with its id', () => {
		const result = read(
			JSON.stringify({ format: 0, exercises: [{ ...arpeggioJson(), params: [] }] })
		);
		expect(result.refusals).toHaveLength(1);
		expect(result.refusals[0]).toMatchObject({
			kind: 'exercise',
			id: ARPEGGIO_EXERCISE.id,
			reason: 'params must be an object'
		});
	});

	it('gives a null id to an entry that is no object', () => {
		const result = read(JSON.stringify({ format: 0, exercises: [3] }));
		expect(result.refusals).toEqual([
			{ file: 'a.json', kind: 'exercise', id: null, reason: 'an exercise must be a JSON object' }
		]);
	});

	it('keeps the first of two exercises with the same id', () => {
		const result = read(JSON.stringify({ format: 0, exercises: [arpeggioJson(), arpeggioJson()] }));
		expect(result.exercises).toHaveLength(1);
		expect(result.refusals).toEqual([
			{
				file: 'a.json',
				kind: 'exercise',
				id: ARPEGGIO_EXERCISE.id,
				reason: 'this id is used twice in the file'
			}
		]);
	});

	it('reads an empty file as three empty lists', () => {
		expect(read('{"format": 0}')).toEqual({ grids: [], exercises: [], refusals: [] });
	});

	it('accepts empty skills and routines', () => {
		expect(read('{"format": 0, "skills": [], "routines": []}')).toEqual({
			grids: [],
			exercises: [],
			refusals: []
		});
	});

	it('reads a grid and a valid exercise and refuses the other exercise', () => {
		const result = read(
			JSON.stringify({
				format: 0,
				grids: [GRID],
				exercises: [arpeggioJson(), { ...arpeggioJson(), id: 'other', params: [] }]
			})
		);
		expect(result.grids.map((grid) => grid.id)).toEqual(['blues']);
		expect(result.exercises.map((exercise) => exercise.id)).toEqual([ARPEGGIO_EXERCISE.id]);
		expect(result.refusals).toHaveLength(1);
		expect(result.refusals[0]).toMatchObject({ kind: 'exercise', id: 'other' });
	});
});
