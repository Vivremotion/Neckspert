import type { GridChange } from '$lib/domain/grid';
import {
	closeTriadVoicings,
	voicingOccurrences,
	type StringNumber,
	type VoicingOccurrence
} from '$lib/domain/music';
import { occurrenceOfId } from '$lib/domain/triads';
import type { ChordReading } from '$lib/domain/families/guitar/chordShapes';
import {
	beyond,
	classifyGridChord,
	inZone,
	parseTriadId,
	shapePosition,
	triadId,
	type ChordGridConfusion
} from './gridClassify';
export { classifyGridChord, inZone, parseTriadId, shapePosition, triadId };
export type { ChordGridConfusion };
import type { ItemSet } from './types';

/** How a gesture exercise judges a shape: the one asked, higher or lower, in a zone, anywhere. */
export type GestureRule = 'link' | 'climb' | 'zone' | 'jam';

/** A change of a passage: everything needed to judge it, hear it and show it. */
export interface ChordGridItem {
	rule: GestureRule;
	/** The element (stable): 'link:D|maj:3,2,1', 'climb:iohefy-a:3,2,1', 'zone:iohefy-a', 'jam:blues-f'. */
	element: string;
	/** This passage in the series: the attempts of a passage are grouped by it. */
	passageId: string;
	index: number;
	/** The grid of the passage, for the view. */
	changes: readonly GridChange[];
	/** This change's symbol. */
	symbol: string;
	/** Its triad, root as spelled: 'D|min', 'Eb|min'. */
	chord: string;
	sets: readonly (readonly StringNumber[])[];
	/** Link: the shape asked (occurrenceId). */
	shape?: string;
	/** Link: a tour chained to a tour of the same element; its lowest shape is not played again. */
	continued?: true;
	/** Climb. */
	direction?: 'up' | 'down';
	/** Zone: frets from `from` to `to`, both in. */
	zone?: { from: number; to: number };
	/** The last shape heard in the passage (occurrenceId): it still rings; the climb compares to it. */
	previous: string | null;
}

/** `Attempt.data` of a chord change. */
export interface ChordGridData {
	item: ChordGridItem;
	answer: ChordReading | null;
	confusion: ChordGridConfusion | null;
}

/** Joins a grid and the rank of a change in it: `iohefy-a#2`. */
const INDEX_SEPARATOR = '#';

/**
 * The direction a climb change goes: its own, unless no shape of its chord on its sets lies
 * strictly beyond the shape before in it (the neck runs out), where it turns. The session carries
 * the turned direction on this change and the ones after it.
 */
export function climbDirection(
	item: Pick<ChordGridItem, 'chord' | 'sets' | 'direction' | 'previous'>
): 'up' | 'down' {
	const direction = item.direction ?? 'up';
	const before = item.previous === null ? null : occurrenceOfId(item.previous);
	if (!before || triadShapes(item).some((shape) => beyond(shape, before, direction))) {
		return direction;
	}
	return direction === 'up' ? 'down' : 'up';
}

/** The shape is right for the change: its chord, on one of its sets, as its rule asks. */
export function admits(item: ChordGridItem, occurrence: VoicingOccurrence): boolean {
	return classifyGridChord(item, occurrence) === null;
}

/** Every shape of the change's triad on its sets, lowest first. */
export function triadShapes(item: Pick<ChordGridItem, 'chord' | 'sets'>): VoicingOccurrence[] {
	const chord = parseTriadId(item.chord);
	return item.sets
		.flatMap((set) => closeTriadVoicings(chord, set).flatMap((v) => voicingOccurrences(v)))
		.sort((a, b) => shapePosition(a) - shapePosition(b));
}

/** The shapes the change's rule admits on its sets, lowest first: the candidates and the aid. */
export function admittedShapes(item: ChordGridItem): VoicingOccurrence[] {
	return triadShapes(item).filter((occurrence) => admits(item, occurrence));
}

/** The shape among `shapes` whose position is closest to `reference`'s; the first without one. */
export function closestShape(
	shapes: readonly VoicingOccurrence[],
	reference: VoicingOccurrence | null
): VoicingOccurrence | null {
	if (shapes.length === 0) return null;
	if (!reference) return shapes[0];
	const target = shapePosition(reference);
	return shapes.reduce((best, shape) =>
		Math.abs(shapePosition(shape) - target) < Math.abs(shapePosition(best) - target) ? shape : best
	);
}

/**
 * After a miss, the shape that was due: the admitted shape closest to the one heard, else to the
 * one still ringing, else the lowest; null when the rule admits none.
 */
export function expectedShape(
	item: ChordGridItem,
	decided: string | null
): VoicingOccurrence | null {
	const heard = decided === null ? null : occurrenceOfId(decided);
	const ringing = item.previous === null ? null : occurrenceOfId(item.previous);
	return closestShape(admittedShapes(item), heard ?? ringing);
}

/** What a change's key names, as `parseItem` reads it back: a link's shape, or a grid's change. */
type KeyedChange = { rule: 'link'; shape: string } | { grid: string; index: number };

/**
 * The part of a change its key names: the shape asked (link), else its grid (the second part of
 * its element) and its rank. Reads a change as `parseItem` gives it back too.
 */
function keyedPart(item: ChordGridItem | KeyedChange): KeyedChange {
	if ('rule' in item && item.rule === 'link') return { rule: 'link', shape: item.shape ?? '' };
	if ('grid' in item) return { grid: item.grid, index: item.index };
	return { grid: item.element.split(':')[1] ?? '', index: item.index };
}

/**
 * A key ending with `#` and a rank names a change of a grid; any other, a placed shape (a voicing
 * key may hold a `#`, as in `C#|maj|…`, never after its frets).
 */
function parseItem(itemKey: string): KeyedChange {
	const at = itemKey.lastIndexOf(INDEX_SEPARATOR);
	const rank = at < 0 ? '' : itemKey.slice(at + 1);
	if (/^\d+$/.test(rank)) {
		const grid = itemKey.slice(0, at);
		const index = Number(rank);
		if (grid === '' || !Number.isSafeInteger(index)) {
			throw new RangeError(`Not a chord change key: "${itemKey}"`);
		}
		return { grid, index };
	}
	if (!occurrenceOfId(itemKey)) throw new RangeError(`Not a chord change key: "${itemKey}"`);
	return { rule: 'link', shape: itemKey };
}

/**
 * The key of a gesture change, as the changes' views present it until plan 4 (D6): the shape asked
 * for the link (a placed voicing), `<grid>#<rank>` for a grid (a change). Not a registered set: the
 * views' presenter carries it.
 */
export const gestureChangeSet: ItemSet<ChordGridItem> = {
	id: 'change',
	itemKey: (item) => {
		const part = keyedPart(item);
		return 'shape' in part ? part.shape : `${part.grid}${INDEX_SEPARATOR}${part.index}`;
	},
	// An attempt keeps the whole change; its key, the shape asked or the change's place in its grid.
	parseItem: (itemKey) => parseItem(itemKey) as unknown as ChordGridItem,
	cardItem: keyedPart
};
