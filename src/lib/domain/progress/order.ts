import { asNeckCard, neckCardKey, type NeckCard } from '$lib/domain/music';

/** The hard rule: never the same card twice in a row. */
export function allowedAfter(card: NeckCard, previous: NeckCard | null): boolean {
	return previous === null || neckCardKey(card) !== neckCardKey(previous);
}

/**
 * Random draw (injected `random`) among the candidates allowed after `previous`. Null when none
 * is allowed.
 */
export function pickAtRandom<T extends { skill: string; item: unknown }>(
	candidates: readonly T[],
	previous: NeckCard | null,
	random: () => number
): T | null {
	const allowed = candidates.filter((candidate) => allowedAfter(asNeckCard(candidate), previous));
	if (allowed.length === 0) return null;
	return allowed[Math.min(allowed.length - 1, Math.floor(random() * allowed.length))];
}
