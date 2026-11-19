import { admitted, familyNamed, passageDerivation, type Member } from '../../families';
import { correspondingCard } from '../../sets/correspondences';
import type { CardKey, PlannedItem } from '../../types';
import type { ExerciseDefinition } from '../types';
import { roundMemberContents, type RoundMemberContent } from './contents';
import { passageMembers } from './indices';
import type { PassageIndex } from './types';

/** Every passage param at its first value: the passage the opening reads. */
export function firstEach(definition: ExerciseDefinition): Record<string, unknown> {
	return Object.fromEntries(
		Object.entries(definition.passages?.each ?? {}).map(([name, values]) => [name, values[0]])
	);
}

/** The round of a passage's member, as a source would serve it, with no member heard before. */
export function passageRound(
	definition: ExerciseDefinition,
	index: PassageIndex,
	each: Readonly<Record<string, unknown>>,
	item: unknown,
	rank: number,
	length: number
): PlannedItem {
	return {
		exerciseId: definition.id,
		skill: definition.practices,
		exerciseLevel: 0,
		item,
		phase: 'free',
		temperature: 'hot',
		aid: 'none',
		leadBeats: null,
		passage: { id: '', index: index.key, of: index.of, rank, length, each, previous: null }
	};
}

/**
 * Whether the members a content admits are acquired: each named, through the correspondence,
 * as a card of the opening's skill; grouped by their strings, every group acquired, or one.
 */
function contentOpen(
	{ content }: RoundMemberContent,
	opening: NonNullable<ExerciseDefinition['passages']>['opens'] & {},
	acquired: ReadonlySet<CardKey>
): boolean {
	const family = familyNamed(content.family);
	const derivation = passageDerivation(content.family);
	if (!family || !derivation) return false;
	const members = admitted(family, content.index, content.selection);
	if (members.length === 0) return false;
	const { skill, item: name, need = 'every-group' } = opening.acquired;
	const strings = family.attributes.strings;
	const groups = new Map<string, Member[]>();
	for (const member of members) {
		const group = strings ? [strings(member)].flat().join() : '';
		groups.set(group, [...(groups.get(group) ?? []), member]);
	}
	const has = (member: Member) => {
		const key = correspondingCard(name, derivation.set, skill, derivation.itemOf(member));
		return key !== null && acquired.has(key);
	};
	const complete = [...groups.values()].map((group) => group.every(has));
	return need === 'every-group' ? complete.every(Boolean) : complete.some(Boolean);
}

/**
 * Whether an index of an exercise is open: always without `passages.opens`; else when, for every
 * member of its passage, each member the round's contents admit with no filter is acquired as
 * the card the correspondence `opens.acquired.item` names in the skill `opens.acquired.skill`,
 * grouped by their strings: in every group (`every-group`, the default) or in one at least
 * (`one-group`). The passage is read with each passage param at its first value: the filters
 * that read them are left out, so their values change no content's members. An index whose
 * passage cannot be read is closed.
 */
export function indexOpen(
	definition: ExerciseDefinition,
	index: PassageIndex,
	acquired: ReadonlySet<CardKey>
): boolean {
	const opening = definition.passages?.opens;
	if (opening === undefined) return true;
	try {
		const each = firstEach(definition);
		const members = passageMembers(definition, index, each);
		const derivation = passageDerivation(definition.passages!.members.family)!;
		return members.every((member, rank) => {
			const round = passageRound(
				definition,
				index,
				each,
				derivation.itemOf(member),
				rank,
				members.length
			);
			return roundMemberContents(definition, round, { filters: false }).every((content) =>
				contentOpen(content, opening, acquired)
			);
		});
	} catch {
		return false;
	}
}
