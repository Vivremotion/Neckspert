import { registerTestSkills } from '$lib/testing/testSkills';
import { describe, expect, it } from 'vitest';
import { FORM_EXERCISE } from '$lib/testing/arpeggioExercise';
import { ITEM_FIELDS } from './itemFields';

registerTestSkills();

const D_ON_B = 'D|maj|3:5,2:1,1:3';

/** One item of each set that offers fields. */
const SAMPLES: Record<string, unknown> = {
	'note-on-string': { string: 2, pitch: 'F' },
	'placed-note': { string: 3, fret: 8 },
	'voicing-on-strings': { voicingKey: D_ON_B, position: 2, fret: 3 },
	'placed-voicing': { voicing: D_ON_B, frets: [2, 3, 2], beats: 4 },
	'placed-shape': { shape: 'maj7', first: 'd', beats: 4 }
};

describe('ITEM_FIELDS', () => {
	it('names exactly the fields it writes for an item', () => {
		expect(Object.keys(ITEM_FIELDS).sort()).toEqual(Object.keys(SAMPLES).sort());
		for (const [set, offered] of Object.entries(ITEM_FIELDS)) {
			for (const locale of ['fr', 'en'] as const) {
				const written = offered.fields(SAMPLES[set], locale, () => 0, FORM_EXERCISE);
				expect(Object.keys(written).sort(), set).toEqual([...offered.names].sort());
			}
		}
	});
});

describe('the fields of a triad', () => {
	// The anchor's and the zone's: one set, its items with a position or without.
	const anchor = ITEM_FIELDS['voicing-on-strings'];
	const zone = ITEM_FIELDS['voicing-on-strings'];

	it('spells Eb, Ab and Bb with a flat', () => {
		expect(
			anchor.fields({ voicingKey: 'D#|min|3:5,2:1,1:b3' }, 'fr', () => 0, FORM_EXERCISE).chord
		).toBe('Ebm');
		expect(
			anchor.fields({ voicingKey: 'C#|maj|3:5,2:1,1:3' }, 'fr', () => 0, FORM_EXERCISE).chord
		).toBe('C#');
	});

	it('names the fret drawn for a zone, else the lowest fret of its shape', () => {
		expect(
			zone.fields({ voicingKey: D_ON_B, position: 2, fret: 3 }, 'fr', () => 0, FORM_EXERCISE).around
		).toBe('vers la case 3');
		expect(
			zone.fields({ voicingKey: D_ON_B, position: 2, fret: 3 }, 'en', () => 0, FORM_EXERCISE).around
		).toBe('around fret 3');
		// An attempt stored before the fret was drawn.
		expect(
			zone.fields({ voicingKey: D_ON_B, position: 2 }, 'fr', () => 0, FORM_EXERCISE).around
		).toBe('vers la case 2');
	});

	it('says nothing around an item without a position', () => {
		expect(anchor.fields({ voicingKey: D_ON_B }, 'fr', () => 0, FORM_EXERCISE).around).toBe('');
	});

	it('calls a shape on open strings open', () => {
		const open = { voicingKey: 'E|min|3:b3,2:5,1:1', position: 'open' };
		expect(zone.fields(open, 'fr', () => 0, FORM_EXERCISE)).toMatchObject({
			chord: 'Em',
			around: 'à vide'
		});
		expect(zone.fields(open, 'en', () => 0, FORM_EXERCISE).around).toBe('open');
	});
});

describe('the fields of a voicing figure', () => {
	const figure = ITEM_FIELDS['placed-voicing'];

	it('names the chord and the strings, in either language', () => {
		const item = { voicing: 'C|maj7|4:1,3:5,2:7,1:3', frets: [10, 12, 12, 12] };
		expect(figure.fields(item, 'fr', () => 0, FORM_EXERCISE)).toEqual({
			chord: 'Cmaj7',
			strings: 'ré‑sol‑si‑mi'
		});
		expect(
			figure.fields({ voicing: D_ON_B, frets: [2, 3, 2] }, 'fr', () => 0, FORM_EXERCISE)
		).toEqual({
			chord: 'D',
			strings: 'sol‑si‑mi'
		});
		expect(
			figure.fields({ voicing: D_ON_B, frets: [2, 3, 2] }, 'en', () => 0, FORM_EXERCISE).strings
		).toBe('G‑B‑E');
	});
});

describe('the fields of a form figure', () => {
	const shape = ITEM_FIELDS['placed-shape'];
	const chord = (first: string) =>
		shape.fields({ shape: 'maj7', first }, 'fr', () => 0, FORM_EXERCISE).chord;

	it("names the chord from the first note as written, then the shape's symbol", () => {
		expect(chord('bes')).toBe('Bbmaj7');
		expect(chord('as')).toBe('Abmaj7');
		expect(chord('es')).toBe('Ebmaj7');
		expect(chord('ees')).toBe('Ebmaj7');
		expect(chord('fis')).toBe('F#maj7');
		expect(chord('c')).toBe('Cmaj7');
	});

	it('leaves the octave out of the name', () => {
		expect(chord("bes'")).toBe('Bbmaj7');
		expect(chord('g,')).toBe('Gmaj7');
	});

	it('names the note alone on a shape the exercise does not write', () => {
		const item = { shape: 'nowhere', first: 'bes' };
		expect(shape.fields(item, 'fr', () => 0, FORM_EXERCISE)).toEqual({ chord: 'Bb' });
		expect(shape.fields(item, 'fr', () => 0, { ...FORM_EXERCISE, shapes: undefined })).toEqual({
			chord: 'Bb'
		});
	});
});
