import { describe, expect, it } from 'vitest';
import { LOCATE_NECK } from './catalog';
import { figureParamsOf, notationOf, writesFigure } from './figureParams';
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
			thresholds: {},
			notation: null,
			neck: false,
			liveMarks: false
		});
		expect(figureParamsOf(LOCATE_NECK, 0)).toEqual({
			feedback: 'every-cycle',
			listen: 'none',
			cursor: false,
			thresholds: {},
			notation: null,
			neck: false,
			liveMarks: false
		});
	});

	it('reads them at the exercise level, a level overriding the cursor and the fidelity', () => {
		expect(figureParamsOf(bare, 1)).toEqual({
			feedback: 'every-cycle',
			listen: 'none',
			cursor: true,
			thresholds: { fidelity: 0.9 },
			notation: null,
			neck: false,
			liveMarks: false
		});
		expect(figureParamsOf(RHYTHM_SILENT_BARS, 5)).toEqual({
			feedback: 'out-of-tolerance',
			listen: 'free',
			cursor: false,
			thresholds: { regularity: 20, holdOffset: 25, holdDrift: 10, precision: 30 },
			notation: null,
			neck: false,
			liveMarks: false
		});
		expect(figureParamsOf(RHYTHM_TWO_FOUR, 0)).toMatchObject({ listen: 'aid', cursor: true });
	});

	it('refuses a level the exercise does not have', () => {
		expect(() => figureParamsOf(bare, 2)).toThrow(RangeError);
	});
});

/** `bare` with its figure entry's content and the notation its levels write. */
function writing(
	content: null | { from: string },
	levels: Record<string, unknown>[]
): ExerciseDefinition {
	const [entry] = FIGURE_ROUND.expectations;
	return {
		...bare,
		round: { ...FIGURE_ROUND, expectations: [{ ...entry, content } as typeof entry] },
		levels: levels.map((params) => ({ params }))
	};
}

describe('notationOf', () => {
	it('engraves a written figure as staff and tab, a derived one and a bare rhythm as the rhythm line', () => {
		expect(notationOf(writing({ from: 'figure' }, [{}]), 0)).toEqual({ staff: true, tab: true });
		expect(notationOf(writing({ from: 'voicing-notes' }, [{}]), 0)).toEqual({
			staff: false,
			tab: false
		});
		expect(notationOf(writing(null, [{}]), 0)).toEqual({ staff: false, tab: false });
		expect(notationOf(RHYTHM_OFFBEATS, 0)).toEqual({ staff: false, tab: false });
	});

	it('takes what a level writes, the rest from the content', () => {
		const derived = writing({ from: 'voicing-notes' }, [{ 'notation.tab': true }, {}]);
		expect(figureParamsOf(derived, 0).notation).toEqual({ staff: false, tab: true });
		expect(figureParamsOf(derived, 1).notation).toBeNull();
		expect(notationOf(derived, 0)).toEqual({ staff: false, tab: true });
		expect(notationOf(derived, 1)).toEqual({ staff: false, tab: false });
		const written = writing({ from: 'figure' }, [
			{ 'notation.staff': false },
			{ notation: { staff: true, tab: false } }
		]);
		expect(notationOf(written, 0)).toEqual({ staff: false, tab: true });
		expect(notationOf(written, 1)).toEqual({ staff: true, tab: false });
	});
});
