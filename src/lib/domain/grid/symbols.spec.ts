import { describe, expect, it } from 'vitest';
import { formatSpelledNote } from '$lib/domain/music';
import { parseChordSymbol, triadOf } from './symbols';

function read(symbol: string) {
	const { root, quality, extensions, bass } = parseChordSymbol(symbol);
	return {
		root: formatSpelledNote(root),
		quality,
		extensions,
		bass: bass && formatSpelledNote(bass)
	};
}

describe('parseChordSymbol', () => {
	it('reads the symbols of the starting grids', () => {
		expect(read('Dm7')).toEqual({ root: 'D', quality: 'm7', extensions: [], bass: null });
		expect(read('G7')).toMatchObject({ root: 'G', quality: '7' });
		expect(read('Cmaj7')).toMatchObject({ root: 'C', quality: 'maj7' });
		expect(read('F7')).toMatchObject({ root: 'F', quality: '7' });
		expect(read('Em7')).toMatchObject({ root: 'E', quality: 'm7' });
		expect(read('Ebm7')).toMatchObject({ root: 'Eb', quality: 'm7' });
		expect(read('Ab7')).toMatchObject({ root: 'Ab', quality: '7' });
		expect(read('Bb7')).toMatchObject({ root: 'Bb', quality: '7' });
		expect(read('C7')).toMatchObject({ root: 'C', quality: '7' });
	});

	it('reads the other ways of writing a quality', () => {
		expect(read('D-7')).toMatchObject({ root: 'D', quality: 'm7' });
		expect(read('CΔ7')).toMatchObject({ quality: 'maj7' });
		expect(read('CΔ')).toMatchObject({ quality: 'maj7' });
		expect(read('Dø7')).toMatchObject({ quality: 'm7b5' });
		expect(read('Dø')).toMatchObject({ quality: 'm7b5' });
		expect(read('E7#5')).toMatchObject({ quality: '7#5' });
		expect(read('C6')).toMatchObject({ quality: '6' });
		expect(read('C')).toMatchObject({ quality: 'maj' });
		expect(read('C#m')).toMatchObject({ root: 'C#', quality: 'min' });
	});

	it('keeps the extensions as data', () => {
		expect(read('A7b9')).toMatchObject({ quality: '7', extensions: ['b9'] });
		expect(read('Bb7#11')).toMatchObject({ root: 'Bb', quality: '7', extensions: ['#11'] });
	});

	it('reads a bass after a slash', () => {
		expect(read('G7/F')).toEqual({ root: 'G', quality: '7', extensions: [], bass: 'F' });
	});

	it('refuses an unknown symbol, naming it', () => {
		for (const symbol of ['H7', 'Dm7#', 'Gsus', 'G7/H', '']) {
			expect(() => parseChordSymbol(symbol)).toThrow(RangeError);
		}
		expect(() => parseChordSymbol('Dm7#')).toThrow(/Dm7#/);
	});
});

describe('triadOf', () => {
	const triad = (symbol: string) => {
		const { root, quality } = triadOf(symbol);
		return `${formatSpelledNote(root)} ${quality.id}`;
	};

	it('plays the triad a symbol stands for, its bass left out', () => {
		expect(triad('Dm7')).toBe('D min');
		expect(triad('G7/F')).toBe('G maj');
		expect(triad('Cmaj7')).toBe('C maj');
		expect(triad('C6')).toBe('C maj');
		expect(triad('Am6')).toBe('A min');
		expect(triad('Dø7')).toBe('D dim');
		expect(triad('E7#5')).toBe('E aug');
		expect(triad('G9')).toBe('G maj');
	});

	it('keeps the spelling of the symbol', () => {
		expect(triad('Ebm7')).toBe('Eb min');
		expect(triad('Ab7')).toBe('Ab maj');
	});

	it('refuses a symbol without a triad', () => {
		expect(() => triadOf('Gsus4')).toThrow(RangeError);
		expect(() => triadOf('Gsus2')).toThrow(/Gsus2/);
	});
});
