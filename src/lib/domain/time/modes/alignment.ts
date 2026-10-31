import {
	alignAttacks,
	alignContext,
	alignPlain,
	captureLeadIn,
	timeExpectations,
	type TimedExpectation
} from '../judge/align';
import type { Fraction } from '../fraction';
import type { Judged, RoundPlan } from '../plan';
import type { TempoMap } from '../tempoMap';
import type { RoundTimes } from './times';
import type {
	Attack,
	IgnoreReason,
	LiveReading,
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
 * alignment (`alignAttacks`) when the result is asked. An attack outside the window belongs to a
 * neighbour (`after-capture`). Each attack keeps what it sounded: of its readings (one time, one
 * attack), the last final one, else the last received. Against an expectation with content, an
 * attack is judged (`PairingContext.judge`) on that reading: the alignment prefers pairing it
 * where it fits, and a pair keeps its judgment (`PairedAnswer.judged`).
 */
class AlignmentPairing implements Pairing {
	private readonly map;
	private readonly start;
	private readonly opensS: number;
	private readonly closesS: number;
	/** The reading kept of each attack, by its time. */
	private readonly kept = new Map<number, { payload: unknown; final: boolean }>();
	private readonly timed: TimedExpectation[];
	/** What `live` has told, by expectation: never taken back. */
	private readonly told = new Map<number, LiveReading['expectations'][number]>();
	/** The attacks `live` has told, as an answer or as added. */
	private readonly toldAttacks = new Set<number>();
	private readonly extraAtMs: number[] = [];

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
		this.timed = timeExpectations(plan, clock.map, clock.start);
	}

	offer(attack: Attack): { fate: 'answer' | IgnoreReason; judged: null } {
		if (attack.time < this.opensS || attack.time >= this.closesS) {
			return { fate: 'after-capture', judged: null };
		}
		// Another reading of an attack already kept is the same attack, not an added one: it
		// replaces the reading kept unless that one was final and this one is not.
		const kept = this.kept.get(attack.time);
		if (!kept || attack.final || !kept.final) {
			this.kept.set(attack.time, { payload: attack.payload, final: attack.final });
		}
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
		const attacks = [...this.kept.keys()].sort((a, b) => a - b);
		const judgments = new Map<string, Judged | null>();
		const judged = (expectation: number, attack: number): Judged | null => {
			const key = `${expectation}:${attack}`;
			if (!judgments.has(key)) {
				const payload = this.kept.get(attacks[attack])?.payload;
				judgments.set(key, this.context.judge(expectation, payload));
			}
			return judgments.get(key) ?? null;
		};
		const fits = (expectation: number, attack: number): boolean =>
			plan.expectations[expectation].content === null ||
			judged(expectation, attack)?.correct === true;
		const alignment = alignAttacks(
			timeExpectations(plan, this.map, this.start),
			attacks,
			alignContext(plan, this.map, this.start),
			fits
		);
		return {
			pairs: alignment.pairs.map((p) => ({
				expectation: p.expectation,
				time: attacks[p.attack],
				judged: judged(p.expectation, p.attack),
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

	/**
	 * Only what is still undecided is aligned, so its cost does not grow with the round. A right
	 * note whose reading is final is told at once; anything else waits for its zone to close, a
	 * right note may still come in it. An attack outside every zone still open is told as added.
	 */
	live(now: number): LiveReading {
		const { plan } = this.context;
		const open = this.timed.filter((e) => !this.told.has(e.index) && e.time - e.zoneS <= now);
		const attacks = [...this.kept.keys()]
			.filter((time) => !this.toldAttacks.has(time))
			.sort((a, b) => a - b);
		const fits = (expectation: number, attack: number): boolean =>
			plan.expectations[expectation].content === null ||
			this.context.judge(expectation, this.kept.get(attacks[attack])?.payload)?.correct === true;
		const closed = (index: number): boolean => {
			const e = this.timed.find((t) => t.index === index);
			return e !== undefined && e.time + e.zoneS <= now;
		};
		const path = alignPlain(open, attacks, fits);
		for (const { expectation, attack, offsetMs, verdict, fits: right } of path.pairs) {
			const time = attacks[attack];
			if (!closed(expectation) && !(right && this.kept.get(time)?.final)) continue;
			this.told.set(expectation, {
				index: expectation,
				verdict: right ? verdict : 'wrong-pitch',
				offsetMs
			});
			this.toldAttacks.add(time);
		}
		for (const expectation of path.missed) {
			if (closed(expectation)) {
				this.told.set(expectation, { index: expectation, verdict: 'missed', offsetMs: null });
			}
		}
		for (const attack of path.extra) {
			const time = attacks[attack];
			const taken = this.timed.some(
				(e) => !this.told.has(e.index) && Math.abs(time - e.time) <= e.zoneS
			);
			if (taken) continue;
			this.toldAttacks.add(time);
			this.extraAtMs.push((time - this.map.toSeconds(this.start)) * 1000);
		}
		return {
			expectations: [...this.told.values()].sort((a, b) => a.index - b.index),
			extraAtMs: [...this.extraAtMs].sort((a, b) => a - b)
		};
	}

	liveWakes(): number[] {
		return this.timed.map((e) => e.time + e.zoneS);
	}
}

/**
 * Null when the alignment can pair the plan, else what it cannot: it times attacks of one sensor
 * against points on the tempo map (their content, when they ask for one, judged on each pair).
 */
function validateAlignment(plan: RoundPlan): string | null {
	for (const [i, e] of plan.expectations.entries()) {
		if (e.at === null)
			return `expectation ${i} is in free time: an alignment times attacks on the tempo map`;
		if (e.span !== 'point')
			return `expectation ${i} is a stretch: an alignment times each attack against a point`;
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
