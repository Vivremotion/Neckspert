import { asNeckCard, isMirrorPair, neckCardKey, type NeckCard } from '$lib/domain/music';

/** Hard rules: never the same card twice in a row, never the two notes of a mirror pair. */
export function allowedAfter(card: NeckCard, previous: NeckCard | null): boolean {
	if (previous === null) return true;
	if (neckCardKey(card) === neckCardKey(previous)) return false;
	return !isMirrorPair(card, previous);
}

/**
 * Random draw (injected `random`) among the candidates allowed after `previous`, preferring
 * another string than the previous one when such a candidate exists. Null when none is allowed.
 */
export function pickAtRandom<T extends { mechanic: string; item: unknown }>(
	candidates: readonly T[],
	previous: NeckCard | null,
	random: () => number
): T | null {
	const allowed = candidates.filter((candidate) => allowedAfter(asNeckCard(candidate), previous));
	const otherString = allowed.filter(
		(candidate) => asNeckCard(candidate).item.string !== previous?.item.string
	);
	const pool = otherString.length > 0 ? otherString : allowed;
	if (pool.length === 0) return null;
	return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}
