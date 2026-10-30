import { afterEach, describe, expect, it, vi } from 'vitest';
import { exerciseById } from '$lib/domain/exercise';
import { ARPEGGIO_EXERCISE } from '$lib/testing/arpeggioExercise';
import { loadLocalExercises, refusedLocalExercises } from './localExercises';

afterEach(() => vi.restoreAllMocks());

// Its own file: loading registers in the live catalog, once per module instance.
describe('loadLocalExercises', () => {
	it('registers the valid exercises, logs the refused ones and reads the folder once', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		const { figures: _figures, ...rest } = ARPEGGIO_EXERCISE;
		const valid = {
			...JSON.parse(JSON.stringify(rest)),
			id: 'loaded-from-a-file',
			figures: [
				{ id: 'quarters', lilypond: 'c4 c c c' },
				{ id: 'eighths', lilypond: 'c8 c c c c c c c' }
			]
		};
		expect(refusedLocalExercises()).toEqual([]);
		const first = loadLocalExercises({
			'/exercises.local/ok.json': JSON.stringify(valid),
			'/exercises.local/no.json': '[]'
		});
		expect(exerciseById('loaded-from-a-file')).toBe(first.loaded[0]);
		expect(error).toHaveBeenCalledTimes(1);
		expect(error.mock.calls[0][0]).toBe(
			'[exercises.local] /exercises.local/no.json refused: an exercise must be a JSON object'
		);
		expect(refusedLocalExercises()).toEqual(first.refused);
		// A second call (createApp runs in every test) neither registers nor logs again.
		expect(loadLocalExercises({})).toBe(first);
		expect(error).toHaveBeenCalledTimes(1);
	});
});
