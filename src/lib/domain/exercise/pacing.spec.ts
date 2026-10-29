import { describe, expect, it } from 'vitest';
import {
	DEFAULT_PREVIEW_BEATS,
	DEFAULT_RESPIRATION_BARS,
	pacingOf,
	previewBeatsOf
} from './pacing';
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

describe('pacingOf', () => {
	it('gives the runs and the breath an exercise writes, over the default breathing bars', () => {
		expect(pacingOf(definition())).toEqual({ respirationBars: DEFAULT_RESPIRATION_BARS });
		const rhythm = {
			...definition(),
			params: { pacing: { roundsPerBreath: 4, breathMinMs: 4000 } }
		} as ExerciseDefinition;
		expect(pacingOf(rhythm)).toEqual({
			respirationBars: DEFAULT_RESPIRATION_BARS,
			roundsPerBreath: 4,
			breathMinMs: 4000
		});
		const notes = {
			...definition(),
			params: { pacing: { respirationBars: 2 } }
		} as ExerciseDefinition;
		expect(pacingOf(notes)).toEqual({ respirationBars: 2 });
	});
});
