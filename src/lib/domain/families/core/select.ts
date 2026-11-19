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

function applyFilter<M extends Member>(
	family: Family<unknown, M>,
	members: readonly M[],
	filter: Filter,
	previous: Member | null
): readonly M[] {
	const attribute = (name: string) => family.attributes[name];
	if ('in' in filter) {
		const { strings, frets } = filter.in;
		return members.filter((member) => {
			const memberStrings = list(attribute('strings')(member));
			const memberFrets = list(attribute('frets')(member));
			return memberFrets.every(
				(fret, i) =>
					(strings === undefined || strings.includes(memberStrings[i])) &&
					(frets === undefined || fretInZone(fret, frets))
			);
		});
	}
	if ('at' in filter) {
		return members.filter((member) => list(attribute('frets')(member)).includes(filter.at));
	}
	if ('position' in filter) {
		if (!previous) return members;
		const position = (member: Member) => scalar(attribute('position')(member as M));
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
	if (!previous) return members;
	// When the previous member is the only one, it stays: something is still asked.
	const others = members.filter((member) => member.id !== previous.id);
	return others.length > 0 ? others : members;
}

/** The members a selection admits for an index: restricted, ordered, taken. Pure. */
export function admitted<M extends Member>(
	family: Family<unknown, M>,
	index: unknown,
	selection: Selection,
	context: SelectionContext = {}
): M[] {
	const previous = context.previous ?? null;
	let members: readonly M[] = family.members(index);
	for (const filter of selection.where ?? []) {
		members = applyFilter(family, members, filter, previous);
	}
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
