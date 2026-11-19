import type { Family } from './core/types';
import { chordShapes } from './guitar/chordShapes';
import { GUITAR_DEFAULT_DERIVATIONS, GUITAR_DERIVATIONS } from './guitar/derivations';
import { notePlaces } from './guitar/notePlaces';

export type { Family, Filter, Member, Selection, SelectionContext } from './core/types';
export { admitted, selectionProblem } from './core/select';

/** Every family, by id. */
export const FAMILIES: Readonly<Record<string, Family>> = {
	[notePlaces.id]: notePlaces,
	[chordShapes.id]: chordShapes
};

export function familyNamed(id: string): Family | null {
	return Object.hasOwn(FAMILIES, id) ? FAMILIES[id] : null;
}

/** What gives an index from an item: by name, the family it indexes and the sets it reads. */
export interface IndexDerivation {
	family: string;
	reads: readonly string[];
	index(item: unknown): unknown;
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
