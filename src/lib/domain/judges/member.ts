import { admitted, familyNamed, type Member, type Selection } from '../families';
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

/**
 * Right when the payload is a member the selection admits. The answer is what the family keeps
 * of the payload; the confusion, on a miss, the family's.
 */
export const memberJudge: ContentJudge = {
	judge(value, payload) {
		const { family: id, index, selection, previous } = value as MemberContent;
		const family = familyNamed(id);
		if (!family) throw new Error(`member content names family "${id}", which is not registered`);
		const members = admitted(family, index, selection, { previous: previous ?? null });
		const heard = family.recognise(members, payload);
		return {
			correct: heard !== null,
			answer: family.answer(payload),
			confusion: heard === null ? family.confusion(index, members, payload) : null
		};
	}
};
