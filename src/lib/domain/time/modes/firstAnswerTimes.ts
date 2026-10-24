import type { Fraction } from '../fraction';
import type { Expectation, RoundPlan } from '../plan';
import { beatSecondsAt } from '../tempoMap';
import type { RoundTimes } from './times';
import type { RoundClock } from './types';

/** Where an answer may start: a delay after the prompt, or a tolerance before the expectation (capped in beats). */
export type Opening = { afterPromptMs: number } | { beforeMs: number; maxBeats: number };

/** After the in-time zone: a capture of `ms` (off the beat), up to the end of listening, or none. */
export type LateCapture = { ms: number } | 'to-end' | null;

/** The pairing policy of a first-answer plan: the settings the first-answer mode owns. */
export type FirstAnswerSettings = {
	mode: 'first-answer';
	opens: Opening;
	lateMs: number;
	lateCapture: LateCapture;
};

export interface ResponseZone {
	index: number; // in the plan
	sensor: string;
	span: 'point' | 'span';
	atS: number | null; // null in free time
	opensS: number; // an attack from here may answer
	inTimeEndS: number; // after it, a right answer is off the beat (point) or none (span)
	captureEndS: number; // after it, no attack answers this expectation
}

const isFields = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;
const isMs = (value: unknown): value is number =>
	typeof value === 'number' && Number.isFinite(value) && value >= 0;

function settingsProblem(pairing: Record<string, unknown>): string | null {
	const { opens, lateMs, lateCapture } = pairing;
	const opening =
		isFields(opens) &&
		(isMs(opens.afterPromptMs) || (isMs(opens.beforeMs) && isMs(opens.maxBeats)));
	if (!opening) return 'a first-answer plan opens with afterPromptMs, or beforeMs and maxBeats';
	if (!isMs(lateMs)) return 'a first-answer plan needs lateMs';
	const capture =
		lateCapture === null ||
		lateCapture === 'to-end' ||
		(isFields(lateCapture) && isMs(lateCapture.ms));
	if (!capture) return 'a first-answer plan captures late for ms, to the end, or not (null)';
	return null;
}

/** Null when the plan suits the first-answer mode, else what is wrong with it. */
export function validateFirstAnswer(plan: RoundPlan): string | null {
	const problem = settingsProblem(plan.policy.pairing);
	if (problem) return problem;
	const settings = plan.policy.pairing as FirstAnswerSettings;
	const free = plan.expectations.some((e) => e.at === null);
	if (free && !('afterPromptMs' in settings.opens)) {
		return 'a free-time plan must open with afterPromptMs';
	}
	return null;
}

/** The first-answer settings of a plan; throws on a plan the mode cannot read. */
export function firstAnswerSettings(plan: RoundPlan): FirstAnswerSettings {
	const problem = settingsProblem(plan.policy.pairing);
	if (problem) throw new RangeError(problem);
	return plan.policy.pairing as FirstAnswerSettings;
}

/** How early a point expectation opens: its tolerance, capped in beats; 0 without one. */
function earlyOf(settings: FirstAnswerSettings, clock: RoundClock, e: Expectation): number {
	if (!('map' in clock) || !('beforeMs' in settings.opens) || !e.at) return 0;
	const { beforeMs, maxBeats } = settings.opens;
	return Math.min(beforeMs / 1000, maxBeats * beatSecondsAt(clock.map, clock.start.add(e.at)));
}

/**
 * The instants of a first-answer round: a plan that opens before its expectations hands over and
 * stops listening that much before its handover, and a chained round shows its prompt at the
 * opening of its first expectation.
 */
export function firstAnswerTimes(
	plan: RoundPlan,
	clock: RoundClock,
	chained: boolean,
	base: RoundTimes
): RoundTimes {
	const settings = firstAnswerSettings(plan);
	if (!('map' in clock) || !('beforeMs' in settings.opens)) return base;
	const at = (position: Fraction) => clock.map.toSeconds(clock.start.add(position));
	const first = plan.expectations[0];
	const handoverS =
		plan.handover && base.handoverS !== null
			? base.handoverS - (first ? earlyOf(settings, clock, first) : 0)
			: null;
	const listenUntilS = plan.listenUntil ? base.listenUntilS : (handoverS ?? base.endS);
	const firstOpening =
		first && first.at
			? at(first.at) - (first.span === 'point' ? earlyOf(settings, clock, first) : 0)
			: null;
	const promptS = chained && firstOpening !== null ? firstOpening : base.promptS;
	return { ...base, promptS, listenUntilS, handoverS };
}

/** The answer zone of each expectation of a first-answer round, on the times the mode gave it. */
export function responseZones(
	plan: RoundPlan,
	clock: RoundClock,
	times: RoundTimes
): ResponseZone[] {
	const settings = firstAnswerSettings(plan);
	if (!('map' in clock)) {
		if (!('afterPromptMs' in settings.opens)) {
			throw new RangeError('a free-time round must open with afterPromptMs');
		}
		const opensS = times.promptS + settings.opens.afterPromptMs / 1000;
		return plan.expectations.map((e, index) => ({
			index,
			sensor: e.sensor,
			span: e.span === 'point' ? 'point' : 'span',
			atS: null,
			opensS,
			inTimeEndS: Infinity,
			captureEndS: Infinity
		}));
	}

	const at = (position: Fraction) => clock.map.toSeconds(clock.start.add(position));
	const beforeMs = 'beforeMs' in settings.opens;
	const { promptS, handoverS, listenUntilS } = times;
	const opensList = plan.expectations.map((e) => {
		if (!e.at) throw new RangeError('a timed plan cannot hold a free-time expectation');
		if (e.span !== 'point') return at(e.at);
		return 'afterPromptMs' in settings.opens
			? promptS + settings.opens.afterPromptMs / 1000
			: at(e.at) - earlyOf(settings, clock, e);
	});
	return plan.expectations.map((e, index): ResponseZone => {
		const atS = at(e.at as Fraction);
		const opensS = opensList[index];
		if (e.span !== 'point') {
			const end = at(e.span.until);
			return {
				index,
				sensor: e.sensor,
				span: 'span',
				atS,
				opensS,
				inTimeEndS: end,
				captureEndS: end
			};
		}
		const inTimeEndS = Math.min(
			atS + settings.lateMs / 1000,
			beforeMs ? (handoverS ?? Infinity) : Infinity
		);
		const nextOpens = opensList[index + 1] ?? Infinity;
		const capture = settings.lateCapture;
		const captureEndS =
			capture === null
				? inTimeEndS
				: capture === 'to-end'
					? Math.min(listenUntilS, nextOpens)
					: Math.min(inTimeEndS + capture.ms / 1000, nextOpens, listenUntilS);
		return { index, sensor: e.sensor, span: 'point', atS, opensS, inTimeEndS, captureEndS };
	});
}
