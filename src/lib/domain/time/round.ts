import type { ContentJudges, Judged, RoundPlan } from './plan';
import type { CycleReport, CycleThresholds, Measures } from './judge/measures';
import { ROUND_MODES } from './modes';
import type {
	ObservationFate,
	Pairing,
	PairingMode,
	RoundClock,
	RoundModes,
	VerdictContext,
	VerdictMode
} from './modes/types';
import { roundTimes } from './modes/times';

/** The sensor a rhythm plan listens to when its expectations do not name one. */
export const RHYTHM_SENSOR = 'attack';

/** Every aid a round can give; `Aid` is read from it, so the two never part. */
export const AIDS = [
	'show-position',
	'string-aid',
	'cursor',
	'listen',
	'play-along',
	'aid-level'
] as const;

/** What a round showed or played for the player: recorded with the outcome, so a result is read with its aids. */
export type Aid = (typeof AIDS)[number];

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
	/** The sensor will not revise this reading. */
	final?: boolean;
}

/** What a round says after an observation or as time passes. */
export type RoundEvent =
	| { kind: 'none' }
	| { kind: 'pending' }
	| { kind: 'provisional'; outcome: RoundOutcome }
	| { kind: 'settled'; outcome: RoundOutcome };

/** What became of an observation offered to a round, and what the round says now. */
export interface Observed {
	fate: ObservationFate;
	/** The content judge's word on it; null when nothing was judged. */
	judged: Judged | null;
	event: RoundEvent;
}

/**
 * The round of any plan: it routes what is heard to the pairing mode its plan names and turns
 * what was paired into an outcome with the verdict mode it names, both read from `modes`. It
 * names no mode itself. Pure: time comes from the observations and from `advance`, never from a
 * clock.
 *
 * An observation of a sensor the plan does not listen to is `'other-sensor'`, an unreadable one
 * `'unreadable'`; once the round is settled every other one is `'settled'`, the modes no longer
 * asked. The round settles when its pairing has decided every expectation (`done`); before, a
 * miss newly shown is told as a provisional outcome. Closed early, a round with nothing heard
 * whose first zone is still open is dropped (`close` gives null).
 */
export class PlanRound {
	/** Audio seconds at which the round opens. */
	readonly startTime: number;
	/** Audio seconds at which the round ends (excluded). */
	readonly endTime: number;
	/** Audio seconds at which the prompt shows. */
	readonly promptTime: number;
	/** Audio seconds after which the round listens no more. */
	readonly listenUntilTime: number;
	/** Audio seconds at which the next round opens without a gap; null without a handover. */
	readonly handoverTime: number | null;

	readonly #pairing: Pairing;
	readonly #verdict: VerdictMode;
	readonly #context: VerdictContext;
	readonly #sensors: Set<string>;
	readonly #shown = new Set<number>();
	#settled = false;

	constructor(input: {
		plan: RoundPlan;
		clock: RoundClock;
		chained?: boolean;
		judges: ContentJudges;
		latency: CycleReport['latency'];
		thresholds: CycleThresholds | null;
		aids: Aid[];
		modes?: RoundModes;
	}) {
		const { plan, clock, judges } = input;
		const modes = input.modes ?? ROUND_MODES;
		const pairingId = plan.policy.pairing.mode;
		const pairingMode: PairingMode | undefined = Object.hasOwn(modes.pairings, pairingId)
			? modes.pairings[pairingId]
			: undefined;
		if (!pairingMode) throw new Error(`unknown pairing mode: ${pairingId}`);
		const verdictId = plan.policy.verdict;
		const verdict = Object.hasOwn(modes.verdicts, verdictId)
			? modes.verdicts[verdictId]
			: undefined;
		if (!verdict) throw new Error(`unknown verdict mode: ${verdictId}`);

		const problem = pairingMode.validate?.(plan) ?? null;
		if (problem) throw new RangeError(`plan unfit for pairing mode ${pairingId}: ${problem}`);
		const verdictProblem = verdict.validate?.(plan) ?? null;
		if (verdictProblem) {
			throw new RangeError(`plan unfit for verdict mode ${verdictId}: ${verdictProblem}`);
		}
		const base = roundTimes(plan, clock);
		const times = pairingMode.times
			? pairingMode.times(plan, clock, input.chained ?? false, base)
			: base;
		this.startTime = times.startS;
		this.endTime = times.endS;
		this.promptTime = times.promptS;
		this.listenUntilTime = times.listenUntilS;
		this.handoverTime = times.handoverS;

		const sensors = new Set(plan.expectations.map((e) => e.sensor));
		this.#sensors = sensors.size > 0 ? sensors : new Set([RHYTHM_SENSOR]);
		this.#verdict = verdict;
		this.#context = {
			plan,
			times,
			clock,
			latency: input.latency,
			thresholds: input.thresholds,
			aids: [...input.aids]
		};
		this.#pairing = pairingMode.create({
			plan,
			times,
			clock,
			judge: (index, payload) => {
				const content = plan.expectations[index]?.content;
				return content ? judges(content.kind).judge(content.value, payload) : null;
			}
		});
	}

	/** Offers an observation to the round's pairing; says what became of it and what the round says now. */
	observe(observation: PlanObservation): Observed {
		if (!this.#sensors.has(observation.sensor)) {
			return { fate: 'other-sensor', judged: null, event: { kind: 'none' } };
		}
		if (!observation.readable) {
			return { fate: 'unreadable', judged: null, event: { kind: 'none' } };
		}
		if (this.#settled) return { fate: 'settled', judged: null, event: { kind: 'none' } };
		const { fate, judged } = this.#pairing.offer({
			time: observation.time,
			sensor: observation.sensor,
			final: observation.final ?? true,
			payload: observation.payload
		});
		// Only an attack taken moves the round; time alone moves it through `advance`.
		if (fate !== 'answer') return { fate, judged, event: { kind: 'none' } };
		return { fate, judged, event: this.#evaluate(observation.time, true) };
	}

	/** Lets time pass up to `now`: the round may settle, or show a miss. */
	advance(now: number): RoundEvent {
		if (this.#settled) return { kind: 'none' };
		this.#pairing.advance(now);
		return this.#evaluate(now, false);
	}

	/** Settles as it stands; null when the round is dropped (nothing heard, still open) or already settled. */
	close(now: number): RoundOutcome | null {
		if (this.#settled) return null;
		this.#settled = true;
		// Time passes first: a reading the pairing decides by now is final in the outcome.
		this.#pairing.advance(now);
		if (this.#pairing.droppable(now)) return null;
		return this.#outcome();
	}

	#evaluate(now: number, answered: boolean): RoundEvent {
		if (this.#pairing.done(now)) {
			this.#settled = true;
			return { kind: 'settled', outcome: this.#outcome() };
		}
		const fresh = this.#pairing.shownMisses(now).filter((index) => !this.#shown.has(index));
		if (fresh.length > 0) {
			for (const index of fresh) this.#shown.add(index);
			return { kind: 'provisional', outcome: this.#outcome() };
		}
		return answered ? { kind: 'pending' } : { kind: 'none' };
	}

	#outcome(): RoundOutcome {
		return this.#verdict.outcome(this.#pairing.result(), this.#context);
	}
}
