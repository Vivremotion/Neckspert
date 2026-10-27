import { alignAttacks, alignContext, captureLeadIn, timeExpectations } from '../judge/align';
import type { Fraction } from '../fraction';
import type { RoundPlan } from '../plan';
import type { TempoMap } from '../tempoMap';
import type { RoundTimes } from './times';
import type {
	Attack,
	IgnoreReason,
	Pairing,
	PairingContext,
	PairingMode,
	PairingResult
} from './types';

/**
 * The capture window of an aligned round, in audio seconds: `[opensS, closesS)`. A plan that loops
 * (its handover is its end) captures `[startS - lead, endS - lead)` (`captureLeadIn`), so cycles of
 * one plan chained end to end tile time with no gap and no overlap. One that does not loop opens
 * its first target's zone before its start, so a first attack a little early is heard, and closes
 * at its end. Either closes where its plan stops listening (`listenUntil`) when that comes first.
 */
export function alignmentCapture(
	plan: RoundPlan,
	map: TempoMap,
	start: Fraction,
	times: RoundTimes
): { opensS: number; closesS: number } {
	const loops = plan.handover !== undefined && plan.handover.equals(plan.length);
	const lead = loops ? captureLeadIn(plan, map, start) : 0;
	const before = loops ? lead : (timeExpectations(plan, map, start)[0]?.zoneS ?? 0);
	const end = times.endS - lead;
	return {
		opensS: times.startS - before,
		closesS: plan.listenUntil ? Math.min(end, times.listenUntilS) : end
	};
}

/**
 * The attacks of a round's capture window (`alignmentCapture`), paired once by the optimal
 * alignment (`alignAttacks`) when the result is asked. Content is not judged. An attack outside
 * the window belongs to a neighbour (`after-capture`).
 */
class AlignmentPairing implements Pairing {
	private readonly map;
	private readonly start;
	private readonly opensS: number;
	private readonly closesS: number;
	private kept: number[] = [];

	constructor(private readonly context: PairingContext) {
		const { clock, plan, times } = context;
		if (!('map' in clock)) throw new RangeError('an alignment needs a tempo map');
		this.map = clock.map;
		this.start = clock.start;
		({ opensS: this.opensS, closesS: this.closesS } = alignmentCapture(
			plan,
			clock.map,
			clock.start,
			times
		));
	}

	offer(attack: Attack): { fate: 'answer' | IgnoreReason; judged: null } {
		if (attack.time < this.opensS || attack.time >= this.closesS) {
			return { fate: 'after-capture', judged: null };
		}
		// Another reading of an attack already kept is the same attack, not an added one.
		if (!this.kept.includes(attack.time)) this.kept.push(attack.time);
		return { fate: 'answer', judged: null };
	}

	advance(): void {}

	/** Over exactly where `offer` stops taking attacks: one it can still take never finds it done. */
	done(now: number): boolean {
		return now >= this.closesS;
	}

	droppable(): boolean {
		return false;
	}

	shownMisses(): number[] {
		return [];
	}

	result(): PairingResult {
		const { plan } = this.context;
		const attacks = [...this.kept].sort((a, b) => a - b);
		const alignment = alignAttacks(
			timeExpectations(plan, this.map, this.start),
			attacks,
			alignContext(plan, this.map, this.start)
		);
		return {
			pairs: alignment.pairs.map((p) => ({
				expectation: p.expectation,
				time: attacks[p.attack],
				judged: null,
				late: false,
				pending: false,
				correction: null,
				timing: p.verdict,
				offsetMs: p.offsetMs
			})),
			missed: alignment.missed,
			dropped: alignment.dropped,
			extra: alignment.extra.map((i) => attacks[i]),
			shift: alignment.shift,
			clampedWindows: alignment.clampedWindows,
			attacks
		};
	}
}

/**
 * Null when the alignment can pair the plan, else what it cannot: it times attacks of one sensor
 * against points on the tempo map, and judges no content.
 */
function validateAlignment(plan: RoundPlan): string | null {
	for (const [i, e] of plan.expectations.entries()) {
		if (e.at === null)
			return `expectation ${i} is in free time: an alignment times attacks on the tempo map`;
		if (e.span !== 'point')
			return `expectation ${i} is a stretch: an alignment times each attack against a point`;
		if (e.content !== null) {
			return `expectation ${i} asks for content (${e.content.kind}): an alignment times attacks and judges no content`;
		}
	}
	const twin = plan.expectations.findIndex(
		(e, i) => i > 0 && e.at !== null && e.at.equals(plan.expectations[i - 1].at as Fraction)
	);
	if (twin > 0) {
		return `expectations ${twin - 1} and ${twin} fall at the same place: an alignment pairs one attack with one place`;
	}
	const sensors = [...new Set(plan.expectations.map((e) => e.sensor))];
	if (sensors.length > 1) {
		return `its expectations are heard by ${sensors.join(', ')}: an alignment pairs the attacks of one sensor, by time alone`;
	}
	return null;
}

export const alignmentPairing: PairingMode = {
	id: 'alignment',
	validate: validateAlignment,
	create: (context) => new AlignmentPairing(context)
};
