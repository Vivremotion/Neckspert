import { describe, expect, it } from 'vitest';
import { gridFromJson } from './fromJson';

const BLUES = {
	id: 'blues',
	title: 'Blues',
	beatsPerBar: 4,
	bars: 2,
	chords: [
		{ bar: 1, beat: 1, symbol: 'F7' },
		{ bar: 2, beat: 1, symbol: 'Bb7' }
	]
};

describe('gridFromJson', () => {
	it('reads a grid', () => expect(gridFromJson(BLUES)).toEqual(BLUES));
	it('refuses what is no object', () =>
		expect(() => gridFromJson([])).toThrow('a grid must be a JSON object'));
	it('refuses an unknown key', () =>
		expect(() => gridFromJson({ ...BLUES, tempo: 80 })).toThrow('unknown key "tempo"'));
	it('refuses an empty id', () =>
		expect(() => gridFromJson({ ...BLUES, id: '' })).toThrow('id must be a string'));
	it('refuses a title that is no string', () =>
		expect(() => gridFromJson({ ...BLUES, title: 3 })).toThrow('title must be a string'));
	it('refuses another bar length', () =>
		expect(() => gridFromJson({ ...BLUES, beatsPerBar: 3 })).toThrow('beatsPerBar must be 4'));
	it('refuses bars that are no positive integer', () =>
		expect(() => gridFromJson({ ...BLUES, bars: 0 })).toThrow('bars must be a positive integer'));
	it('refuses chords that are no list', () =>
		expect(() => gridFromJson({ ...BLUES, chords: {} })).toThrow(
			'chords must be a list of { bar, beat, symbol }'
		));
	it('refuses a chord that is no object', () =>
		expect(() => gridFromJson({ ...BLUES, chords: ['F7'] })).toThrow(
			'chords[0] must be { bar, beat, symbol }'
		));
	it('refuses an unknown key in a chord', () => {
		const chords = [{ ...BLUES.chords[0], root: 'F' }];
		expect(() => gridFromJson({ ...BLUES, chords })).toThrow('chords[0]: unknown key "root"');
	});
	it('refuses a chord whose bar is no number', () => {
		const chords = [{ ...BLUES.chords[0], bar: '1' }];
		expect(() => gridFromJson({ ...BLUES, chords })).toThrow('chords[0].bar must be a number');
	});
	it('refuses a chord whose beat is no number', () => {
		const chords = [{ ...BLUES.chords[0], beat: '1' }];
		expect(() => gridFromJson({ ...BLUES, chords })).toThrow('chords[0].beat must be a number');
	});
	it('refuses a chord whose symbol is no string', () => {
		const chords = [{ ...BLUES.chords[0], symbol: 7 }];
		expect(() => gridFromJson({ ...BLUES, chords })).toThrow('chords[0].symbol must be a string');
	});
	it('names the chord whose symbol does not read', () => {
		const chords = [BLUES.chords[0], { bar: 2, beat: 1, symbol: 'H7' }];
		expect(() => gridFromJson({ ...BLUES, chords })).toThrow(/^chords\[1\]\.symbol: /);
	});
	it('refuses a grid that does not start on bar 1, beat 1', () => {
		expect(() => gridFromJson({ ...BLUES, chords: [{ bar: 2, beat: 1, symbol: 'F7' }] })).toThrow(
			'must start on bar 1, beat 1'
		);
	});
});
