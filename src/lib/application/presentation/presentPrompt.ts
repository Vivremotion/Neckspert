import { exerciseSetId } from '$lib/domain/sets';
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
 * fields its set offers and those of its round's content (`contentFields`, given by the caller),
 * an item's field winning over the content's of the same name. `random` spells an altered note:
 * give every call for one item the same value. The presentation is checked once, as its exercise
 * loads (`definitionChecks`). A picture of the round's content (`CONTENT_PICTURES`) is left to
 * the view of the round.
 */
export function presentPrompt(
	definition: ExerciseDefinition,
	item: PlannedItem,
	locale: Locale,
	random: () => number,
	contentFields: Readonly<Record<string, string>> = {}
): PresentedPrompt {
	const presentation = definition.presentation;
	if (!presentation) throw new Error(`${definition.id}: has no presentation`);
	const set = exerciseSetId(definition);
	const offered = Object.hasOwn(ITEM_FIELDS, set) ? ITEM_FIELDS[set] : undefined;
	const fields = {
		...contentFields,
		...(offered ? offered.fields(item.item, locale, random, definition) : {})
	};
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
			const drawn =
				name === undefined || CONTENT_PICTURES.includes(name)
					? null
					: PICTURES[name].draw(item.item);
			return drawn === null ? [] : [drawn];
		})
	};
}
