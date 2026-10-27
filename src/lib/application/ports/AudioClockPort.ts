/** The shared audio clock. All times are AudioContext seconds. */
export interface AudioClockPort {
	/** Creates or resumes the shared AudioContext. Call from a user gesture. */
	resume(): Promise<void>;
	/** Resolves once the output can be heard from its first sound: a fresh output loses its start. */
	settle(): Promise<void>;
	/** AudioContext.currentTime, in seconds. */
	now(): number;
	/** Converts an audio time to epoch ms, for storage only. */
	toEpochMs(audioTime: number): number;
	/**
	 * The wall time now, in epoch ms: the audio clock's when it exists, else the system's. Readable
	 * before `resume()`, unlike `now()` and `toEpochMs()`.
	 */
	epochNow(): number;
}
