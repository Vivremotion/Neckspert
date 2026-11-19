/** One member of a family: named by its identity, never by a rank. */
export interface Member {
	/** Stable identity (its strings and frets), unique in its family. */
	id: string;
}

/**
 * What a member is compared by. Written as a method, so that a family of its own members still
 * passes as a `Family` in a registry (methods are compared bivariantly, as `members` is).
 */
export type Attribute<M extends Member> = {
	read(member: M): number | readonly number[];
}['read'];

/**
 * What gives, for an index, a set of members, and how they are compared, recognised and told
 * apart. The attributes `strings` and `frets` list a member's notes in one order, so that the
 * filter `in` reads them side by side.
 */
export interface Family<I = unknown, M extends Member = Member> {
	id: string;
	/** Null when `index` is one this family reads; else why not. */
	indexProblem(index: unknown): string | null;
	/** Every member for this index, in a stable order. */
	members(index: I): M[];
	/** By name: what a filter or an order compares. A list for `strings` and `frets`. */
	attributes: Readonly<Record<string, Attribute<M>>>;
	/** The admitted member a sensor's payload is, or null. */
	recognise(admitted: readonly M[], payload: unknown): M | null;
	/** How a payload that is no admitted member relates to them; null when nothing can be said. */
	confusion(index: I, admitted: readonly M[], payload: unknown): unknown;
}

export type Filter =
	| { in: { strings?: readonly number[]; frets?: readonly [number, number] } }
	| { at: number }
	| { position: { beyond: 'previous'; toward: 'up' | 'down'; turns?: boolean } }
	| { other: 'previous' };

/** A selection with every value resolved. */
export interface Selection {
	family: string;
	where?: readonly Filter[];
	order?: readonly string[];
	take?: number;
}

export interface SelectionContext {
	/** The member before: the last asked of the card, or the last heard in the passage. */
	previous?: Member | null;
}
