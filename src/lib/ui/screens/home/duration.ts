/** A duration in whole minutes (at least 1), short for the eye and spoken for assistive tech. */
export function formatMinutes(
	ms: number,
	words: { short: (n: number) => string; spoken: (n: number) => string }
): { text: string; spoken: string } {
	const minutes = Math.max(1, Math.round(ms / 60_000));
	return { text: words.short(minutes), spoken: words.spoken(minutes) };
}
