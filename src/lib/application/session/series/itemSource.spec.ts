import { describe, expect, it } from 'vitest';
import { RHYTHM_OFFBEATS, RHYTHM_TWO_FOUR, type ExerciseDefinition } from '$lib/domain/exercise';
import { mechanicRules } from '$lib/domain/mechanics';
import type { PlannedItem } from '$lib/domain/types';
import { createExerciseItemSource } from './itemSource';

const context = { now: 0, elapsedMs: 0, fatigued: false };
const keyOf = (item: PlannedItem | null) => item && mechanicRules(item.mechanic).itemKey(item.item);

const C_ROOT = 'C|maj|3:5,2:5,1:3';
const C_FIRST = 'C|maj|3:3,2:5,1:1';

/** Shapes played in turn, each a figure of their notes. */
const shapes: ExerciseDefinition = {
	id: 'test-shapes',
	version: 1,
	mechanic: 'voicing-figure',
	params: {},
	round: {
		expectations: [
			{
				figure: { id: 'arpeggio' },
				at: { bars: 0 },
				sensor: 'note',
				content: { from: 'voicing-notes' },
				window: { ms: 80 }
			}
		],
		length: { bars: 1 },
		handover: 'end',
		policy: { unit: 'cycle', verdict: 'cycle', correction: false, pairing: { mode: 'alignment' } }
	},
	levels: [{ params: {} }, { params: { tempo: 100 } }],
	items: [`${C_ROOT}@0@4`, `${C_FIRST}@1`, `${C_ROOT}@1`]
};

describe('createExerciseItemSource, from the figures', () => {
	it('gives the same figure again in a loop, as a hot free item of its exercise', () => {
		const source = createExerciseItemSource(RHYTHM_OFFBEATS);
		const items = [1, 2, 3].map(() => source.next(context));
		expect(items.map(keyOf)).toEqual(['offbeats-1@0', 'offbeats-1@0', 'offbeats-1@0']);
		expect(items[0]).toEqual({
			exerciseId: 'rhythm-offbeats',
			mechanic: 'figure',
			exerciseLevel: 0,
			item: { figureId: 'offbeats-1', level: 0 },
			phase: 'free',
			temperature: 'hot',
			aid: 'none',
			leadBeats: null
		});
	});

	it('goes round the list with `next`', () => {
		const source = createExerciseItemSource(RHYTHM_TWO_FOUR);
		const keys = Array.from({ length: 8 }, () => keyOf(source.next(context)));
		expect(keys).toEqual([
			'line-1@0',
			'line-2@0',
			'line-3@0',
			'line-4@0',
			'line-5@0',
			'line-6@0',
			'line-1@0',
			'line-2@0'
		]);
	});

	it('serves an item again at the level played, with the figure of its turn that fits the round', () => {
		const offbeats = createExerciseItemSource(RHYTHM_OFFBEATS);
		const first = offbeats.next(context)!;
		// Level 2 (index 1) plays rounds of two bars: the two-bar figure.
		const leveled = offbeats.atLevel!(first, 1);
		expect(keyOf(leveled)).toBe('offbeats-2@1');
		expect(leveled.exerciseLevel).toBe(1);
		// An aid level, below the first.
		expect(keyOf(offbeats.atLevel!(first, -1))).toBe('offbeats-1@-1');

		const lines = createExerciseItemSource(RHYTHM_TWO_FOUR);
		lines.next(context);
		const second = lines.next(context)!;
		expect(keyOf(lines.atLevel!(second, 2))).toBe('line-2@2');
		// Its turn stays its own: an item served again is served again at its turn.
		expect(keyOf(lines.atLevel!(lines.atLevel!(second, 2), 0))).toBe('line-2@0');
	});

	it('refuses an item it did not serve, and an exercise whose round reads no figure on its items', () => {
		const source = createExerciseItemSource(RHYTHM_OFFBEATS);
		expect(() =>
			source.atLevel!(createExerciseItemSource(RHYTHM_OFFBEATS).next(context)!, 1)
		).toThrow(/did not serve/);
		expect(() => createExerciseItemSource({ ...shapes, items: undefined })).toThrow(/test-shapes/);
	});

	it('learns nothing from an attempt and never runs out', () => {
		const source = createExerciseItemSource(RHYTHM_OFFBEATS);
		expect(source.record({} as never, 0)).toBeNull();
		for (let i = 0; i < 100; i++) expect(source.next(context)).not.toBeNull();
	});
});

describe('createExerciseItemSource, from the written items', () => {
	it('serves the written items in order, again from the first', () => {
		const source = createExerciseItemSource(shapes);
		const keys = Array.from({ length: 5 }, () => keyOf(source.next(context)));
		expect(keys).toEqual([
			`${C_ROOT}@0@4`,
			`${C_FIRST}@1`,
			`${C_ROOT}@1`,
			`${C_ROOT}@0@4`,
			`${C_FIRST}@1`
		]);
	});

	it('parses each item by its mechanic, and serves it again at the level played', () => {
		const source = createExerciseItemSource(shapes);
		const first = source.next(context)!;
		expect(first).toEqual({
			exerciseId: 'test-shapes',
			mechanic: 'voicing-figure',
			exerciseLevel: 0,
			item: { voicing: C_ROOT, occurrence: 0, beats: 4 },
			phase: 'free',
			temperature: 'hot',
			aid: 'none',
			leadBeats: null
		});
		const leveled = source.atLevel!(first, 1);
		expect(leveled.exerciseLevel).toBe(1);
		expect(leveled.item).toEqual(first.item);
		// The turn after it is still the second.
		expect(keyOf(source.next(context))).toBe(`${C_FIRST}@1`);
	});

	it('refuses an item its mechanic cannot read, and an empty list, naming the exercise', () => {
		expect(() => createExerciseItemSource({ ...shapes, items: ['nope'] })).toThrow(
			/test-shapes.*items\[0\]/
		);
		expect(() => createExerciseItemSource({ ...shapes, items: [] })).toThrow(/test-shapes/);
	});
});
