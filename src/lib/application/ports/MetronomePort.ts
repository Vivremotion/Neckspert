export interface BeatEvent {
	/** 0 = the first beat after start(). */
	index: number;
	/** Scheduled audio time of the beat, in seconds. */
	time: number;
	isDownbeat: boolean;
}

/** Audible click track scheduled on the audio clock. */
export interface MetronomePort {
	setTempo(bpm: number): void;
	getTempo(): number;
	secondsPerBeat(): number;
	/** Starts clicking; beat 0 sounds at `firstBeatTime` (audio seconds). */
	start(firstBeatTime: number): void;
	/** Beats keep firing either way. Identify questions silence the click. */
	setAudible(audible: boolean): void;
	stop(): void;
	isRunning(): boolean;
	/** Audio time of beat `index`. Throws when not running. */
	beatTime(index: number): number;
	/** Called once per beat, slightly ahead of its audio time. Returns an unsubscribe function. */
	onBeat(callback: (beat: BeatEvent) => void): () => void;
	/**
	 * Calls back once the audio clock reaches `time` (s), at the scheduler's next wake-up: never
	 * early, at most its period late, after the beats of that wake-up. Cancelled by stop() or the
	 * returned function. Throws when not running.
	 */
	at(time: number, callback: () => void): () => void;
}
