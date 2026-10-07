import type {
	AudioClockPort,
	ChordReport,
	ChordVerifierPort,
	NoteDetectorPort,
	NoteOnset,
	NoteRejection
} from '$lib/application/ports';

/** Something a sensor perceived, at its audio time (seconds), latency already removed. */
export interface Observation {
	time: number;
	payload: unknown;
	/** False when the sensor perceived something but could not read it (its payload says why). */
	readable: boolean;
	/**
	 * False when a better reading of the same attack (same `time`) will follow. Omitted: final,
	 * as every note and tap is.
	 */
	final?: boolean;
}

export interface ObservationSource {
	/** Returns the unsubscribe function. */
	onObservation(callback: (observation: Observation) => void): () => void;
	/** Sources fed by the screen take their values here. */
	push?(payload: unknown): void;
	/**
	 * What the round that opens listens for, as its mechanic prepared it; null when nothing.
	 * Opaque to the core: only the sensor reads it.
	 */
	expect?(expectation: unknown): void;
}

/** Opens a source for one series, once the calibrated latency is known. */
export type SensorFactory = (context: {
	latencyMs: number;
	clock: AudioClockPort;
}) => ObservationSource;

/** Readable payload of a played note: what was heard, not when. */
export type NotePayload = Pick<NoteOnset, 'midi' | 'frequencyHz' | 'clarity'>;

/** Unreadable payload of a played note: why the attack could not be read. */
export type NoteRejectionPayload = Omit<NoteRejection, 'time'>;

/**
 * Played notes: each attack, dated minus the calibrated latency. An attack whose pitch could not
 * be read is still an observation, unreadable.
 */
export function noteSensor(detector: NoteDetectorPort): SensorFactory {
	return ({ latencyMs }) => ({
		onObservation: (callback) => {
			const stopNotes = detector.onNote(({ time, midi, frequencyHz, clarity }) =>
				callback({
					time: time - latencyMs / 1000,
					payload: { midi, frequencyHz, clarity } satisfies NotePayload,
					readable: true
				})
			);
			const stopRejections = detector.onRejected(({ time, ...reason }) =>
				callback({
					time: time - latencyMs / 1000,
					payload: reason satisfies NoteRejectionPayload,
					readable: false
				})
			);
			return () => {
				stopNotes();
				stopRejections();
			};
		}
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
				const observation = { time: clock.now(), payload, readable: true };
				listeners.forEach((listener) => listener(observation));
			}
		};
	};
}

/** Payload of a chord report: what was heard and judged, and whether it is final; not when. */
export type ChordObservationPayload = Omit<ChordReport, 'time'>;

/**
 * Played chords: each report of the verifier, dated at its attack minus the calibrated latency.
 * The expectation of each round goes to the verifier as the mechanic prepared it.
 */
export function chordSensor(verifier: ChordVerifierPort): SensorFactory {
	return ({ latencyMs }) => ({
		onObservation: (callback) =>
			verifier.onReport(({ time, ...payload }) =>
				callback({
					time: time - latencyMs / 1000,
					payload: payload satisfies ChordObservationPayload,
					readable: true,
					final: payload.final
				})
			),
		expect: (expectation) =>
			verifier.expect(expectation as Parameters<ChordVerifierPort['expect']>[0])
	});
}
