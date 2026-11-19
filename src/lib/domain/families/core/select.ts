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
 * at fret 1, the nut's, and in no other.
 */
function fretInZone(fret: number, [from, to]: readonly [number, number]): boolean {
	return fret <= to && (fret >= from || (fret === 0 && from === 1));
}

type PlaceFilter = Extract<Filter, { in: unknown } | { at: unknown }>;
type PositionFilter = Extract<Filter, { position: unknown }>;

function unknownFilter(filter: never): never {
	throw new Error(`unknown filter ${JSON.stringify(filter)}`);
}

/** What `in` or `at` keeps: it reads the member alone. */
function placeKeeps<M extends Member>(family: Family<unknown, M>, filter: PlaceFilter, member: M) {
	const memberFrets = list(family.attributes.frets(member));
	if ('at' in filter) return memberFrets.includes(filter.at);
	const { strings, frets } = filter.in;
	const memberStrings = list(family.attributes.strings(member));
	return memberFrets.every(
		(fret, i) =>
			(strings === undefined || strings.includes(memberStrings[i])) &&
			(frets === undefined || fretInZone(fret, frets))
	);
}

/** What `position` keeps of `members`: beyond the previous member, else, with `turns`, the other way. */
function beyondPrevious<M extends Member>(
	family: Family<unknown, M>,
	members: readonly M[],
	filter: PositionFilter,
	previous: M
): readonly M[] {
	const position = (member: M) => scalar(family.attributes.position(member));
	const from = position(previous);
	const beyond = (toward: 'up' | 'down') =>
		members.filter((member) =>
			toward === 'up' ? position(member) > from : position(member) < from
		);
	const { toward, turns } = filter.position;
	const ahead = beyond(toward);
	if (ahead.length > 0 || !turns) return ahead;
	return beyond(toward === 'up' ? 'down' : 'up');
}

/**
 * The members the filters keep, whatever order they are written in: first `in` and `at`, which
 * read the member alone; then each `position`, on what they left (several add up); then `other`,
 * which leaves the previous member out unless nothing else is left, the members then staying as
 * the other filters left them. Without a previous member, `position` and `other` restrict nothing.
 */
function filtered<M extends Member>(
	family: Family<unknown, M>,
	members: readonly M[],
	where: readonly Filter[],
	previous: M | null
): readonly M[] {
	const places: PlaceFilter[] = [];
	const positions: PositionFilter[] = [];
	let other = false;
	for (const filter of where) {
		if ('in' in filter || 'at' in filter) places.push(filter);
		else if ('position' in filter) positions.push(filter);
		else if ('other' in filter) other = true;
		else unknownFilter(filter);
	}
	let kept = members.filter((member) =>
		places.every((filter) => placeKeeps(family, filter, member))
	);
	if (!previous) return kept;
	const placed = kept;
	for (const filter of positions) {
		const beyond = new Set(beyondPrevious(family, placed, filter, previous));
		kept = kept.filter((member) => beyond.has(member));
	}
	if (!other) return kept;
	const others = kept.filter((member) => member.id !== previous.id);
	return others.length > 0 ? others : kept;
}

/**
 * The members a selection admits for an index: restricted (the filters in an order of their
 * own, see `filtered`, so the order they are written in changes nothing), ordered, taken. Pure.
 */
export function admitted<M extends Member>(
	family: Family<unknown, M>,
	index: unknown,
	selection: Selection,
	context: SelectionContext<M> = {}
): M[] {
	const members = filtered(
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
	return selection.take === undefined ? ordered : ordered.slice(0, selection.take);
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
