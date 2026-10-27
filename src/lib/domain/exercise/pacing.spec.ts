import { describe, expect, it } from 'vitest';
import { DEFAULT_PREVIEW_BEATS, DEFAULT_RESPIRATION_BARS, previewBeatsOf } from './pacing';
import type { ExerciseDefinition } from './types';

function definition(flow?: ExerciseDefinition['flow']): ExerciseDefinition {
	return { id: 'any', mechanic: 'locate', params: {}, ...(flow && { flow }) } as ExerciseDefinition;
}

describe('previewBeatsOf', () => {
	it('resolves the preview once: the exercise, else the presenter, else none', () => {
		expect(previewBeatsOf(definition({ previewBeats: 3 }), 1)).toBe(3);
		expect(previewBeatsOf(definition({ previewBeats: 0 }), 1)).toBe(0);
		expect(previewBeatsOf(definition(), 1)).toBe(1);
		expect(previewBeatsOf(definition({}), 2)).toBe(2);
		expect(previewBeatsOf(definition(), undefined)).toBeNull();
	});

	it('names the defaults the notes have always had', () => {
		expect(DEFAULT_RESPIRATION_BARS).toBe(1);
		expect(DEFAULT_PREVIEW_BEATS).toBeGreaterThan(0);
	});
});
