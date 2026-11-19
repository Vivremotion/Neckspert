import { classifyNameConfusion, pitchOnString, type IdentifyItem } from '$lib/domain/music';
import type { Midi, PitchName } from '$lib/domain/music/types';
import { classifyGridChord } from '$lib/domain/sets/gridClassify';
import type { ChordGridItem } from '$lib/domain/sets/chordGrid';
import type { ChordReading } from '$lib/domain/families/guitar/chordShapes';
import { occurrenceOfId } from '$lib/domain/triads';
import type { ContentJudge, ContentJudges } from '$lib/domain/time';
import { MEMBER_CONTENT, memberJudge } from './member';

export { admittedMembers, MEMBER_CONTENT, type MemberContent } from './member';

/** The name of the note at a fret of a string. Value: `IdentifyItem`; payload: a `PitchName`. */
export const NAME_CONTENT = 'name';
/** A change of a chord grid, by its rule. Value: `ChordGridItem`; payload: `ChordReading`. */
export const CHORD_GRID_CONTENT = 'chord-grid';

/** An exact pitch, octave included. Value: `{ midi, string? }`; payload: `{ midi }`. */
export const PITCH_CONTENT = 'pitch';

const pitchJudge: ContentJudge = {
	judge(value, payload) {
		const expected = (value as { midi: Midi }).midi;
		// A sensor that reports no pitch (a local exercise can pair one with pitch content) is wrong.
		const midi = (payload as { midi?: unknown } | null | undefined)?.midi;
		if (typeof midi !== 'number') return { correct: false, answer: null, confusion: null };
		return { correct: midi === expected, answer: { midi }, confusion: null };
	}
};

const nameJudge: ContentJudge = {
	judge(value, payload) {
		const item = value as IdentifyItem;
		const pitch = payload as PitchName;
		const expected = pitchOnString(item.string, item.fret);
		return {
			correct: pitch === expected,
			answer: { pitch },
			confusion: classifyNameConfusion(expected, pitch)
		};
	}
};

const chordGridJudge: ContentJudge = {
	judge(value, payload) {
		const { decided } = payload as ChordReading;
		const found = classifyGridChord(
			value as ChordGridItem,
			decided === null ? null : occurrenceOfId(decided)
		);
		return { correct: found === null, answer: { decided }, confusion: found };
	}
};

/** The content judges by kind of content. */
export const CONTENT_JUDGES: Readonly<Record<string, ContentJudge>> = {
	[NAME_CONTENT]: nameJudge,
	[PITCH_CONTENT]: pitchJudge,
	[CHORD_GRID_CONTENT]: chordGridJudge,
	[MEMBER_CONTENT]: memberJudge
};

export const contentJudges: ContentJudges = (kind) => {
	const judge = Object.hasOwn(CONTENT_JUDGES, kind) ? CONTENT_JUDGES[kind] : undefined;
	if (!judge) throw new Error(`unknown content kind: ${kind}`);
	return judge;
};
