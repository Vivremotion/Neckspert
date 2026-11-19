import { parseVoicingKey } from '$lib/domain/music';
import { occurrenceOfId, placedShapeId } from '$lib/domain/triads';
import type { ItemSet } from './types';

/**
 * What a voicing-figure attempt is about: a chord shape at one of its places on the neck, played
 * as a figure. `beats` is the length of its turn, when the exercise gives it one in its list of
 * items: it is not part of the key.
 */
export interface VoicingFigureItem {
	/** A voicing key (`voicingKey`). */
	voicing: string;
	/** The fret of each of its notes, in its strings' order: the place of the shape. */
	frets: readonly number[];
	beats?: number;
}

/**
 * Chord shapes placed on the neck, whose notes a figure plays. The key is the id of the placed
 * shape (`occurrenceId`): `${voicing}@${frets joined by -}`.
 */
export const placedVoicingSet: ItemSet<VoicingFigureItem> = {
	id: 'placed-voicing',
	itemKey: ({ voicing, frets }) => placedShapeId(voicing, frets),
	parseItem: (itemKey) => {
		const at = itemKey.lastIndexOf('@');
		if (at < 1) throw new Error(`Invalid voicing figure item key: "${itemKey}"`);
		const voicing = itemKey.slice(0, at);
		parseVoicingKey(voicing);
		const place = occurrenceOfId(itemKey);
		if (!place) {
			throw new Error(`the voicing has no place at frets ${itemKey.slice(at + 1)}`);
		}
		return { voicing, frets: place.notes.map((note) => note.fret) };
	},
	cardItem: ({ voicing, frets }) => ({ voicing, frets })
};
