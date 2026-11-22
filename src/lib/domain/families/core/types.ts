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
	/** The member an identity names, whatever its index; null for an id that names none. */
	member(id: string): M | null;
	/** By name: what a filter or an order compares. A list for `strings` and `frets`. */
	attributes: Readonly<Record<string, Attribute<M>>>;
	/** The admitted member a sensor's payload is, or null. */
	recognise(admitted: readonly M[], payload: unknown): M | null;
	/** The member of this index a sensor's payload is, admitted or not; null when it is none. */
	heard(index: I, payload: unknown): M | null;
	/**
	 * The member of the family a payload (or the answer an attempt kept of it) names by its
	 * identity, whatever its index; null when it names none, or when a payload cannot name one
	 * without an index.
	 */
	named(payload: unknown): M | null;
	/**
	 * How a payload that is no admitted member relates to them; null when nothing can be said.
	 * `refused`: the filter that left out the member heard (`refusedBy`), when it is one of the
	 * index's; null or absent otherwise.
	 */
	confusion(index: I, admitted: readonly M[], payload: unknown, refused?: Filter | null): unknown;
	/** What of a payload an attempt keeps as its answer; null when the payload is unreadable. */
	answer(payload: unknown): unknown;
}

/**
 * A restriction of the members, independent of the others: a selection admits the same members
 * whatever order its filters are written in (`admitted` applies them in an order of its own).
 * `in` and `at` read the member alone (`at`: the member covers that fret, between its lowest and
 * its highest, an open string counted as fret 0: 5-5-3 covers 3, 4 and 5); `position` keeps what lies beyond the previous member,
 * its turn decided on what `in` and `at` left; `other` leaves the previous member out, unless
 * nothing else is left.
 */
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

export interface SelectionContext<M extends Member = Member> {
	/**
	 * The member before: the last asked of the card, or the last heard in the passage. A member
	 * of the family, of this index or of another (the last shape heard was of another chord).
	 */
	previous?: M | null;
}
