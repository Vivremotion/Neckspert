import { describe, expect, it } from 'vitest';
import { CHROMATIC_NOTES } from '$lib/domain/music/types';
import { classifyNameConfusion } from './confusion';

describe('classifyNameConfusion', () => {
	it('returns null when the names match', () => {
		expect(classifyNameConfusion('F', 'F')).toBeNull();
		expect(classifyNameConfusion('A#', 'A#')).toBeNull();
	});

	it('flags names one or two semitones away, with the signed distance', () => {
		expect(classifyNameConfusion('F', 'F#')).toEqual({ kind: 'semitone', delta: 1 });
		expect(classifyNameConfusion('F', 'E')).toEqual({ kind: 'semitone', delta: -1 });
		expect(classifyNameConfusion('F', 'G')).toEqual({ kind: 'semitone', delta: 2 });
		expect(classifyNameConfusion('F', 'D#')).toEqual({ kind: 'semitone', delta: -2 });
	});

	it('classifies farther names as other', () => {
		expect(classifyNameConfusion('F', 'G#')).toEqual({ kind: 'other', semitones: 3 });
		expect(classifyNameConfusion('F', 'D')).toEqual({ kind: 'other', semitones: -3 });
		expect(classifyNameConfusion('F', 'A')).toEqual({ kind: 'other', semitones: 4 });
		expect(classifyNameConfusion('F', 'C')).toEqual({ kind: 'other', semitones: -5 });
		expect(classifyNameConfusion('F', 'B')).toEqual({ kind: 'other', semitones: -6 });
	});

	it('folds the distance across the octave boundary', () => {
		expect(classifyNameConfusion('B', 'C')).toEqual({ kind: 'semitone', delta: 1 });
		expect(classifyNameConfusion('C', 'B')).toEqual({ kind: 'semitone', delta: -1 });
		expect(classifyNameConfusion('A#', 'C')).toEqual({ kind: 'semitone', delta: 2 });
		expect(classifyNameConfusion('C', 'F')).toEqual({ kind: 'other', semitones: 5 });
		expect(classifyNameConfusion('C', 'F#')).toEqual({ kind: 'other', semitones: -6 });
	});

	it('keeps every distance within -6..+5 for all 132 wrong pairs', () => {
		for (const expected of CHROMATIC_NOTES) {
			for (const answered of CHROMATIC_NOTES) {
				if (expected === answered) continue;
				const confusion = classifyNameConfusion(expected, answered);
				if (confusion?.kind === 'semitone') {
					expect([-2, -1, 1, 2]).toContain(confusion.delta);
				} else if (confusion?.kind === 'other') {
					expect(Math.abs(confusion.semitones)).toBeGreaterThan(2);
					expect(confusion.semitones).toBeGreaterThanOrEqual(-6);
					expect(confusion.semitones).toBeLessThanOrEqual(5);
				} else {
					expect.unreachable(`unexpected confusion for ${expected} → ${answered}`);
				}
			}
		}
	});
});
