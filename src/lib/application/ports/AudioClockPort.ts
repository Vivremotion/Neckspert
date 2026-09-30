/** The shared audio clock. All times are AudioContext seconds. */
export interface AudioClockPort {
	/** Creates or resumes the shared AudioContext. Call from a user gesture. */
	resume(): Promise<void>;
	/** AudioContext.currentTime, in seconds. */
	now(): number;
	/** Converts an audio time to epoch ms, for storage only. */
	toEpochMs(audioTime: number): number;
}
