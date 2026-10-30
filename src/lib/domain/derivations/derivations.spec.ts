import { describe, expect, it } from 'vitest';
import type { ExerciseDefinition } from '../exercise/types';
import { FORM_EXERCISE } from '$lib/testing/arpeggioExercise';
import { CONTENT_DERIVATIONS, ITEM_FIGURES, ITEM_NUMBERS } from './index';

/** What the derivations that do not read an exercise's forms are given. */
const NO_FORMS = { ...FORM_EXERCISE, forms: undefined } satisfies ExerciseDefinition;

const C_FIRST = 'C|maj|3:3,2:5,1:1';

// D major on the G-B-E strings with the root on the B string.
const KEY = 'D|maj|3:5,2:1,1:3';

describe('the derivations', () => {
	it('derives the root of a voicing as a note on its string', () => {
		const root = CONTENT_DERIVATIONS['voicing-root'];
		expect(root.kind).toBe('note');
		expect(root.derive({ voicingKey: KEY }, NO_FORMS)).toEqual({ string: 2, pitch: 'D' });
	});

	it('derives a voicing anywhere and at its position', () => {
		expect(
			CONTENT_DERIVATIONS['voicing-anywhere'].derive({ voicingKey: KEY, position: 7 }, NO_FORMS)
		).toEqual({ voicingKey: KEY, position: null });
		expect(
			CONTENT_DERIVATIONS['voicing-at-position'].derive({ voicingKey: KEY, position: 7 }, NO_FORMS)
		).toEqual({ voicingKey: KEY, position: 7 });
		expect(CONTENT_DERIVATIONS['voicing-at-position'].kind).toBe('chord-voicing');
		const item = { string: 3, pitch: 'F' };
		expect(CONTENT_DERIVATIONS['note-of-item'].derive(item, NO_FORMS)).toBe(item);
		expect(CONTENT_DERIVATIONS['name-of-item'].derive(item, NO_FORMS)).toBe(item);
		expect(CONTENT_DERIVATIONS['grid-change'].derive(item, NO_FORMS)).toBe(item);
		expect(
			ITEM_NUMBERS['change-beats'].measure({ changes: [{ length: 2 }, { length: 4 }], index: 1 })
		).toBe(4);
	});

	it('declares the mechanics each derivation reads', () => {
		const reads = Object.fromEntries(
			Object.entries(CONTENT_DERIVATIONS).map(([name, d]) => [name, d.reads])
		);
		expect(reads).toEqual({
			'note-of-item': ['locate'],
			'name-of-item': ['identify'],
			'voicing-root': ['triad-anchor', 'triad-zone'],
			'voicing-anywhere': ['triad-anchor', 'triad-zone'],
			'voicing-at-position': ['triad-zone'],
			'grid-change': ['chord-grid'],
			'voicing-notes': ['voicing-figure'],
			'form-notes': ['form-figure']
		});
		expect(ITEM_NUMBERS['change-beats'].reads).toEqual(['chord-grid']);
		expect(ITEM_NUMBERS.beats.reads).toEqual(['voicing-figure', 'form-figure']);
	});

	it("voicing-notes derives the notes of the item's voicing", () => {
		const notes = CONTENT_DERIVATIONS['voicing-notes'];
		expect(notes.kind).toBe('pitch');
		expect(notes.list).toBe(true);
		expect(notes.derive({ voicing: C_FIRST, occurrence: 0 }, NO_FORMS)).toEqual([
			{ midi: 64, string: 3 },
			{ midi: 67, string: 2 },
			{ midi: 72, string: 1 }
		]);
		expect(
			notes.derive({ voicing: 'C|maj|3:5,2:1,1:3', occurrence: 1, beats: 4 }, NO_FORMS)
		).toEqual([
			{ midi: 67, string: 3 },
			{ midi: 72, string: 2 },
			{ midi: 76, string: 1 }
		]);
		expect(() => notes.derive({ voicing: C_FIRST, occurrence: 1 }, NO_FORMS)).toThrow();
	});

	it("form-notes derives the item's form, moved to its first note", () => {
		const notes = CONTENT_DERIVATIONS['form-notes'];
		expect(notes.kind).toBe('pitch');
		expect(notes.derive({ form: 'maj7', first: 'd' }, FORM_EXERCISE)).toEqual([
			{ midi: 50, string: 5 },
			{ midi: 54, string: 4 },
			{ midi: 57, string: 4 },
			{ midi: 61, string: 3 }
		]);
		expect(notes.derive({ form: 'maj7', first: 'bes', beats: 2 }, FORM_EXERCISE)).toEqual([
			{ midi: 58, string: 5 },
			{ midi: 62, string: 4 },
			{ midi: 65, string: 4 },
			{ midi: 69, string: 3 }
		]);
	});

	it('form-notes throws on a form the exercise does not write, or moved off the neck', () => {
		const notes = CONTENT_DERIVATIONS['form-notes'];
		expect(() => notes.derive({ form: 'nowhere', first: 'd' }, FORM_EXERCISE)).toThrow(
			/form "nowhere".*\(maj7\)/
		);
		expect(() => notes.derive({ form: 'maj7', first: 'd' }, NO_FORMS)).toThrow(/form "maj7".*none/);
		expect(() => notes.derive({ form: 'maj7', first: 'g,' }, FORM_EXERCISE)).toThrow(
			/below string 5/
		);
	});

	it('only voicing-notes and form-notes spread a list', () => {
		const lists = Object.entries(CONTENT_DERIVATIONS)
			.filter(([, d]) => d.list)
			.map(([name]) => name);
		expect(lists).toEqual(['voicing-notes', 'form-notes']);
	});

	it("beats measures the item's own length and throws without one", () => {
		expect(ITEM_NUMBERS.beats.measure({ voicing: C_FIRST, occurrence: 0, beats: 4 })).toBe(4);
		expect(() => ITEM_NUMBERS.beats.measure({ voicing: C_FIRST, occurrence: 0 })).toThrow();
		expect(ITEM_NUMBERS.beats.measure({ form: 'maj7', first: 'd', beats: 2 })).toBe(2);
	});

	it('reads the figure a rhythm item names', () => {
		expect(ITEM_FIGURES.figure.reads).toEqual(['figure']);
		expect(ITEM_FIGURES.figure.figureOf({ figureId: 'eighths' })).toBe('eighths');
	});
});
