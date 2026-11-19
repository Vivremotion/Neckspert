import {
	closeTriadVoicings,
	createVoicing,
	isTriadQuality,
	pitchOfSpelled,
	voicingKey,
	voicingOccurrences,
	type Chord,
	type Degree,
	type StringNumber,
	type Voicing,
	type VoicingOccurrence
} from '$lib/domain/music';
import { occurrenceId, occurrenceOfId, occurrencePosition } from '$lib/domain/triads';
import type { Family } from '../core/types';
import { GUITAR_ATTRIBUTES, isObject, type GuitarMember } from './notes';

/**
 * A chord on strings (neighbours, the lowest first), and, when it names one voicing, the degree
 * each string carries.
 */
export interface ChordShapesIndex {
	chord: Chord;
	strings: readonly StringNumber[];
	degrees?: readonly Degree[];
}

/** A shape of the chord on the neck, with the occurrence it is (the presenter and the sensor read it). */
export interface ChordShape extends GuitarMember {
	occurrence: VoicingOccurrence;
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

/** The voicings an index names: its one voicing with degrees, else the close inversions. */
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
	return closeTriadVoicings(index.chord, index.strings);
}

function neighbours(strings: readonly unknown[]): boolean {
	return strings.every((string, i) => i === 0 || string === (strings[i - 1] as number) - 1);
}

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
	const { degrees } = index;
	if (degrees === undefined) {
		if (
			index.strings.length !== TRIAD_SIZE ||
			!neighbours(index.strings) ||
			!isTriadQuality(quality as unknown as Chord['quality'])
		) {
			return 'chord-shapes needs three neighbouring strings and a triad';
		}
	} else if (!Array.isArray(degrees) || degrees.length !== index.strings.length) {
		return 'chord-shapes needs one degree per string';
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

/**
 * The shapes of a chord on strings, at every octave within the neck's bounds: of the voicing
 * `degrees` names, else of each close inversion in turn, each lowest first.
 */
export const chordShapes: Family<ChordShapesIndex, ChordShape> = {
	id: 'chord-shapes',
	indexProblem,
	members(index) {
		const read = readIndex(index);
		if ('problem' in read) return [];
		return read.voicings.flatMap((voicing) => voicingOccurrences(voicing).map(shape));
	},
	member(id) {
		const occurrence = occurrenceOfId(id);
		return occurrence ? shape(occurrence) : null;
	},
	attributes: GUITAR_ATTRIBUTES,
	recognise(admitted, payload) {
		const decided = decidedOf(payload);
		return decided === null ? null : (admitted.find((member) => member.id === decided) ?? null);
	},
	/**
	 * With degrees: as the triads judge it, the position asked being the one shape admitted (none
	 * when more are). Without: only no chord read or another chord; plan 4b refines it.
	 */
	confusion(index, admitted, payload) {
		const read = readIndex(index);
		if ('problem' in read) return null;
		const decided = decidedOf(payload);
		if (index.degrees) {
			const [asked] = read.voicings;
			const position = admitted.length === 1 ? occurrencePosition(admitted[0].occurrence) : null;
			return classifyChordShape(asked, position, decided).confusion;
		}
		const heard = decided === null ? null : occurrenceOfId(decided);
		if (!heard) return { kind: 'none', part: 'chord' } satisfies ChordConfusion;
		if (!sameChord(heard.voicing.chord, index.chord)) {
			return { kind: 'other-quality', part: 'chord' } satisfies ChordConfusion;
		}
		return null;
	}
};
