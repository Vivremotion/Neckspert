import { identifyRules, type IdentifyData } from '$lib/domain/mechanics';
import { answerChoiceLabel, type IdentifyItem } from '$lib/domain/music';
import { CHROMATIC_NOTES, type PitchName } from '$lib/domain/music/types';
import type { MechanicPresenter } from './types';

/** Name the note on the screen: the answer pad, silence, the tap sensor. */
export const identifyPresenter: MechanicPresenter<IdentifyItem, { pitch: PitchName }> = {
	rules: identifyRules,
	scene: 'screen',
	sensors: ['tap'],
	answerChoices: () =>
		CHROMATIC_NOTES.map((pitch) => ({ value: pitch, label: answerChoiceLabel(pitch) })),
	attemptData: (item, value): IdentifyData => {
		const [asked] = value.expectations;
		return {
			item,
			answer: (asked?.answer as IdentifyData['answer'] | undefined) ?? null,
			confusion: (asked?.confusion as IdentifyData['confusion'] | undefined) ?? null
		};
	}
};
