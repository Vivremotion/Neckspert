import { ITEM_NUMBERS, ITEM_VALUES } from '../../derivations';
import { familyNamed, indexDerivation, selectionProblem, type Filter } from '../../families';
import { exerciseSetId } from '../../sets';
import { levelRange } from '../../time/levels';
import { ladderOf } from '../ladder';
import { exerciseLevelsOf, overrideParams, resolvedParamsOf, type LevelOverrides } from '../levels';
import type { ExerciseDefinition } from '../types';
import { FILTER_VALUE_WORDS, fitsFilterValue, itemValueFits, type FilterValueKind } from './types';

/** The most filters a selection may write: each costs a look at every level. */
export const MAX_SELECTION_FILTERS = 16;
/** The most attributes a selection's order may name. */
export const MAX_SELECTION_ORDER = 8;

/**
 * Why a selection cannot be compiled: `field` the selection's own field (`where[0].at`), empty
 * for the selection itself; `text` what is wrong. A caller joins them, a space between.
 */
export interface SelectionProblem {
	field: string;
	text: string;
}

type Record_ = Record<string, unknown>;

const SELECTION_KEYS = ['family', 'of', 'where', 'order', 'take'];
const FILTER_NAMES = ['in', 'at', 'position', 'other'];
const PLACE_KEYS = ['strings', 'frets'];
const POSITION_KEYS = ['beyond', 'toward', 'turns'];

const ITEM_VALUE_WORDS = { number: 'a number', numbers: 'a list of numbers' } as const;

