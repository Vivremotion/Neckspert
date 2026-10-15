import type { ScheduledSound } from '$lib/domain/time';

/**
 * Keeps the input of the run under way, in memory only, so the player can hear it again with
 * the click put back (spec 2026-10-14, section 7, « Réécouter »). Times are audio seconds.
 */
export interface TakeBufferPort {
	/** Starts keeping the input from `fromTime` (audio s), forgetting what came before. */
	keepFrom(fromTime: number): void;
	/**
	 * Stops keeping the input at `toTime` (audio s), until the next `keepFrom`: what comes after
	 * (a pause, a breath) never pushes the run out of the buffer.
	 */
	keepUntil(toTime: number): void;
	/** Plays what was kept between from and to, with `sounds` resynthesized at their times shifted by `latencyS`. Resolves when done. */
	play(
		from: number,
		to: number,
		sounds: readonly ScheduledSound[],
		latencyS: number
	): Promise<void>;
	stop(): void;
}
