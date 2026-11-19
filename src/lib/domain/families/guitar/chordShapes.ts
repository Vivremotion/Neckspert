import {
	closeTriadVoicings,
	createVoicing,
	isTriadQuality,
	pitchOfSpelled,
	STRING_NUMBERS,
	voicingKey,
	voicingOccurrences,
	type Chord,
	type Degree,
	type StringNumber,
	type Voicing,
	type VoicingOccurrence
} from '$lib/domain/music';
import type { ChordGridConfusion } from '$lib/domain/sets/gridClassify';
import { occurrenceId, occurrenceOfId, occurrencePosition } from '$lib/domain/triads';
import type { Family, Filter } from '../core/types';
import { GUITAR_ATTRIBUTES, isObject, type GuitarMember } from './notes';

/**
 * A chord on strings (neighbours, the lowest first), and, when it names one voicing, the degree
 * each string carries, and, when it names one shape of it, the fret of each. Without degrees, the
 * strings are a zone of three or more, whose every three neighbours are a group the chord's
 * inversions are played on.
 */
export interface ChordShapesIndex {
	chord: Chord;
	strings: readonly StringNumber[];
	degrees?: readonly Degree[];
	frets?: readonly number[];
}

/** A shape of the chord on the neck, with the occurrence it is (the presenter and the sensor read it). */
export interface ChordShape extends GuitarMember {
	occurrence: VoicingOccurrence;
}

/** The chord sensor's reading: the shape it decided (`occurrenceId`), or none. */
export interface ChordReading {
	decided: string | null;
}

/** What went wrong with a chord: the chord heard, or none. Part of a triad confusion. */
export type ChordConfusion = {
	kind: 'other-octave' | 'other-inversion' | 'other-quality' | 'none';
	part: 'chord';
};

const TRIAD_SIZE = 3;

/** How the chord heard relates to the one asked (`position`: the shape asked, if any). */
export function classifyChordShape(
	asked: Voicing,
	position: number | 'open' | null,
	decided: string | null
): { correct: boolean; confusion: ChordConfusion | null } {
	const heard = decided === null ? null : occurrenceOfId(decided);
	if (!heard) return { correct: false, confusion: { kind: 'none', part: 'chord' } };
	if (!sameChord(heard.voicing.chord, asked.chord)) {
		return { correct: false, confusion: { kind: 'other-quality', part: 'chord' } };
	}
	if (voicingKey(heard.voicing) !== voicingKey(asked)) {
		return { correct: false, confusion: { kind: 'other-inversion', part: 'chord' } };
	}
	if (position !== null && occurrencePosition(heard) !== position) {
		return { correct: false, confusion: { kind: 'other-octave', part: 'chord' } };
	}
	return { correct: true, confusion: null };
}

function sameChord(a: Chord, b: Chord): boolean {
	return pitchOfSpelled(a.root) === pitchOfSpelled(b.root) && a.quality.id === b.quality.id;
}

/**
 * The groups of strings an index plays its voicings on: its strings with degrees; else every
 * three neighbours of its zone, the highest first (as the changes have listed their sets).
 */
function groupsOf(index: ChordShapesIndex): (readonly StringNumber[])[] {
	if (index.degrees) return [index.strings];
	const { strings } = index;
	return Array.from({ length: strings.length - TRIAD_SIZE + 1 }, (_, i) => {
		const from = strings.length - TRIAD_SIZE - i;
		return strings.slice(from, from + TRIAD_SIZE);
	});
}

/** The voicings an index names: its one voicing with degrees, else the close inversions on each group. */
function voicingsOf(index: ChordShapesIndex): Voicing[] {
	if (index.degrees) {
		const degrees = index.degrees;
		return [
			createVoicing(
				index.chord,
				index.strings.map((string, i) => ({ string, degree: degrees[i] }))
			)
		];
	}
	return groupsOf(index).flatMap((group) => closeTriadVoicings(index.chord, group));
}

function neighbours(strings: readonly unknown[]): boolean {
	return strings.every(
		(string, i) =>
			STRING_NUMBERS.includes(string as StringNumber) &&
			(i === 0 || string === (strings[i - 1] as number) - 1)
	);
}

const isFret = (fret: unknown) => typeof fret === 'number' && Number.isInteger(fret) && fret >= 0;

/** The voicings an index names, or why the family cannot read it. */
function readIndex(index: unknown): { voicings: Voicing[] } | { problem: string } {
	const problem = shapeProblem(index);
	if (problem !== null) return { problem };
	try {
		return { voicings: voicingsOf(index as ChordShapesIndex) };
	} catch (error) {
		return { problem: `chord-shapes: ${(error as Error).message}` };
	}
}

/** What keeps an index from naming voicings, before they are built. */
function shapeProblem(index: unknown): string | null {
	if (!isObject(index) || !isObject(index.chord) || !Array.isArray(index.strings)) {
		return 'chord-shapes reads a chord on strings { chord, strings, degrees? }';
	}
	const quality = index.chord.quality;
	if (!isObject(quality) || !Array.isArray(quality.degrees)) {
		return 'chord-shapes: the chord has no quality';
	}
	const { degrees, frets } = index;
	if (degrees === undefined) {
		if (frets !== undefined) return 'chord-shapes reads frets only with degrees';
		if (
			index.strings.length < TRIAD_SIZE ||
			!neighbours(index.strings) ||
			!isTriadQuality(quality as unknown as Chord['quality'])
		) {
			return 'chord-shapes needs three neighbouring strings or more and a triad';
		}
	} else if (!Array.isArray(degrees) || degrees.length !== index.strings.length) {
		return 'chord-shapes needs one degree per string';
	} else if (
		frets !== undefined &&
		(!Array.isArray(frets) || frets.length !== index.strings.length || !frets.every(isFret))
	) {
		return 'chord-shapes needs one fret per string';
	}
	return null;
}

