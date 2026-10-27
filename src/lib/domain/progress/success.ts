import type { Attempt, CardKey } from '$lib/domain/types';

/** Share of successes (`Attempt.success`); null without attempts. */
export function successRate(attempts: readonly Attempt[]): number | null {
	if (attempts.length === 0) return null;
	return attempts.filter((attempt) => attempt.success).length / attempts.length;
}

/** Success of one card over its last `window` attempts of the session, probe left out. */
export function cardSuccessRate(
	attempts: readonly Attempt[],
	key: CardKey,
	window: number
): number | null {
	const own = attempts.filter((attempt) => attempt.cardKey === key && attempt.phase !== 'probe');
	return successRate(own.slice(-window));
}
