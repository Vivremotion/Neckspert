import { secondsToMs } from '$lib/domain/scoring/judgement';
import {
	answerWindow,
	isInWindow,
	lateCaptureEnd,
	timingVerdict
} from '$lib/domain/scoring/timing';
import { adjustLeadBeats, leadForThreshold } from '$lib/domain/progress/lead';
import {
	RECALL_THRESHOLD_MS,
	SHORTEST_LEAD,
	type LeadBeats,
	type Verdict
} from '$lib/domain/types';
import { alignedPromptBeat, respirationStart, STRING_PREVIEW_BEATS } from './grid';
import type { Round, RoundEvent, RoundOutcome, TimingRelation } from './types';

/** First lead of a new card: the longest step. */
const INITIAL_LEAD: LeadBeats = 8;

/** Far below a millisecond: only absorbs floating-point error on the capture edge. */
const EDGE_TOLERANCE_S = 1e-6;

type State = 'listening' | 'capturing' | 'settled';

class BeatRound implements Round {
	readonly targetBeatIndex: number;
	readonly promptTime: number;
	private readonly targetTime: number;
	private readonly window: { opensAt: number; closesAt: number };
	private readonly captureEnd: number;
	private state: State = 'listening';
	/** Index of the beat on which the window closed unanswered, if it did. */
	private closingBeat: number | null = null;

	constructor(
		readonly promptBeatIndex: number,
		leadBeats: number,
		beatTime: (index: number) => number
	) {
		this.targetBeatIndex = promptBeatIndex + leadBeats;
		this.promptTime = beatTime(promptBeatIndex);
		this.targetTime = beatTime(this.targetBeatIndex);
		this.window = answerWindow(this.promptTime, this.targetTime);
		this.captureEnd = lateCaptureEnd(
			this.targetTime,
			beatTime(respirationStart(this.targetBeatIndex) - STRING_PREVIEW_BEATS)
		);
	}

	observe(observation: { time: number; correct: boolean; answer: unknown }): RoundEvent {
		if (this.state === 'settled') return { kind: 'ignored', reason: 'settled' };
		const { time } = observation;
		const inWindow = isInWindow(time, this.window);
		if (time < this.window.opensAt && !inWindow) {
			// Before the prompt or in its first MIN_RESPONSE_MS: it answers the previous prompt.
			return { kind: 'ignored', reason: 'before-window' };
		}
		if (time > this.captureEnd + EDGE_TOLERANCE_S) {
			return { kind: 'ignored', reason: 'after-capture' };
		}
		const captured = !inWindow && time > this.window.closesAt;
		const offsetMs = secondsToMs(time - this.targetTime);
		const verdict: Verdict = !observation.correct
			? 'wrong'
			: captured
				? 'offbeat'
				: timingVerdict(offsetMs);
		this.state = 'settled';
		return {
			kind: 'settled',
			outcome: {
				verdict,
				correct: observation.correct,
				answer: observation.answer,
				timingOffsetMs: offsetMs,
				reactionMs: secondsToMs(time - this.promptTime),
				laneBeat: this.targetBeatIndex
			}
		};
	}

	onBeat(beat: { index: number; time: number }): RoundEvent {
		if (this.state === 'listening' && beat.time >= this.window.closesAt) {
			this.state = 'capturing';
			this.closingBeat = beat.index;
			return { kind: 'provisional', outcome: this.unanswered() };
		}
		if (this.state === 'capturing' && beat.time >= this.captureEnd) {
			this.state = 'settled';
			return { kind: 'settled', outcome: this.unanswered() };
		}
		return { kind: 'none' };
	}

	abandon(): RoundOutcome | null {
		if (this.state !== 'capturing') return null;
		this.state = 'settled';
		return this.unanswered();
	}

	after(): { advanceAt: number; earliestPrompt: number } | null {
		if (this.state !== 'settled') return null;
		return {
			advanceAt: (this.closingBeat ?? this.targetBeatIndex) + 1,
			earliestPrompt: respirationStart(this.targetBeatIndex)
		};
	}

	private unanswered(): RoundOutcome {
		return {
			verdict: 'wrong',
			correct: false,
			answer: null,
			timingOffsetMs: null,
			reactionMs: null,
			laneBeat: this.targetBeatIndex
		};
	}
}

/** Mode 1: play the note on a target beat, a lead of beats after the prompt. */
export const beatTiming: TimingRelation = {
	id: 'beat',
	usesTempo: true,
	previewBeats: STRING_PREVIEW_BEATS,
	initialLead: INITIAL_LEAD,
	promptBeat: (earliest, planned) => alignedPromptBeat(earliest, planned.leadBeats ?? INITIAL_LEAD),
	open: ({ planned, promptBeat, beatTime }) =>
		new BeatRound(promptBeat, planned.leadBeats ?? INITIAL_LEAD, beatTime),
	isDirectRecall: (attempt) => {
		// Found after the window means found by calculation: never direct recall.
		if (!attempt.correct || attempt.verdict === 'offbeat') return false;
		if (attempt.leadBeats === null || attempt.tempoBpm === null) return false;
		return (attempt.leadBeats * 60_000) / attempt.tempoBpm <= RECALL_THRESHOLD_MS;
	},
	learnedLead: (tempoBpm) => (tempoBpm === null ? SHORTEST_LEAD : leadForThreshold(tempoBpm)),
	adjustLead: (current, success) => adjustLeadBeats(current, success, 'locate')
};
