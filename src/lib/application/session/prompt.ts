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
import type { Locale, PlannedItem } from '$lib/domain/types';
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
