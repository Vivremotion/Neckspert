import { median } from '$lib/domain/stats';
import { PAIR_WINDOW_S } from './config';

/**
 * How far the constant offset between two inputs is looked for, in seconds. Large on purpose:
 * the interface − mic offset was −30 ms in Chrome and −121 ms in Firefox on the same hardware.
 */
export const OFFSET_SEARCH_S = 0.25;

/**
 * Clicks heard by a silent input: median delay, the share of clicks heard (bleed) and the spread
 * (median absolute deviation, ms). Every attack within `withinS` after a click is a candidate
 * delay; the delays gather at the input's loop latency, so the mode of the candidates (the delay
 * with the most others within `clusterS`) is kept, and a click is heard only by a candidate in
 * that cluster, the nearest to its centre. Noises of the room, at any other delay, are ignored;
 * nothing before its click is a candidate.
 */
export function loopLatency(
	clickTimes: number[],
	heard: number[],
	withinS: number,
	clusterS: number = PAIR_WINDOW_S
): { ms: number | null; heardRatio: number; spreadMs: number | null } {
	const candidates: { click: number; delay: number }[] = [];
	clickTimes.forEach((click, index) => {
		for (const t of heard) {
			if (t >= click && t - click <= withinS) candidates.push({ click: index, delay: t - click });
		}
	});
	let cluster: number[] = [];
	for (const { delay } of candidates) {
		const near = candidates
			.filter((other) => Math.abs(other.delay - delay) <= clusterS)
			.map((other) => other.delay);
		if (near.length > cluster.length) cluster = near;
	}
	const centre = median(cluster);
	if (centre === null) return { ms: null, heardRatio: 0, spreadMs: null };
	const best = new Map<number, number>();
	for (const { click, delay } of candidates) {
		if (Math.abs(delay - centre) > clusterS) continue;
		const kept = best.get(click);
		if (kept === undefined || Math.abs(delay - centre) < Math.abs(kept - centre)) {
			best.set(click, delay);
		}
	}
	const delaysMs = [...best.values()].map((delay) => delay * 1000);
	const ms = median(delaysMs);
	const spreadMs = ms === null ? null : median(delaysMs.map((d) => Math.abs(d - ms)));
	return { ms, heardRatio: delaysMs.length / Math.max(1, clickTimes.length), spreadMs };
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
