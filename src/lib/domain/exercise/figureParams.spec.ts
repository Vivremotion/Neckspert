import { describe, expect, it } from 'vitest';
import { LOCATE_NECK } from './catalog';
import { figureParamsOf, writesFigure } from './figureParams';
import { RHYTHM_OFFBEATS, RHYTHM_SILENT_BARS, RHYTHM_TWO_FOUR } from './rhythmCatalog';
import type { RoundTemplate } from './round';
import type { ExerciseDefinition } from './types';

const FIGURE_ROUND: RoundTemplate = {
	expectations: [
		{ figure: { id: 'main' }, at: { bars: 0 }, sensor: 'attack', content: null, window: { ms: 80 } }
	],
	length: { bars: 1 },
	handover: 'end',
	policy: { unit: 'cycle', verdict: 'cycle', correction: false, pairing: { mode: 'alignment' } }
};

/** An exercise whose round writes a figure, and nothing else of the figure params. */
const bare: ExerciseDefinition = {
	id: 'test-figure',
	version: 1,
	mechanic: 'figure',
	params: {},
	round: FIGURE_ROUND,
	levels: [{ params: {} }, { params: { cursor: true, 'thresholds.fidelity': 0.9 } }]
};

describe('writesFigure', () => {
	it('tells a round that writes a figure entry from one that writes places only', () => {
		expect(writesFigure(bare)).toBe(true);
		for (const exercise of [RHYTHM_SILENT_BARS, RHYTHM_TWO_FOUR, RHYTHM_OFFBEATS]) {
			expect(writesFigure(exercise), exercise.id).toBe(true);
		}
		expect(writesFigure(LOCATE_NECK)).toBe(false);
		expect(writesFigure({ ...bare, round: undefined })).toBe(false);
	});
});

describe('figureParamsOf', () => {
	it('gives the defaults to an exercise that writes none', () => {
		expect(figureParamsOf(bare, 0)).toEqual({
			feedback: 'every-cycle',
			listen: 'none',
			cursor: false,
			thresholds: {}
		});
		expect(figureParamsOf(LOCATE_NECK, 0)).toEqual({
			feedback: 'every-cycle',
			listen: 'none',
			cursor: false,
			thresholds: {}
		});
	});

	it('reads them at the exercise level, a level overriding the cursor and the fidelity', () => {
		expect(figureParamsOf(bare, 1)).toEqual({
			feedback: 'every-cycle',
			listen: 'none',
			cursor: true,
			thresholds: { fidelity: 0.9 }
		});
		expect(figureParamsOf(RHYTHM_SILENT_BARS, 5)).toEqual({
			feedback: 'out-of-tolerance',
			listen: 'free',
			cursor: false,
			thresholds: { regularity: 20, holdOffset: 25, holdDrift: 10, precision: 30 }
		});
		expect(figureParamsOf(RHYTHM_TWO_FOUR, 0)).toMatchObject({ listen: 'aid', cursor: true });
	});

	it('refuses a level the exercise does not have', () => {
		expect(() => figureParamsOf(bare, 2)).toThrow(RangeError);
	});
});
