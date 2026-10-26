import { Fraction } from './fraction';
import { attackPositions, validateFigure, type Figure } from './figure';
import { barLength } from './meter';

/** How far from an expectation an attack still counts: absolute, or a share of the local gap. */
export type ExpectationWindow = { ms: number } | { ofGap: Fraction };

/** What the judge listens for at one position of a round. */
export interface Expectation {
	/** Position in the round, as a fraction of a whole note from its start; null: free time. */
	at: Fraction | null;
	/** A point, or a stretch (the chord of the anchor) that ends at `until`. */
	span: 'point' | { until: Fraction };
	/** An expected attack, or a silence that is judged. */
	role: 'target' | 'judged-rest';
	/** Which sensor hears it. */
	sensor: string;
	/** What must be played; null in pure rhythm. */
	content: ExpectedContent | null;
	window: ExpectationWindow;
	/** Bar of the cycle, from 0: the muted-bar bookkeeping reads it. */
	bar: number;
}

/** What must be played at an expectation, judged by the content judge of its `kind`. */
export interface ExpectedContent {
	kind: string;
	value: unknown;
}

/**
 * How a round pairs attacks with expectations: the pairing mode it names (`mode`, read in the
 * registry of modes) and that mode's own settings, which the mode reads and validates.
 */
export type PairingPolicy = { mode: string } & Record<string, unknown>;

/** The verdict mode a round names, read in the registry of modes. */
export type VerdictModeId = string;

export interface RoundPolicy {
	/** One answer closes the round, or the whole cycle is judged. */
	unit: 'response' | 'cycle';
	pairing: PairingPolicy;
	verdict: VerdictModeId;
	/** A wrong first answer of a span may be put right later in the span (`corrected`). */
	correction: boolean;
}

export interface Judged {
	correct: boolean;
	answer: unknown;
	confusion: unknown | null;
}

export interface ContentJudge {
	judge(value: unknown, payload: unknown): Judged;
}

/** The judge of a content kind; throws on a kind it does not know. */
export type ContentJudges = (kind: string) => ContentJudge;

export interface RoundPlan {
	/** Where the prompt shows (negative: before the round), if the round has one. */
	prompt: Fraction | null;
	/** Sorted by `at`. */
	expectations: Expectation[];
	/** Length of the round, as a fraction of a whole note. */
	length: Fraction;
	policy: RoundPolicy;
	/**
	 * Where the next round may open without a gap, relative to this round's start: rounds that
	 * chain hand over there: the cycles of a loop at their end, the changes of a grid (one round
	 * per change) a little before the next change. Absent: the round
	 * ends on its own and the next one waits for it.
	 */
	handover?: Fraction;
	/** Last position where the round listens; absent: `handover`, else `length`. */
	listenUntil?: Fraction;
	/** Bars of the cycle (from 0) where the accompaniment is silent. */
	mutedBars: number[];
	/** Where a counted bar or a breath ends: on the prompt (default) or on the target (a grid opens a beat before its change). */
	countEndsOn?: 'prompt' | 'target';
	/** Where the round's start (its target) falls in its bar, as a fraction of a whole note; default 0, the downbeat. */
	barOffset?: Fraction;
}

function validateWindow(window: ExpectationWindow): boolean {
	if ('ms' in window) return Number.isFinite(window.ms) && window.ms >= 0;
	return window.ofGap.n > 0;
}

/**
 * Null when the plan is well formed whatever its modes, else what is wrong with it. What a mode
 * asks of a plan, the mode checks (`PairingMode.validate`, run by the round engine).
 */
