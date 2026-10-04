import { CHROMATIC_NOTES, MAX_PROMPT_FRET } from '$lib/domain/music/types';
import {
	answerChoiceLabel,
	formatNote,
	fretLabel,
	fretsForPitch,
	pitchOnString,
	spellPitch,
	stringLabel
} from '$lib/domain/music';
import type { Locale, PlannedItem, Target } from '$lib/domain/types';
import type { AnswerChoice, PromptView } from './contract';

export function buildPromptView(
	item: PlannedItem,
	locale: Locale,
	random: () => number
): PromptView {
	const { target, aid } = item;
	if (target.direction === 'locate') {
		const label = spellPitch(target.pitch, random);
		const frets = fretsForPitch(target.string, target.pitch, MAX_PROMPT_FRET);
		return {
			direction: 'locate',
			primary: formatNote(label),
			secondary: stringLabel(target.string, locale),
			aid: aid === 'show-position' && frets.length > 0 ? fretLabel(frets[0], locale) : null
		};
	}
	return {
		direction: 'identify',
		primary: fretLabel(target.fret, locale),
		secondary: stringLabel(target.string, locale),
		aid:
			aid === 'show-position'
				? formatNote(spellPitch(pitchOnString(target.string, target.fret), random))
				: null
	};
}

export function buildAnswerChoices(): AnswerChoice[] {
	return CHROMATIC_NOTES.map((pitch) => ({
		pitch,
		label: answerChoiceLabel(pitch)
	}));
}

/** Highest fret shown in a correction: fret 12 stands for the open string, which is never prompted. */
const CORRECTION_MAX_FRET = 12;

/**
 * The right answer, shown after a miss: the position in mode 1 ("corde de E grave, case 5"),
 * the note name in mode 2 ("F# / Gb").
 */
export function buildCorrection(target: Target, locale: Locale): string {
	if (target.direction === 'identify') {
		return answerChoiceLabel(pitchOnString(target.string, target.fret));
	}
	const fret = fretsForPitch(target.string, target.pitch, CORRECTION_MAX_FRET).find((f) => f > 0);
	return `${stringLabel(target.string, locale)}, ${fretLabel(fret ?? CORRECTION_MAX_FRET, locale)}`;
}
