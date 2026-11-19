import { describe, expect, it } from 'vitest';
import { introductionOrder } from '$lib/domain/progress/introduction';
import { triadIntroductionOrder } from '$lib/domain/triads/introduction';
import { triadParams } from '$lib/domain/triads/items';
import { LEARNABLE_FRETS, pitchOnString, voicingKey } from '$lib/domain/music';
import { noteOnStringSet, placedNoteSet, voicingOnStringsSet } from '$lib/domain/sets';
import { IDENTIFY_NECK, LOCATE_NECK, TRIADS_ANCHOR, TRIADS_ZONE } from './catalog';

describe('the lists of the catalog (until the generators go)', () => {
	const places = introductionOrder();
	const voicings = triadIntroductionOrder(triadParams(TRIADS_ANCHOR), new Set());

	it('lists locate-note-string as the neck introduction order, 66 notes on a string', () => {
		expect(LOCATE_NECK.items).toEqual(
			places.map((place) => noteOnStringSet.itemKey({ string: place.string, pitch: place.pitch }))
		);
		expect(LOCATE_NECK.items).toHaveLength(66);
	});

	it('lists identify-note on the same places, in the same order', () => {
		const frets = places.map((place) => {
			const fret = LEARNABLE_FRETS.find((f) => pitchOnString(place.string, f) === place.pitch);
			return placedNoteSet.itemKey({ string: place.string, fret: fret! });
		});
		expect(IDENTIFY_NECK.items).toEqual(frets);
		expect(IDENTIFY_NECK.items).toHaveLength(66);
	});

	it('lists both triad exercises as the voicings in introduction order', () => {
		const keys = voicings.map((voicing) =>
			voicingOnStringsSet.itemKey({ voicingKey: voicingKey(voicing) } as never)
		);
		expect(TRIADS_ANCHOR.items).toEqual(keys);
		expect(TRIADS_ZONE.items).toEqual(keys);
		expect(keys).toHaveLength(144);
	});

	it('writes the entry conditions and draws of the learning', () => {
		expect(IDENTIFY_NECK.params.learning).toEqual({
			enter: { acquired: { skill: 'locate-note-string', item: 'same-place' } }
		});
		expect(TRIADS_ZONE.params.learning).toEqual({
			enter: { acquired: { skill: 'chord-anchor', item: 'same' } },
			draw: 'another-place',
			presentAtOnce: false
		});
		expect(TRIADS_ANCHOR.params.learning).toEqual({ presentAtOnce: false });
	});
});
