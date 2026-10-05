import type { AnswerChoice } from '$lib/application/session/contract';
import { answerChoiceLabel } from '$lib/domain/music';
import { CHROMATIC_NOTES } from '$lib/domain/music/types';

/** The twelve mode 2 answers, C to B; altered notes carry both spellings ("F# / Gb"). */
export function identifyChoices(): AnswerChoice[] {
	return CHROMATIC_NOTES.map((pitch) => ({ value: pitch, label: answerChoiceLabel(pitch) }));
}

const CHROMATIC_ORDER: readonly string[] = CHROMATIC_NOTES;

/** Chromatic order, C to B, whatever order the controller sent. Returns a copy. */
export function orderChoices(choices: readonly AnswerChoice[]): AnswerChoice[] {
	return [...choices].sort(
		(a, b) => CHROMATIC_ORDER.indexOf(a.value) - CHROMATIC_ORDER.indexOf(b.value)
	);
}
