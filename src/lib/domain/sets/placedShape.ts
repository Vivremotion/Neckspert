import type { ExerciseShape } from '$lib/domain/exercise/types';
import { parseNoteName } from '$lib/domain/time/noteName';
import type { ItemSet } from './types';

/**
 * What an attempt on a placed shape is about: a shape of the exercise, moved so that it starts on
 * `first`, played as a figure. `beats` is the length of its turn, when the exercise gives it one
 * in its list of items: it is not part of the key.
 */
export interface FormFigureItem {
	/** The id of a shape among its exercise's `shapes`. */
	shape: string;
	/** One LilyPond note, as written (`d`, `g,`, `bes'`): no duration, no string. */
	first: string;
	beats?: number;
}

/** Between the parts of an item's key, so a shape's id cannot hold it. */
export const SHAPE_ITEM_SEPARATOR = '@';

/**
 * A shape written once by its exercise, moved from chord to chord, whose notes a figure plays. The
 * key is `${shape}@${first}`.
 */
export const placedShapeSet: ItemSet<FormFigureItem> = {
	id: 'placed-shape',
	itemKey: ({ shape, first }) => `${shape}${SHAPE_ITEM_SEPARATOR}${first}`,
	parseItem: (itemKey) => {
		const [shape, first, ...rest] = itemKey.split(SHAPE_ITEM_SEPARATOR);
		if (!shape || first === undefined || rest.length > 0) {
			throw new Error(`Invalid form figure item key: "${itemKey}"`);
		}
		parseNoteName(first);
		return { shape, first };
	},
	cardItem: ({ shape, first }) => ({ shape, first })
};

/** The shape `id` among those an exercise writes; throws naming it and them. */
export function shapeNamed(
	shapes: readonly ExerciseShape[] | undefined,
	id: string
): ExerciseShape {
	const found = shapes?.find((shape) => shape.id === id);
	if (!found) {
		const written = shapes?.map((shape) => shape.id).join(', ') || 'none';
		throw new Error(`names shape "${id}", which the exercise does not write (${written})`);
	}
	return found;
}
