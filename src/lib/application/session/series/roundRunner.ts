import { contentJudges } from '$lib/domain/judges';
import {
	Fraction,
	PlanRound,
	POSITION_RESOLUTION,
	segmentAt,
	type CycleReport,
	type RoundEvent,
	type RoundOutcome,
	type RoundPlan,
	type TempoMap
} from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';
import type { SensorKind } from '$lib/application/mechanics/types';
import { aidsOf } from '../aids';
import { ObservationSpan } from '../observationSpan';
import type { Observation, ObservationSource } from '../sensors';
import type { Transport } from '../transport';

/** What a round tells its controller: a miss shown while it listens on, or its settlement (once). */
export type RunnerEvent =
	{ kind: 'provisional'; outcome: RoundOutcome } | { kind: 'settled'; outcome: RoundOutcome };

/** Absorbs the float error of a beat falling exactly on an instant of the round. */
const TIME_EPSILON_S = 1e-9;

/**
 * One round on the transport: opens its PlanRound, tells the sensors what to listen for, routes
 * observations into its span, wakes the round, settles it.
 *
 * It wakes the round (`advance`) on every beat of the map from the prompt to the end of
 * listening (`listenUntilTime`), and at the end of listening itself when no beat falls there.
 * It does not wake at the handover, nor at any beat from it on: the controller closes the round
 * there (`close`), after the expectations are withdrawn, so that what a sensor reports at once (a
 * window cut short) lands in the round that ends; a wake-up there would settle it first.
 *
 * The span opens with the round and stays open after the settlement (what comes until the next
 * round is kept, as `'settled'`); the controller closes it at the next round's opening.
 */
export class RoundRunner {
	readonly span: ObservationSpan;
	/** Audio seconds of the handover, when the round has one. */
	readonly handoverTime: number | null;

	readonly #round: PlanRound;
	readonly #plan: RoundPlan;
	readonly #sources: ReadonlyMap<SensorKind, ObservationSource>;
	readonly #onEvent: (event: RunnerEvent) => void;
	#wakeUps: (() => void)[] = [];
	#settled = false;
	/** `close` is withdrawing the expectations: a settlement then is returned by `close`. */
	#closing = false;
	#closedWith: RoundOutcome | null = null;
	#withdrawn = false;