function isRecord(value: unknown): value is Record_ {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRef(value: unknown): value is { param: unknown } | { item: unknown } {
	if (!isRecord(value)) return false;
	const keys = Object.keys(value);
	return keys.length === 1 && (keys[0] === 'param' || keys[0] === 'item');
}

const problemAt = (field: string, text: string): SelectionProblem => ({ field, text });

function unknownKey(value: Record_, allowed: readonly string[], field: string) {
	const key = Object.keys(value).find((k) => !allowed.includes(k));
	if (key === undefined) return null;
	return problemAt(
		field === '' ? key : `${field}.${key}`,
		`is not a key of its place (known: ${allowed.join(', ')})`
	);
}

/** A param the selection reads, checked at every level once the selection's shape is known. */
interface ParamRead {
	/** Where a param that is missing is told: the filter, or `take`. */
	field: string;
	path: string;
	/** Null when the value is fine at that level; else why not. */
	unfit(value: unknown): string | null;
	/** Set when every level gives a value but one that does not fit: told as is. */
	unfitText?: string;
}

/** What a selection check reads: the exercise, its set, and the params it reads. */
interface Check {
	definition: ExerciseDefinition;
	set: string;
	params: ParamRead[];
}

/** Why a filter's value cannot be resolved as `kind`, or null; a param is checked later, at every level. */
function valueProblem(
	check: Check,
	filterField: string,
	field: string,
	value: unknown,
	kind: FilterValueKind
): SelectionProblem | null {
	if (!isRef(value)) {
		return fitsFilterValue(value, kind)
			? null
			: problemAt(field, `must be ${FILTER_VALUE_WORDS[kind]}, got ${JSON.stringify(value)}`);
	}
	if ('param' in value) {
		if (typeof value.param !== 'string')
			return problemAt(`${field}.param`, 'reads a param named by text');
		check.params.push({
			field: filterField,
			path: value.param,
			unfit: (found) => {
				if (!fitsFilterValue(found, kind)) return `not ${FILTER_VALUE_WORDS[kind]}`;
				if (kind === 'pair' && (found as number[])[0] > (found as number[])[1]) {
					return 'whose first fret is above the second';
				}
				return null;
			}
		});
		return null;
	}
	const name = value.item;
	if (
		typeof name !== 'string' ||
		!Object.hasOwn(ITEM_VALUES, name) ||
		!ITEM_VALUES[name].reads.includes(check.set)
	) {
		return problemAt(
			filterField,
			`reads item value "${String(name)}", which ${check.set} does not have`
		);
	}
	const given = ITEM_VALUES[name].kind;
	return itemValueFits(given, kind)
		? null
		: problemAt(
				field,
				`reads item value "${name}", ${ITEM_VALUE_WORDS[given]}, where ${FILTER_VALUE_WORDS[kind]} is needed`
			);
}

/** A filter: its problem, or the filter as far as the exercise knows its values (what `selectionProblem` reads). */
function filterProblem(check: Check, field: string, filter: unknown): Filter | SelectionProblem {
	const keys = isRecord(filter) ? Object.keys(filter) : [];
	if (!isRecord(filter) || keys.length !== 1 || !FILTER_NAMES.includes(keys[0])) {
		return problemAt(field, `is no filter (${FILTER_NAMES.join(', ')})`);
	}
	if ('at' in filter) {
		return valueProblem(check, field, `${field}.at`, filter.at, 'number') ?? { at: 0 };
	}
	if ('in' in filter) {
		const place = filter.in;
		if (!isRecord(place)) return problemAt(`${field}.in`, 'must be { strings?, frets? }');
		const unknown = unknownKey(place, PLACE_KEYS, `${field}.in`);
		if (unknown !== null) return unknown;
		if (place.strings !== undefined) {
			const strings = valueProblem(check, field, `${field}.in.strings`, place.strings, 'numbers');
			if (strings !== null) return strings;
		}
		if (!Array.isArray(place.frets)) {
			if (place.frets === undefined) return { in: {} };
			return valueProblem(check, field, `${field}.in.frets`, place.frets, 'pair') ?? { in: {} };
		}
		if (place.frets.length !== 2) {
			return problemAt(`${field}.in.frets`, `must be ${FILTER_VALUE_WORDS.pair}`);
		}
		for (const [i, end] of place.frets.entries()) {
			const problem = valueProblem(check, field, `${field}.in.frets[${i}]`, end, 'number');
			if (problem !== null) return problem;
		}
		const [from, to] = place.frets;
		// The family checks the order of a zone written whole.
		return typeof from === 'number' && typeof to === 'number'
			? { in: { frets: [from, to] } }
			: { in: {} };
	}
	if ('position' in filter) {
		const position = filter.position;
		if (
			!isRecord(position) ||
			unknownKey(position, POSITION_KEYS, '') !== null ||
			position.beyond !== 'previous' ||
			(position.toward !== 'up' && position.toward !== 'down') ||
			(position.turns !== undefined && typeof position.turns !== 'boolean')
		) {
			return problemAt(
				`${field}.position`,
				'must be { beyond: "previous", toward: "up" or "down", turns?: true or false }'
			);
		}
		return filter as Filter;
	}
	return filter.other === 'previous'
		? (filter as Filter)
		: problemAt(`${field}.other`, `must be "previous", got ${JSON.stringify(filter.other)}`);
}

const TAKE_TEXT = 'must be a positive whole number';
const isCount = (value: unknown) =>
	typeof value === 'number' && Number.isInteger(value) && value >= 1;

function takeProblem(check: Check, take: unknown): SelectionProblem | null {
	if (typeof take === 'number') return isCount(take) ? null : problemAt('take', TAKE_TEXT);
	if (!isRef(take)) return problemAt('take', 'must be a number, { param: path } or { item: name }');
	if ('item' in take) {
		const name = take.item;
		if (typeof name !== 'string' || !Object.hasOwn(ITEM_NUMBERS, name)) {
			return problemAt('take', `measures unknown item number "${String(name)}"`);
		}
		const { reads } = ITEM_NUMBERS[name];
		return reads.includes(check.set)
			? null
			: problemAt('take', `measures "${name}" which reads ${reads.join(', ')}, not ${check.set}`);
	}
	if (typeof take.param !== 'string') return problemAt('take.param', 'reads a param named by text');
	check.params.push({
		field: 'take',
		path: take.param,
		unfit: (found) => (isCount(found) ? null : TAKE_TEXT),
		unfitText: TAKE_TEXT
	});
	return null;
}

/** Whether overriding `key` may change the value at `path`: the same path, one above or one below it. */
const touches = (key: string, path: string) =>
	key === path || key.startsWith(`${path}.`) || path.startsWith(`${key}.`);

/**
 * The params of every level an item may be compiled at, as far as `paths` read them: each
 * exercise level with each ladder level (none without a ladder). A ladder level applies only its
 * overrides that touch a path read, the others leaving those values as they are, so a level that
 * writes many params costs only what it writes there.
 */
function* levelsOf(
	definition: ExerciseDefinition,
	paths: readonly string[]
): Generator<{ where: string; params: Readonly<Record_> }> {
	const { lowest, highest } = levelRange(exerciseLevelsOf(definition));
	let steps: LevelOverrides[] | null = null;
	let first = 0;
	if (definition.params.ladder !== undefined) {
		try {
			const ladder = ladderOf(definition);
			first = levelRange(ladder).lowest;
			steps = ladder.map((step) =>
				Object.fromEntries(
					Object.entries(step.params as LevelOverrides).filter(([key]) =>
						paths.some((path) => touches(key, path))
					)
				)
			);
		} catch {
			// A ladder that cannot be read is refused by its own check.
		}
	}
	for (let level = lowest; level <= highest; level++) {
		const base = resolvedParamsOf(definition, { exerciseLevel: level, itemLevel: null });
		if (steps === null) {
			yield { where: `exercise level ${level}`, params: base };
			continue;
		}
		for (const [i, step] of steps.entries()) {
			yield {
				where: `exercise level ${level}, item level ${first + i}`,
				params: Object.keys(step).length === 0 ? base : overrideParams(base, step)
			};
		}
	}
}

function paramValue(params: Readonly<Record_>, path: string): unknown {
	let found: unknown = params;
	for (const key of path.split('.')) found = isRecord(found) ? found[key] : undefined;
	return found;
}

/**
 * Why a param the selection reads is not written as it must be at every level: the params of
 * each level are resolved once, whatever the number of params read.
 */
function paramsProblem(check: Check): SelectionProblem | null {
	if (check.params.length === 0) return null;
	const seen = check.params.map(() => ({
		written: false,
		missing: null as string | null,
		unfit: null as { where: string; value: unknown; text: string } | null
	}));
	for (const { where, params } of levelsOf(
		check.definition,
		check.params.map((read) => read.path)
	)) {
		for (const [k, read] of check.params.entries()) {
			const value = paramValue(params, read.path);
			const state = seen[k];
			if (value === undefined) {
				state.missing ??= where;
				continue;
			}
			state.written = true;
			if (state.unfit === null) {
				const text = read.unfit(value);
				if (text !== null) state.unfit = { where, value, text };
			}
		}
	}
	for (const [k, read] of check.params.entries()) {
		const { written, missing, unfit } = seen[k];
		const reads = `reads param "${read.path}", which`;
		if (!written) return problemAt(read.field, `${reads} no level of the exercise writes`);
		if (missing !== null) return problemAt(read.field, `${reads} ${missing} does not write`);
		if (unfit !== null) {
			return problemAt(
				read.field,
				read.unfitText ??
					`${reads} ${unfit.where} gives as ${JSON.stringify(unfit.value)}, ${unfit.text}`
			);
		}
	}
	return null;
}

/**
 * Why a selection cannot be compiled for the exercise's items, naming its own field: a key it
 * does not know, a family not registered, no index of it from the exercise's set, more filters or
 * order than the limits, a filter it does not know, an item value the set does not have or of
 * another shape, a param a level does not write as it must, a take that is no positive whole
 * number, what the family cannot run. Null when it can be.
 */
export function selectionFieldProblem(
	definition: ExerciseDefinition,
	selection: unknown
): SelectionProblem | null {
	if (!isRecord(selection))
		return problemAt('', 'must be a selection { family, of?, where?, order?, take? }');
	const unknown = unknownKey(selection, SELECTION_KEYS, '');
	if (unknown !== null) return unknown;
	if (typeof selection.family !== 'string') return problemAt('family', 'must name a family');
	const family = familyNamed(selection.family);
	if (!family) return problemAt('', `names family "${selection.family}", which is not registered`);
	if (selection.of !== undefined && typeof selection.of !== 'string') {
		return problemAt('of', 'must name an index derivation');
	}
	const set = exerciseSetId(definition);
	if (!indexDerivation(selection.family, set, selection.of)) {
		return selection.of === undefined
			? problemAt('', `set ${set} gives no index of ${selection.family}`)
			: problemAt('of', `"${selection.of}" gives no index of ${selection.family} from ${set}`);
	}
	const { where, order } = selection;
	if (where !== undefined && !Array.isArray(where))
		return problemAt('where', 'must be a list of filters');
	if (where !== undefined && where.length > MAX_SELECTION_FILTERS) {
		return problemAt('where', `has ${where.length} filters, more than ${MAX_SELECTION_FILTERS}`);
	}
	if (order !== undefined && !Array.isArray(order)) {
		return problemAt('order', 'must be a list of attribute names');
	}
	if (order !== undefined && order.length > MAX_SELECTION_ORDER) {
		return problemAt('order', `names ${order.length} attributes, more than ${MAX_SELECTION_ORDER}`);
	}
	if (order !== undefined && !order.every((name) => typeof name === 'string')) {
		return problemAt('order', 'must be a list of attribute names');
	}
	const check: Check = { definition, set, params: [] };
	const known: Filter[] = [];
	for (const [i, filter] of (where ?? []).entries()) {
		const checked = filterProblem(check, `where[${i}]`, filter);
		if ('text' in checked && 'field' in checked) return checked as SelectionProblem;
		known.push(checked as Filter);
	}
	if (selection.take !== undefined) {
		const take = takeProblem(check, selection.take);
		if (take !== null) return take;
	}
	const reason = selectionProblem(family, {
		family: selection.family,
		where: known,
		...(order !== undefined && { order: order as string[] })
	});
	if (reason !== null) return problemAt('', reason);
	return paramsProblem(check);
}

/** `selectionFieldProblem` told as one line: the field, a space, what is wrong. */
export function selectionProblemOf(
	definition: ExerciseDefinition,
	selection: unknown
): string | null {
	const problem = selectionFieldProblem(definition, selection);
	if (problem === null) return null;
	return problem.field === '' ? problem.text : `${problem.field} ${problem.text}`;
}
