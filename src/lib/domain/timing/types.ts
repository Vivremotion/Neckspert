import type { LeadBeats, RecordedLeadBeats, ResponseVerdict } from '$lib/domain/types';

/** Why a note did not answer the current round. */
export type IgnoreReason = 'settled' | 'before-window' | 'after-capture';

export interface RoundOutcome {
	verdict: ResponseVerdict;
	correct: boolean;
	answer: unknown | null;
	/** The judge's confusion for `answer`, carried as is; omitted or null without one. */
	confusion?: unknown;
	timingOffsetMs: number | null;
	reactionMs: number | null;
	/** Beat the verdict is drawn on in the lane, if any. */
	laneBeat: number | null;
}

export type RoundEvent =
	| { kind: 'none' }
	| { kind: 'ignored'; reason: IgnoreReason }
	/** Taken as (part of) the answer; the verdict waits for a better reading or another part. */
	| { kind: 'pending' }
	| { kind: 'provisional'; outcome: RoundOutcome }
	| { kind: 'settled'; outcome: RoundOutcome };

/** An observation as a round sees it: when, whether it is right, and what the judge said. */
export interface RoundObservation {
	time: number;
	correct: boolean;
	answer: unknown;
	confusion?: unknown;
	sensor?: string;
	final?: boolean;
}

/** One prompt, from its appearance to its verdict. Times are audio seconds, latency-corrected. */
export interface Round {
	readonly promptBeatIndex: number;
	readonly targetBeatIndex: number | null;
	/** A second gesture expected anywhere in these beats (`untilBeat` excluded), after the target. */
	readonly followUp?: { fromBeat: number; untilBeat: number };
	/** Audio seconds. */
	readonly promptTime: number;
	/**
	 * The next round may open without a gap at this audio time (s), on this (fractional) beat.
	 * A round that has one is settled at the latest then, by the session (`abandon`), never by
	 * `after().advanceAt`.
	 */
	readonly handover?: { beat: number; time: number };
	/**
	 * `sensor`: the sensor that read the observation; relations heard by one sensor ignore it.
	 * `final` false: a better reading of the same attack (same `time`) will follow.
	 */
	observe(observation: RoundObservation): RoundEvent;
	onBeat(beat: { index: number; time: number }): RoundEvent;
	/**
	 * Settles an open capture as unanswered, or a reading still waiting as it is; null when
	 * listening without one or already settled. `now` (audio s): when the session abandons it; a
	 * relation that tells an open window from a closed one by the time reads it.
	 */
	abandon(now?: number): RoundOutcome | null;
	/**
	 * Null until settled. `advanceAt`: first beat on which the next prompt is chosen;
	 * `earliestPrompt`: first beat it may show.
	 */
	after(): { advanceAt: number; earliestPrompt: number } | null;
}

export interface TimingRelation {
	id: string;
	usesTempo: boolean;
	previewBeats: number;
	/**
	 * Beats from a round's opening on the beat grid to its target, for a relation whose counted
	 * bar counts down to its target rather than to its opening: the session then takes its
	 * earliest beat as the target's and counts to it. Omitted: 0, the count ends on the opening.
	 */
	targetOffset?: number;
	promptBeat(earliest: number, planned: { leadBeats: LeadBeats | null }): number;
	/**
	 * `planned.item`: the mechanic's item, for a relation that reads it (opaque otherwise).
	 * `chained`: the round opens at the previous round's handover, on its (fractional) beat,
	 * without a gap; omitted or false after a wait on the beat grid. The session passes both.
	 */
	open(input: {
		planned: { leadBeats: LeadBeats | null; item?: unknown };
		promptBeat: number;
		now: number;
		beatTime: (index: number) => number;
		secondsPerBeat: number;
		chained?: boolean;
	}): Round;
	isDirectRecall(attempt: {
		correct: boolean;
		verdict: ResponseVerdict;
		reactionMs: number | null;
		leadBeats: RecordedLeadBeats | null;
		tempoBpm: number | null;
	}): boolean;
	initialLead: LeadBeats;
	learnedLead(tempoBpm: number | null): LeadBeats;
	adjustLead(current: LeadBeats, success: boolean): LeadBeats;
}
