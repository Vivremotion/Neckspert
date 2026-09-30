import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHROMATIC_NOTES, STRING_NUMBERS } from '$lib/domain/music/types';
import { answerChoiceLabel, formatNote, fretLabel, spellPitch, stringLabel } from './naming';

describe('spellPitch', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('keeps naturals without drawing a random number', () => {
		const random = vi.fn(() => 0.9);
		expect(spellPitch('F', random)).toEqual({ pitch: 'F', spelling: 'sharp' });
		expect(spellPitch('B', random)).toEqual({ pitch: 'B', spelling: 'sharp' });
		expect(random).not.toHaveBeenCalled();
	});

	it('spells altered pitches sharp below 0.5 and flat from 0.5', () => {
		expect(spellPitch('F#', () => 0)).toEqual({ pitch: 'F#', spelling: 'sharp' });
		expect(spellPitch('F#', () => 0.49)).toEqual({ pitch: 'F#', spelling: 'sharp' });
		expect(spellPitch('F#', () => 0.5)).toEqual({ pitch: 'F#', spelling: 'flat' });
		expect(spellPitch('A#', () => 0.99)).toEqual({ pitch: 'A#', spelling: 'flat' });
	});

	it('draws from Math.random by default', () => {
		vi.spyOn(Math, 'random').mockReturnValue(0.7);
		expect(spellPitch('C#')).toEqual({ pitch: 'C#', spelling: 'flat' });
		expect(Math.random).toHaveBeenCalledOnce();
	});
});

describe('formatNote', () => {
	it('prints naturals and sharps as they are', () => {
		expect(formatNote({ pitch: 'F', spelling: 'sharp' })).toBe('F');
		expect(formatNote({ pitch: 'F#', spelling: 'sharp' })).toBe('F#');
		expect(formatNote({ pitch: 'F', spelling: 'flat' })).toBe('F');
	});

	it('prints the flat name of every altered pitch', () => {
		const flats = (['C#', 'D#', 'F#', 'G#', 'A#'] as const).map((pitch) =>
			formatNote({ pitch, spelling: 'flat' })
		);
		expect(flats).toEqual(['Db', 'Eb', 'Gb', 'Ab', 'Bb']);
	});
});

describe('answerChoiceLabel', () => {
	it('labels naturals alone and altered pitches with both spellings', () => {
		expect(CHROMATIC_NOTES.map((pitch) => answerChoiceLabel(pitch))).toEqual([
			'C',
			'C# / Db',
			'D',
			'D# / Eb',
			'E',
			'F',
			'F# / Gb',
			'G',
			'G# / Ab',
			'A',
			'A# / Bb',
			'B'
		]);
	});
});

describe('stringLabel', () => {
	it('names strings in French, with grave and aiguë for the two E strings', () => {
		expect(STRING_NUMBERS.map((string) => stringLabel(string, 'fr'))).toEqual([
			'corde de E aiguë',
			'corde de B',
			'corde de G',
			'corde de D',
			'corde de A',
			'corde de E grave'
		]);
	});

	it('names strings in English, with high and low for the two E strings', () => {
		expect(STRING_NUMBERS.map((string) => stringLabel(string, 'en'))).toEqual([
			'high E string',
			'B string',
			'G string',
			'D string',
			'A string',
			'low E string'
		]);
	});
});

describe('fretLabel', () => {
	it('prints frets in French, and the open string', () => {
		expect(fretLabel(8, 'fr')).toBe('case 8');
		expect(fretLabel(1, 'fr')).toBe('case 1');
		expect(fretLabel(0, 'fr')).toBe('corde à vide');
	});

	it('prints frets in English, and the open string', () => {
		expect(fretLabel(8, 'en')).toBe('fret 8');
		expect(fretLabel(11, 'en')).toBe('fret 11');
		expect(fretLabel(0, 'en')).toBe('open string');
	});
});
