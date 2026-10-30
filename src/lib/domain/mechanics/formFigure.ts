import type { ExerciseForm } from '$lib/domain/exercise/types';
import { parseNoteName } from '$lib/domain/time/noteName';
import { parseItemBeats, type MechanicIdentity } from './types';

/**
 * What a form-figure attempt is about: a form of the exercise, moved so that it starts on `first`,
 * played as a figure. `beats` is the length of its turn, when the exercise lists its forms with
 * one.
 */
export interface FormFigureItem {
	/** The id of a form among its exercise's `forms`. */
	form: string;
	/** One LilyPond note, as written (`d`, `g,`, `bes'`): no duration, no string. */
	first: string;
	beats?: number;
}

/** Between the parts of an item's key, so a form's id cannot hold it. */
export const FORM_ITEM_SEPARATOR = '@';

/**
 * Figures played on a form written once and moved from chord to chord: a skill (its attempts are
 * kept with their observations, no card). The key is `${form}@${first}`, followed by `@${beats}`
 * when the item has a length.
 */
export const formFigureRules: MechanicIdentity<FormFigureItem> = {
	id: 'form-figure',
	learner: 'skill',
	itemKey: ({ form, first, beats }) =>
		`${form}${FORM_ITEM_SEPARATOR}${first}${beats === undefined ? '' : `${FORM_ITEM_SEPARATOR}${beats}`}`,
	parseItem: (itemKey) => {
		const [form, first, beats, ...rest] = itemKey.split(FORM_ITEM_SEPARATOR);
		if (!form || first === undefined || rest.length > 0) {
			throw new Error(`Invalid form figure item key: "${itemKey}"`);
		}
		parseNoteName(first);
		return beats === undefined
			? { form, first }
			: { form, first, beats: parseItemBeats(beats, itemKey) };
	}
};

/** The form `id` among those an exercise writes; throws naming it and them. */
export function formNamed(forms: readonly ExerciseForm[] | undefined, id: string): ExerciseForm {
	const found = forms?.find((form) => form.id === id);
	if (!found) {
		const written = forms?.map((form) => form.id).join(', ') || 'none';
		throw new Error(`names form "${id}", which the exercise does not write (${written})`);
	}
	return found;
}
