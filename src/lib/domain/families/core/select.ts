import type { Family, Filter, Member, Selection, SelectionContext } from './types';

/** The attributes the filters `in` and `at` read: a member's notes, side by side. */
const PLACE_ATTRIBUTES = ['strings', 'frets'] as const;

function list(value: number | readonly number[]): readonly number[] {
	return typeof value === 'number' ? [value] : value;
}

/** A list attribute compares by its smallest element. */
function scalar(value: number | readonly number[]): number {
	return typeof value === 'number' ? value : Math.min(...value);
}

/**
 * A note lies in the frets `[from, to]`; an open string (fret 0) also lies in a zone that starts
 * at fret 1, the nut's, and in no other. A zone whose first fret is above the second holds none.
 */
function fretInZone(fret: number, [from, to]: readonly [number, number]): boolean {
	if (from > to) return false;
	return fret <= to && (fret >= from || (fret === 0 && from === 1));
}

/** A member covers the frets from its lowest to its highest, an open string counted as fret 0. */
function covers(frets: readonly number[], fret: number): boolean {
	return frets.length > 0 && fret >= Math.min(...frets) && fret <= Math.max(...frets);
}

type PlaceFilter = Extract<Filter, { in: unknown } | { at: unknown }>;
type PositionFilter = Extract<Filter, { position: unknown }>;

function unknownFilter(filter: never): never {
	throw new Error(`unknown filter ${JSON.stringify(filter)}`);
}

/** What `in` or `at` keeps: it reads the member alone. */
function placeKeeps<M extends Member>(family: Family<unknown, M>, filter: PlaceFilter, member: M) {
	const memberFrets = list(family.attributes.frets(member));
	if ('at' in filter) return covers(memberFrets, filter.at);
	const { strings, frets } = filter.in;
	const memberStrings = list(family.attributes.strings(member));
	return memberFrets.every(
		(fret, i) =>
			(strings === undefined || strings.includes(memberStrings[i])) &&
			(frets === undefined || fretInZone(fret, frets))
	);
}

/**
 * What `position` keeps of `members`: beyond the previous member, else, with `turns`, the other
 * way. `applied`: the filter as it ran, its `toward` turned when it turned.
 */
function beyondPrevious<M extends Member>(
	family: Family<unknown, M>,
	members: readonly M[],
	filter: PositionFilter,
	previous: M
): { kept: readonly M[]; turned: boolean; applied: PositionFilter } {
	const position = (member: M) => scalar(family.attributes.position(member));
	const from = position(previous);
	const beyond = (toward: 'up' | 'down') =>
		members.filter((member) =>
			toward === 'up' ? position(member) > from : position(member) < from
		);
	const { toward, turns } = filter.position;
	const ahead = beyond(toward);
	if (ahead.length > 0 || !turns) return { kept: ahead, turned: false, applied: filter };
	const back = toward === 'up' ? 'down' : 'up';
	return {
		kept: beyond(back),
		turned: true,
		applied: { position: { ...filter.position, toward: back } }
	};
}

/** The filters by kind, each kind in the order written. */
function sorted(where: readonly Filter[]) {
	const places: PlaceFilter[] = [];
	const positions: PositionFilter[] = [];
	let other: Extract<Filter, { other: unknown }> | null = null;
	for (const filter of where) {
		if ('in' in filter || 'at' in filter) places.push(filter);
		else if ('position' in filter) positions.push(filter);
		else if ('other' in filter) other ??= filter;
		else unknownFilter(filter);
	}
	return { places, positions, other };
}

/** What the filters kept, whether a `position` turned, and the first filter that left out the member asked about. */
interface Run<M extends Member> {
	kept: readonly M[];
	turned: boolean;
	refused: Filter | null;
}

/**
 * The members the filters keep, whatever order they are written in: first `in` and `at`, which
 * read the member alone; then each `position`, on what they left (several add up); then `other`,
 * which leaves the previous member out unless nothing else is left, the members then staying as
 * the other filters left them. Without a previous member, `position` and `other` restrict nothing.
 * With `member`, also the first filter, in that order, that left it out.
 */
