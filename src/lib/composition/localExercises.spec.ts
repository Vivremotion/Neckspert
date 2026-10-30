import { describe, expect, it } from 'vitest';
import { LOCATE_NECK } from '$lib/domain/exercise';
import { ARPEGGIO_EXERCISE } from '$lib/testing/arpeggioExercise';
import { readLocalExercises } from './localExercises';

/** The public arpeggio exercise as a JSON file writes it: its figures in LilyPond. */
function arpeggioJson(over: Record<string, unknown> = {}): Record<string, unknown> {
	const { figures: _figures, ...rest } = ARPEGGIO_EXERCISE;
	return {
		...JSON.parse(JSON.stringify(rest)),
		id: 'local-arpeggio',
		figures: [
			{ id: 'quarters', lilypond: 'c4 c c c' },
			{ id: 'eighths', lilypond: 'c8 c c c c c c c' }
		],
		...over
	};
}

describe('readLocalExercises', () => {
	it('keeps the valid files and reports the others with their reason', () => {
		const result = readLocalExercises({
			'/exercises.local/arpeggio.json': arpeggioJson(),
			'/exercises.local/number.json': 42,
			'/exercises.local/figure.json': arpeggioJson({
				id: 'bad-figure',
				figures: [{ id: 'bad', lilypond: 'c4 #(foo)' }]
			}),
			'/exercises.local/taken.json': arpeggioJson({ id: LOCATE_NECK.id }),
			'/exercises.local/tempo.json': arpeggioJson({ id: 'bad-tempo', tempo: -3 }),
			'/exercises.local/key.json': arpeggioJson({ id: 'bad-key', colour: 'red' })
		});
		expect(result.loaded.map((exercise) => exercise.id)).toEqual(['local-arpeggio']);
		expect(result.refused).toEqual([
			{
				file: '/exercises.local/figure.json',
				reason: expect.stringMatching(/^figures\[0\] \(bad\): lilypond:/)
			},
			{ file: '/exercises.local/key.json', reason: 'unknown key "colour"' },
			{ file: '/exercises.local/number.json', reason: 'an exercise must be a JSON object' },
			{
				file: '/exercises.local/taken.json',
				reason: 'locate-neck: this id is already in the catalog'
			},
			{
				file: '/exercises.local/tempo.json',
				reason: 'bad-tempo: tempo must be a positive number, got -3'
			}
		]);
	});

	it('refuses an unknown mechanic, a screen it cannot draw, and a second file with the same id', () => {
		const result = readLocalExercises({
			'a.json': arpeggioJson({ id: 'one' }),
			'b.json': arpeggioJson({ id: 'one' }),
			'c.json': arpeggioJson({ id: 'two', mechanic: 'nowhere' }),
			'd.json': arpeggioJson({ id: 'three', view: 'score' })
		});
		expect(result.loaded.map((exercise) => exercise.id)).toEqual(['one']);
		expect(result.refused).toEqual([
			{ file: 'b.json', reason: 'one: this id is already used by another local file' },
			{ file: 'c.json', reason: 'two: mechanic "nowhere" is unknown' },
			{ file: 'd.json', reason: expect.stringContaining('three: view "score" is not a view') }
		]);
	});

	it('reports a file whose content breaks a validator instead of stopping', () => {
		const result = readLocalExercises({
			'a.json': arpeggioJson({ id: 'broken', round: 'not a template' }),
			'b.json': arpeggioJson({ id: 'fine' })
		});
		expect(result.loaded.map((exercise) => exercise.id)).toEqual(['fine']);
		expect(result.refused).toHaveLength(1);
		expect(result.refused[0].file).toBe('a.json');
		expect(result.refused[0].reason).not.toBe('');
	});

	it('refuses nothing when the folder is empty', () => {
		expect(readLocalExercises({})).toEqual({ loaded: [], refused: [] });
	});
});

const DOC = import.meta.glob<string>('/docs/exercices-locaux.md', {
	query: '?raw',
	import: 'default',
	eager: true
});

describe('docs/exercices-locaux.md', () => {
	it('gives an example in JSON that loads', () => {
		const doc = DOC['/docs/exercices-locaux.md'] ?? '';
		const block = /```json\n([\s\S]*?)\n```/.exec(doc)?.[1] ?? '';
		const result = readLocalExercises({ 'example.json': JSON.parse(block) });
		expect(result.refused).toEqual([]);
		expect(result.loaded[0].view).toBe('figure');
	});
});
