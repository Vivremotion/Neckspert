import { classifyNameConfusion, pitchOnString, type IdentifyItem } from '$lib/domain/music';
import type { Midi, PitchName } from '$lib/domain/music/types';
import type { ContentJudge, ContentJudges } from '$lib/domain/time';
import { MEMBER_CONTENT, memberJudge } from './member';

export { admittedMembers, MEMBER_CONTENT, type MemberContent } from './member';

/** The name of the note at a fret of a string. Value: `IdentifyItem`; payload: a `PitchName`. */
export const NAME_CONTENT = 'name';

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

/** The content judges by kind of content. */
export const CONTENT_JUDGES: Readonly<Record<string, ContentJudge>> = {
	[NAME_CONTENT]: nameJudge,
	[PITCH_CONTENT]: pitchJudge,
	[MEMBER_CONTENT]: memberJudge
};

export const contentJudges: ContentJudges = (kind) => {
	const judge = Object.hasOwn(CONTENT_JUDGES, kind) ? CONTENT_JUDGES[kind] : undefined;
	if (!judge) throw new Error(`unknown content kind: ${kind}`);
	return judge;
};
