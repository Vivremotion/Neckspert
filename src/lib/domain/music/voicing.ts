import { DEGREES, qualityById, spellInterval, type Chord, type Degree } from './chord';
import { midiOnString } from './fretboard';
import { assertSpelledNote, pitchOfSpelled, spelledFromPitch, type SpelledNote } from './spelling';
import {
	CHROMATIC_NOTES,
	STRING_NUMBERS,
	type FretPosition,
	type Midi,
	type PitchName,
	type StringNumber
} from './types';

/** Highest fret a voicing occurrence may use. The grid climb on G-B-E reaches it. To calibrate. */
export const MAX_VOICING_FRET = 17;

/** Widest gap between the lowest and highest fretted notes, open strings left out. To calibrate. */
export const MAX_SPAN_FRETS = 4;

/** Strings ordered from the lowest to the highest, any size, adjacent or not. */
export type StringSet = readonly StringNumber[];

export interface VoicingString {
	string: StringNumber;
	degree: Degree;
}

/** The item: a chord and the degree each string carries. A degree may be missing or doubled. */
export interface Voicing {
	chord: Chord;
	strings: readonly VoicingString[];
}

export interface VoicingNote {
	string: StringNumber;
	/** 0 = open string. */
	fret: number;
	midi: Midi;
	degree: Degree;
	note: SpelledNote;
}

/** One place where a voicing falls on the neck. */
export interface VoicingOccurrence {
	voicing: Voicing;
	/** In the voicing's string order. */
	notes: readonly VoicingNote[];
}

const OCTAVE = 12;

/**
 * Throws on a malformed root, on empty, doubled or unordered strings and on degrees outside the
 * quality.
 */
export function createVoicing(chord: Chord, strings: readonly VoicingString[]): Voicing {
	assertSpelledNote(chord.root);
	if (strings.length === 0) throw new RangeError('A voicing needs at least one string');
	strings.forEach(({ string, degree }, i) => {
		if (!STRING_NUMBERS.includes(string)) throw new RangeError(`Not a string: ${string}`);
		if (i > 0 && string >= strings[i - 1].string) {
			throw new RangeError('Voicing strings must go from the lowest to the highest, once each');
		}
		if (!chord.quality.degrees.includes(degree)) {
			throw new RangeError(`Degree ${degree} is not in ${chord.quality.id}`);
		}
	});
	return { chord, strings };
}

/** `D|maj|3:5,2:1,1:3`: sharp pitch, so Ebm and D#m share a card. Stored in cards: keep it stable. */
export function voicingKey(voicing: Voicing): string {
	const strings = voicing.strings.map(({ string, degree }) => `${string}:${degree}`).join(',');
	return `${pitchOfSpelled(voicing.chord.root)}|${voicing.chord.quality.id}|${strings}`;
}

/** The voicing of a key, its root spelled with sharps. Throws on a corrupted key. */
export function parseVoicingKey(key: string): Voicing {
	const [pitch, qualityId, stringsPart, ...rest] = key.split('|');
	if (rest.length > 0 || !stringsPart || !CHROMATIC_NOTES.includes(pitch as PitchName)) {
		throw new RangeError(`Not a voicing key: "${key}"`);
	}
	const strings = stringsPart.split(',').map((part) => {
		const [string, degree, ...extra] = part.split(':');
		if (extra.length > 0 || !(degree in DEGREES)) {
			throw new RangeError(`Not a voicing key: "${key}"`);
		}
		return { string: Number(string) as StringNumber, degree: degree as Degree };
	});
	const chord = { root: spelledFromPitch(pitch as PitchName), quality: qualityById(qualityId) };
	return createVoicing(chord, strings);
}

function mod(value: number, n: number): number {
	return ((value % n) + n) % n;
}

function fretsCarrying(string: StringNumber, pitch: PitchName): number[] {
	const lowest = mod(CHROMATIC_NOTES.indexOf(pitch) - midiOnString(string, 0), OCTAVE);
	const frets: number[] = [];
	for (let fret = lowest; fret <= MAX_VOICING_FRET; fret += OCTAVE) frets.push(fret);
	return frets;
}

/** Each string sounds above the previous one, less than an octave higher: a close shape stays close. */
function spaced(notes: readonly VoicingNote[]): boolean {
	return notes.every((n, i) => {
		if (i === 0) return true;
		const gap = n.midi - notes[i - 1].midi;
		return gap > 0 && gap < OCTAVE;
	});
}

function playable(notes: readonly VoicingNote[]): boolean {
	const fretted = notes.filter((n) => n.fret > 0).map((n) => n.fret);
	const span = fretted.length > 0 ? Math.max(...fretted) - Math.min(...fretted) : 0;
	return span <= MAX_SPAN_FRETS && spaced(notes);
}

function compareMidis(a: VoicingOccurrence, b: VoicingOccurrence): number {
	for (let i = 0; i < a.notes.length; i++) {
		if (a.notes[i].midi !== b.notes[i].midi) return a.notes[i].midi - b.notes[i].midi;
	}
	return 0;
}

/**
 * Every fret combination, 0 to MAX_VOICING_FRET, where each string carries its degree, within
 * MAX_SPAN_FRETS, each string less than an octave above the previous one. Lowest first.
 */
export function voicingOccurrences(voicing: Voicing): VoicingOccurrence[] {
	const choices = voicing.strings.map(({ string, degree }) => {
		const note = spellInterval(voicing.chord.root, degree);
		return fretsCarrying(string, pitchOfSpelled(note)).map((fret): VoicingNote => ({
			string,
			fret,
			midi: midiOnString(string, fret),
			degree,
			note
		}));
	});
	const combinations = choices.reduce<VoicingNote[][]>(
		(partials, options) => partials.flatMap((partial) => options.map((n) => [...partial, n])),
		[[]]
	);
	return combinations
		.filter(playable)
		.map((notes) => ({ voicing, notes }))
		.sort(compareMidis);
}

export function occurrencePositions(occurrence: VoicingOccurrence): FretPosition[] {
	return occurrence.notes.map(({ string, fret }) => ({ string, fret }));
}
