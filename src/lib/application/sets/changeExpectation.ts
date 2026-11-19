import type { ChordCandidate, ChordExpectation } from '$lib/application/ports';
import {
	chordShapes,
	type ChordShape,
	type ChordShapesIndex
} from '$lib/domain/families/guitar/chordShapes';
import { triadOf } from '$lib/domain/grid';
import { admittedMembers, type MemberContent } from '$lib/domain/judges';
import {
	formatSpelledNote,
	pitchOfSpelled,
	qualityById,
	type Chord,
	type VoicingOccurrence
} from '$lib/domain/music';
import { occurrenceId, occurrenceOfId } from '$lib/domain/triads';

/** How far around the shapes expected a look-alike stays a candidate, in frets. To calibrate. */
export const NEIGHBOUR_FRETS = 2;

/** The other quality a chord may be mistaken for: major and minor, each for the other. */
const OTHER_QUALITY: Readonly<Record<string, string>> = { maj: 'min', min: 'maj' };

/** `D|maj`: a triad, its root as spelled. */
const chordKey = (chord: Chord) => `${formatSpelledNote(chord.root)}|${chord.quality.id}`;

/** The pitches a shape sounds, low first: two shapes alike sound the same. */
function pitchesOf(occurrence: VoicingOccurrence): string {
	return occurrence.notes
		.map((note) => note.midi)
		.sort((a, b) => a - b)
		.join();
}

function toCandidate(kind: string, occurrence: VoicingOccurrence): ChordCandidate {
	return {
		id: occurrenceId(occurrence),
		kind,
		notes: occurrence.notes.map(({ string, fret, midi }) => ({ string, fret, midi }))
	};
}

/** Every shape of `chord` on each group of three strings of `strings`, lowest first. */
function shapesOn(chord: Chord, strings: ChordShapesIndex['strings']): VoicingOccurrence[] {
	return chordShapes.members({ chord, strings }).map((shape) => shape.occurrence);
}

/**
 * What the chord sensor listens for in a change (spec 2026-10-10, section 3): the shapes its
 * content admits; then, within NEIGHBOUR_FRETS of their frets (`anywhere`: wherever they lie),
 * the other shapes of the chord on the content's strings, those of its other quality and those
 * of the other chords of the passage's line (`changes`). Never a shape of the pitches of the one
 * still ringing (the content's previous member).
 */
export function changeExpectation(
	content: MemberContent,
	changes: readonly { symbol: string }[],
	anywhere: boolean,
	opensAt: number
): ChordExpectation {
	const index = content.index as ChordShapesIndex;
	const ringing = content.previous ? occurrenceOfId(content.previous) : null;
	const silent = (o: VoicingOccurrence) => !ringing || pitchesOf(o) !== pitchesOf(ringing);
	const expected = (admittedMembers(content) as ChordShape[])
		.map((shape) => shape.occurrence)
		.filter(silent);
	const frets = expected.flatMap((o) => o.notes.map((note) => note.fret));
	const near = (o: VoicingOccurrence) =>
		anywhere ||
		frets.length === 0 ||
		o.notes.every(
			(note) =>
				note.fret >= Math.min(...frets) - NEIGHBOUR_FRETS &&
				note.fret <= Math.max(...frets) + NEIGHBOUR_FRETS
		);
	const asked = index.chord;
	const others = new Map<string, { chord: Chord; kind: string }>();
	const other = OTHER_QUALITY[asked.quality.id];
	if (other) {
		const chord = { root: asked.root, quality: qualityById(other) };
		others.set(chordKey(chord), { chord, kind: 'other-quality' });
	}
	const samePitch = (chord: Chord) =>
		pitchOfSpelled(chord.root) === pitchOfSpelled(asked.root) &&
		chord.quality.id === asked.quality.id;
	for (const change of changes) {
		const chord = triadOf(change.symbol);
		if (!samePitch(chord) && !others.has(chordKey(chord))) {
			others.set(chordKey(chord), { chord, kind: 'other-chord' });
		}
	}
	const candidates = new Map<string, ChordCandidate>();
	const add = (kind: string, o: VoicingOccurrence) => {
		const candidate = toCandidate(kind, o);
		if (!candidates.has(candidate.id)) candidates.set(candidate.id, candidate);
	};
	expected.forEach((o) => add('expected', o));
	shapesOn(asked, index.strings)
		.filter((o) => silent(o) && near(o))
		.forEach((o) => add('other-shape', o));
	for (const { chord, kind } of others.values()) {
		shapesOn(chord, index.strings)
			.filter((o) => silent(o) && near(o))
			.forEach((o) => add(kind, o));
	}
	return {
		opensAt,
		expected: expected.map(occurrenceId),
		candidates: [...candidates.values()],
		style: 'unknown'
	};
}
