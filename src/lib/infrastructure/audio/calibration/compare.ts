import { median } from '$lib/domain/stats';

/**
 * How far the constant offset between two inputs is looked for, in seconds. Large on purpose:
 * the interface − mic offset was −30 ms in Chrome and −121 ms in Firefox on the same hardware.
 */
export const OFFSET_SEARCH_S = 0.25;

/**
 * Clicks heard by a silent input: median delay and the share of clicks heard (bleed). A click is
 * heard by the first attack that follows it within `withinS`; any other attack (an echo, a noise
 * of the room) is ignored. A sound cannot come before its click, so nothing earlier is paired.
 */
export function loopLatency(
	clickTimes: number[],
	heard: number[],
	withinS: number
): { ms: number | null; heardRatio: number } {
	if (clickTimes.length === 0) return { ms: null, heardRatio: 0 };
	const sorted = [...heard].sort((x, y) => x - y);
	const delaysMs: number[] = [];
	for (const click of clickTimes) {
		const first = sorted.find((t) => t >= click && t - click <= withinS);
		if (first !== undefined) delaysMs.push((first - click) * 1000);
	}
	return { ms: median(delaysMs), heardRatio: delaysMs.length / clickTimes.length };
}

/**
 * The constant offset a − b (s): the mode of every difference within `searchS`, that is the
 * difference with the most others within `withinS` of it, refined by the median of those.
 */
function constantOffset(a: number[], b: number[], withinS: number, searchS: number): number | null {
	const diffs: number[] = [];
	for (const x of a) for (const y of b) if (Math.abs(x - y) <= searchS) diffs.push(x - y);
	if (diffs.length === 0) return null;
	let best: number[] = [];
	for (const d of diffs) {
		const near = diffs.filter((other) => Math.abs(other - d) <= withinS);
		if (near.length > best.length) best = near;
	}
	return median(best);
}

/**
 * Pairs the same attacks on two inputs: median and spread of (a − b), in ms. The constant offset
 * is found first over a wide window (`searchS`), then each attack of `a` pairs one to one with
 * an attack of `b` within `withinS` of that offset, closest first. Attacks of `b` that pair with
 * nothing (a mic hearing the room) are left out. The spread is the median absolute deviation.
 * Null when nothing pairs.
 */
export function pairedDelay(
	a: number[],
	b: number[],
	withinS: number,
	searchS: number = OFFSET_SEARCH_S
): { ms: number; spreadMs: number; pairs: number } | null {
	const offset = constantOffset(a, b, withinS, searchS);
	if (offset === null) return null;
	const candidates: { i: number; j: number; residual: number }[] = [];
	for (let i = 0; i < a.length; i++) {
		for (let j = 0; j < b.length; j++) {
			const residual = a[i] - b[j] - offset;
			if (Math.abs(residual) <= withinS) candidates.push({ i, j, residual });
		}
	}
	candidates.sort((x, y) => Math.abs(x.residual) - Math.abs(y.residual));
	const usedA = new Set<number>();
	const usedB = new Set<number>();
	const delaysMs: number[] = [];
	for (const { i, j } of candidates) {
		if (usedA.has(i) || usedB.has(j)) continue;
		usedA.add(i);
		usedB.add(j);
		delaysMs.push((a[i] - b[j]) * 1000);
	}
	const ms = median(delaysMs);
	if (ms === null) return null;
	const spreadMs = median(delaysMs.map((d) => Math.abs(d - ms))) ?? 0;
	return { ms, spreadMs, pairs: delaysMs.length };
}
