import type { Segment } from '$lib/domain/session';
import type { ScheduledSound } from '$lib/domain/time';

/** The input of one run as the take buffer keeps it, and the sounds to put back over it. */
export interface RunTake {
	/** Audio time of the run's first bar. */
	from: number;
	/** Audio time the run ended (its breath, or a cut). */
	to: number;
	/** What the run made sound, and the click of its muted bars, in time order. */
	sounds: ScheduledSound[];
}

/** A session as it was played: its trace, the take of each run, the latency to replay them with. */
export interface SessionPlayback {
	sessionId: string;
	trace: Segment;
	/** The take of each run, by the id of its segment. */
	takes: ReadonlyMap<number, RunTake>;
	latencyS: number;
}

/**
 * The latest session played, in memory only: the summary reads it, and a reload forgets it
 * (spec amendment 2026-10-17: the trace is not stored yet).
 */
export class SessionMemory {
	private latest: SessionPlayback | null = null;

	remember(playback: SessionPlayback): void {
		this.latest = playback;
	}

	get(sessionId: string): SessionPlayback | null {
		return this.latest?.sessionId === sessionId ? this.latest : null;
	}
}