function filtered<M extends Member>(
	family: Family<unknown, M>,
	members: readonly M[],
	where: readonly Filter[],
	previous: M | null,
	member: M | null = null
): Run<M> {
	const { places, positions, other } = sorted(where);
	let refused: Filter | null = member
		? (places.find((filter) => !placeKeeps(family, filter, member)) ?? null)
		: null;
	let kept = members.filter((each) => places.every((filter) => placeKeeps(family, filter, each)));
	if (!previous) return { kept, turned: false, refused };
	const placed = kept;
	let turned = false;
	for (const filter of positions) {
		const run = beyondPrevious(family, placed, filter, previous);
		const beyond = new Set(run.kept);
		turned ||= run.turned;
		if (member && refused === null && !beyond.has(member)) refused = run.applied;
		kept = kept.filter((each) => beyond.has(each));
	}
	if (!other) return { kept, turned, refused };
	const others = kept.filter((each) => each.id !== previous.id);
	if (others.length === 0) return { kept, turned, refused };
	if (member && refused === null && member.id === previous.id) refused = other;
	return { kept: others, turned, refused };
}

/** What `select` gives: the members admitted, and whether a `position` turned. */
export interface Selected<M extends Member> {
	admitted: M[];
	/** A `position` filter with `turns` found nothing beyond and turned. */
	turned: boolean;
}

/**
 * The members a selection admits for an index: restricted (the filters in an order of their
 * own, see `filtered`, so the order they are written in changes nothing), ordered, taken; and
 * whether its direction turned. Pure.
 */
export function select<M extends Member>(
	family: Family<unknown, M>,
	index: unknown,
	selection: Selection,
	context: SelectionContext<M> = {}
): Selected<M> {
	const { kept: members, turned } = filtered(
		family,
		family.members(index),
		selection.where ?? [],
		context.previous ?? null
	);
	const order = selection.order ?? [];
	const ordered =
		order.length === 0
			? [...members]
			: [...members].sort((a, b) => {
					for (const name of order) {
						const attribute = family.attributes[name];
						const gap = scalar(attribute(a)) - scalar(attribute(b));
						if (gap !== 0) return gap;
					}
					return 0;
				});
	return {
		admitted: selection.take === undefined ? ordered : ordered.slice(0, selection.take),
		turned
	};
}

/** The members a selection admits for an index (`select`, without whether it turned). Pure. */
export function admitted<M extends Member>(
	family: Family<unknown, M>,
	index: unknown,
	selection: Selection,
	context: SelectionContext<M> = {}
): M[] {
	return select(family, index, selection, context).admitted;
}

/**
 * Why a member of the index is not admitted: the first filter that leaves it out, in the order
 * `filtered` applies them (`in` and `at` as written, then each `position` as written, a turned
 * one given as it ran, then `other`). Null when the filters keep it, and for a member the index
 * does not give (what the family's confusion tells). The take is no filter: it refuses nothing.
 */
export function refusedBy<M extends Member>(
	family: Family<unknown, M>,
	index: unknown,
	selection: Selection,
	member: M,
	context: SelectionContext<M> = {}
): Filter | null {
	const members = family.members(index);
	const own = members.find((each) => each.id === member.id);
	if (!own) return null;
	return filtered(family, members, selection.where ?? [], context.previous ?? null, own).refused;
}

function filterName(filter: Filter): string {
	return Object.keys(filter)[0];
}

/** Null when the family can run this selection; else why not (an unknown attribute, a filter it has no attribute for). */
export function selectionProblem(family: Family, selection: Selection): string | null {
	const has = (name: string) => Object.hasOwn(family.attributes, name);
	for (const filter of selection.where ?? []) {
		const name = filterName(filter);
		if ((name === 'in' || name === 'at') && !PLACE_ATTRIBUTES.every(has)) {
			return `filter "${name}" needs the attributes strings and frets, which family "${family.id}" does not have`;
		}
		if ('in' in filter && filter.in.frets && filter.in.frets[0] > filter.in.frets[1]) {
			const [from, to] = filter.in.frets;
			return `filter "in" has frets [${from}, ${to}]: the first is above the second`;
		}
		if (name === 'position' && !has('position')) {
			return `filter "position" needs the attribute position, which family "${family.id}" does not have`;
		}
	}
	for (const name of selection.order ?? []) {
		if (!has(name)) {
			return `order names attribute "${name}", which family "${family.id}" does not have`;
		}
	}
	return null;
}
