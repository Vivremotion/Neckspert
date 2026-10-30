import type { Alignment, ExpectationVerdict, TimedExpectation } from './align';

export type MeasureId =
	'fidelity' | 'placement' | 'precision' | 'regularity' | 'holdOffset' | 'holdDrift';
export type MeasureUnit = 'ms' | 'ms/bar' | 'ratio';
/** A measure without data is absent, never `NaN` and never `null`. */
export type Measures = Partial<Record<MeasureId, { value: number; unit: MeasureUnit }>>;

/** Who measured the latency the offsets were corrected by: the system alone, or the player's own taps. */
export type LatencyProvenance = 'system' | 'player';

/**
 * The verdict of an expectation in the report: `dropped` for one a shift made unplayable,
 * `wrong-pitch` for one answered in its zone by an attack that does not play it (a wrong note in
 * place), whatever its timing.
 */
export type ReportedVerdict = ExpectationVerdict | 'dropped' | 'wrong-pitch';

export interface CycleReport {
	/** One entry per timed expectation, in plan order. */
	expectations: { index: number; verdict: ReportedVerdict; offsetMs: number | null }[];
	/** Plan indexes of the expectations a shift made unplayable (neither played nor missed). */
	dropped: number[];
	/** How many attacks answered no expectation. */
	extra: number;
	/**
	 * When each of them fell, in ms from the cycle's start (latency removed), in time order.
	 * Absent from the reports stored before it existed.
	 */
	extraAtMs?: number[];
	shift: Alignment['shift'];
	measures: Measures;
	latency: { ms: number; provenance: LatencyProvenance } | null;
}

export type CycleFailure =
	'missed' | 'wrong-pitch' | 'extra' | 'shift' | 'precision' | 'regularity' | 'hold';
export type CycleVerdict = { passed: true } | { passed: false; reasons: CycleFailure[] };

/**
 * What a level allows a cycle: the largest absolute value of a measure that still passes, and the
 * least share of hits (`fidelity`, 0 to 1) that lets missed and wrong notes pass.
 */
export type CycleThresholds = Partial<
	Record<'precision' | 'regularity' | 'holdOffset' | 'holdDrift' | 'fidelity', number>
>;

/** Float tolerance on a share: 9 hits out of 10 meet a threshold of 0.9. */
const EPSILON = 1e-9;