	constructor(input: {
		plan: RoundPlan;
		item: PlannedItem;
		/** Bar position of the round's start on the transport (fractions allowed). */
		at: Fraction;
		chained: boolean;
		transport: Transport;
		map: TempoMap;
		latency: CycleReport['latency'];
		sources: ReadonlyMap<SensorKind, ObservationSource>;
		expectation: Partial<Record<SensorKind, unknown>>;
		onEvent: (event: RunnerEvent) => void;
	}) {
		const { plan, transport, map } = input;
		this.#plan = plan;
		this.#sources = input.sources;
		this.#onEvent = input.onEvent;
		// Transport bars are bar numbers; the map's positions are whole notes.
		const barLength = transport.barLength;
		const start = input.at.mul(barLength);
		this.#round = new PlanRound({
			plan,
			clock: { map, start },
			chained: input.chained,
			judges: contentJudges,
			latency: input.latency,
			thresholds: null,
			aids: aidsOf(input.item)
		});
		this.handoverTime = this.#round.handoverTime;
		this.span = new ObservationSpan(this.#round.promptTime, input.item);
		for (const [kind, source] of this.#sources) source.expect?.(input.expectation[kind] ?? null);

		for (const position of this.#wakePositions(map, start)) {
			const time = map.toSeconds(position);
			this.#wakeUps.push(transport.at(position.div(barLength), () => this.#wake(time)));
		}
	}

	/** Files an observation in the span with its fate and the judge's word, as it arrives. */
	observe(sensor: SensorKind, observation: Observation): void {
		if (!observation.readable) {
			this.span.add(sensor, observation, 'unreadable', null);
			return;
		}
		const observed = this.#round.observe({
			time: observation.time,
			sensor,
			readable: true,
			payload: observation.payload,
			final: observation.final
		});
		const correct =
			observed.fate === 'other-sensor'
				? null
				: (observed.judged?.correct ?? this.#judge(sensor, observation.payload));
		// Kept before the event is told: an attempt written on it includes its answer.
		this.span.add(sensor, observation, observed.fate, correct);
		this.#tell(observed.event);
	}

	/**
	 * Withdraws the expectations, then closes the round at `now` (null: dropped, nothing heard,
	 * or already settled and told). What a sensor reports during the withdrawal goes into the round
	 * first; if it settles the round, that settlement is the one returned, not told by `onEvent`.
	 */
	close(now: number): RoundOutcome | null {
		this.cancel();
		this.#closing = true;
		this.withdraw();
		const outcome = this.#closedWith ?? (this.#settled ? null : this.#round.close(now));
		this.#settled = true;
		return outcome;
	}

	/**
	 * Tells every sensor to listen for nothing more, once: what one reports then still goes into
	 * this round's span. The controller calls it before the span closes.
	 */
	withdraw(): void {
		if (this.#withdrawn) return;
		this.#withdrawn = true;
		for (const source of this.#sources.values()) source.expect?.(null);
	}

	/** Cancels every wake-up (pause, quit). */
	cancel(): void {
		for (const cancel of this.#wakeUps) cancel();
		this.#wakeUps = [];
	}

	#wake(time: number): void {
		this.#tell(this.#round.advance(time));
	}

	#tell(event: RoundEvent): void {
		if (this.#settled) return;
		if (event.kind === 'settled') {
			this.#settled = true;
			this.cancel();
			if (this.#closing) this.#closedWith = event.outcome;
			else this.#onEvent(event);
		} else if (event.kind === 'provisional' && !this.#closing) {
			this.#onEvent(event);
		}
	}

	/**
	 * The judge's word on a payload the round did not judge (heard outside every zone, or after
	 * the settlement): the content of the first expectation of its sensor; null without one.
	 */
	#judge(sensor: SensorKind, payload: unknown): boolean | null {
		const content = this.#plan.expectations.find((e) => e.sensor === sensor && e.content)?.content;
		return content ? contentJudges(content.kind).judge(content.value, payload).correct : null;
	}

	/**
	 * Beats of the map from the prompt to the end of listening, short of the handover; without a
	 * handover, the end of listening too when it falls between beats.
	 */
	#wakePositions(map: TempoMap, start: Fraction): Fraction[] {
		const { promptTime, listenUntilTime, handoverTime } = this.#round;
		const inRound = (time: number) =>
			time <= listenUntilTime + TIME_EPSILON_S &&
			(handoverTime === null || time < handoverTime - TIME_EPSILON_S);
		const unit = segmentAt(map, start).unit;
		let beat = start;
		while (map.toSeconds(beat) > promptTime + TIME_EPSILON_S) beat = beat.sub(unit);
		while (map.toSeconds(beat) < promptTime - TIME_EPSILON_S) beat = beat.add(unit);
		const positions: Fraction[] = [];
		for (; inRound(map.toSeconds(beat)); beat = beat.add(segmentAt(map, beat).unit)) {
			positions.push(beat);
		}
		const last = positions.at(-1);
		const onBeat =
			last !== undefined && Math.abs(map.toSeconds(last) - listenUntilTime) < TIME_EPSILON_S;
		if (handoverTime === null && !onBeat) {
			// Rounded to the map's resolution, never before the end of listening.
			let end = map.toPosition(listenUntilTime);
			if (map.toSeconds(end) < listenUntilTime - TIME_EPSILON_S) {
				end = end.add(Fraction.of(1, POSITION_RESOLUTION));
			}
			positions.push(end);
		}
		return positions;
	}
}
