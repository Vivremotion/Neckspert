import type { ExerciseDefinition, Slot } from '$lib/domain/exercise/types';
import type { Locale, PlannedItem } from '$lib/domain/types';
import { ITEM_FIELDS } from './itemFields';
import { PICTURES, type Picture } from './pictures';
import { presentationProblem } from './validate';

/** What the screen says of one prompt, in the player's language. */
export interface PresentedPrompt {
	primary: string;
	secondary: string | null;
	/** Small, under the prompt. */
	detail: string | null;
	/** On the target tile; null: the view shows `primary`. */
	target: string | null;
	/** On the band of an extended expectation. */
	band: string | null;
	/** While the item waits for its prompt. */
	preview: string | null;
	/** The aided level's line. */
	aid: string | null;
	/** What to draw: the aided picture, then the fading one. */
	pictures: Picture[];
}

/** The text of a slot in a language, `{field}` replaced; null when it says nothing. */
function say(
	slot: Slot | undefined,
	locale: Locale,
	fields: Record<string, string>
): string | null {
	if (slot === undefined) return null;
	const text = typeof slot === 'string' ? slot : slot[locale];
	const written = text.replace(/\{(\w+)\}/g, (_, name: string) => fields[name] ?? '').trim();
	return written === '' ? null : written;
}

/**
 * What the screen says of `item`, from the words its exercise writes (`presentation`) over the
 * fields its mechanic offers. `random` spells an altered note: give every call for one item the
 * same value. Throws on a presentation `presentationProblem` refuses.
 */
export function presentPrompt(
	definition: ExerciseDefinition,
	item: PlannedItem,
	locale: Locale,
	random: () => number
): PresentedPrompt {
	const problem = presentationProblem(definition);
	if (problem !== null) throw new Error(problem);
	const presentation = definition.presentation;
	if (!presentation) throw new Error(`${definition.id}: has no presentation`);
	const offered = ITEM_FIELDS[definition.mechanic];
	const fields = offered ? offered.fields(item.item, locale, random) : {};
	const aided = item.aid === 'show-position';
	const names = [
		aided ? presentation.aided?.picture : undefined,
		item.stringAid ? presentation.fading?.picture : undefined
	];
	return {
		primary: say(presentation.primary, locale, fields) ?? '',
		secondary: say(presentation.secondary, locale, fields),
		detail: say(presentation.detail, locale, fields),
		target: say(presentation.target, locale, fields),
		band: say(presentation.band, locale, fields),
		preview: say(presentation.preview, locale, fields),
		aid: aided ? say(presentation.aided?.line, locale, fields) : null,
		pictures: names.flatMap((name) => {
			const drawn = name === undefined ? null : PICTURES[name].draw(item.item);
			return drawn === null ? [] : [drawn];
		})
	};
}
