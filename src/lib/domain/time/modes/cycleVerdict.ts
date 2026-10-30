import { timeExpectations, type Alignment } from '../judge/align';
import { cycleReport, cycleVerdict, type CycleVerdict } from '../judge/measures';
import type { RoundPlan } from '../plan';
import type { RoundOutcome } from '../round';
import { alignmentPairing } from './alignment';
import type { PairingResult, VerdictContext, VerdictMode } from './types';

/** The pairing whose timed pairs the cycle verdict reads. */
const ALIGNMENT = alignmentPairing.id;

/** The version of the shape of a cycle verdict (`CycleVerdict`). */
export const CYCLE_VERDICT_VERSION = 1;

/**
 * The alignment a pairing result came from, attacks indexed in `result.attacks`; a pair fits
 * unless its judgment says otherwise (none for an expectation without content).
 */
function alignmentOf(result: PairingResult): Alignment {
	const indexOf = (time: number): number => {
		const index = result.attacks.indexOf(time);
		if (index < 0) throw new RangeError('a paired attack is missing from the attacks kept');
		return index;
	};
	return {
		pairs: result.pairs.map((p) => {
			if (p.timing === null || p.offsetMs === null) {
				throw new RangeError('a cycle verdict needs pairs timed by the alignment');
			}
			return {
				expectation: p.expectation,
				attack: indexOf(p.time),
				offsetMs: p.offsetMs,
				verdict: p.timing,
				fits: p.judged === null || p.judged.correct
			};
		}),
		missed: [...result.missed],
		dropped: [...result.dropped],
		extra: result.extra.map(indexOf),
		shift: result.shift,
		clampedWindows: result.clampedWindows
	};
}

/**
 * A whole cycle judged at once: the alignment reported (`cycleReport`), then judged against the
 * level's thresholds (`cycleVerdict`). `correct` is null: a note judged wrong shows in the report
 * (`wrong-pitch`).
 */
export const cycleVerdictMode: VerdictMode = {
	id: 'cycle',
	readsThresholds: true,
	validate(plan: RoundPlan): string | null {
		if (plan.policy.unit !== 'cycle') {
			return `a cycle verdict judges a whole cycle (unit "cycle"), got unit "${plan.policy.unit}"`;
		}
		if (plan.policy.pairing.mode !== ALIGNMENT) {
			return `a cycle verdict needs pairs timed by the alignment (pairing "${ALIGNMENT}"), got "${plan.policy.pairing.mode}"`;
		}
		const free = plan.expectations.findIndex((e) => e.at === null);
		if (free >= 0) return `a cycle verdict needs a tempo map: expectation ${free} is in free time`;
		return null;
	},
	outcome(result: PairingResult, context: VerdictContext): RoundOutcome {
		const { plan, clock, thresholds } = context;
		if (thresholds === null) throw new RangeError('a cycle verdict needs thresholds');
		if (!('map' in clock)) throw new RangeError('a cycle verdict needs a tempo map');
		const { map, start } = clock;
		const report = cycleReport({
			alignment: alignmentOf(result),
			expectations: timeExpectations(plan, map, start),
			attacks: result.attacks,
			startS: map.toSeconds(start),
			mutedBars: plan.mutedBars,
			latency: context.latency
		});
		const value: CycleVerdict = cycleVerdict(report, thresholds);
		return {
			success: value.passed,
			correct: null,
			verdict: { relation: 'cycle', version: CYCLE_VERDICT_VERSION, value },
			measures: report.measures,
			aids: [...context.aids],
			detail: report
		};
	}
};
