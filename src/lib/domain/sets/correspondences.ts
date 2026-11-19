import { pitchOnString } from '$lib/domain/music';
import type { StringNumber } from '$lib/domain/music';

/** How an item of one set names an item of another (`enter.acquired.item` of an exercise's learning). */
export interface Correspondence {
	/** The item of the other set an item names; null when it names none. */
	of(item: unknown): unknown | null;
}

/** The names a correspondence is registered under. */
export const CORRESPONDENCE_NAMES: readonly string[] = ['same', 'same-place', 'voicing'];

const SAME: Correspondence = { of: (item) => item };

/** A placed note `{ string, fret }` names the note on its string `{ string, pitch }`. */
const SAME_PLACE: Correspondence = {
	of(item) {
		const placed = item as { string: StringNumber; fret: number };
		return { string: placed.string, pitch: pitchOnString(placed.string, placed.fret) };
	}
};

/** A placed voicing `{ voicing, frets }` names its voicing on its strings `{ voicingKey }`. */
const VOICING: Correspondence = {
	of: (item) => ({ voicingKey: (item as { voicing: string }).voicing })
};

/**
 * The correspondence `name` from set `from` to set `to` (set ids); null when none is registered.
 * `same` holds between any set and itself.
 */
export function correspondence(name: string, from: string, to: string): Correspondence | null {
	if (name === 'same') return from === to ? SAME : null;
	if (name === 'same-place' && from === 'placed-note' && to === 'note-on-string') return SAME_PLACE;
	if (name === 'voicing' && from === 'placed-voicing' && to === 'voicing-on-strings')
		return VOICING;
	return null;
}
