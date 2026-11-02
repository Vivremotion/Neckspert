import { familyNamed, type Filter, type Member } from '$lib/domain/families';
import {
	expectedShape,
	type ChordShape,
	type ChordShapesIndex
} from '$lib/domain/families/guitar/chordShapes';
import type { NotePlacesIndex } from '$lib/domain/families/guitar/notePlaces';
import { admittedMembers, type MemberContent } from '$lib/domain/judges';
import type { ChordReading } from '$lib/domain/sets';
import { formatSpelledNote, pitchOfMidi, type IdentifyItem } from '$lib/domain/music';
import type { Midi, PitchName } from '$lib/domain/music/types';
import { accidentalOfName } from '$lib/domain/time/noteName';
import { occurrenceOfId } from '$lib/domain/triads';
import type { Locale } from '$lib/domain/types';
import { CHORD_GRID_MESSAGES } from '$lib/application/sets/chordGridMessages';
import { TRIAD_MESSAGES, TRIAD_STRING_NAMES } from './triadMessages';
import { nameChoice, noteName, positionLabel } from './noteWords';
import { neckWithNext, type NeckNote, type Picture } from './pictures';
import {
	chordGap,
	closestShape,
	fretsOf,
	heardFrets,
	heardOf,
	notesOf,
	shapeOf
} from './triadWords';

/** What a missed answer shows: the right answer, the shape heard and expected, what tells them apart. */
export interface MissView {
	correction: string | null;
	heard: Picture | null;
	expected: Picture | null;
	gap: string | null;
}

/** How a kind of content tells an answer and a miss. `value` is what the judge was given. */
export interface ContentView {
	/** What was answered, localized, or null when it says nothing. */
	answerLabel(value: unknown, answer: unknown, locale: Locale, random: () => number): string | null;
	miss(
		value: unknown,
		outcome: { answer: unknown; confusion: unknown },
		locale: Locale,
		random: () => number
	): MissView;
}

const NO_MISS: MissView = { correction: null, heard: null, expected: null, gap: null };

const asPicture = (shape: ReturnType<typeof shapeOf>): Picture => ({ kind: 'shape', ...shape });

/** The pitch an answer played, spelled as the prompt spells its target; null without one. */
const midiAnswerLabel: ContentView['answerLabel'] = (_value, answer, _locale, random) => {
	const midi = (answer as { midi?: Midi } | null)?.midi;
	return midi === undefined ? null : noteName(pitchOfMidi(midi), random);
};

const GAP_WORDS: Record<Locale, (heard: string, expected: string) => string> = {
	fr: (heard, expected) => `${heard} au lieu de ${expected}`,
	en: (heard, expected) => `${heard} instead of ${expected}`
};

/** The right note played `octaves` octaves off, higher when `higher`. */
const OCTAVE_WORDS: Record<Locale, (note: string, octaves: number, higher: boolean) => string> = {
	fr: (note, octaves, higher) =>
		`${note}, ${octaves === 1 ? 'une octave' : `${octaves} octaves`} trop ${higher ? 'haut' : 'bas'}`,
	en: (note, octaves, higher) =>
		`${note}, ${octaves === 1 ? 'an octave' : `${octaves} octaves`} too ${higher ? 'high' : 'low'}`
};

/** Draws that make `noteName` spell an altered pitch with a flat, and with a sharp. */
const FLAT_DRAW = 1;
const SHARP_DRAW = 0;

/** Semitones in an octave. */
const OCTAVE = 12;

/**
 * An exact pitch: the note played; a miss tells the note heard and the note expected, both
 * spelled with one accidental choice, or the octave the right note was played off.
 */
const pitchView: ContentView = {
	answerLabel: midiAnswerLabel,
	miss: (value, { answer }, locale, random) => {
		// One spelling for both notes: « Ab au lieu de Bb », never « G# au lieu de Bb ». A note
		// the content names (as its figure or its chord writes it) gives it; else one draw.
		const { midi: asked, name } = value as { midi: Midi; name?: string };
		const drawn = random();
		const accidental = name === undefined ? null : accidentalOfName(name);
		const spelling = () => (accidental ? (accidental < 0 ? FLAT_DRAW : SHARP_DRAW) : drawn);
		const expected = name ?? noteName(pitchOfMidi(asked), spelling);
		const midi = (answer as { midi?: Midi } | null)?.midi;
		const octaves = midi === undefined ? 0 : (midi - asked) / OCTAVE;
		const gap =
			midi === undefined
				? null
				: Number.isInteger(octaves) && octaves !== 0
					? OCTAVE_WORDS[locale](expected, Math.abs(octaves), octaves > 0)
					: GAP_WORDS[locale](noteName(pitchOfMidi(midi), spelling), expected);
		return { ...NO_MISS, correction: expected, gap };
	}
};

