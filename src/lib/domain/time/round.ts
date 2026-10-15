import type { Fraction } from './fraction';
import type { LevelParams } from './levels';
import type { RoundPlan } from './plan';
import type { TempoMap } from './tempoMap';
import { alignAttacks, alignContext, captureLeadIn, timeExpectations } from './judge/align';
import {
	cycleReport,
	cycleVerdict,
	type CycleReport,
	type CycleVerdict,
	type Measures
} from './judge/measures';

/** The sensor a rhythm plan listens to when its expectations do not name one. */
export const RHYTHM_SENSOR = 'attack';

/** What a round showed or played for the player: recorded with the outcome, so a result is read with its aids. */
export type Aid = 'show-position' | 'string-aid' | 'cursor' | 'listen' | 'play-along' | 'aid-level';

/**
 * A verdict the core carries without reading: the relation that judged it and the version of
 * its value's shape say how to interpret `value`.
 */
export interface VerdictEnvelope {
	relation: string;
	version: number;
	value: unknown;
}

/**
 * What a round hands to the core on the target contract. `success` is the relation's word on
 * whether the round passed; `correct` is the judge's word on the content played, `null` when
 * the round has none (a cycle judges time only).
 */
export interface RoundOutcome {
	success: boolean;
	correct: boolean | null;
	verdict: VerdictEnvelope;
	measures: Measures;
	aids: Aid[];
	detail: unknown;
}

/** An observation a sensor made, as a plan round sees it: `time` in audio seconds, latency already removed. */
export interface PlanObservation {
	time: number;
	sensor: string;
	readable: boolean;
	payload: unknown;
}

/** The fate of an observation offered to a plan round. */
export type PlanFate = 'answer' | 'other-sensor' | 'unreadable' | 'after-capture';

/** The version of the shape of a cycle verdict (`CycleVerdict`). */
export const CYCLE_VERDICT_VERSION = 1;

/**
 * The round of a plan whose unit is the whole cycle: it keeps the attacks heard in its capture
 * window and judges them together once settled (`settle`). Pure: time comes from the
 * observations, never from a clock.
 *
 * The capture window is `[startTime - lead, endTime - lead)`, where `lead` (`captureLeadIn`)
 * is the zone before the plan's first expectation when the plan loops (shortened so that the
 * zone after its last expectation stays inside the window; 0 for a plan that does not loop). The round
 * listens over its own expectations' zones, not over its bar: a downbeat played a few ms early
 * belongs to the cycle it opens, a last note played late to the cycle it closes, and cycles of one
 * plan chained end to end tile time with no gap and no overlap. An observation outside the window
 * is not this round's, whatever it is: the controller gives it to the neighbouring round
 * (`'after-capture'`). Inside, only a readable observation of the plan's sensor is kept as an
 * attack. `startTime` and `endTime` stay the bar span of the cycle.
 */
export class PlanRound {
	/** Audio seconds at which the cycle opens. */
	readonly startTime: number;
	/** Audio seconds at which the cycle ends (excluded). */
	readonly endTime: number;

	readonly #plan: RoundPlan;
	readonly #map: TempoMap;
	readonly #start: Fraction;
	readonly #latency: CycleReport['latency'];
	readonly #thresholds: LevelParams['thresholds'];
	readonly #aids: Aid[];
	readonly #sensors: Set<string>;
	/** Seconds before `startTime` (and `endTime`) at which the capture window opens (and closes). */
	readonly #lead: number;
	#attacks: number[] = [];
	#settled = false;

	constructor(input: {
		plan: RoundPlan;
		map: TempoMap;
		start: Fraction;
		latency: CycleReport['latency'];
		thresholds: LevelParams['thresholds'];
		aids: Aid[];
	}) {
		this.#plan = input.plan;
		this.#map = input.map;
		this.#start = input.start;
		this.#latency = input.latency;
		this.#thresholds = input.thresholds;
		this.#aids = [...input.aids];
		const sensors = new Set(input.plan.expectations.map((e) => e.sensor));
		this.#sensors = sensors.size > 0 ? sensors : new Set([RHYTHM_SENSOR]);
		this.startTime = input.map.toSeconds(input.start);
		this.endTime = input.map.toSeconds(input.start.add(input.plan.length));
		this.#lead = captureLeadIn(input.plan, input.map, input.start);
	}

	/** Keeps a readable observation of an expected sensor; returns its fate. */
	observe(observation: PlanObservation): PlanFate {
		if (
			this.#settled ||
			observation.time < this.startTime - this.#lead ||
			observation.time >= this.endTime - this.#lead
		) {
			return 'after-capture';
		}
		if (!this.#sensors.has(observation.sensor)) return 'other-sensor';
		if (!observation.readable) return 'unreadable';
		this.#attacks.push(observation.time);
		return 'answer';
	}

	/**
	 * Settles the cycle: the alignment of what it kept, reported, then judged against the
	 * thresholds. The round is closed afterwards; settling again gives the same outcome.
	 */
	settle(): RoundOutcome {
		this.#settled = true;
		const expectations = timeExpectations(this.#plan, this.#map, this.#start);
		const alignment = alignAttacks(
			expectations,
			this.#attacks,
			alignContext(this.#plan, this.#map, this.#start)
		);
		const report = cycleReport({
			alignment,
			expectations,
			mutedBars: this.#plan.mutedBars,
			latency: this.#latency
		});
		const value: CycleVerdict = cycleVerdict(report, this.#thresholds);
		return {
			success: value.passed,
			correct: null,
			verdict: { relation: 'cycle', version: CYCLE_VERDICT_VERSION, value },
			measures: report.measures,
			aids: [...this.#aids],
			detail: report
		};
	}
}
