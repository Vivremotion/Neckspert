import {
	admitted,
	familyNamed,
	refusedBy,
	type Family,
	type Member,
	type Selection
} from '../families';
import type { ContentJudge } from '../time';

/** A member of a family, admitted by a selection. Value: `MemberContent`; payload: the sensor's. */
export const MEMBER_CONTENT = 'member';

/** The value of a member content: what the judge needs, resolved at compile time. */
export interface MemberContent {
	family: string;
	index: unknown;
	/** Every value resolved. */
	selection: Selection;
	/**
	 * The identity of the member before (the last heard in a passage), resolved by the family
	 * (`Family.member`); absent, null or naming none: no member before.
	 */
	previous?: string | null;
}

/** The family a member content names; throws on an unknown family. */
function familyOf(content: MemberContent): Family {
	const family = familyNamed(content.family);
	if (!family) {
		throw new Error(`member content names family "${content.family}", which is not registered`);
	}
	return family;
}

/** The member before a content's round, resolved by its family; null when there is none. */
function previousMember(content: MemberContent, family: Family = familyOf(content)) {
	return content.previous ? family.member(content.previous) : null;
}

/** The family a member content names and the members it admits. Throws on an unknown family. */
function familyAndMembers(content: MemberContent): { family: Family; members: Member[] } {
	const family = familyOf(content);
	const { index, selection } = content;
	const previous = previousMember(content, family);
	return { family, members: admitted(family, index, selection, { previous }) };
}

/** The members a member content admits, in its selection's order. Throws on an unknown family. */
export function admittedMembers(content: MemberContent): Member[] {
	return familyAndMembers(content).members;
}

/**
 * Right when the payload is a member the selection admits. The answer is what the family keeps
 * of the payload; the confusion, on a miss, the family's, told which filter refused the member
 * heard when it is one of the index's.
 */
export const memberJudge: ContentJudge = {
	judge(value, payload) {
		const content = value as MemberContent;
		const { family, members } = familyAndMembers(content);
		if (family.recognise(members, payload) !== null) {
			return { correct: true, answer: family.answer(payload), confusion: null };
		}
		const heard = family.heard(content.index, payload);
		const refused =
			heard === null
				? null
				: refusedBy(family, content.index, content.selection, heard, {
						previous: previousMember(content, family)
					});
		return {
			correct: false,
			answer: family.answer(payload),
			confusion: family.confusion(content.index, members, payload, refused)
		};
	}
};