/** The name of a note at a fret: the name tapped; a miss gives both spellings of the right one. */
const nameView: ContentView = {
	answerLabel: (_value, answer, _locale, random) => {
		const pitch = (answer as { pitch?: PitchName } | null)?.pitch;
		return pitch === undefined ? null : noteName(pitch, random);
	},
	miss: (value) => ({ ...NO_MISS, correction: nameChoice(value as IdentifyItem) })
};

/** How a member of one family tells an answer and a miss; `value` is the member content judged. */
interface MemberView {
	answerLabel(
		value: MemberContent,
		answer: unknown,
		locale: Locale,
		random: () => number
	): string | null;
	miss(
		value: MemberContent,
		outcome: { answer: unknown; confusion: unknown },
		locale: Locale,
		random: () => number
	): MissView;
	/** The fields this content offers to the words of a prompt. */
	names: readonly string[];
	/** Every field of `names` for `value`; a field with nothing to say is the empty string. */
	fields(value: MemberContent, locale: Locale): Record<string, string>;
	/**
	 * The picture of members of the family admitted by `value` (now) and at the next round;
	 * null when there is nothing to draw.
	 */
	picture(
		value: MemberContent,
		members: readonly Member[],
		next: readonly Member[]
	): Picture | null;
}

/** A place of a note: the pitch played, spelled as the prompt spells its target; its place on its string. */
const notePlacesView: MemberView = {
	answerLabel: midiAnswerLabel,
	names: [],
	fields: () => ({}),
	picture: () => null,
	miss: ({ index }, _outcome, locale) => {
		const { pitch, string } = index as NotePlacesIndex;
		return {
			...NO_MISS,
			correction: string === undefined ? null : positionLabel({ string, pitch }, locale)
		};
	}
};

/** Between the strings of a set: a hyphen that never breaks the line. */
const STRING_SEPARATOR = '‑';

/** The first filter of a selection of the kind `key` names; null without one. */
function filterOf<K extends string>(
	where: readonly Filter[] | undefined,
	key: K
): Extract<Filter, Record<K, unknown>> | null {
	const found = (where ?? []).find((filter) => Object.hasOwn(filter, key));
	return (found as Extract<Filter, Record<K, unknown>> | undefined) ?? null;
}

/** The notes of shapes on the neck, each place once, named by their spelling. */
function neckOf(shapes: readonly ChordShape[]): Picture & { kind: 'neck' } {
	const places = new Map<string, NeckNote>();
	for (const { occurrence } of shapes) {
		for (const { string, fret, note } of occurrence.notes) {
			const key = `${string}-${fret}`;
			if (!places.has(key)) places.set(key, { string, fret, name: formatSpelledNote(note) });
		}
	}
	return { kind: 'neck', notes: [...places.values()] };
}

/**
 * After a missed change of a passage, as the changes have told it: the shape heard, the shape
 * that was due (the admitted one closest to the one heard, else to the one still ringing, else
 * the first admitted) and the gap its confusion names; no correction in words.
 */
function passageMiss(
	value: MemberContent,
	{ answer, confusion }: { answer: unknown; confusion: unknown },
	locale: Locale
): MissView {
	const decided = (answer as ChordReading | null)?.decided ?? null;
	const heard = decided === null ? null : occurrenceOfId(decided);
	const admitted = admittedMembers(value) as ChordShape[];
	const expected = expectedShape(admitted, decided, value.previous ?? null);
	const gap = CHORD_GRID_MESSAGES[locale].gap;
	const kind = (confusion as { kind?: keyof typeof gap } | null)?.kind;
	return {
		correction: null,
		heard: heard && asPicture(shapeOf(heard)),
		expected: expected && asPicture(shapeOf(expected.occurrence)),
		gap: answer === null ? gap.noChordHeard : kind ? (gap[kind] ?? null) : null
	};
}

/**
 * A shape of a chord: the frets heard. After a miss in a passage (its content carries the
 * member heard before, `previous`), as `passageMiss` tells it; else the shape heard, the shape
 * expected (the admitted shape nearest the one heard, else the lowest fretted admitted), its
 * frets and notes, and what tells them apart. Its fields: the strings of its index, the frets
 * of a zone (`in.frets`) and the way a climb goes (`position.toward`); its picture, the notes of
 * its shapes on the neck, on the strings of its index (the zone of strings the exercise writes).
 */
