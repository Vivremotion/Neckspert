import { admitted, familyNamed, passageDerivation, type Member } from '../../families';
import { correspondingCard } from '../../sets/correspondences';
import type { CardKey } from '../../types';
import type { ExerciseDefinition } from '../types';
import { roundMemberContents, type RoundMemberContent } from './contents';
import { passageMembers } from './indices';
import { firstEach, isUnplayable, passageRound } from './round';
import type { PassageIndex } from './types';

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
 * (`one-group`). The passage is read with each passage param at its first value, and the
 * contents with none of their filters, so the values of the passage params change no content's
 * members. An index whose passage cannot be read from its data (`isUnplayable`) is closed; any
 * other error goes through.
 */
export function indexOpen(
	definition: ExerciseDefinition,
	index: PassageIndex,
	acquired: ReadonlySet<CardKey>
): boolean {
	const { passages } = definition;
	const opening = passages?.opens;
	if (passages === undefined || opening === undefined) return true;
	const derivation = passageDerivation(passages.members.family);
	if (!derivation) return false;
	try {
		const each = firstEach(definition);
		const members = passageMembers(definition, index, each);
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
	} catch (error) {
		if (isUnplayable(error)) return false;
		throw error;
	}
}
