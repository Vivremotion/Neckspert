import { Fraction } from '../fraction';
import type { Expectation, RoundPlan } from '../plan';
import { beatSecondsAt } from '../tempoMap';
import type { RoundClock } from './types';

/** The one tolerance at the edge of a zone, in seconds. */
export const EDGE_TOLERANCE_S = 1e-6;

export interface ResponseZone {
	index: number; // in the plan
	sensor: string;
	span: 'point' | 'span';
	atS: number | null; // null in free time
	opensS: number; // an attack from here may answer
	inTimeEndS: number; // after it, a right answer is off the beat (point) or none (span)
	captureEndS: number; // after it, no attack answers this expectation
}

export interface RoundTimes {
	promptS: number;
	startS: number;
	endS: number;
	listenUntilS: number;
	handoverS: number | null;
	/** One per expectation, for a first-answer plan; empty otherwise. */
	zones: ResponseZone[];
}

/** The instants of a round: its prompt, its end, and the answer zone of each expectation. */
export function roundTimes(plan: RoundPlan, clock: RoundClock, chained: boolean): RoundTimes {
	const pairing = plan.policy.pairing;
	if (!('map' in clock)) return freeTimeTimes(plan, clock.promptS);

	const { map, start } = clock;
	const at = (position: Fraction) => map.toSeconds(start.add(position));
	const startS = map.toSeconds(start);
	const endS = at(plan.length);
	const beforeMs = pairing.mode === 'first-answer' && 'beforeMs' in pairing.opens;

	// How early a point expectation opens: its tolerance, capped in beats.
	const earlyOf = (e: Expectation): number => {
		if (pairing.mode !== 'first-answer' || !('beforeMs' in pairing.opens) || !e.at) return 0;
		const { beforeMs, maxBeats } = pairing.opens;
		return Math.min(beforeMs / 1000, maxBeats * beatSecondsAt(map, start.add(e.at)));
	};
	const openingOf = (e: Expectation): number | null => {
		if (!beforeMs || !e.at) return null;
		return at(e.at) - (e.span === 'point' ? earlyOf(e) : 0);
	};

	const first = plan.expectations[0];
	const handoverS = plan.handover
		? at(plan.handover) - (beforeMs && first ? earlyOf(first) : 0)
		: null;
	const listenUntilS = plan.listenUntil ? at(plan.listenUntil) : (handoverS ?? endS);
	const firstOpening = first ? openingOf(first) : null;
	const promptS =
		chained && firstOpening !== null ? firstOpening : plan.prompt ? at(plan.prompt) : startS;

	if (pairing.mode !== 'first-answer') {
		return { promptS, startS, endS, listenUntilS, handoverS, zones: [] };
	}

	const opensList = plan.expectations.map((e) => {
		if (!e.at) throw new RangeError('a timed plan cannot hold a free-time expectation');
		if (e.span !== 'point') return at(e.at);
		return 'afterPromptMs' in pairing.opens
			? promptS + pairing.opens.afterPromptMs / 1000
			: at(e.at) - earlyOf(e);
	});
	const zones = plan.expectations.map((e, index): ResponseZone => {
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
			atS + pairing.lateMs / 1000,
			beforeMs ? (handoverS ?? Infinity) : Infinity
		);
		const nextOpens = opensList[index + 1] ?? Infinity;
		const capture = pairing.lateCapture;
		const captureEndS =
			capture === null
				? inTimeEndS
				: capture === 'to-end'
					? Math.min(listenUntilS, nextOpens)
					: Math.min(inTimeEndS + capture.ms / 1000, nextOpens, listenUntilS);
		return { index, sensor: e.sensor, span: 'point', atS, opensS, inTimeEndS, captureEndS };
	});
	return { promptS, startS, endS, listenUntilS, handoverS, zones };
}

function freeTimeTimes(plan: RoundPlan, promptS: number): RoundTimes {
	const pairing = plan.policy.pairing;
	const zones: ResponseZone[] = [];
	if (pairing.mode === 'first-answer') {
		if (!('afterPromptMs' in pairing.opens)) {
			throw new RangeError('a free-time round must open with afterPromptMs');
		}
		const opensS = promptS + pairing.opens.afterPromptMs / 1000;
		for (const [index, e] of plan.expectations.entries()) {
			zones.push({
				index,
				sensor: e.sensor,
				span: e.span === 'point' ? 'point' : 'span',
				atS: null,
				opensS,
				inTimeEndS: Infinity,
				captureEndS: Infinity
			});
		}
	}
	return {
		promptS,
		startS: promptS,
		endS: promptS,
		listenUntilS: Infinity,
		handoverS: null,
		zones
	};
}