export function validateRoundPlan(plan: RoundPlan): string | null {
	if (plan.length.n <= 0) return `plan length must be positive, got ${plan.length}`;
	for (const [i, e] of plan.expectations.entries()) {
		if (e.content && !e.content.kind) return `expectation ${i} content needs a kind`;
	}
	const free = plan.expectations.filter((e) => e.at === null).length;
	if (free > 0 && free < plan.expectations.length) {
		return 'a plan cannot mix timed and free-time expectations';
	}
	const first = plan.expectations[0];
	if (plan.prompt && first && first.at && plan.prompt.compare(first.at) > 0) {
		return `prompt at ${plan.prompt} comes after the first expectation at ${first.at}`;
	}
	if (plan.handover && (plan.handover.n <= 0 || plan.handover.compare(plan.length) > 0)) {
		return `handover at ${plan.handover} is outside (0, ${plan.length}]`;
	}
	if (plan.listenUntil && (plan.listenUntil.n <= 0 || plan.listenUntil.compare(plan.length) > 0)) {
		return `listenUntil at ${plan.listenUntil} is outside (0, ${plan.length}]`;
	}
	let previous: Fraction | null = null;
	for (const [i, e] of plan.expectations.entries()) {
		if (e.at === null) continue;
		if (e.at.compare(Fraction.ZERO) < 0 || e.at.compare(plan.length) >= 0) {
			return `expectation ${i} at ${e.at} is outside the plan length ${plan.length}`;
		}
		if (previous && e.at.compare(previous) < 0) {
			return `expectation ${i} at ${e.at} is out of order, after ${previous}`;
		}
		previous = e.at;
		if (e.span !== 'point') {
			if (e.span.until.compare(e.at) <= 0 || e.span.until.compare(plan.length) > 0) {
				return `expectation ${i} span ends at ${e.span.until}, expected after ${e.at} and within ${plan.length}`;
			}
		}
		if (!validateWindow(e.window)) return `expectation ${i} has an invalid window`;
		if (!Number.isInteger(e.bar) || e.bar < 0) {
			return `expectation ${i} bar must be a non-negative integer, got ${e.bar}`;
		}
	}
	if (!plan.mutedBars.every((b) => Number.isInteger(b) && b >= 0)) {
		return 'muted bars must be non-negative integers';
	}
	return null;
}

/**
 * The plan of a looped figure played over `cycleBars` bars, the cycle beginning at bar
 * `startBar` of the figure loop (it wraps, the figure repeats); `cycleBars` is a whole number
 * of figure loops. One point target per note
 * of the figure's first voice, tied notes counted once. The accompaniment cycle is rotated
 * by the same `startBar`: cycle bar `i` is muted when `accompanimentBars[(startBar + i) % n]`
 * is `'off'`, so the cycle starts where the silence does (spec section 6, landing).
 */
export function compileCyclePlan(input: {
	figure: Figure;
	cycleBars: number;
	startBar: number;
	sensor: string;
	window: ExpectationWindow;
	accompanimentBars: ('on' | 'off')[];
}): RoundPlan {
	const { figure, cycleBars, startBar, sensor, window, accompanimentBars } = input;
	const problem = validateFigure(figure);
	if (problem) throw new RangeError(`invalid figure: ${problem}`);
	if (!Number.isInteger(cycleBars) || cycleBars < 1) {
		throw new RangeError(`cycleBars must be a positive integer, got ${cycleBars}`);
	}
	if (!Number.isInteger(startBar) || startBar < 0) {
		throw new RangeError(`startBar must be a non-negative integer, got ${startBar}`);
	}
	if (cycleBars % figure.bars !== 0) {
		throw new RangeError(
			`cycleBars (${cycleBars}) must be a whole number of figure loops of ${figure.bars} bars`
		);
	}
	if (accompanimentBars.length === 0) {
		throw new RangeError('an accompaniment needs at least one bar');
	}
	const bar = barLength(figure.meter);
	const attacks = attackPositions(figure);
	const expectations: Expectation[] = [];
	const mutedBars: number[] = [];
	for (let i = 0; i < cycleBars; i++) {
		const figureBar = (startBar + i) % figure.bars;
		const from = bar.mul(Fraction.of(figureBar));
		const to = bar.mul(Fraction.of(figureBar + 1));
		const origin = bar.mul(Fraction.of(i));
		for (const attack of attacks) {
			if (attack.compare(from) < 0 || attack.compare(to) >= 0) continue;
			expectations.push({
				at: origin.add(attack.sub(from)),
				span: 'point',
				role: 'target',
				sensor,
				content: null,
				window: { ...window },
				bar: i
			});
		}
		if (accompanimentBars[(startBar + i) % accompanimentBars.length] === 'off') mutedBars.push(i);
	}
	const length = bar.mul(Fraction.of(cycleBars));
	return {
		prompt: null,
		expectations,
		length,
		policy: { unit: 'cycle', pairing: { mode: 'alignment' }, verdict: 'cycle', correction: false },
		handover: length,
		mutedBars
	};
}
