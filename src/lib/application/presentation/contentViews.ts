import { familyNamed } from '$lib/domain/families';
import type { ChordShape } from '$lib/domain/families/guitar/chordShapes';
import type { NotePlacesIndex } from '$lib/domain/families/guitar/notePlaces';
import { admittedMembers, type MemberContent } from '$lib/domain/judges';
import type { ChordReading } from '$lib/domain/sets';
import { pitchOfMidi, type IdentifyItem } from '$lib/domain/music';
import type { Midi, PitchName } from '$lib/domain/music/types';
import type { Locale } from '$lib/domain/types';
import { TRIAD_MESSAGES } from './triadMessages';
import { nameChoice, noteName, positionLabel } from './noteWords';
import type { Picture } from './pictures';
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

/** Semitones in an octave. */
const OCTAVE = 12;

/**
 * An exact pitch: the note played; a miss tells the note heard and the note expected, both
 * spelled with one accidental choice, or the octave the right note was played off.
 */
const pitchView: ContentView = {
	answerLabel: midiAnswerLabel,
	miss: (value, { answer }, locale, random) => {
		// One draw for both notes: « Ab au lieu de Bb », never « G# au lieu de Bb ».
		const drawn = random();
		const spelling = () => drawn;
		const asked = (value as { midi: Midi }).midi;
		const expected = noteName(pitchOfMidi(asked), spelling);
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
}

/** A place of a note: the pitch played, spelled as the prompt spells its target; its place on its string. */
const notePlacesView: MemberView = {
	answerLabel: midiAnswerLabel,
	miss: ({ index }, _outcome, locale) => {
		const { pitch, string } = index as NotePlacesIndex;
		return {
			...NO_MISS,
			correction: string === undefined ? null : positionLabel({ string, pitch }, locale)
		};
	}
};

/**
 * A shape of a chord: the frets heard; after a miss, the shape heard, the shape expected (the one
 * admitted, else the admitted shape nearest the one heard) and what tells them apart.
 */
const chordShapesView: MemberView = {
	answerLabel: (_value, answer) => heardFrets(answer as ChordReading | null),
	miss: (value, { answer, confusion }, locale) => {
		const admitted = admittedMembers(value) as ChordShape[];
		if (admitted.length === 0) return NO_MISS;
		const heard = heardOf(answer as ChordReading | null);
		const expected =
			admitted.length === 1
				? admitted[0].occurrence
				: closestShape(admitted[0].occurrence.voicing, heard);
		return {
			correction: `${fretsOf(expected)} · ${notesOf(expected)}`,
			heard: heard && asPicture(shapeOf(heard)),
			expected: asPicture(shapeOf(expected)),
			gap: answer === null ? TRIAD_MESSAGES[locale].gap.noChordHeard : chordGap(confusion, locale)
		};
	}
};

/** The views of the members of each family, by family id. */
const MEMBER_VIEWS: Readonly<Record<string, MemberView>> = {
	'note-places': notePlacesView,
	'chord-shapes': chordShapesView
};

/** The view of a member content's family; null for a value that is none, or a family without a view. */
function memberViewOf(value: unknown): MemberView | null {
	if (typeof value !== 'object' || value === null) return null;
	const { family } = value as Partial<MemberContent>;
	if (typeof family !== 'string') return null;
	return Object.hasOwn(MEMBER_VIEWS, family) && familyNamed(family) ? MEMBER_VIEWS[family] : null;
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
