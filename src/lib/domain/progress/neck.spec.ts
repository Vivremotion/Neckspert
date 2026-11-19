import { describe, expect, it } from 'vitest';
import { IDENTIFY_NECK, LOCATE_NECK, TRIADS_ANCHOR } from '$lib/testing/catalog';
import {
	exercisesOnSet,
	isLocated,
	isNamed,
	isNeck,
	LOCATED_NOTES,
	NAMED_NOTES,
	neckOf
} from './neck';

describe('the neck, told by the item sets of its skills', () => {
	it('tells a located note, a named place and the rest apart by set', () => {
		expect(isLocated(LOCATE_NECK.practices)).toBe(true);
		expect(isNamed(IDENTIFY_NECK.practices)).toBe(true);
		expect(isNeck({ skill: LOCATE_NECK.practices })).toBe(true);
		expect(isNeck({ skill: IDENTIFY_NECK.practices })).toBe(true);
		expect(isNeck({ skill: TRIADS_ANCHOR.practices })).toBe(false);
		// A skill no file defines belongs to no track.
		expect(isNeck({ skill: 'kazoo' })).toBe(false);
	});

	it('finds the registered exercises on a set', () => {
		expect(exercisesOnSet(LOCATED_NOTES).map((e) => e.id)).toEqual([LOCATE_NECK.id]);
		expect(exercisesOnSet(NAMED_NOTES).map((e) => e.id)).toEqual([IDENTIFY_NECK.id]);
	});

	it('takes its places from the items its exercises list, by string then fret', () => {
		const neck = neckOf();
		expect(neck.located).toBe(LOCATE_NECK.practices);
		expect(neck.named).toBe(IDENTIFY_NECK.practices);
		expect(neck.places).toHaveLength(66);
		expect(neck.places[0]).toEqual({ string: 1, fret: 1 });
		expect(neck.places.at(-1)).toEqual({ string: 6, fret: 11 });
	});

	it('places a located note at the fret it is prompted at, and lists a place once', () => {
		const neck = neckOf([
			{ ...LOCATE_NECK, items: ['2:C', '6:E'] },
			{ ...IDENTIFY_NECK, items: ['2:1', '3:4'] }
		]);
		// C on the B string is fret 1; E on the low E string only above the open string, fret 12,
		// past the frets prompted: it has no place.
		expect(neck.places).toEqual([
			{ string: 2, fret: 1 },
			{ string: 3, fret: 4 }
		]);
	});

	it('has no place and no skill without an exercise of the neck', () => {
		expect(neckOf([TRIADS_ANCHOR])).toEqual({ located: null, named: null, places: [] });
	});
});
