import { admitted, familyNamed, passageDerivation, type Member } from '../../families';
import { resolvedParamsOf } from '../levels';
import { passageSelection } from '../selection/compile';
import type { ExerciseDefinition } from '../types';
import type { PassageIndex, PassagesTemplate } from './types';

/** Level 1 of an exercise, whose params a passage's members are read with. */
const FIRST_LEVEL = 0;

/**
 * The key of an index: its values in the order written, `name=value` joined by `;`, a list joined
 * by `,` (`grid=iohefy-a;strings=3,2,1`). Distinct for the values `passagesProblem` lets through.
 */
export function passageIndexKey(of: Readonly<Record<string, unknown>>): string {
	return Object.entries(of)
		.map(([name, value]) => `${name}=${Array.isArray(value) ? value.join(',') : String(value)}`)
		.join(';');
}

/**
 * Every index of an exercise: the product of the lists of `passages.of`, the first name
 * outermost (its values side by side). None when it writes no passages.
 */
export function passageIndices(definition: ExerciseDefinition): PassageIndex[] {
	const of = definition.passages?.of;
	if (of === undefined) return [];
	let indices: Record<string, unknown>[] = [{}];
	for (const [name, values] of Object.entries(of)) {
		indices = indices.flatMap((index) => values.map((value) => ({ ...index, [name]: value })));
	}
	return indices.map((values) => ({ key: passageIndexKey(values), of: values }));
}

/** The params a passage's members are read with: the exercise's at its level 1, and the passage params. */
export function passageParams(
	definition: ExerciseDefinition,
	each: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
	return {
		...resolvedParamsOf(definition, { exerciseLevel: FIRST_LEVEL, itemLevel: null }),
		...each
	};
}

/** The family of the members, and what gives them to a passage; throws when there is none. */
function membersFamily(definition: ExerciseDefinition) {
	const passages = definition.passages;
	if (!passages) throw new Error(`${definition.id} writes no passages`);
	const { family: id } = passages.members;
	const family = familyNamed(id);
	const derivation = passageDerivation(id);
	if (!family || !derivation) {
		throw new Error(`family "${id}" gives no members from a passage’s index`);
	}
	return { family, derivation };
}

/**
 * The index of the members' family that a passage's index gives, read with the exercise's params
 * at its level 1: the passage params feed the members' selection, never the index, so every
 * passage of an index lists the members of one family index. Throws an Error saying why when it
 * gives none the family can read.
 */
export function passageFamilyIndex(definition: ExerciseDefinition, index: PassageIndex): unknown {
	const { family, derivation } = membersFamily(definition);
	const familyIndex = derivation.passageIndex(index.of, passageParams(definition, {}));
	const problem = family.indexProblem(familyIndex);
	if (problem !== null) throw new Error(problem);
	return familyIndex;
}

/**
 * The members `template` admits for the family's index `familyIndex`, its values read in
 * `params` (`passageParams`); with `andBack`, then back down without the last twice.
 */
export function passageMembersAt(
	definition: ExerciseDefinition,
	familyIndex: unknown,
	template: PassagesTemplate['members'],
	params: Readonly<Record<string, unknown>>
): Member[] {
	const { family } = membersFamily(definition);
	const { andBack, ...selection } = template;
	const members = admitted(family, familyIndex, passageSelection(definition, selection, params));
	return andBack ? [...members, ...members.slice(0, -1).reverse()] : members;
}

/**
 * The members of a passage of this index, in order, each the item of a round: the family's
 * members for the index it gives (`passageFamilyIndex`), through the selection `passages.members`
 * resolved in the exercise's params at its level 1 and the passage params `each` (no item, no
 * previous member); with `andBack`, then back down without the last twice (`a b c d` →
 * `a b c d c b a`). Throws when the index gives none.
 */
export function passageMembers(
	definition: ExerciseDefinition,
	index: PassageIndex,
	each: Readonly<Record<string, unknown>>
): Member[] {
	return passageMembersAt(
		definition,
		passageFamilyIndex(definition, index),
		definition.passages!.members,
		passageParams(definition, each)
	);
}
