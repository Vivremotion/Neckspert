import { describe, expect, it } from 'vitest';
import {
	QUALITIES,
	SEVENTH_QUALITIES,
	chordLabel,
	chordTones,
	qualityById,
	spellInterval,
	type Chord,
	type ChordQuality
} from './chord';
import { formatSpelledNote, parseSpelledNote } from './spelling';

function chord(root: string, quality: string | ChordQuality): Chord {
	return {
		root: parseSpelledNote(root),
		quality: typeof quality === 'string' ? qualityById(quality) : quality
	};
}

const written = (c: Chord) => chordTones(c).map((tone) => formatSpelledNote(tone.note));

const MAJ7: ChordQuality = { id: 'maj7', suffix: 'maj7', degrees: ['1', '3', '5', '7'] };

describe('chordTones', () => {
	it('spells each degree from the chord name', () => {
		expect(written(chord('Eb', 'min'))).toEqual(['Eb', 'Gb', 'Bb']);
		expect(written(chord('Ab', 'min'))).toEqual(['Ab', 'Cb', 'Eb']);
		expect(written(chord('C#', 'maj'))).toEqual(['C#', 'E#', 'G#']);
		expect(written(chord('Eb', 'dim'))).toEqual(['Eb', 'Gb', 'Bbb']);
	});

	it('gives the sharp pitches and the degrees', () => {
		expect(chordTones(chord('Eb', 'min')).map((tone) => tone.pitch)).toEqual(['D#', 'F#', 'A#']);
		expect(chordTones(chord('C', 'aug')).map((tone) => tone.degree)).toEqual(['1', '3', '#5']);
	});

	it('accepts a quality defined as data', () => {
		expect(written(chord('C', MAJ7))).toEqual(['C', 'E', 'G', 'B']);
		expect(chordLabel(chord('C', MAJ7))).toBe('Cmaj7');
	});
});

describe('chordLabel', () => {
	it('writes the root and the suffix', () => {
		expect(chordLabel(chord('Eb', 'min'))).toBe('Ebm');
		expect(chordLabel(chord('C#', 'maj'))).toBe('C#');
		expect(chordLabel(chord('B', 'dim'))).toBe('Bdim');
		expect(chordLabel(chord('C', 'aug'))).toBe('Caug');
	});
});

describe('qualities', () => {
	it('holds the four triad qualities', () => {
		expect(QUALITIES.map((quality) => quality.id)).toEqual(['maj', 'min', 'dim', 'aug']);
	});

	it('holds the seventh qualities apart, found by id like the triads', () => {
		expect(SEVENTH_QUALITIES.map((quality) => quality.id)).toEqual([
			'maj7',
			'7',
			'm7',
			'm7b5',
			'6',
			'm6',
			'7#5'
		]);
		expect(written(chord('C', 'maj7'))).toEqual(['C', 'E', 'G', 'B']);
		expect(written(chord('D', 'm7b5'))).toEqual(['D', 'F', 'Ab', 'C']);
		expect(written(chord('G', '7'))).toEqual(['G', 'B', 'D', 'F']);
		expect(written(chord('Eb', 'm7'))).toEqual(['Eb', 'Gb', 'Bb', 'Db']);
		expect(written(chord('C', '6'))).toEqual(['C', 'E', 'G', 'A']);
		expect(written(chord('A', 'm6'))).toEqual(['A', 'C', 'E', 'F#']);
		expect(written(chord('E', '7#5'))).toEqual(['E', 'G#', 'B#', 'D']);
	});

	it('rejects an unknown quality', () => {
		expect(() => qualityById('sus4')).toThrow(RangeError);
	});
});

describe('spellInterval', () => {
	it('refuses a triple sharp', () => {
		expect(() => spellInterval(parseSpelledNote('B##'), '#5')).toThrow(RangeError);
	});
});
