import { describe, expect, it } from 'vitest';
import { RHYTHM_OFFBEATS, RHYTHM_TWO_FOUR } from '$lib/domain/exercise';
import { rhythmFigureRules, type RhythmItem } from '$lib/domain/mechanics';
import type { PlannedItem } from '$lib/domain/types';
import { createFigureSource } from './figureSource';

const context = { now: 0, elapsedMs: 0, fatigued: false };
const keyOf = (item: PlannedItem | null) =>
	item && rhythmFigureRules.itemKey((item as PlannedItem<RhythmItem>).item);

describe('createFigureSource', () => {
	it('gives the same figure again in a loop, as a hot free item of its exercise', () => {
		const source = createFigureSource(RHYTHM_OFFBEATS);
		const items = [1, 2, 3].map(() => source.next(context));
		expect(items.map(keyOf)).toEqual(['offbeats-1@0', 'offbeats-1@0', 'offbeats-1@0']);
		expect(items[0]).toEqual({
			exerciseId: 'rhythm-offbeats',
			mechanic: 'rhythm-figure',
			exerciseLevel: 0,
			item: { figureId: 'offbeats-1', level: 0 },
			phase: 'free',
			temperature: 'hot',
			aid: 'none',
			leadBeats: null
		});
	});

	it('goes round the list with `next`', () => {
		const source = createFigureSource(RHYTHM_TWO_FOUR);
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

	it('serves an item again at the level played, with the figure of its turn that fits the cycle', () => {
		const offbeats = createFigureSource(RHYTHM_OFFBEATS);
		const first = offbeats.next(context)!;
		// Level 2 (index 1) plays cycles of two bars: the two-bar figure.
		const leveled = offbeats.atLevel!(first, 1) as PlannedItem<RhythmItem>;
		expect(keyOf(leveled)).toBe('offbeats-2@1');
		expect(leveled.exerciseLevel).toBe(1);
		// An aid level, below the first.
		expect(keyOf(offbeats.atLevel!(first, -1))).toBe('offbeats-1@-1');

		const lines = createFigureSource(RHYTHM_TWO_FOUR);
		lines.next(context);
		const second = lines.next(context)!;
		expect(keyOf(lines.atLevel!(second, 2))).toBe('line-2@2');
		// Its turn stays its own: an item served again is served again at its turn.
		expect(keyOf(lines.atLevel!(lines.atLevel!(second, 2), 0))).toBe('line-2@0');
	});

	it('learns nothing from an attempt and never runs out', () => {
		const source = createFigureSource(RHYTHM_OFFBEATS);
		expect(source.record({} as never, 0)).toBeNull();
		for (let i = 0; i < 100; i++) expect(source.next(context)).not.toBeNull();
	});
});
