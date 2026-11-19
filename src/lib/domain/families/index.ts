import type { Family, Member } from './core/types';
import { chordShapes } from './guitar/chordShapes';
import {
	GUITAR_DEFAULT_DERIVATIONS,
	GUITAR_DERIVATIONS,
	GUITAR_PASSAGE_DERIVATIONS
} from './guitar/derivations';
import { notePlaces } from './guitar/notePlaces';
import { gridChangesFamily, MUSIC_PASSAGE_DERIVATIONS } from './music/gridChanges';

export type { Family, Filter, Member, Selection, SelectionContext } from './core/types';
export { admitted, refusedBy, select, selectionProblem, type Selected } from './core/select';

/** Every family, by id: the guitar's and the music's. */
export const FAMILIES: Readonly<Record<string, Family>> = {
	[notePlaces.id]: notePlaces,
	[chordShapes.id]: chordShapes,
	[gridChangesFamily.id]: gridChangesFamily
};

export function familyNamed(id: string): Family | null {
	return Object.hasOwn(FAMILIES, id) ? FAMILIES[id] : null;
}

/**
 * What a derivation reads besides its item: the values of its passage's index (`{}` out of a
 * passage) and the item's resolved params.
 */
export interface IndexContext {
	of: Readonly<Record<string, unknown>>;
	params: Readonly<Record<string, unknown>>;
}

/** What gives an index from an item: by name, the family it indexes and the sets it reads. */
export interface IndexDerivation {
	family: string;
	reads: readonly string[];
	/** Throws an Error saying why when the item gives no index. */
	index(item: unknown, context: IndexContext): unknown;
}

export const INDEX_DERIVATIONS: Readonly<Record<string, IndexDerivation>> = GUITAR_DERIVATIONS;

/** The derivation `name` (or, absent, the one set `set` gives family `family`); null when none. */
export function indexDerivation(
	family: string,
	set: string,
	name?: string
): IndexDerivation | null {
	const chosen =
		name ??
		(Object.hasOwn(GUITAR_DEFAULT_DERIVATIONS, family) &&
		Object.hasOwn(GUITAR_DEFAULT_DERIVATIONS[family], set)
			? GUITAR_DEFAULT_DERIVATIONS[family][set]
			: undefined);
	if (chosen === undefined || !Object.hasOwn(INDEX_DERIVATIONS, chosen)) return null;
	const derivation = INDEX_DERIVATIONS[chosen];
	return derivation.family === family && derivation.reads.includes(set) ? derivation : null;
}

/**
 * What gives a family's members to a passage: its index from a passage's index, and the item set
 * whose items its members are. A family without one gives no passage its members.
 */
export interface PassageDerivation {
	/** The item set whose items the members are. */
	set: string;
	/**
	 * The family's index for a passage's values (`of`) and the resolved params. Throws an Error
	 * saying why when they give none; the family's `indexProblem` judges what it gives.
	 */
	passageIndex(
		of: Readonly<Record<string, unknown>>,
		params: Readonly<Record<string, unknown>>
	): unknown;
	/** The item of `set` a member is, whose key is the member's id. */
	itemOf(member: Member): unknown;
}

/** By family id, what gives its members to a passage: the guitar's and the music's. */
export const PASSAGE_DERIVATIONS: Readonly<Record<string, PassageDerivation>> = {
	...GUITAR_PASSAGE_DERIVATIONS,
	...MUSIC_PASSAGE_DERIVATIONS
};

/** What gives family `family`'s members to a passage; null when it gives none. */
export function passageDerivation(family: string): PassageDerivation | null {
	return Object.hasOwn(PASSAGE_DERIVATIONS, family) ? PASSAGE_DERIVATIONS[family] : null;
}
