import type { CycleFailure, CycleReport, CycleVerdict } from '$lib/domain/time';

/** Failed rounds in a row at the floor before the anti-blocking acts. */
export const BLOCK_AFTER_FAILS = 3;
/** Of those rounds, how many must fail at the same spot to read a reading block. */
export const BLOCK_SAME_SPOT_CYCLES = 2;
/** After « On change d’air », the exercise rests this long (ms). */
export const BLOCK_REST_MS = 3_600_000;

/**
 * Why a series is blocked: the player does not know what to play (`reading`), knows it but not
 * in place (`execution`), or the signs mix and the application does not claim to know.
 */
export type BlockDiagnosis = 'reading' | 'execution' | 'unclear';

/** A settled round as the session policy reads it. */
export interface SettledRound {
	/** The level it was played at. */
	level: number;
	/** What was played (a figure at a level): rounds of different items are never compared. */
	item: string;
	success: boolean;
	/** Played with an aid the level does not give. */
	aided: boolean;
	report: CycleReport;
	verdict: CycleVerdict;
	/** `MATCH_LIMIT` in ms at the round's tempo: extras closer than this fall on the same spot. */
	spotMs: number;
}

/** The judge's order of reasons (`cycleVerdict`), for ties. */
const REASON_ORDER: readonly CycleFailure[] = [
	'missed',
	'extra',
	'shift',
	'precision',
	'regularity',
	'hold'
];

function reasonsOf(round: SettledRound): CycleFailure[] {
	return round.verdict.passed ? [] : round.verdict.reasons;
}

function sameMissedSpot(rounds: readonly SettledRound[]): boolean {
	const counts = new Map<number, number>();
	for (const round of rounds) {
		for (const expectation of round.report.expectations) {
			if (expectation.verdict !== 'missed') continue;
			counts.set(expectation.index, (counts.get(expectation.index) ?? 0) + 1);
		}
	}
	return [...counts.values()].some((count) => count >= BLOCK_SAME_SPOT_CYCLES);
}

function sameExtraSpot(rounds: readonly SettledRound[]): boolean {
	const paired = new Set<number>();
	rounds.forEach((a, i) => {
		rounds.forEach((b, j) => {
			if (j <= i) return;
			const near = (a.report.extraAtMs ?? []).some((x) =>
				(b.report.extraAtMs ?? []).some((y) => Math.abs(x - y) <= Math.min(a.spotMs, b.spotMs))
			);
			if (near) {
				paired.add(i);
				paired.add(j);
			}
		});
	});
	return paired.size >= BLOCK_SAME_SPOT_CYCLES;
}

/** Reads the failed rounds that blocked a series. */
export function diagnoseBlock(rounds: readonly SettledRound[]): BlockDiagnosis {
	const played = rounds.every(
		(round) =>
			!round.success &&
			!reasonsOf(round).some((reason) => reason === 'missed' || reason === 'extra')
	);
	if (rounds.length > 0 && played) return 'execution';
	const byItem = new Map<string, SettledRound[]>();
	for (const round of rounds) byItem.set(round.item, [...(byItem.get(round.item) ?? []), round]);
	for (const same of byItem.values()) {
		if (sameMissedSpot(same) || sameExtraSpot(same)) return 'reading';
	}
	return 'unclear';
}

/** The reason that failed the most rounds; on a tie, the first in the judge's order. */
export function breakingMeasure(rounds: readonly SettledRound[]): CycleFailure | null {
	const counts = new Map<CycleFailure, number>();
	for (const round of rounds) {
		for (const reason of reasonsOf(round)) counts.set(reason, (counts.get(reason) ?? 0) + 1);
	}
	let best: CycleFailure | null = null;
	for (const reason of REASON_ORDER) {
		const count = counts.get(reason) ?? 0;
		if (count > 0 && (best === null || count > (counts.get(best) ?? 0))) best = reason;
	}
	return best;
}
