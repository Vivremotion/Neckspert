/**
 * A content written as a selection of a family's members, as an exercise writes it: pure data,
 * JSON as is. `selectionProblemOf` says whether it can be compiled, `compileSelection` resolves
 * it for one item.
 */
import type { Num } from '../round/types';

/** A value of a filter: written, read in the item's resolved params, or read on the item (`ITEM_VALUES`). */
export type FilterValue<T> = T | { param: string } | { item: string };

/**
 * A filter of a selection as written (`Filter` once resolved): any of its values may be read in
 * the params or on the item; a value the item does not carry leaves the filter out.
 */
export type FilterTemplate =
	| {
			in: {
				strings?: FilterValue<readonly number[] | number>;
				frets?: FilterValue<readonly [FilterValue<number>, FilterValue<number>]>;
			};
	  }
	| { at: FilterValue<number> }
	| {
			position: {
				beyond: 'previous';
				/** Written, or read in the params (a passage's params among them). */
				toward: 'up' | 'down' | { param: string };
				turns?: boolean;
			};
	  }
	| { other: 'previous' };

/**
 * The members of `family` for the index the item gives (through the index derivation `of`, else
 * the set's own), that the filters admit, ordered and taken. Judged by the member judge.
 */
export interface SelectionTemplate {
	family: string;
	of?: string;
	where?: readonly FilterTemplate[];
	order?: readonly string[];
	/** A whole number above 0; `{ item }` measures it (`ITEM_NUMBERS`), as any `Num`. */
	take?: Num;
}

/** Whether a content is written as a selection. */
export function isSelectionTemplate(content: unknown): content is SelectionTemplate {
	return typeof content === 'object' && content !== null && 'family' in content;
}

/**
 * The shape a filter's value must have: a fret (`at`, an end of `frets`), strings (one or a list),
 * or a zone of two frets (their order is the family's to check, `selectionProblem`).
 */
export type FilterValueKind = 'number' | 'numbers' | 'pair';

export const FILTER_VALUE_WORDS: Readonly<Record<FilterValueKind, string>> = {
	number: 'a number',
	numbers: 'a number or a list of numbers',
	pair: 'a pair of frets'
};

const finite = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value);

/** Whether a filter's value, resolved, has the shape `kind` asks: the one predicate of load and compile. */
export function fitsFilterValue(value: unknown, kind: FilterValueKind): boolean {
	if (kind === 'number') return finite(value);
	if (kind === 'numbers') return finite(value) || (Array.isArray(value) && value.every(finite));
	return Array.isArray(value) && value.length === 2 && value.every(finite);
}

/** Whether the shape of an item value (`ItemValue.kind`) fits where a filter needs `kind`. */
export function itemValueFits(given: 'number' | 'numbers', kind: FilterValueKind): boolean {
	return kind === 'numbers' || (kind === 'number' && given === 'number');
}
