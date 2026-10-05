import { identifyRules } from '$lib/domain/mechanics';
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
import type { MechanicPresenter } from './types';

/** Name the note on the screen: the answer pad, silence, the tap sensor. */
export const identifyPresenter: MechanicPresenter<IdentifyItem, { pitch: PitchName }> = {
	rules: identifyRules,
	scene: 'screen',
	sensor: 'tap',
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
		CHROMATIC_NOTES.map((pitch) => ({ value: pitch, label: answerChoiceLabel(pitch) }))
};
