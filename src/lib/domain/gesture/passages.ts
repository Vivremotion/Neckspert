import { gridChanges, triadOf, type ChordGrid } from '$lib/domain/grid';
import { inZone, shapePosition } from '$lib/domain/mechanics/chordGrid';
import {
	closeTriadVoicings,
	MAX_VOICING_FRET,
	voicingOccurrences,
	type Chord,
	type StringNumber,
	type VoicingOccurrence
} from '$lib/domain/music';
import { isSuccess, type Attempt } from '$lib/domain/types';

/** Shapes climbed in a link passage: the three inversions, then the first at the octave. To calibrate. */
export const LINK_SHAPES = 4;

/** Width of a zone, in frets. To calibrate. */
export const ZONE_FRETS = 4;

/** How far the zone moves from one passage to the next, in frets. To calibrate. */
export const ZONE_STEP_FRETS = 3;

/** Share of its changes right and in time that makes a passage succeed. To calibrate. */
export const PASSAGE_SUCCESS = 0.9;

function compareShapes(a: VoicingOccurrence, b: VoicingOccurrence): number {
	return (
		shapePosition(a) - shapePosition(b) ||
		a.notes.reduce((gap, note, i) => gap || note.midi - b.notes[i].midi, 0)
	);
}

/**
 * The shapes of a link passage, one per bar: the first LINK_SHAPES shapes of the chord on the set
 * by rising position (the inversions, then the first at the octave), then down again without
 * playing the highest twice. Without the octave on the neck, the turn stops at the inversions.
 */
export function linkShapes(chord: Chord, set: readonly StringNumber[]): VoicingOccurrence[] {
	const up = closeTriadVoicings(chord, set)
		.flatMap((voicing) => voicingOccurrences(voicing))
		.sort(compareShapes)
		.slice(0, LINK_SHAPES);
	return [...up, ...up.slice(0, -1).reverse()];
}

/** Every chord of the grid has a shape in the zone starting at `from`, on one of the sets. */
export function zoneFits(
	grid: ChordGrid,
	sets: readonly (readonly StringNumber[])[],
	from: number
): boolean {
	const zone = { from, to: from + ZONE_FRETS - 1 };
	const chords = new Set(gridChanges(grid).map((change) => change.symbol));
	return [...chords].every((symbol) =>
		sets.some((set) =>
			closeTriadVoicings(triadOf(symbol), set)
				.flatMap((voicing) => voicingOccurrences(voicing))
				.some((occurrence) => inZone(occurrence, zone))
		)
	);
}

/**
 * The zone of the next passage: ZONE_STEP_FRETS above the last one, back to fret 1 once it would
 * pass MAX_VOICING_FRET; a zone where a chord of the grid has no shape on any set is skipped.
 * Throws when no zone fits.
 */
export function nextZone(
	grid: ChordGrid,
	sets: readonly (readonly StringNumber[])[],
	last: { from: number } | null
): { from: number; to: number } {
	const wrap = (from: number) => (from + ZONE_FRETS - 1 > MAX_VOICING_FRET ? 1 : from);
	let from = wrap(last === null ? 1 : last.from + ZONE_STEP_FRETS);
	for (let tries = 0; tries <= MAX_VOICING_FRET; tries++) {
		if (zoneFits(grid, sets, from)) return { from, to: from + ZONE_FRETS - 1 };
		from = wrap(from + ZONE_STEP_FRETS);
	}
	throw new RangeError(`No zone of ${ZONE_FRETS} frets fits the grid ${grid.id}`);
}

/** A passage succeeds when PASSAGE_SUCCESS of its changes are right and in time. */
export function passageSucceeded(
	attempts: readonly Pick<Attempt, 'correct' | 'verdict'>[]
): boolean {
	if (attempts.length === 0) return false;
	return attempts.filter(isSuccess).length / attempts.length >= PASSAGE_SUCCESS;
}
