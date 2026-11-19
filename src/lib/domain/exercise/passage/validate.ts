import { passageDerivation } from '../../families';
import { hasCards, hasSkill, skillById } from '../../skill/registry';
import { exerciseParamsOf } from '../levels';
import { ROUND_GIVEN_PARAMS } from '../round/compile';
import { selectionFieldProblem, type LevelSweep } from '../selection/validate';
import type { ExerciseDefinition } from '../types';
import { passageFamilyIndex, passageIndices, passageMembersAt, passageParams } from './indices';
import { OPENING_NEEDS, type PassagesTemplate } from './types';

/**
 * What checking an exercise's passages may cost, each checked before the work it bounds: its
 * indices (the product of the lists of `of`), the values of one passage param, the members of
 * one passage.
 */
export const MAX_PASSAGE_INDICES = 500;
export const MAX_PASSAGE_EACH = 64;
export const MAX_PASSAGE_MEMBERS = 256;
/** The most bars of silence before a new index's counted bar. */
export const MAX_REST_BARS = 16;

const PASSAGES_KEYS = ['of', 'members', 'each', 'opens', 'again', 'restBars', 'passes', 'scope'];
/** What a key's value may not hold: they join its parts (`passageIndexKey`). */
const KEY_SEPARATORS = /[;=]/;

type Record_ = Record<string, unknown>;

const isRecord = (value: unknown): value is Record_ =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const scalar = (value: unknown): value is string | number =>
	typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));

/** Why a value of `of` cannot key an index: no text, number or flat list of them, or a separator. */
function ofValueProblem(field: string, value: unknown): string | null {
	const parts = Array.isArray(value) ? value : [value];
	if (!parts.every(scalar)) return `${field} must be a text, a number or a list of them`;
	if (parts.some((part) => typeof part === 'string' && KEY_SEPARATORS.test(part))) {
		return `${field} may not hold ";" or "="`;
	}
	return null;
}

/** Why `of` gives no indices that can be keyed, within the limit; checked before any value is read. */
function ofProblem(of: unknown): string | null {
	if (!isRecord(of)) return 'passages.of must map names to lists of values';
	const entries = Object.entries(of);
	if (entries.length === 0) return 'passages.of names no list of values';
	for (const [name, values] of entries) {
		if (KEY_SEPARATORS.test(name)) return `passages.of name "${name}" may not hold ";" or "="`;
		if (!Array.isArray(values) || values.length === 0) {
			return `passages.of.${name} must be a list, not empty`;
		}
	}
	// Multiplied only while under the limit: past it, the product is not worth computing.
	let count = 1;
	for (const [k, [, values]] of entries.entries()) {
		count *= (values as unknown[]).length;
		if (count <= MAX_PASSAGE_INDICES) continue;
		return k === entries.length - 1
			? `passages.of gives ${count} indices, more than ${MAX_PASSAGE_INDICES}`
			: `passages.of gives more than ${MAX_PASSAGE_INDICES} indices`;
	}
	for (const [name, values] of entries as [string, unknown[]][]) {
		const keys = new Map<string, number>();
		for (const [i, value] of values.entries()) {
			const field = `passages.of.${name}[${i}]`;
			const problem = ofValueProblem(field, value);
			if (problem !== null) return problem;
			// Two values keyed alike would make two indices one.
			const key = Array.isArray(value) ? value.join(',') : String(value);
			const seen = keys.get(key);
			if (seen !== undefined) return `${field} has the key of passages.of.${name}[${seen}]`;
			keys.set(key, i);
		}
	}
	return null;
}

/** The first part of each path the exercise's levels and ladder levels write. */
function levelRoots(definition: ExerciseDefinition): Set<string> {
	const levels: unknown[] = [
		...(Array.isArray(definition.levels) ? definition.levels : []),
		...(Array.isArray(definition.params.ladder) ? definition.params.ladder : [])
	];
	const roots = new Set<string>();
	for (const level of levels) {
		const params = isRecord(level) ? level.params : undefined;
		if (!isRecord(params)) continue;
		for (const path of Object.keys(params)) roots.add(path.split('.')[0]);
	}
	return roots;
}

