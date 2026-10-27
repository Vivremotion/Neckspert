import type { RoundPlan } from '../plan';
import type { RoundOutcome } from '../round';
import type { PairedAnswer, PairingResult, VerdictContext, VerdictMode } from './types';

/**
 * Best to worst: perfect > early / late > offbeat > corrected > wrong. `offbeat` (mode 1): the right
 * note, heard after the window while still listening. Right but never direct recall. `corrected`
 * (triad anchor): a wrong chord put right later in its window; a miss everywhere (`correct` false),
 * only the screen salutes it.
 */
export const RESPONSE_VERDICTS = [
	'perfect',
	'early',
	'late',
	'offbeat',
	'corrected',
	'wrong'
] as const;
export type ResponseVerdict = (typeof RESPONSE_VERDICTS)[number];

/** The version of the shape of a response verdict (`ResponseValue`). */
export const RESPONSE_VERDICT_VERSION = 1;

/** What one expectation of a response round received. */
export interface ExpectationResult {
	index: number;
	answer: unknown | null;
	/** null: unanswered. */
	correct: boolean | null;
	confusion: unknown | null;
	/** The answer of the attack that put a wrong one right, if any. */
	correction: unknown | null;
	late: boolean;
}

export interface ResponseValue {
	verdict: ResponseVerdict;
	timingOffsetMs: number | null;
	reactionMs: number | null;
	/** From the prompt to the first timed expectation; null in free time. */
	leadMs: number | null;
	expectations: ExpectationResult[];
}

/** Seconds to whole ms, rounded half away from zero. */
function secondsToMs(seconds: number): number {
	const ms = Math.round(Math.abs(seconds) * 1000);
	return seconds < 0 && ms !== 0 ? -ms : ms;
}

/** An answer without content to judge counts as right. */
const isRight = (pair: PairedAnswer | undefined): boolean =>
	pair !== undefined && (pair.judged === null || pair.judged.correct);

function expectationResult(index: number, pair: PairedAnswer | undefined): ExpectationResult {
	return {
		index,
		answer: pair?.judged?.answer ?? null,
		correct: pair ? isRight(pair) : null,
		confusion: pair?.judged?.confusion ?? null,
		correction: pair?.correction?.judged.answer ?? null,
		late: pair?.late ?? false
	};
}

/**
 * One answer per expectation, judged as the one-answer relations did: the first point expectation
 * is the timed one and gives the verdict in time; the round is right when every expectation is
 * answered right (a pending reading counts as it stands).
 */
export const responseVerdict: VerdictMode = {
	id: 'response',
	validate(plan: RoundPlan): string | null {
		// It judges answers: a rest, never answered, would always be a miss.
		const rest = plan.expectations.findIndex((e) => e.role === 'judged-rest');
		if (rest >= 0) {
			return `expectation ${rest} is a judged rest: a response verdict judges answers, not silences`;
		}
		const timed = plan.expectations.find((e) => e.span === 'point');
		if (!timed) return 'a response verdict needs a point expectation';
		if (!('ms' in timed.window)) return 'a response verdict needs a window in ms';
		return null;
	},
	outcome(result: PairingResult, context: VerdictContext): RoundOutcome {
		const { plan, times, clock } = context;
		const problem = responseVerdict.validate?.(plan) ?? null;
		if (problem) throw new RangeError(problem);
		const timedIndex = plan.expectations.findIndex((e) => e.span === 'point');
		const timed = plan.expectations[timedIndex];
		const windowMs = (timed.window as { ms: number }).ms;

		const byIndex = new Map(result.pairs.map((p) => [p.expectation, p]));
		const timedPair = byIndex.get(timedIndex);
		const atS = 'map' in clock && timed.at ? clock.map.toSeconds(clock.start.add(timed.at)) : null;

		const reactionMs = timedPair ? secondsToMs(timedPair.time - times.promptS) : null;
		const timingOffsetMs = timedPair && atS !== null ? secondsToMs(timedPair.time - atS) : null;
		const leadMs = atS !== null ? secondsToMs(atS - times.promptS) : null;

		const inTime = ((): ResponseVerdict => {
			if (!timedPair || !isRight(timedPair)) return 'wrong';
			if (timedPair.late) return 'offbeat';
			if (timingOffsetMs === null) return (reactionMs as number) <= windowMs ? 'perfect' : 'late';
			if (Math.abs(timingOffsetMs) <= windowMs) return 'perfect';
			return timingOffsetMs < 0 ? 'early' : 'late';
		})();

		const pairs = plan.expectations.map((_, index) => byIndex.get(index));
		const correct = pairs.every(isRight);
		const corrected = pairs.some(
			(pair, index) => pair?.correction != null && pairs.slice(0, index).every(isRight)
		);
		const verdict: ResponseVerdict = correct ? inTime : corrected ? 'corrected' : 'wrong';

		const value: ResponseValue = {
			verdict,
			timingOffsetMs,
			reactionMs,
			leadMs,
			expectations: pairs.map((pair, index) => expectationResult(index, pair))
		};
		return {
			success: correct && verdict !== 'offbeat',
			correct,
			verdict: { relation: 'response', version: RESPONSE_VERDICT_VERSION, value },
			measures: {},
			aids: [...context.aids],
			detail: result
		};
	}
};

/**
 * Direct recall: a success within the threshold, measured on the lead (the prompt to the timed
 * expectation) or, in free time, on the reaction. No threshold: never.
 */
export function isDirectRecall(
	value: ResponseValue,
	success: boolean,
	thresholdMs: number | null
): boolean {
	if (!success || thresholdMs === null) return false;
	const measured = value.leadMs ?? value.reactionMs;
	return measured !== null && measured <= thresholdMs;
}
