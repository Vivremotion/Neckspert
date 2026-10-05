import { describe, expect, it } from 'vitest';
import type { LocateItem } from './items';
import {
	CHROMATIC_NOTES,
	STANDARD_TUNING,
	STRING_NUMBERS,
	pitchOfMidi
} from '$lib/domain/music/types';
import { acceptableMidis, fretsForPitch, midiOnString, pitchOnString } from './fretboard';

describe('midiOnString', () => {
	it('adds the fret to the open string in standard tuning', () => {
		expect(midiOnString(6, 0)).toBe(40);
		expect(midiOnString(5, 0)).toBe(45);
		expect(midiOnString(4, 0)).toBe(50);
		expect(midiOnString(3, 0)).toBe(55);
		expect(midiOnString(2, 6)).toBe(65);
		expect(midiOnString(2, 18)).toBe(77);
		expect(midiOnString(1, 24)).toBe(88);
	});

	it('rejects negative, fractional and unplayable frets', () => {
		expect(() => midiOnString(1, -1)).toThrow(RangeError);
		expect(() => midiOnString(1, 2.5)).toThrow(RangeError);
		expect(() => midiOnString(1, 25)).toThrow(RangeError);
	});
});

describe('pitchOnString', () => {
	it('names positions in sharp spelling', () => {
		expect(pitchOnString(6, 3)).toBe('G');
		expect(pitchOnString(5, 8)).toBe('F');
		expect(pitchOnString(3, 3)).toBe('A#');
		expect(pitchOnString(2, 6)).toBe('F');
		expect(pitchOnString(1, 12)).toBe('E');
	});

	it('meets each pitch class exactly once between frets 0 and 11', () => {
		for (const string of STRING_NUMBERS) {
			const pitches = Array.from({ length: 12 }, (_, fret) => pitchOnString(string, fret));
			expect(new Set(pitches).size).toBe(12);
		}
	});
});

describe('fretsForPitch', () => {
	it('lists every fret of the pitch up to fret 24, ascending', () => {
		expect(fretsForPitch(2, 'F')).toEqual([6, 18]);
		expect(fretsForPitch(6, 'E')).toEqual([0, 12, 24]);
		expect(fretsForPitch(4, 'C#')).toEqual([11, 23]);
	});

	it('stops at maxFret', () => {
		expect(fretsForPitch(2, 'F', 11)).toEqual([6]);
		expect(fretsForPitch(6, 'E', 11)).toEqual([0]);
		expect(fretsForPitch(1, 'D#', 0)).toEqual([]);
	});

	it('rejects a maxFret outside 0..24', () => {
		expect(() => fretsForPitch(2, 'F', -1)).toThrow(RangeError);
		expect(() => fretsForPitch(2, 'F', 25)).toThrow(RangeError);
	});
});

describe('acceptableMidis', () => {
	it('returns every octave of the pitch playable on the string', () => {
		expect(acceptableMidis({ string: 2, pitch: 'F' })).toEqual([65, 77]);
		expect(acceptableMidis({ string: 6, pitch: 'E' })).toEqual([40, 52, 64]);
		expect(acceptableMidis({ string: 1, pitch: 'E' })).toEqual([64, 76, 88]);
		expect(acceptableMidis({ string: 4, pitch: 'C#' })).toEqual([61, 73]);
	});

	it('keeps to the target pitch and the string range for all 72 targets', () => {
		for (const string of STRING_NUMBERS) {
			for (const pitch of CHROMATIC_NOTES) {
				const target: LocateItem = { string, pitch };
				const midis = acceptableMidis(target);
				expect(midis.length).toBeGreaterThanOrEqual(2);
				expect(midis.length).toBeLessThanOrEqual(3);
				for (const midi of midis) {
					expect(pitchOfMidi(midi)).toBe(pitch);
					expect(midi).toBeGreaterThanOrEqual(STANDARD_TUNING[string]);
					expect(midi).toBeLessThanOrEqual(STANDARD_TUNING[string] + 24);
				}
			}
		}
	});
});
