import type { ScheduledSound, SoundId } from '$lib/domain/time';

/**
 * The one path every sound takes: a click, a demonstration, a rhythm to play along. Each
 * is pitchless, so the note detector never reads it. Times are audio seconds.
 */
export interface SoundSchedulerPort {
	/** Sounds `sound` at `time`. A time already past is dropped, not played late, and not logged. */
	play(time: number, sound: SoundId): void;
	/**
	 * Calls `callback` once the audio clock reaches `time`: never early, at most the
	 * scheduler's wake-up period late. Returns a function that cancels it.
	 */
	at(time: number, callback: () => void): () => void;
	/** Cancels the sounds yet to come and the wake-ups, and empties the journal. */
	cancelAll(): void;
	/** What was scheduled since the last `cancelAll`, in the order `play` was called. */
	emitted(): readonly ScheduledSound[];
}
