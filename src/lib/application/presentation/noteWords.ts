import {
	answerChoiceLabel,
	formatNote,
	fretLabel,
	fretsForPitch,
	pitchOnString,
	spellPitch,
	stringLabel,
	type IdentifyItem,
	type LocateItem
} from '$lib/domain/music';
import { MAX_PROMPT_FRET, type PitchName } from '$lib/domain/music/types';
import type { Locale } from '$lib/domain/types';

/** Highest fret shown in a correction: fret 12 stands for the open string, which is never prompted. */
export const CORRECTION_MAX_FRET = 12;

/** A pitch as the screen spells it: a sharp or a flat for an altered one, drawn with `random`. */
export function noteName(pitch: PitchName, random: () => number): string {
	return formatNote(spellPitch(pitch, random));
}

/** The first fret of a located note a prompt can name ("case 6"), null when it has none. */
export function promptFretLabel(item: LocateItem, locale: Locale): string | null {
	const [fret] = fretsForPitch(item.string, item.pitch, MAX_PROMPT_FRET);
	return fret === undefined ? null : fretLabel(fret, locale);
}

/** Where a missed located note is ("corde de E grave, case 5"). */
export function positionLabel(item: LocateItem, locale: Locale): string {
	const fret = fretsForPitch(item.string, item.pitch, CORRECTION_MAX_FRET).find((f) => f > 0);
	return `${stringLabel(item.string, locale)}, ${fretLabel(fret ?? CORRECTION_MAX_FRET, locale)}`;
}

/** The note at a fret, as the prompt spells it. */
export function nameAtFret(item: IdentifyItem, random: () => number): string {
	return noteName(pitchOnString(item.string, item.fret), random);
}

/** The right name after a missed one, both spellings for an altered note ("F# / Gb"). */
export function nameChoice(item: IdentifyItem): string {
	return answerChoiceLabel(pitchOnString(item.string, item.fret));
}
