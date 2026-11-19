import {
	CHROMATIC_NOTES,
	classifyNoteConfusion,
	fretsForPitch,
	MAX_PLAYABLE_FRET,
	midiOnString,
	STRING_NUMBERS,
	type Midi,
	type PitchName,
	type StringNumber
} from '$lib/domain/music';
import type { Family } from '../core/types';
import { GUITAR_ATTRIBUTES, isObject, type GuitarMember } from './notes';

/** A note, on one string or on any. */
export interface NotePlacesIndex {
	pitch: PitchName;
	string?: StringNumber;
}

/** A place of a note on the neck. */
export interface NotePlace extends GuitarMember {
	string: StringNumber;
	fret: number;
	midi: Midi;
}

function indexProblem(index: unknown): string | null {
	if (!isObject(index)) return 'note-places reads a note { pitch, string? }';
	if (!CHROMATIC_NOTES.includes(index.pitch as PitchName)) {
		return `note-places: ${JSON.stringify(index.pitch)} is not a pitch`;
	}
	if (index.string !== undefined && !STRING_NUMBERS.includes(index.string as StringNumber)) {
		return `note-places: ${JSON.stringify(index.string)} is not a string`;
	}
	return null;
}

function place(string: StringNumber, fret: number): NotePlace {
	const midi = midiOnString(string, fret);
	return { id: `${string}:${fret}`, string, fret, midi, notes: [{ string, fret, midi }] };
}

/** `<string>:<fret>`, as `place` names it. */
const PLACE_ID = /^([1-6]):(\d{1,2})$/;

const midiOf = (payload: unknown): number | null =>
	isObject(payload) && typeof payload.midi === 'number' ? payload.midi : null;

/** The places of a note on the neck, frets 0 to the last playable: by string, then by fret. */
export const notePlaces: Family<NotePlacesIndex, NotePlace> = {
	id: 'note-places',
	indexProblem,
	members(index) {
		if (indexProblem(index) !== null) return [];
		const strings = index.string === undefined ? STRING_NUMBERS : [index.string];
		return strings.flatMap((string) =>
			fretsForPitch(string, index.pitch).map((fret) => place(string, fret))
		);
	},
	member(id) {
		const match = PLACE_ID.exec(id);
		if (!match) return null;
		const fret = Number(match[2]);
		return fret > MAX_PLAYABLE_FRET ? null : place(Number(match[1]) as StringNumber, fret);
	},
	attributes: GUITAR_ATTRIBUTES,
	recognise(admitted, payload) {
		const midi = midiOf(payload);
		return midi === null ? null : (admitted.find((member) => member.midi === midi) ?? null);
	},
	confusion(index, _admitted, payload) {
		const midi = midiOf(payload);
		if (indexProblem(index) !== null || midi === null || index.string === undefined) return null;
		return classifyNoteConfusion({ string: index.string, pitch: index.pitch }, midi);
	}
};
