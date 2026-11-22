/**
 * The passages an exercise writes, as data: a passage is the sequence of the members of a family
 * for one index the exercise lists, each member the item of one round. `passagesProblem` says
 * whether they can be read, `passageIndices` and `passageMembers` read them.
 */
import type { SkillId } from '../../skill/types';
import type { SelectionTemplate } from '../selection/types';

/** How many groups of a change's shapes must be acquired for its index to open. */
export const OPENING_NEEDS = ['every-group', 'one-group'] as const;
export type OpeningNeed = (typeof OPENING_NEEDS)[number];

export interface PassagesTemplate {
	/** By name, the values an index takes: the indices are their product. */
	of: Readonly<Record<string, readonly unknown[]>>;
	/** The members of a passage, in order: each is the item of a round. */
	members: SelectionTemplate & { andBack?: boolean };
	/** Passage params: each takes the next value of its list at every passage of one index. */
	each?: Readonly<Record<string, readonly unknown[]>>;
	opens?: { acquired: { skill: SkillId; item: string; need?: OpeningNeed } };
	again?: 'until-passed';
	restBars?: number;
	/** Share of right changes that makes a passage pass; 1 by default. */
	passes?: number;
	/** The key of `of` whose value scopes the exercise's level (its tempo); absent: no scope. */
	scope?: string;
}

/** One index of an exercise: its values, and a stable key (`grid=iohefy-a;strings=3,2,1`). */
export interface PassageIndex {
	key: string;
	of: Readonly<Record<string, unknown>>;
}
