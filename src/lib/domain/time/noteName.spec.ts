import { describe, expect, it } from 'vitest';
import { parseNoteName, readNoteName } from './noteName';

describe('parseNoteName', () => {
	it('reads absolute octaves: c is 48, each mark an octave', () => {
		expect(parseNoteName('c').midi).toBe(48);
		expect(parseNoteName("c'").midi).toBe(60);
		expect(parseNoteName("c''").midi).toBe(72);
		expect(parseNoteName('c,').midi).toBe(36);
	});

	it('reads the open strings of a guitar', () => {
		expect(['e,', 'a,', 'd', 'g', 'b', "e'"].map((n) => parseNoteName(n).midi)).toEqual([
			40, 45, 50, 55, 59, 64
		]);
	});

	it('reads Dutch accidentals, es and as alone for E and A flat', () => {
		expect(parseNoteName('fis').midi).toBe(54);
		expect(parseNoteName('bes').midi).toBe(58);
		expect(parseNoteName('es').midi).toBe(51);
		expect(parseNoteName('ees').midi).toBe(51);
		expect(parseNoteName('as').midi).toBe(56);
		expect(parseNoteName('aes').midi).toBe(56);
		expect(parseNoteName('cisis').midi).toBe(50);
		expect(parseNoteName('beses').midi).toBe(57);
	});

	it('names a note as a chart writes it, without its octave', () => {
		const names = ['c', 'bes', 'as', 'es', 'ees', 'fis', "bes'", 'g,', 'cisis', 'beses'];
		expect(names.map((n) => parseNoteName(n).name)).toEqual([
			'C',
			'Bb',
			'Ab',
			'Eb',
			'Eb',
			'F#',
			'Bb',
			'G',
			'C##',
			'Bbb'
		]);
	});

	it('refuses anything but one note, naming the text', () => {
		for (const text of ['', 'h', 'r', 'd4', 'd\\5', 'd e', ' d', 'cus', "d',", "c''''''''''"]) {
			expect(() => parseNoteName(text), text).toThrow(`"${text}"`);
		}
	});
});

describe('readNoteName', () => {
	it('reads a note from where it stands and tells where it ends', () => {
		expect(readNoteName("c4 bes'8", 3)).toEqual({ midi: 70, name: 'Bb', end: 7 });
	});

	it('tells what is wrong and where', () => {
		expect(readNoteName('c cisi', 2)).toEqual({ problem: "unknown note name 'cisi'", offset: 2 });
		expect(readNoteName("c',", 0)).toEqual({
			problem: "octave marks must all go up (') or all go down (,)",
			offset: 2
		});
		expect(readNoteName('h', 0)).toEqual({ problem: "unknown note name 'h'", offset: 0 });
	});
});
