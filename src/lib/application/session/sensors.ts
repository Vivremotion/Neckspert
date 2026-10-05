import type { AudioClockPort, NoteDetectorPort } from '$lib/application/ports';

/** Something a sensor perceived, at its audio time (seconds), latency already removed. */
export interface Observation {
	time: number;
	payload: unknown;
}

export interface ObservationSource {
	/** Returns the unsubscribe function. */
	onObservation(callback: (observation: Observation) => void): () => void;
	/** Sources fed by the screen take their values here. */
	push?(payload: unknown): void;
}

/** Opens a source for one series, once the calibrated latency is known. */
export type SensorFactory = (context: {
	latencyMs: number;
	clock: AudioClockPort;
}) => ObservationSource;

/** Played notes: each attack, its payload the onset, dated minus the calibrated latency. */
export function noteSensor(detector: NoteDetectorPort): SensorFactory {
	return ({ latencyMs }) => ({
		onObservation: (callback) =>
			detector.onNote((onset) => callback({ time: onset.time - latencyMs / 1000, payload: onset }))
	});
}

/** Taps on the screen: each pushed value, dated on the audio clock when it arrives. */
export function tapSensor(): SensorFactory {
	return ({ clock }) => {
		const listeners = new Set<(observation: Observation) => void>();
		return {
			onObservation: (callback) => {
				listeners.add(callback);
				return () => listeners.delete(callback);
			},
			push: (payload) => {
				const observation = { time: clock.now(), payload };
				listeners.forEach((listener) => listener(observation));
			}
		};
	};
}
