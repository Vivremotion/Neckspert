import type { GridChange } from '$lib/domain/grid';
import {
	closeTriadVoicings,
	formatSpelledNote,
	parseSpelledNote,
	pitchOfSpelled,
	qualityById,
	voicingOccurrences,
	type Chord,
	type StringNumber,
	type VoicingOccurrence
} from '$lib/domain/music';
import { createGridTiming } from '$lib/domain/timing';
import { occurrenceId, occurrenceOfId, occurrencePosition } from '$lib/domain/triads';
import type { ChordReading } from './triadChord';
import type { MechanicRules } from './types';

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

/** What went wrong with the chord of a change. */
export type ChordGridConfusion = {
	kind:
		| 'none'
		| 'other-chord'
		| 'other-quality'
		| 'other-set'
		| 'other-shape'
		| 'not-higher'
		| 'not-lower'
		| 'out-of-zone';
	part: 'chord';
};

/** `Attempt.data` of a chord change. */
export interface ChordGridData {
	item: ChordGridItem;
	answer: ChordReading | null;
	confusion: ChordGridConfusion | null;
}

/** Joins the element and the change's index in its passage: `link:D|maj:3,2,1#2`. */
const INDEX_SEPARATOR = '#';

/** `D|maj`: a triad, its root as spelled. */
export function triadId(chord: Chord): string {
	return `${formatSpelledNote(chord.root)}|${chord.quality.id}`;
}

/** The triad of a `triadId`. Throws on a malformed one. */
export function parseTriadId(id: string): Chord {
	const [root, quality, ...rest] = id.split('|');
	if (rest.length > 0 || !root || !quality) throw new RangeError(`Not a triad id: "${id}"`);
	return { root: parseSpelledNote(root), quality: qualityById(quality) };
}

/** Where a shape sits: its lowest fretted fret, a shape on open strings only at 0. */
export function shapePosition(occurrence: VoicingOccurrence): number {
	const position = occurrencePosition(occurrence);
	return position === 'open' ? 0 : position;
}

/**
 * Every fret of the shape lies in the zone. An open string is inside the zone at fret 1, the
 * nut's, and out of any other.
 */
export function inZone(occurrence: VoicingOccurrence, zone: { from: number; to: number }): boolean {
	return occurrence.notes.every(
		(note) =>
			note.fret <= zone.to && (note.fret >= zone.from || (note.fret === 0 && zone.from === 1))
	);
}

function stringsOf(occurrence: VoicingOccurrence): string {
	return occurrence.notes.map((note) => note.string).join();
}

function confusion(kind: ChordGridConfusion['kind']): ChordGridConfusion {
	return { kind, part: 'chord' };
}

/** How the shape heard relates to the change, by its rule; null when it is right. */
function classify(item: ChordGridItem, heard: VoicingOccurrence | null): ChordGridConfusion | null {
	if (!heard) return confusion('none');
	const asked = parseTriadId(item.chord);
	if (pitchOfSpelled(heard.voicing.chord.root) !== pitchOfSpelled(asked.root)) {
		return confusion('other-chord');
	}
	if (heard.voicing.chord.quality.id !== asked.quality.id) return confusion('other-quality');
	if (!item.sets.some((set) => set.join() === stringsOf(heard))) return confusion('other-set');
	switch (item.rule) {
		case 'link':
			return occurrenceId(heard) === item.shape ? null : confusion('other-shape');
		case 'climb': {
			const before = item.previous === null ? null : occurrenceOfId(item.previous);
			if (!before) return null;
			const down = item.direction === 'down';
			if (beyond(heard, before, down ? 'down' : 'up')) return null;
			return confusion(down ? 'not-lower' : 'not-higher');
		}
		case 'zone':
			return item.zone && inZone(heard, item.zone) ? null : confusion('out-of-zone');
		case 'jam':
			return null;
	}
}

/** `shape` lies strictly beyond `before` on the neck, going `direction`. */
function beyond(
	shape: VoicingOccurrence,
	before: VoicingOccurrence,
	direction: 'up' | 'down'
): boolean {
	const [position, last] = [shapePosition(shape), shapePosition(before)];
	return direction === 'down' ? position < last : position > last;
}

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
	return classify(item, occurrence) === null;
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

function parseItem(itemKey: string): { element: string; index: number } {
	const at = itemKey.lastIndexOf(INDEX_SEPARATOR);
	const element = at < 0 ? '' : itemKey.slice(0, at);
	const index = Number(at < 0 ? NaN : itemKey.slice(at + 1));
	if (element === '' || !Number.isInteger(index) || index < 0) {
		throw new RangeError(`Not a chord change key: "${itemKey}"`);
	}
	return { element, index };
}

/**
 * A change of a chord grid, attacked on its beat (chord sensor) and judged by its exercise's
 * rule. A skill: its attempts are kept, no card.
 */
export const chordGridRules: MechanicRules<
	ChordGridItem,
	ChordReading,
	ChordReading,
	ChordGridConfusion
> = {
	id: 'chord-grid',
	timing: createGridTiming((item) => {
		const { changes, index } = item as ChordGridItem;
		return { lengthBeats: changes[index].length };
	}),
	learner: 'skill',
	itemKey: (item) => `${item.element}${INDEX_SEPARATOR}${item.index}`,
	// An attempt keeps the whole change; its key, the element and the place in the passage.
	parseItem: (itemKey) => parseItem(itemKey) as ChordGridItem,
	cardItem: (item) => ({ element: item.element, index: item.index }),
	judge: (item, { decided }) => {
		const found = classify(item, decided === null ? null : occurrenceOfId(decided));
		return { correct: found === null, answer: { decided }, confusion: found };
	}
};
