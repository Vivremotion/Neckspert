import { ITEM_NUMBERS, ITEM_VALUES } from '../../derivations';
import { familyNamed, indexDerivation, type Filter, type Selection } from '../../families';
import type { MemberContent } from '../../judges';
import { exerciseItemSet, exerciseSetId } from '../../sets';
import type { PlannedItem } from '../../types';
import type { ExerciseDefinition } from '../types';
import {
	FILTER_VALUE_WORDS,
	fitsFilterValue,
	type FilterTemplate,
	type FilterValueKind,
	type SelectionTemplate
} from './types';

/** A selection that cannot be compiled for an item: `field` its own field (empty: itself). */
export class SelectionCompileError extends Error {
	constructor(
		readonly field: string,
		readonly text: string
	) {
		super(field === '' ? text : `${field} ${text}`);
		this.name = 'SelectionCompileError';
	}
}

/** What a compilation reads; no item for a passage's members. */
interface Context {
	definition: ExerciseDefinition;
	item: Pick<PlannedItem, 'item' | 'passage'> | null;
	params: Readonly<Record<string, unknown>>;
}

/** What a passage's members are resolved for, in place of an item. */
const PASSAGE = 'a passage';

function fail(field: string, text: string): never {
	throw new SelectionCompileError(field, text);
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRef(value: unknown): value is { param: string } | { item: string } {
	if (!isRecord(value)) return false;
	const keys = Object.keys(value);
	return keys.length === 1 && (keys[0] === 'param' || keys[0] === 'item');
}

function paramValue(params: Readonly<Record<string, unknown>>, path: string): unknown {
	let found: unknown = params;
	for (const key of path.split('.')) found = isRecord(found) ? found[key] : undefined;
	return found;
}

/** The item for a message: its key, or its JSON when its set cannot read it. */
function itemOf(context: Context): string {
	if (context.item === null) return PASSAGE;
	const set = exerciseSetId(context.definition);
	try {
		return `${set} item ${exerciseItemSet(context.definition).itemKey(context.item.item)}`;
	} catch {
		return `${set} item ${JSON.stringify(context.item.item)}`;
	}
}

function readsSet(
	field: string,
	name: string,
	reads: readonly string[],
	what: string,
	set: string
) {
	if (!reads.includes(set))
		fail(field, `${what} "${name}" which reads ${reads.join(', ')}, not ${set}`);
}

/** What a filter value is when the item carries none: the filter is left out. */
const ABSENT: unique symbol = Symbol('absent');

/** A param read for the item, failing when it is absent. */
function param(context: Context, field: string, path: string): unknown {
	const found = paramValue(context.params, path);
	if (found === undefined) fail(field, `reads param "${path}", absent for ${itemOf(context)}`);
	return found;
}

/** A filter's value resolved as `kind`: written, the param's, or the item's (`ABSENT` when it carries none). */
function filterValue(
	context: Context,
	field: string,
	value: unknown,
	kind: FilterValueKind
): unknown {
	let found = value;
	if (isRef(value) && 'param' in value) found = param(context, field, value.param);
	else if (isRef(value) && 'item' in value) {
		const name = value.item;
		if (context.item === null)
			fail(field, `reads item value "${name}", which ${PASSAGE} does not have`);
		const reader = Object.hasOwn(ITEM_VALUES, name) ? ITEM_VALUES[name] : undefined;
		if (!reader) fail(field, `reads unknown item value "${name}"`);
		readsSet(field, name, reader.reads, 'reads', exerciseSetId(context.definition));
		found = reader.valueOf(context.item.item);
		if (found === undefined) return ABSENT;
	}
	// The ends of a pair may themselves be read.
	if (kind === 'pair' && Array.isArray(found)) {
		found = found.map((end, i) => filterValue(context, `${field}[${i}]`, end, 'number'));
		if ((found as unknown[]).includes(ABSENT)) return ABSENT;
	}
	if (!fitsFilterValue(found, kind)) {
		fail(field, `must be ${FILTER_VALUE_WORDS[kind]}, got ${JSON.stringify(found)}`);
	}
	return found;
}

/** A filter with its values resolved; null when a value the item does not carry leaves it out. */
function filterOf(context: Context, field: string, filter: FilterTemplate): Filter | null {
	if ('at' in filter) {
		const at = filterValue(context, `${field}.at`, filter.at, 'number');
		return at === ABSENT ? null : { at: at as number };
	}
	if ('position' in filter) {
		const { toward } = filter.position;
		if (typeof toward === 'string') return filter as Filter;
		const found = param(context, `${field}.position.toward`, toward.param);
		if (found !== 'up' && found !== 'down') {
			fail(`${field}.position.toward`, `must be up or down, got ${JSON.stringify(found)}`);
		}
		return { position: { ...filter.position, toward: found } };
	}
	if (!('in' in filter)) return filter;
	let strings: readonly number[] | undefined;
	let frets: readonly [number, number] | undefined;
	if (filter.in.strings !== undefined) {
		const found = filterValue(context, `${field}.in.strings`, filter.in.strings, 'numbers');
		if (found === ABSENT) return null;
		strings = typeof found === 'number' ? [found] : (found as number[]);
	}
	if (filter.in.frets !== undefined) {
		const found = filterValue(context, `${field}.in.frets`, filter.in.frets, 'pair');
		if (found === ABSENT) return null;
		const [from, to] = found as number[];
		frets = [from, to];
	}
	return { in: { ...(strings && { strings }), ...(frets && { frets }) } };
}

/** The take, a whole number above 0: written, a param, or measured on the item (`ITEM_NUMBERS`). */
function takeOf(context: Context, take: SelectionTemplate['take'] & {}): number {
	let found: unknown = take;
	if (isRef(take) && 'param' in take) found = param(context, 'take', take.param);
	else if (isRef(take)) {
		if (context.item === null)
			fail('take', `measures "${take.item}", which ${PASSAGE} does not have`);
		const measure = Object.hasOwn(ITEM_NUMBERS, take.item) ? ITEM_NUMBERS[take.item] : undefined;
		if (!measure) fail('take', `measures unknown item number "${take.item}"`);
		readsSet('take', take.item, measure.reads, 'measures', exerciseSetId(context.definition));
		found = measure.measure(context.item.item);
	}
	if (typeof found !== 'number' || !Number.isInteger(found) || found < 1) {
		fail('take', `must be a positive whole number, got ${JSON.stringify(found)}`);
	}
	return found;
}

/** The selection with its filters' values resolved (a filter the item leaves out dropped) and its take counted. */
function resolvedSelection(context: Context, template: SelectionTemplate): Selection {
	const where = template.where?.flatMap((filter, i) => {
		const resolved = filterOf(context, `where[${i}]`, filter);
		return resolved === null ? [] : [resolved];
	});
	const take = template.take === undefined ? undefined : takeOf(context, template.take);
	return {
		family: template.family,
		...(where && { where }),
		...(template.order && { order: [...template.order] }),
		...(take !== undefined && { take })
	};
}

/**
 * The selection of a passage's members, resolved in `params` (the exercise's and the passage's):
 * no item is there, so a value read on one fails. Throws a `SelectionCompileError` naming the
 * selection's own field.
 */
export function passageSelection(
	definition: ExerciseDefinition,
	template: SelectionTemplate,
	params: Readonly<Record<string, unknown>>
): Selection {
	return resolvedSelection({ definition, item: null, params }, template);
}

/**
 * A selection compiled for `item`: its index derived (reading the values of its passage's index,
 * when it is a passage's round), its filters' values resolved in `params` (the item's resolved
 * params) or on the item (a filter whose value the item does not carry left out), its take
 * counted; a passage's round keeps the identity of the member heard before it as its previous
 * member. No member is enumerated: the judge admits them. Throws a `SelectionCompileError`
 * naming the selection's own field.
 */
export function compileSelection(
	definition: ExerciseDefinition,
	item: Pick<PlannedItem, 'item' | 'passage'>,
	template: SelectionTemplate,
	params: Readonly<Record<string, unknown>>
): MemberContent {
	const context: Context = { definition, item, params };
	const family = familyNamed(template.family);
	if (!family) fail('', `names family "${template.family}", which is not registered`);
	const set = exerciseSetId(definition);
	const derivation = indexDerivation(template.family, set, template.of);
	if (!derivation) {
		return template.of === undefined
			? fail('', `set ${set} gives no index of ${template.family}`)
			: fail('of', `"${template.of}" gives no index of ${template.family} from ${set}`);
	}
	let index: unknown;
	try {
		index = derivation.index(item.item, { of: item.passage?.of ?? {}, params });
	} catch (error) {
		fail(
			'',
			`gives no index of ${template.family} for ${itemOf(context)}: ${(error as Error).message}`
		);
	}
	const selection = resolvedSelection(context, template);
	// What the family cannot run is refused at the load; a zone whose ends come out reversed
	// here is no error: it admits nothing.
	return {
		family: template.family,
		index,
		selection,
		...(item.passage && { previous: item.passage.previous })
	};
}