const chordShapesView: MemberView = {
	answerLabel: (_value, answer) => heardFrets(answer as ChordReading | null),
	miss: (value, outcome, locale) => {
		if (Object.hasOwn(value, 'previous')) return passageMiss(value, outcome, locale);
		const { answer, confusion } = outcome;
		const admitted = admittedMembers(value) as ChordShape[];
		if (admitted.length === 0) return NO_MISS;
		const heard = heardOf(answer as ChordReading | null);
		const expected = closestShape(
			admitted.map((shape) => shape.occurrence),
			heard
		)!;
		return {
			correction: `${fretsOf(expected)} · ${notesOf(expected)}`,
			heard: heard && asPicture(shapeOf(heard)),
			expected: asPicture(shapeOf(expected)),
			gap: answer === null ? TRIAD_MESSAGES[locale].gap.noChordHeard : chordGap(confusion, locale)
		};
	},
	names: ['strings', 'frets', 'toward'],
	fields: ({ index, selection }, locale) => {
		const messages = CHORD_GRID_MESSAGES[locale];
		const frets = filterOf(selection.where, 'in')?.in.frets;
		const toward = filterOf(selection.where, 'position')?.position.toward;
		return {
			strings: (index as ChordShapesIndex).strings
				.map((string) => TRIAD_STRING_NAMES[locale][string])
				.join(STRING_SEPARATOR),
			frets: frets ? messages.frets(frets[0], frets[1]) : '',
			toward: toward ? messages.toward[toward] : ''
		};
	},
	picture: ({ index }, members, next) => {
		if (members.length === 0 && next.length === 0) return null;
		// The strings of the content's index, low to high: the neck keeps its rows along a passage.
		const strings = [...(index as ChordShapesIndex).strings].sort((a, b) => b - a);
		return {
			...neckWithNext(
				neckOf(members as readonly ChordShape[]),
				neckOf(next as readonly ChordShape[]),
				true
			),
			strings
		};
	}
};

/** The views of the members of each family, by family id. */
const MEMBER_VIEWS: Readonly<Record<string, MemberView>> = {
	'note-places': notePlacesView,
	'chord-shapes': chordShapesView
};

/** The view of a family's members; null for a family without a view. */
function familyView(family: string): MemberView | null {
	return Object.hasOwn(MEMBER_VIEWS, family) && familyNamed(family) ? MEMBER_VIEWS[family] : null;
}

/** The view of a member content's family; null for a value that is none, or a family without a view. */
function memberViewOf(value: unknown): MemberView | null {
	if (typeof value !== 'object' || value === null) return null;
	const { family } = value as Partial<MemberContent>;
	return typeof family === 'string' ? familyView(family) : null;
}

/** The names of the fields the member content of a family offers; empty without a view. */
export function memberFieldNames(family: string): readonly string[] {
	return familyView(family)?.names ?? [];
}

/** The fields of a member content; empty for what is none. */
export function memberFields(value: unknown, locale: Locale): Record<string, string> {
	return memberViewOf(value)?.fields(value as MemberContent, locale) ?? {};
}

/**
 * The fields of a round's member contents, in the order of its expectations: a field is the
 * first content's that gives it words (an empty field gives way to a later content's).
 */
export function roundMemberFields(
	values: readonly unknown[],
	locale: Locale
): Record<string, string> {
	const fields: Record<string, string> = {};
	for (const value of values) {
		for (const [name, text] of Object.entries(memberFields(value, locale))) {
			if (!Object.hasOwn(fields, name) || fields[name] === '') fields[name] = text;
		}
	}
	return fields;
}

/** The picture of the members `content` admits now and of those admitted next; null without a view. */
export function membersPicture(
	content: MemberContent,
	now: readonly Member[],
	next: readonly Member[]
): Picture | null {
	return memberViewOf(content)?.picture(content, now, next) ?? null;
}

/** A member of a family, told as its family tells it; nothing for a family without a view. */
const memberView: ContentView = {
	answerLabel: (value, answer, locale, random) =>
		memberViewOf(value)?.answerLabel(value as MemberContent, answer, locale, random) ?? null,
	miss: (value, outcome, locale, random) =>
		memberViewOf(value)?.miss(value as MemberContent, outcome, locale, random) ?? NO_MISS
};

/** The views of content, by kind of content (the kinds of `CONTENT_JUDGES`). */
export const CONTENT_VIEWS: Readonly<Record<string, ContentView>> = {
	name: nameView,
	pitch: pitchView,
	member: memberView
};
