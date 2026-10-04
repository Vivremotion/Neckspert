import { isMirrorPair } from '$lib/domain/music';
import { cardKey, type Target } from '$lib/domain/types';

/** Hard rules: never the same card twice in a row, never the two notes of a mirror pair. */
export function allowedAfter(target: Target, previous: Target | null): boolean {
	if (previous === null) return true;
	if (cardKey(target) === cardKey(previous)) return false;
	return !isMirrorPair(target, previous);
}

/**
 * Random draw (injected `random`) among the candidates allowed after `previous`, preferring
 * another string than the previous one when such a candidate exists. Null when none is allowed.
 */
export function pickAtRandom<T extends { target: Target }>(
	candidates: readonly T[],
	previous: Target | null,
	random: () => number
): T | null {
	const allowed = candidates.filter((candidate) => allowedAfter(candidate.target, previous));
	const otherString = allowed.filter((candidate) => candidate.target.string !== previous?.string);
	const pool = otherString.length > 0 ? otherString : allowed;
	if (pool.length === 0) return null;
	return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}
