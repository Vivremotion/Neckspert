import { CHANGE_SKILL_IDS, CHORD_ANCHOR_SKILL_ID } from '$lib/testing/catalogIds';
import { hasSkill, skillById } from '$lib/domain/skill/registry';
import { type Attempt, type ResponseVerdict, type VerdictEnvelope } from '$lib/domain/types';

/**
 * An attempt written as a one-answer round reads: `verdict` a `ResponseVerdict`, `correct` a
 * boolean. The target fields left out are derived by `responseAttempt`.
 */
export type ResponseAttemptFields<D = unknown> = Omit<
	Attempt<D>,
	'verdict' | 'success' | 'aids' | 'measures' | 'plan'
> & {
	verdict: ResponseVerdict | VerdictEnvelope;
	success?: boolean;
	aids?: Attempt['aids'];
	measures?: Attempt['measures'];
	plan?: unknown | null;
};

/** Overrides of a spec's attempt builder, in either shape. */
export type AttemptOverrides<D = unknown> = Partial<ResponseAttemptFields<D>>;

/** The one-answer relation a set's attempts were judged by before the target model. */
const RELATION_OF_SET: Readonly<Record<string, string>> = {
	'placed-note': 'free',
	change: 'grid-change'
};

/**
 * The relation the attempts of a skill were judged by before the target model: the anchor's (a
 * skill drawn from it included), the changes', else its set's; `beat` otherwise, a skill no
 * definition holds included.
 */
function relationOf(skill: string): string {
	if (skill.startsWith(CHORD_ANCHOR_SKILL_ID)) return 'anchor';
	if ((CHANGE_SKILL_IDS as readonly string[]).includes(skill)) return 'grid-change';
	if (!hasSkill(skill)) return 'beat';
	return RELATION_OF_SET[skillById(skill).items] ?? 'beat';
}

/**
 * A stored attempt in the target shape, as the recorder writes one for a one-answer round. A
 * `ResponseVerdict` is wrapped in its relation's envelope and decides `success` (with `correct`).
 * An envelope is kept as given, with the `success` given.
 */
export function responseAttempt<D>(fields: ResponseAttemptFields<D>): Attempt<D> {
	const { verdict, success, aids, measures, plan, ...rest } = fields;
	const envelope =
		typeof verdict === 'string'
			? { relation: relationOf(fields.skill), version: 1, value: verdict }
			: verdict;
	const decided =
		typeof verdict === 'string'
			? fields.correct === true && verdict !== 'offbeat'
			: (success ?? false);
	return {
		...rest,
		verdict: envelope,
		success: decided,
		...(aids && { aids }),
		measures: measures ?? {},
		plan: plan ?? null
	};
}
