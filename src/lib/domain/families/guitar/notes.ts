import type { Midi, StringNumber } from '$lib/domain/music';
import type { Member } from '../core/types';

/** A note of a member: where it is played and what it sounds. */
export interface PlacedNote {
	string: StringNumber;
	/** 0 = open string. */
	fret: number;
	midi: Midi;
}

/** A member of a guitar family: its notes, from which its attributes are computed. */
export interface GuitarMember extends Member {
	notes: readonly PlacedNote[];
}

/**
 * What a guitar member is compared by: its strings and frets (in its notes' order), its position
 * (the lowest fretted fret; 0 on open strings only) and its pitch (the lowest note, in MIDI).
 */
export const GUITAR_ATTRIBUTES = {
	strings: (member: GuitarMember) => member.notes.map((note) => note.string),
	frets: (member: GuitarMember) => member.notes.map((note) => note.fret),
	position: (member: GuitarMember) => {
		const fretted = member.notes.map((note) => note.fret).filter((fret) => fret > 0);
		return fretted.length === 0 ? 0 : Math.min(...fretted);
	},
	pitch: (member: GuitarMember) => Math.min(...member.notes.map((note) => note.midi))
} as const;

export const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);