function indexProblem(index: unknown): string | null {
	const read = readIndex(index);
	return 'problem' in read ? read.problem : null;
}

function shape(occurrence: VoicingOccurrence): ChordShape {
	return {
		id: occurrenceId(occurrence),
		occurrence,
		notes: occurrence.notes.map(({ string, fret, midi }) => ({ string, fret, midi }))
	};
}

const decidedOf = (payload: unknown): string | null =>
	isObject(payload) && typeof payload.decided === 'string' ? payload.decided : null;

const sameFrets = (occurrence: VoicingOccurrence, frets: readonly number[]) =>
	occurrence.notes.every((note, i) => note.fret === frets[i]);

/** The shapes an index names, once read (see `chordShapes`). */
function shapesOf(index: ChordShapesIndex, voicings: readonly Voicing[]): ChordShape[] {
	const { degrees, frets } = index;
	const occurrences = voicings.flatMap((voicing) => voicingOccurrences(voicing));
	if (degrees && frets) return occurrences.filter((o) => sameFrets(o, frets)).map(shape);
	const shapes = occurrences.map(shape);
	// Stable: within a position, the groups and inversions stay in their order.
	if (!degrees) {
		shapes.sort((a, b) => GUITAR_ATTRIBUTES.position(a) - GUITAR_ATTRIBUTES.position(b));
	}
	return shapes;
}

const gridConfusion = (kind: ChordGridConfusion['kind']): ChordGridConfusion => ({
	kind,
	part: 'chord'
});

/**
 * How a shape heard relates to a chord on a zone of strings or to one placed shape, in the order
 * the changes have told it: none, another root, another quality, on no group of the zone; then
 * another shape than the placed one, or what the filter that refused it asks.
 */
function changeConfusion(
	index: ChordShapesIndex,
	members: () => readonly ChordShape[],
	decided: string | null,
	refused: Filter | null
): ChordGridConfusion | null {
	const heard = decided === null ? null : occurrenceOfId(decided);
	if (!heard) return gridConfusion('none');
	if (pitchOfSpelled(heard.voicing.chord.root) !== pitchOfSpelled(index.chord.root)) {
		return gridConfusion('other-chord');
	}
	if (heard.voicing.chord.quality.id !== index.chord.quality.id) {
		return gridConfusion('other-quality');
	}
	const strings = heard.notes.map((note) => note.string).join();
	if (!groupsOf(index).some((group) => group.join() === strings)) {
		return gridConfusion('other-set');
	}
	if (index.frets) {
		return members().some((member) => member.id === decided) ? null : gridConfusion('other-shape');
	}
	if (!refused) return null;
	if ('in' in refused || 'at' in refused) return gridConfusion('out-of-zone');
	if ('position' in refused) {
		return gridConfusion(refused.position.toward === 'up' ? 'not-higher' : 'not-lower');
	}
	return null;
}

/**
 * The shapes of a chord on strings, at every octave within the neck's bounds: of the voicing
 * `degrees` names, each lowest first (with `frets`, only the one placed there); else of each
 * close inversion on each group of the zone, the highest group first, sorted by position (a
 * stable sort: the order the changes have listed their shapes in).
 */
export const chordShapes: Family<ChordShapesIndex, ChordShape> = {
	id: 'chord-shapes',
	indexProblem,
	members(index) {
		const read = readIndex(index);
		if ('problem' in read) return [];
		return shapesOf(index, read.voicings);
	},
	member(id) {
		const occurrence = occurrenceOfId(id);
		return occurrence ? shape(occurrence) : null;
	},
	attributes: GUITAR_ATTRIBUTES,
	/** The shape decided, or none decided (`{ decided: null }`); null when the payload says neither. */
	answer(payload) {
		if (!isObject(payload) || !(typeof payload.decided === 'string' || payload.decided === null)) {
			return null;
		}
		return { decided: payload.decided };
	},
	recognise(admitted, payload) {
		const decided = decidedOf(payload);
		return decided === null ? null : (admitted.find((member) => member.id === decided) ?? null);
	},
	heard(index, payload) {
		return chordShapes.recognise(chordShapes.members(index), payload);
	},
	/**
	 * With degrees and no frets: as the triads judge it, the position asked being the one shape
	 * admitted (none when more are). Else as the changes judge a shape (`changeConfusion`).
	 */
	confusion(index, admitted, payload, refused = null) {
		const read = readIndex(index);
		if ('problem' in read) return null;
		const decided = decidedOf(payload);
		if (index.degrees && !index.frets) {
			const [asked] = read.voicings;
			const position = admitted.length === 1 ? occurrencePosition(admitted[0].occurrence) : null;
			return classifyChordShape(asked, position, decided).confusion;
		}
		return changeConfusion(index, () => shapesOf(index, read.voicings), decided, refused);
	}
};