/**
 * Why the passage params cannot be read: no list, too long, or a name something else gives a
 * `{ param }` (the round, the params, an exercise or ladder level) or that keys an index, so that
 * a passage param has one source.
 */
function eachProblem(definition: ExerciseDefinition, each: unknown, of: Record_): string | null {
	if (each === undefined) return null;
	if (!isRecord(each)) return 'passages.each must map names to lists of values';
	const params = exerciseParamsOf(definition);
	const atLevels = levelRoots(definition);
	for (const [name, values] of Object.entries(each)) {
		if (!Array.isArray(values) || values.length === 0) {
			return `passages.each.${name} must be a list, not empty`;
		}
		if (values.length > MAX_PASSAGE_EACH) {
			return `passages.each.${name} has ${values.length} values, more than ${MAX_PASSAGE_EACH}`;
		}
		if (ROUND_GIVEN_PARAMS.includes(name)) return `passages.each.${name} is a name the round gives`;
		if (Object.hasOwn(params, name)) return `passages.each.${name} is also written in params`;
		if (Object.hasOwn(of, name)) return `passages.each.${name} is also a key of passages.of`;
		if (atLevels.has(name)) return `passages.each.${name} is also written at a level`;
	}
	return null;
}

const OPENS_SHAPE = 'passages.opens must be { acquired: { skill, item, need? } }';

/** Why an opening is not written as one; the skill and the correspondence are the application's to check. */
function opensProblem(opens: unknown): string | null {
	if (opens === undefined) return null;
	const acquired = isRecord(opens) ? opens.acquired : undefined;
	if (
		!isRecord(opens) ||
		Object.keys(opens).length !== 1 ||
		!isRecord(acquired) ||
		typeof acquired.skill !== 'string' ||
		typeof acquired.item !== 'string' ||
		Object.keys(acquired).some((key) => !['skill', 'item', 'need'].includes(key))
	) {
		return OPENS_SHAPE;
	}
	if (
		acquired.need !== undefined &&
		!(OPENING_NEEDS as readonly unknown[]).includes(acquired.need)
	) {
		return `passages.opens.acquired.need must be ${OPENING_NEEDS.map((n) => `"${n}"`).join(' or ')}`;
	}
	return null;
}

/** Why `again`, `restBars`, `passes` or `scope` cannot be run. */
function settingsProblem(passages: Record_): string | null {
	const { again, restBars, passes, scope, of } = passages;
	if (again !== undefined && again !== 'until-passed') {
		return 'passages.again must be "until-passed"';
	}
	if (
		restBars !== undefined &&
		!(
			typeof restBars === 'number' &&
			Number.isInteger(restBars) &&
			restBars >= 0 &&
			restBars <= MAX_REST_BARS
		)
	) {
		return `passages.restBars must be a whole number from 0 to ${MAX_REST_BARS}`;
	}
	if (passes !== undefined && !(typeof passes === 'number' && passes > 0 && passes <= 1)) {
		return 'passages.passes must be a number above 0 and at most 1';
	}
	if (scope !== undefined) {
		if (typeof scope !== 'string') return 'passages.scope must name a key of passages.of';
		if (!Object.hasOwn(of as Record_, scope)) {
			return `passages.scope names "${scope}", which passages.of does not write`;
		}
	}
	return null;
}

/**
 * Why the members cannot be selected: what the selection module refuses (its field under
 * `passages.members`), an `andBack` that is no boolean, a family that gives no members from a
 * passage's index, or whose members are no items of the skill's set.
 */
function membersProblem(
	definition: ExerciseDefinition,
	members: unknown,
	sweep: LevelSweep
): string | null {
	if (!isRecord(members)) {
		return 'passages.members must be a selection { family, where?, order?, take?, andBack? }';
	}
	let selection: Record_ = members;
	if (Object.hasOwn(members, 'andBack')) {
		const { andBack, ...rest } = members;
		if (typeof andBack !== 'boolean') return 'passages.members.andBack must be true or false';
		selection = rest;
	}
	const problem = selectionFieldProblem(definition, selection, sweep, { members: true });
	if (problem !== null) {
		return problem.field === ''
			? `passages.members ${problem.text}`
			: `passages.members.${problem.field} ${problem.text}`;
	}
	const family = (selection as { family: string }).family;
	const derivation = passageDerivation(family);
	if (!derivation) {
		return `passages.members names family "${family}", which gives no members from a passage’s index`;
	}
	const set = hasSkill(definition.practices) ? skillById(definition.practices).items : null;
	if (set !== null && derivation.set !== set) {
		return `passages.members names family "${family}", whose members are no items of ${set}`;
	}
	return null;
}

