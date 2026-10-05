import type { LeadBeats, RecordedLeadBeats, Verdict } from '$lib/domain/types';

/** Why a note did not answer the current round. */
export type IgnoreReason = 'settled' | 'before-window' | 'after-capture';

export interface RoundOutcome {
	verdict: Verdict;
	correct: boolean;
	answer: unknown | null;
	timingOffsetMs: number | null;
	reactionMs: number | null;
	/** Beat the verdict is drawn on in the lane, if any. */
	laneBeat: number | null;
}

export type RoundEvent =
	| { kind: 'none' }
	| { kind: 'ignored'; reason: IgnoreReason }
	| { kind: 'provisional'; outcome: RoundOutcome }
	| { kind: 'settled'; outcome: RoundOutcome };

/** One prompt, from its appearance to its verdict. Times are audio seconds, latency-corrected. */
export interface Round {
	readonly promptBeatIndex: number;
	readonly targetBeatIndex: number | null;
	/** Audio seconds. */
	readonly promptTime: number;
	observe(observation: { time: number; correct: boolean; answer: unknown }): RoundEvent;
	onBeat(beat: { index: number; time: number }): RoundEvent;
	/** Settles an open capture as unanswered; null when listening or already settled. */
	abandon(): RoundOutcome | null;
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
	promptBeat(earliest: number, planned: { leadBeats: LeadBeats | null }): number;
	open(input: {
		planned: { leadBeats: LeadBeats | null };
		promptBeat: number;
		now: number;
		beatTime: (index: number) => number;
		secondsPerBeat: number;
	}): Round;
	isDirectRecall(attempt: {
		correct: boolean;
		verdict: Verdict;
		reactionMs: number | null;
		leadBeats: RecordedLeadBeats | null;
		tempoBpm: number | null;
	}): boolean;
	initialLead: LeadBeats;
	learnedLead(tempoBpm: number | null): LeadBeats;
	adjustLead(current: LeadBeats, success: boolean): LeadBeats;
}
