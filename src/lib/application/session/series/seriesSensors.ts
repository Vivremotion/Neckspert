import type { AudioClockPort } from '$lib/application/ports';
import type { SetPresenter, SensorKind } from '$lib/application/sets/types';
import type { Observation, ObservationSource, SensorFactory } from '../sensors';

/** The observation sources a series listens to: one per sensor its exercises' presenters use. */
export class SeriesSensors {
	readonly sources = new Map<SensorKind, ObservationSource>();
	private unsubscribe: (() => void)[] = [];

	constructor(
		private readonly deps: {
			clock: AudioClockPort;
			/** The presenters of the exercises the session plays. */
			listening: () => readonly SetPresenter[];
			sensors: Record<SensorKind, SensorFactory>;
		}
	) {}

	/** Opens each with the calibrated latency of its sensor; each observation goes to `onObservation` as it arrives. */
	open(
		latencyOf: (kind: SensorKind) => number,
		onObservation: (kind: SensorKind, observation: Observation) => void
	): void {
		this.close();
		const kinds = new Set(this.deps.listening().flatMap((p) => p.sensors));
		for (const kind of kinds) {
			const factory = this.deps.sensors[kind];
			if (!factory) throw new Error(`No factory for sensor: ${kind}`);
			const source = factory({ latencyMs: latencyOf(kind), clock: this.deps.clock });
			this.sources.set(kind, source);
			this.unsubscribe.push(
				source.onObservation((observation) => onObservation(kind, observation))
			);
		}
	}

	/** Withdraws every expectation and stops listening. */
	close(): void {
		for (const source of this.sources.values()) source.expect?.(null);
		this.unsubscribe.forEach((stop) => stop());
		this.unsubscribe = [];
		this.sources.clear();
	}
}
