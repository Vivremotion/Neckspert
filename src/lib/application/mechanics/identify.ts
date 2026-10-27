import { identifyRules, type IdentifyData } from '$lib/domain/mechanics';
import { answerChoiceLabel, fretLabel, stringLabel, type IdentifyItem } from '$lib/domain/music';
import { CHROMATIC_NOTES, type PitchName } from '$lib/domain/music/types';
import type { PromptView, AnswerChoice } from '$lib/application/session/contract';
import { nameAtFret, nameChoice, noteName } from '$lib/application/presentation/noteWords';
import { noteVerdict, type NoteVerdictView } from './noteVerdict';
import type { MechanicPresenter } from './types';

/** The screen model of a note to name: its fret and string, the twelve names, how it went. */
export interface AnswerKeysModel {
	prompt: PromptView;
	choices: AnswerChoice[];
	verdict: NoteVerdictView | null;
}

/** Name the note on the screen: the answer pad, silence, the tap sensor. */
export const identifyPresenter: MechanicPresenter<IdentifyItem, { pitch: PitchName }> = {
	rules: identifyRules,
	scene: 'screen',
	sensors: ['tap'],
	prompt: (item, { aid }, locale, random) => ({
		primary: fretLabel(item.fret, locale),
		secondary: stringLabel(item.string, locale),
		aid: aid === 'show-position' ? nameAtFret(item, random) : null,
		diagram: null
	}),
	answerLabel: ({ pitch }, _item, _locale, random) => noteName(pitch, random),
	/** After a miss: the name, both spellings for an altered one ("F# / Gb"). */
	reveal: (item, { verdict }) => (verdict === 'wrong' ? nameChoice(item) : null),
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