function mean(values: number[]): number {
	return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Population standard deviation: the cycle is the whole of what was played, not a sample of it. */
function deviation(values: number[]): number {
	const m = mean(values);
	return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}

/** Least-squares slope of `y` over `x`; `x` must hold at least two distinct values. */
function slope(points: { x: number; y: number }[]): number {
	const mx = mean(points.map((p) => p.x));
	const my = mean(points.map((p) => p.y));
	let num = 0;
	let den = 0;
	for (const p of points) {
		num += (p.x - mx) * (p.y - my);
		den += (p.x - mx) ** 2;
	}
	return num / den;
}

/**
 * The report of one cycle: a verdict per expectation, the added attacks, the shift, and the
 * measures, computed from the paired offsets. A pair whose attack does not fit is `wrong-pitch`.
 * Fidelity is the share of the expectations hit (paired by a note that fits), over every
 * expectation (a dropped one was not played). The other measures read every pair, a wrong
 * note's too: it was played at its place. Placement, precision and hold offset need at least one
 * paired offset (hold offset also needs a muted and a clicked bar with data), regularity at
 * least two, hold drift at least two muted bars with data (each bar by the mean of its offsets).
 * `mutedBars` are the cycle bars where the click is silent. `attacks` are the times aligned
 * (seconds, latency removed, indexed as the alignment indexes them) and `startS` the cycle's
 * start, which the extra attacks are timed from. Pure: the same alignment gives the same report.
 */
export function cycleReport(input: {
	alignment: Alignment;
	expectations: TimedExpectation[];
	attacks: number[];
	startS: number;
	mutedBars: number[];
	latency: CycleReport['latency'];
}): CycleReport {
	const { alignment, expectations, attacks, startS, mutedBars, latency } = input;
	const paired = new Map(alignment.pairs.map((p) => [p.expectation, p]));
	const dropped = new Set(alignment.dropped);
	const entries: CycleReport['expectations'] = [...expectations]
		.sort((a, b) => a.index - b.index)
		.map((e) => {
			const pair = paired.get(e.index);
			if (pair) {
				const verdict = pair.fits ? pair.verdict : 'wrong-pitch';
				return { index: e.index, verdict, offsetMs: pair.offsetMs };
			}
			if (dropped.has(e.index)) return { index: e.index, verdict: 'dropped', offsetMs: null };
			return { index: e.index, verdict: 'missed', offsetMs: null };
		});

	const measures: Measures = {};
	if (expectations.length > 0) {
		const hits = alignment.pairs.filter((p) => p.fits).length;
		measures.fidelity = { value: hits / expectations.length, unit: 'ratio' };
	}
	const offsets = alignment.pairs.map((p) => p.offsetMs);
	if (offsets.length > 0) {
		measures.placement = { value: mean(offsets), unit: 'ms' };
		measures.precision = { value: mean(offsets.map(Math.abs)), unit: 'ms' };
	}
	if (offsets.length > 1) measures.regularity = { value: deviation(offsets), unit: 'ms' };

	const barOf = new Map(expectations.map((e) => [e.index, e.bar]));
	const muted = new Set(mutedBars);
	const byBar = new Map<number, number[]>();
	for (const p of alignment.pairs) {
		const bar = barOf.get(p.expectation);
		if (bar === undefined) continue;
		byBar.set(bar, [...(byBar.get(bar) ?? []), p.offsetMs]);
	}
	const mutedOffsets: number[] = [];
	const clickOffsets: number[] = [];
	const mutedPoints: { x: number; y: number }[] = [];
	for (const [bar, list] of byBar) {
		if (muted.has(bar)) {
			mutedOffsets.push(...list);
			mutedPoints.push({ x: bar, y: mean(list) });
		} else clickOffsets.push(...list);
	}
	if (mutedOffsets.length > 0 && clickOffsets.length > 0) {
		measures.holdOffset = { value: mean(mutedOffsets) - mean(clickOffsets), unit: 'ms' };
	}
	if (mutedPoints.length > 1) {
		measures.holdDrift = { value: slope(mutedPoints), unit: 'ms/bar' };
	}

	return {
		expectations: entries,
		dropped: [...alignment.dropped],
		extra: alignment.extra.length,
		extraAtMs: alignment.extra.map((i) => (attacks[i] - startS) * 1000),
		shift: alignment.shift,
		measures,
		latency
	};
}

/**
 * A cycle passes when the figure was played faithfully (nothing missed, no wrong note, nothing
 * added, no shift) and regularity and hold are within their thresholds. A level that writes
 * `thresholds.fidelity` (a share of hits, 0 to 1) lets missed and wrong notes pass while the
 * fidelity is at or above it; without it, any one fails. Precision judges only when the
 * latency was measured without the player (`provenance === 'system'`): otherwise it is shown,
 * and judges nothing. A measure without data or without a threshold is not judged; a threshold
 * is the largest absolute value that still passes. Dropped expectations add no `missed`
 * reason: the `shift` already fails the cycle.
 */
export function cycleVerdict(report: CycleReport, thresholds: CycleThresholds): CycleVerdict {
	const over = (id: Exclude<keyof CycleThresholds, 'fidelity'>): boolean => {
		const limit = thresholds[id];
		const measure = report.measures[id];
		return limit !== undefined && measure !== undefined && Math.abs(measure.value) > limit;
	};
	const reasons: CycleFailure[] = [];
	const fidelity = report.measures.fidelity?.value;
	const faithful =
		thresholds.fidelity !== undefined &&
		fidelity !== undefined &&
		fidelity >= thresholds.fidelity - EPSILON;
	if (!faithful) {
		if (report.expectations.some((e) => e.verdict === 'missed')) reasons.push('missed');
		if (report.expectations.some((e) => e.verdict === 'wrong-pitch')) reasons.push('wrong-pitch');
	}
	if (report.extra > 0) reasons.push('extra');
	if (report.shift) reasons.push('shift');
	if (report.latency?.provenance === 'system' && over('precision')) reasons.push('precision');
	if (over('regularity')) reasons.push('regularity');
	if (over('holdOffset') || over('holdDrift')) reasons.push('hold');
	return reasons.length === 0 ? { passed: true } : { passed: false, reasons };
}
