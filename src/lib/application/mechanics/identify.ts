import { identifyRules, type IdentifyData } from '$lib/domain/mechanics';
import {
	answerChoiceLabel,
	formatNote,
	fretLabel,
	pitchOnString,
	spellPitch,
	stringLabel,
	type IdentifyItem
} from '$lib/domain/music';
import { CHROMATIC_NOTES, type PitchName } from '$lib/domain/music/types';
import type { PromptView, AnswerChoice } from '$lib/application/session/contract';
import { noteVerdict, type NoteLaneModel } from './locate';
import type { MechanicPresenter } from './types';

/** The screen model of a note to name: its fret and string, the twelve names, how it went. */
export interface AnswerKeysModel {
	prompt: PromptView;
	choices: AnswerChoice[];
	verdict: NoteLaneModel['verdict'];
}

/** Name the note on the screen: the answer pad, silence, the tap sensor. */
export const identifyPresenter: MechanicPresenter<IdentifyItem, { pitch: PitchName }> = {
	rules: identifyRules,
	scene: 'screen',
	sensors: ['tap'],
	prompt: (item, { aid }, locale, random) => ({
		primary: fretLabel(item.fret, locale),
		secondary: stringLabel(item.string, locale),
		aid:
			aid === 'show-position'
				? formatNote(spellPitch(pitchOnString(item.string, item.fret), random))
				: null,
		diagram: null
	}),
	answerLabel: ({ pitch }, _item, _locale, random) => formatNote(spellPitch(pitch, random)),
	/** After a miss: the name, both spellings for an altered one ("F# / Gb"). */
	reveal: (item, { verdict }) =>
		verdict === 'wrong' ? answerChoiceLabel(pitchOnString(item.string, item.fret)) : null,
	answerChoices: () =>
		CHROMATIC_NOTES.map((pitch) => ({ value: pitch, label: answerChoiceLabel(pitch) })),
	stageOf: (item, settled, locale, aids, _place, _drawing, random): { model: AnswerKeysModel } => ({
		model: {
			prompt: identifyPresenter.prompt(item, aids, locale, random),
			choices: identifyPresenter.answerChoices!(),
			verdict: settled && noteVerdict(identifyPresenter, item, settled.value, locale, random)
		}
	}),
	attemptData: (item, value): IdentifyData => {
		const [asked] = value.expectations;
		return {
			item,
			answer: (asked?.answer as IdentifyData['answer'] | undefined) ?? null,
			confusion: (asked?.confusion as IdentifyData['confusion'] | undefined) ?? null
		};
	}
};
