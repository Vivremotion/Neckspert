import type { Fraction } from '../fraction';
import type { RoundPlan } from '../plan';
import type { RoundClock } from './types';

/** The one tolerance at the edge of a zone, in seconds. */
export const EDGE_TOLERANCE_S = 1e-6;

/** The instants of a round, in audio seconds. */
export interface RoundTimes {
	promptS: number;
	startS: number;
	endS: number;
	listenUntilS: number;
	handoverS: number | null;
}

/**
 * The instants of a round that no mode decides: its start and end, and its prompt, handover and
 * end of listening where its plan puts them (`listenUntil`, else `handover`, else its end). A
 * pairing mode that shifts them gives its own (`PairingMode.times`).
 */
export function roundTimes(plan: RoundPlan, clock: RoundClock): RoundTimes {
	if (!('map' in clock)) {
		const { promptS } = clock;
		return { promptS, startS: promptS, endS: promptS, listenUntilS: Infinity, handoverS: null };
	}
	const { map, start } = clock;
	const at = (position: Fraction) => map.toSeconds(start.add(position));
	const startS = map.toSeconds(start);
	const endS = at(plan.length);
	const handoverS = plan.handover ? at(plan.handover) : null;
	const listenUntilS = plan.listenUntil ? at(plan.listenUntil) : (handoverS ?? endS);
	const promptS = plan.prompt ? at(plan.prompt) : startS;
	return { promptS, startS, endS, listenUntilS, handoverS };
}
