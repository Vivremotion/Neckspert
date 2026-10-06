import type { ObservationFate, PlannedItem, RecordedObservation } from '$lib/domain/types';
import type { Observation } from './sensors';

/** Collects the raw observations heard during one prompt, timed relative to it. */
export class ObservationSpan {
	private readonly entries: RecordedObservation[] = [];
	private closed = false;

	constructor(
		private readonly promptTime: number,
		readonly planned: PlannedItem
	) {}

	add(
		sensor: string,
		observation: Observation,
		fate: ObservationFate,
		correct: boolean | null
	): void {
		if (this.closed) throw new Error('ObservationSpan is closed');
		this.entries.push({
			atMs: (observation.time - this.promptTime) * 1000,
			sensor,
			fate,
			correct,
			// null, not undefined: JSON drops an undefined key and backup validation requires it.
			payload: observation.payload ?? null
		});
	}

	/** A copy of what was collected so far. */
	snapshot(): RecordedObservation[] {
		return [...this.entries];
	}

	/** Ends the span; no observation can be added afterwards. */
	close(): RecordedObservation[] {
		this.closed = true;
		return this.snapshot();
	}
}
