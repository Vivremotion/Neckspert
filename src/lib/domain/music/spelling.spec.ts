import { describe, expect, it } from 'vitest';
import { CHROMATIC_NOTES } from './types';
import {
	formatSpelledNote,
	parseSpelledNote,
	pitchOfSpelled,
	spelledFromPitch,
	transposeSpelled
} from './spelling';

const note = parseSpelledNote;

describe('parseSpelledNote and formatSpelledNote', () => {
	it('round-trip letters with up to two identical accidentals', () => {
		for (const text of ['C', 'C#', 'Db', 'Bbb', 'F##']) {
			expect(formatSpelledNote(parseSpelledNote(text))).toBe(text);
		}
		expect(parseSpelledNote('Bbb')).toEqual({ letter: 'B', accidental: -2 });
	});

	it('rejects anything else', () => {
		for (const text of ['H', 'Eb#', 'Ebbb', '', 'c']) {
			expect(() => parseSpelledNote(text)).toThrow(RangeError);
		}
	});
});

describe('pitchOfSpelled', () => {
	it('gives the canonical sharp pitch', () => {
		expect(pitchOfSpelled(note('Cb'))).toBe('B');
		expect(pitchOfSpelled(note('E#'))).toBe('F');
		expect(pitchOfSpelled(note('Bbb'))).toBe('A');
		expect(pitchOfSpelled(note('F##'))).toBe('G');
		expect(pitchOfSpelled(note('Eb'))).toBe('D#');
	});
});

describe('spelledFromPitch', () => {
	it('spells a pitch with sharps and comes back to it', () => {
		for (const pitch of CHROMATIC_NOTES) {
			expect(pitchOfSpelled(spelledFromPitch(pitch))).toBe(pitch);
		}
		expect(spelledFromPitch('D#')).toEqual({ letter: 'D', accidental: 1 });
	});
});

describe('transposeSpelled', () => {
	it('moves the letter by steps and fixes the accidental by semitones', () => {
		expect(formatSpelledNote(transposeSpelled(note('Eb'), 3, 2))).toBe('Gb');
		expect(formatSpelledNote(transposeSpelled(note('Ab'), 3, 2))).toBe('Cb');
		expect(formatSpelledNote(transposeSpelled(note('Eb'), 6, 4))).toBe('Bbb');
	});

	it('refuses an accidental beyond a double sharp or flat', () => {
		expect(() => transposeSpelled(note('B##'), 8, 4)).toThrow(RangeError);
	});
});
