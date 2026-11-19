import {
	parseSpelledNote,
	pitchOfSpelled,
	qualityById,
	formatSpelledNote,
	type Chord,
	type VoicingOccurrence
} from '$lib/domain/music';
import { occurrenceId, occurrenceOfId, occurrencePosition } from '$lib/domain/triads';
import type { ChordGridItem } from './chordGrid';

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
export function classifyGridChord(
	item: ChordGridItem,
	heard: VoicingOccurrence | null
): ChordGridConfusion | null {
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
export function beyond(
	shape: VoicingOccurrence,
	before: VoicingOccurrence,
	direction: 'up' | 'down'
): boolean {
	const [position, last] = [shapePosition(shape), shapePosition(before)];
	return direction === 'down' ? position < last : position > last;
}
