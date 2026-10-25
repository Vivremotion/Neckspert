import type { AudioClockPort } from '$lib/application/ports';
import type { MechanicPresenter, SensorKind } from '$lib/application/mechanics/types';
import type { Observation, ObservationSource, SensorFactory } from '../sensors';

/** The observation sources a series listens to: one per sensor its mechanics use. */
export class SeriesSensors {
	readonly sources = new Map<SensorKind, ObservationSource>();
	private unsubscribe: (() => void)[] = [];

	constructor(
		private readonly deps: {
			clock: AudioClockPort;
			mechanics: Record<string, MechanicPresenter>;
			sensors: Record<SensorKind, SensorFactory>;
		}
	) {}

	/** Opens them with the calibrated latency; each observation goes to `onObservation` as it arrives. */
	open(
		latencyMs: number,
		onObservation: (kind: SensorKind, observation: Observation) => void
	): void {
		this.close();
		const kinds = new Set(Object.values(this.deps.mechanics).flatMap((p) => p.sensors));
		for (const kind of kinds) {
			const factory = this.deps.sensors[kind];
			if (!factory) throw new Error(`No factory for sensor: ${kind}`);
			const source = factory({ latencyMs, clock: this.deps.clock });
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
