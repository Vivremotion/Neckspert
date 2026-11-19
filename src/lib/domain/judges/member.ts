import { admitted, familyNamed, type Family, type Member, type Selection } from '../families';
import type { ContentJudge } from '../time';

/** A member of a family, admitted by a selection. Value: `MemberContent`; payload: the sensor's. */
export const MEMBER_CONTENT = 'member';

/** The value of a member content: what the judge needs, resolved at compile time. */
export interface MemberContent {
	family: string;
	index: unknown;
	/** Every value resolved. */
	selection: Selection;
	/** The member before, when the selection reads one. */
	previous?: Member | null;
}

/** The family a member content names and the members it admits. Throws on an unknown family. */
function familyAndMembers(content: MemberContent): { family: Family; members: Member[] } {
	const { family: id, index, selection, previous } = content;
	const family = familyNamed(id);
	if (!family) throw new Error(`member content names family "${id}", which is not registered`);
	return { family, members: admitted(family, index, selection, { previous: previous ?? null }) };
}

/** The members a member content admits, in its selection's order. Throws on an unknown family. */
export function admittedMembers(content: MemberContent): Member[] {
	return familyAndMembers(content).members;
}

/**
 * Right when the payload is a member the selection admits. The answer is what the family keeps
 * of the payload; the confusion, on a miss, the family's.
 */
export const memberJudge: ContentJudge = {
	judge(value, payload) {
		const content = value as MemberContent;
		const { family, members } = familyAndMembers(content);
		const heard = family.recognise(members, payload);
		return {
			correct: heard !== null,
			answer: family.answer(payload),
			confusion: heard === null ? family.confusion(content.index, members, payload) : null
		};
	}
};