/** Whether a piece of a selection reads a `{ param }` whose first part is one of `names`. */
function readsParamOf(value: unknown, names: ReadonlySet<string>): boolean {
	if (Array.isArray(value)) return value.some((part) => readsParamOf(part, names));
	if (!isRecord(value)) return false;
	if (typeof value.param === 'string' && names.has(value.param.split('.')[0])) return true;
	return Object.values(value).some((part) => readsParamOf(part, names));
}

/**
 * The members' selection with every filter and the take that read a passage param left out:
 * filters and take only remove members, so what it admits bounds every passage of an index.
 */
function boundingMembers(passages: PassagesTemplate): PassagesTemplate['members'] {
	const names = new Set(Object.keys(passages.each ?? {}));
	const { where, take, ...rest } = passages.members;
	const kept = where?.filter((filter) => !readsParamOf(filter, names));
	return {
		...rest,
		...(kept && { where: kept }),
		...(take !== undefined && !readsParamOf(take, names) && { take })
	};
}

/** A family's reason, the family named once: `grid-changes: unknown grid "x"` → `unknown grid "x"`. */
function withoutFamily(reason: string, family: string): string {
	return reason.startsWith(`${family}: `)
		? reason.slice(family.length + 2)
		: reason.startsWith(`${family} `)
			? reason.slice(family.length + 1)
			: reason;
}

/**
 * Why a passage of each index cannot be played: an index the family cannot read, or one whose
 * passages may give more members than the limit. The family's index is derived once per index;
 * its members are counted with the filters and the take that read a passage param left out
 * (`boundingMembers`), so that the count bounds every passage of the index, whatever its params.
 */
function indicesProblem(definition: ExerciseDefinition): string | null {
	const passages = definition.passages!;
	const params = passageParams(definition, {});
	const bounding = boundingMembers(passages);
	const { family } = passages.members;
	for (const index of passageIndices(definition)) {
		let familyIndex: unknown;
		try {
			familyIndex = passageFamilyIndex(definition, index);
		} catch (error) {
			return `passages.of gives no index of ${family}: ${withoutFamily((error as Error).message, family)}`;
		}
		let count: number;
		try {
			count = passageMembersAt(definition, familyIndex, bounding, params).length;
		} catch (error) {
			return `passages.members ${(error as Error).message}`;
		}
		if (count > MAX_PASSAGE_MEMBERS) {
			return `passages.members gives ${count} members for index ${index.key}, more than ${MAX_PASSAGE_MEMBERS}`;
		}
	}
	return null;
}

/**
 * Why the passages an exercise writes cannot be read, naming the field; null when they can, or
 * when it writes none. Passages and items are not written together; a skill with cards is learned
 * from its items, not played in passages. Each limit is checked before the work it bounds. The
 * opening's skill and correspondence are checked with the application's (`definitionChecks`).
 * `sweep`: the levels swept for the round's selections, shared with the members'.
 */
export function passagesProblem(
	definition: ExerciseDefinition,
	sweep: LevelSweep = new Map()
): string | null {
	const passages: unknown = definition.passages;
	if (passages === undefined) return null;
	if (!isRecord(passages)) return 'passages must be an object';
	if (definition.items !== undefined) return 'an exercise writes passages or items, not both';
	if (hasCards(definition.practices)) return 'passages needs a skill without cards';
	const unknown = Object.keys(passages).find((key) => !PASSAGES_KEYS.includes(key));
	if (unknown !== undefined) return `passages has an unknown key "${unknown}"`;
	return (
		ofProblem(passages.of) ??
		eachProblem(definition, passages.each, passages.of as Record_) ??
		opensProblem(passages.opens) ??
		settingsProblem(passages) ??
		membersProblem(definition, passages.members, sweep) ??
		indicesProblem(definition)
	);
}
