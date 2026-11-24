import { exerciseSetId } from '$lib/domain/sets';
import { presentationOf } from '$lib/domain/exercise/levels';
import type { ExerciseDefinition, Slot } from '$lib/domain/exercise/types';
import type { Locale, PlannedItem } from '$lib/domain/types';
import { ITEM_FIELDS } from './itemFields';
import { CONTENT_PICTURES, PICTURES, type Picture } from './pictures';

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
	/** What to draw: the picture its levels' presentation names, if any. */
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
 * What the screen says of `item`, from the words its exercise writes at the item's levels
 * (`presentationOf`: its `presentation`, rewritten by the `presentation.*` paths of its exercise
 * level and its item level) over the fields its set offers and those of its round's content
 * (`contentFields`, given by the caller), an item's field winning over the content's of the same
 * name. `random` spells an altered note: give every call for one item the same value. The
 * presentation is checked once at every level, as its exercise loads
 * (`definitionChecks`). A picture of the round's content (`CONTENT_PICTURES`) is left to the view
 * of the round.
 */
export function presentPrompt(
	definition: ExerciseDefinition,
	item: PlannedItem,
	locale: Locale,
	random: () => number,
	contentFields: Readonly<Record<string, string>> = {}
): PresentedPrompt {
	const presentation = presentationOf(definition, {
		exerciseLevel: item.exerciseLevel,
		itemLevel: item.level ?? null
	});
	if (!presentation) throw new Error(`${definition.id}: has no presentation`);
	const set = exerciseSetId(definition);
	const offered = Object.hasOwn(ITEM_FIELDS, set) ? ITEM_FIELDS[set] : undefined;
	const fields = {
		...contentFields,
		...(offered ? offered.fields(item.item, locale, random, definition) : {})
	};
	const name = presentation.picture;
	const drawn =
		name === undefined || CONTENT_PICTURES.includes(name) ? null : PICTURES[name].draw(item.item);
	return {
		primary: say(presentation.primary, locale, fields) ?? '',
		secondary: say(presentation.secondary, locale, fields),
		detail: say(presentation.detail, locale, fields),
		target: say(presentation.target, locale, fields),
		band: say(presentation.band, locale, fields),
		preview: say(presentation.preview, locale, fields),
		pictures: drawn === null ? [] : [drawn]
	};
}
