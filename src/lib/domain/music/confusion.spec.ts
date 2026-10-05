import { describe, expect, it } from 'vitest';
import type { LocateItem } from './items';
import { CHROMATIC_NOTES } from '$lib/domain/music/types';
import { classifyNameConfusion, classifyNoteConfusion } from './confusion';

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

describe('classifyNoteConfusion', () => {
	/** Accepts MIDI 65 and 77 (frets 6 and 18). */
	const fOnB: LocateItem = { string: 2, pitch: 'F' };
	/** Accepts MIDI 40, 52 and 64 (frets 0, 12 and 24). */
	const eOnLowE: LocateItem = { string: 6, pitch: 'E' };

	it('returns null for every playable octave of the target on its string', () => {
		expect(classifyNoteConfusion(fOnB, 65)).toBeNull();
		expect(classifyNoteConfusion(fOnB, 77)).toBeNull();
		expect(classifyNoteConfusion(eOnLowE, 40)).toBeNull();
		expect(classifyNoteConfusion(eOnLowE, 64)).toBeNull();
	});

	it('flags the right pitch in an octave the string cannot play', () => {
		expect(classifyNoteConfusion(fOnB, 53)).toEqual({ kind: 'octave' });
		expect(classifyNoteConfusion(fOnB, 89)).toEqual({ kind: 'octave' });
		expect(classifyNoteConfusion(eOnLowE, 28)).toEqual({ kind: 'octave' });
		expect(classifyNoteConfusion(eOnLowE, 76)).toEqual({ kind: 'octave' });
	});

	it('measures one or two semitones from the nearest acceptable note', () => {
		expect(classifyNoteConfusion(fOnB, 66)).toEqual({ kind: 'semitone', delta: 1 });
		expect(classifyNoteConfusion(fOnB, 64)).toEqual({ kind: 'semitone', delta: -1 });
		expect(classifyNoteConfusion(fOnB, 67)).toEqual({ kind: 'semitone', delta: 2 });
		expect(classifyNoteConfusion(fOnB, 63)).toEqual({ kind: 'semitone', delta: -2 });
		expect(classifyNoteConfusion(fOnB, 76)).toEqual({ kind: 'semitone', delta: -1 });
		expect(classifyNoteConfusion(fOnB, 78)).toEqual({ kind: 'semitone', delta: 1 });
		expect(classifyNoteConfusion(eOnLowE, 39)).toEqual({ kind: 'semitone', delta: -1 });
	});

	it('reports farther notes as other, signed from the nearest acceptable note', () => {
		expect(classifyNoteConfusion(fOnB, 62)).toEqual({ kind: 'other', semitones: -3 });
		expect(classifyNoteConfusion(fOnB, 72)).toEqual({ kind: 'other', semitones: -5 });
		expect(classifyNoteConfusion(fOnB, 40)).toEqual({ kind: 'other', semitones: -25 });
	});

	it('breaks a tie toward the lower acceptable note', () => {
		const gOnD: LocateItem = { string: 4, pitch: 'G' };
		expect(classifyNoteConfusion(gOnD, 61)).toEqual({ kind: 'other', semitones: 6 });
	});

	it('flags the note the prompted string is named after, in any octave', () => {
		const aOnLowE: LocateItem = { string: 6, pitch: 'A' };
		expect(classifyNoteConfusion(aOnLowE, 40)).toEqual({ kind: 'string-name' });
		expect(classifyNoteConfusion(aOnLowE, 52)).toEqual({ kind: 'string-name' });
		expect(classifyNoteConfusion(fOnB, 71)).toEqual({ kind: 'string-name' });
		// One fret above the open string: reading the string name wins over a semitone.
		const fOnLowE: LocateItem = { string: 6, pitch: 'F' };
		expect(classifyNoteConfusion(fOnLowE, 40)).toEqual({ kind: 'string-name' });
	});
});
