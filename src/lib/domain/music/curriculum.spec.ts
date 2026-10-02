import { describe, expect, it } from 'vitest';
import { cardKey } from '$lib/domain/types';
import { pitchOnString } from './fretboard';
import { LEARNABLE_FRETS, locateTargets, practiceTargets } from './curriculum';

describe('LEARNABLE_FRETS', () => {
	it('runs from fret 1 to 11: open strings are assumed known', () => {
		expect(LEARNABLE_FRETS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
	});
});

describe('locateTargets', () => {
	it('returns 66 locate targets, string 6 first, frets 1 to 11 on each string', () => {
		const targets = locateTargets();
		expect(targets).toHaveLength(66);
		expect(new Set(targets.map((target) => cardKey(target))).size).toBe(66);
		expect(targets[0]).toEqual({ direction: 'locate', string: 6, pitch: 'F' });
		expect(targets[11]).toEqual({ direction: 'locate', string: 5, pitch: 'A#' });
		expect(targets[65]).toEqual({ direction: 'locate', string: 1, pitch: 'D#' });
	});

	it('leaves out every open-string pitch on its own string', () => {
		for (const string of [6, 5, 4, 3, 2, 1] as const) {
			const open = pitchOnString(string, 0);
			expect(
				locateTargets().some((target) => target.string === string && target.pitch === open)
			).toBe(false);
		}
	});
});

describe('practiceTargets', () => {
	it('returns the 66 locate and 66 identify targets of frets 1 to 11', () => {
		const targets = practiceTargets();
		expect(targets).toHaveLength(132);
		expect(new Set(targets.map((target) => cardKey(target))).size).toBe(132);
		expect(targets.filter((target) => target.direction === 'identify')).toHaveLength(66);
		expect(targets.some((target) => target.direction === 'identify' && target.fret === 0)).toBe(
			false
		);
	});
});
