import { V7_RELATIONS } from '$lib/infrastructure/storage/migrations/v8';
import {
	type AidLevel,
	type Attempt,
	type ResponseVerdict,
	type VerdictEnvelope
} from '$lib/domain/types';

/**
 * An attempt written as a one-answer round reads: `verdict` a `ResponseVerdict`, `correct` a
 * boolean, the planned `aid`. The target fields left out are derived by `responseAttempt`.
 */
export type ResponseAttemptFields<D = unknown> = Omit<
	Attempt<D>,
	'verdict' | 'success' | 'aids' | 'measures' | 'plan'
> & {
	verdict: ResponseVerdict | VerdictEnvelope;
	success?: boolean;
	aid?: AidLevel;
	aids?: Attempt['aids'];
	measures?: Attempt['measures'];
	plan?: unknown | null;
};

/** Overrides of a spec's attempt builder, in either shape. */
export type AttemptOverrides<D = unknown> = Partial<ResponseAttemptFields<D>>;

/** The relation an old mechanic's attempts were judged by (frozen at version 7); `beat` otherwise. */
function relationOf(mechanic: string): string {
	return V7_RELATIONS[mechanic] ?? 'beat';
}

/**
 * A stored attempt in the target shape, as the recorder writes one for a one-answer round. A
 * `ResponseVerdict` is wrapped in its relation's envelope and decides `success` (with `correct`);
 * the planned `aid` becomes `aids`. An envelope is kept as given, with the `success` given.
 */
export function responseAttempt<D>(fields: ResponseAttemptFields<D>): Attempt<D> {
	const { aid, verdict, success, aids, measures, plan, ...rest } = fields;
	const envelope =
		typeof verdict === 'string'
			? { relation: relationOf(fields.mechanic), version: 1, value: verdict }
			: verdict;
	const decided =
		typeof verdict === 'string'
			? fields.correct === true && verdict !== 'offbeat'
			: (success ?? false);
	return {
		...rest,
		verdict: envelope,
		success: decided,
		aids: aids ?? (aid === 'show-position' ? ['show-position'] : []),
		measures: measures ?? {},
		plan: plan ?? null
	};
}
