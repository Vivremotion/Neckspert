import { registerTestSkills } from '$lib/testing/testSkills';
import { describe, expect, it } from 'vitest';
import type { ExerciseDefinition } from '../exercise/types';
import { FORM_EXERCISE } from '$lib/testing/arpeggioExercise';
import { CONTENT_DERIVATIONS, ITEM_FIGURES, ITEM_NUMBERS, ITEM_VALUES } from './index';

registerTestSkills();

/** What the derivations that do not read an exercise's shapes are given. */
const NO_SHAPES = { ...FORM_EXERCISE, shapes: undefined } satisfies ExerciseDefinition;

const C_FIRST = 'C|maj|3:3,2:5,1:1';

// D major on the G-B-E strings with the root on the B string.
const KEY = 'D|maj|3:5,2:1,1:3';

describe('the derivations', () => {
	it('derives the item itself, and measures a change of a grid on its grid', () => {
		const item = { string: 3, pitch: 'F' };
		expect(CONTENT_DERIVATIONS['name-of-item'].derive(item, NO_SHAPES)).toBe(item);
		const beats = ITEM_NUMBERS['change-beats'];
		// iohefy-a: Cmaj7 over a bar and a half (equal symbols in a row are one change), then F7.
		expect(beats.measure({ grid: 'iohefy-a', index: 0 })).toBe(4);
		expect(beats.measure({ grid: 'iohefy-a', index: 4 })).toBe(6);
		expect(beats.measure({ grid: 'iohefy-a', index: 5 })).toBe(2);
		expect(() => beats.measure({ grid: 'iohefy-a', index: 40 })).toThrow(
			'grid "iohefy-a" has no change at rank 40'
		);
	});

	it('declares the sets each derivation reads', () => {
		const reads = Object.fromEntries(
			Object.entries(CONTENT_DERIVATIONS).map(([name, d]) => [name, d.reads])
		);
		expect(reads).toEqual({
			'name-of-item': ['placed-note'],
			'voicing-notes': ['placed-voicing'],
			'shape-notes': ['placed-shape']
		});
		expect(ITEM_NUMBERS['change-beats'].reads).toEqual(['change']);
		expect(ITEM_NUMBERS.beats.reads).toEqual(['placed-voicing', 'placed-shape']);
	});

	it("voicing-notes derives the notes of the item's voicing", () => {
		const notes = CONTENT_DERIVATIONS['voicing-notes'];
		expect(notes.kind).toBe('pitch');
		expect(notes.list).toBe(true);
		expect(notes.derive({ voicing: C_FIRST, frets: [9, 8, 8] }, NO_SHAPES)).toEqual([
			{ midi: 64, string: 3 },
			{ midi: 67, string: 2 },
			{ midi: 72, string: 1 }
		]);
		expect(
			notes.derive({ voicing: 'C|maj|3:5,2:1,1:3', frets: [12, 13, 12], beats: 4 }, NO_SHAPES)
		).toEqual([
			{ midi: 67, string: 3 },
			{ midi: 72, string: 2 },
			{ midi: 76, string: 1 }
		]);
		expect(() => notes.derive({ voicing: C_FIRST, frets: [9, 9, 9] }, NO_SHAPES)).toThrow(
			'the voicing has no place at frets 9-9-9'
		);
	});

	it("shape-notes derives the item's shape, moved to its first note", () => {
		const notes = CONTENT_DERIVATIONS['shape-notes'];
		expect(notes.kind).toBe('pitch');
		expect(notes.derive({ shape: 'maj7', first: 'd' }, FORM_EXERCISE)).toEqual([
			{ midi: 50, string: 5, name: 'D' },
			{ midi: 54, string: 4, name: 'F#' },
			{ midi: 57, string: 4, name: 'A' },
			{ midi: 61, string: 3, name: 'C#' }
		]);
		expect(notes.derive({ shape: 'maj7', first: 'bes', beats: 2 }, FORM_EXERCISE)).toEqual([
			{ midi: 58, string: 5, name: 'Bb' },
			{ midi: 62, string: 4, name: 'D' },
			{ midi: 65, string: 4, name: 'F' },
			{ midi: 69, string: 3, name: 'A' }
		]);
	});

	it('shape-notes throws on a shape the exercise does not write, or moved off the neck', () => {
		const notes = CONTENT_DERIVATIONS['shape-notes'];
		expect(() => notes.derive({ shape: 'nowhere', first: 'd' }, FORM_EXERCISE)).toThrow(
			/shape "nowhere".*\(maj7\)/
		);
		expect(() => notes.derive({ shape: 'maj7', first: 'd' }, NO_SHAPES)).toThrow(
			/shape "maj7".*none/
		);
		expect(() => notes.derive({ shape: 'maj7', first: 'g,' }, FORM_EXERCISE)).toThrow(
			/below string 5/
		);
	});

	it('only voicing-notes and shape-notes spread a list', () => {
		const lists = Object.entries(CONTENT_DERIVATIONS)
			.filter(([, d]) => d.list)
			.map(([name]) => name);
		expect(lists).toEqual(['voicing-notes', 'shape-notes']);
	});

	it("beats measures the item's own length and throws without one", () => {
		expect(ITEM_NUMBERS.beats.measure({ voicing: C_FIRST, frets: [9, 8, 8], beats: 4 })).toBe(4);
		expect(() => ITEM_NUMBERS.beats.measure({ voicing: C_FIRST, frets: [9, 8, 8] })).toThrow();
		expect(ITEM_NUMBERS.beats.measure({ shape: 'maj7', first: 'd', beats: 2 })).toBe(2);
	});

	it('reads the figure a rhythm item names', () => {
		expect(ITEM_FIGURES.figure.reads).toEqual(['figure']);
		expect(ITEM_FIGURES.figure.figureOf({ figureId: 'eighths' })).toBe('eighths');
	});
});

describe('the values a filter reads on an item', () => {
	it('reads the fret the prompt names, else the place of the shape asked, absent without one', () => {
		expect(ITEM_VALUES.fret.reads).toEqual(['voicing-on-strings']);
		expect(ITEM_VALUES.fret.valueOf({ voicingKey: KEY, position: 5, fret: 7 })).toBe(7);
		expect(ITEM_VALUES.fret.valueOf({ voicingKey: KEY, position: 5 })).toBe(5);
		expect(ITEM_VALUES.fret.valueOf({ voicingKey: KEY, position: 'open' })).toBe(0);
		expect(ITEM_VALUES.fret.valueOf({ voicingKey: KEY })).toBeUndefined();
	});

	it('reads the string of a note on a string', () => {
		expect(ITEM_VALUES.string.reads).toEqual(['note-on-string']);
		expect(ITEM_VALUES.string.valueOf({ string: 2, pitch: 'F' })).toBe(2);
	});
});
