import {
	answerWindow,
	isInWindow,
	lateCaptureEnd,
	secondsToMs,
	timingVerdict
} from '$lib/domain/scoring/timing';
import { DEFAULT_PACING } from '$lib/domain/exercise/pacing';
import type { ExercisePacing } from '$lib/domain/exercise/types';
import { RECALL_THRESHOLD_MS, type LeadBeats, type Verdict } from '$lib/domain/types';
import { alignedPromptBeat, BEATS_PER_BAR, respirationStart, STRING_PREVIEW_BEATS } from './grid';
import type { Round, RoundEvent, RoundObservation, RoundOutcome, TimingRelation } from './types';

/** Lead of a prompt planned without one (none today: every mode 1 prompt has a lead). */
const FALLBACK_LEAD = BEATS_PER_BAR;

/** Far below a millisecond: only absorbs floating-point error on the capture edge. */
const EDGE_TOLERANCE_S = 1e-6;

type State = 'listening' | 'capturing' | 'settled';

/**
 * Longest of `steps` (longest first) whose duration at `tempoBpm` fits in RECALL_THRESHOLD_MS;
 * at least the shortest step.
 */
function leadForThreshold(steps: readonly LeadBeats[], tempoBpm: number): LeadBeats {
	for (const step of steps) {
		if ((step * 60_000) / tempoBpm <= RECALL_THRESHOLD_MS) return step;
	}
	return steps[steps.length - 1];
}

/**
 * One step shorter on success, one longer on failure. A lead outside `steps` (a card met in
 * another exercise) starts from the shortest step at least as long.
 */
function adjustLeadBeats(
	steps: readonly LeadBeats[],
	current: LeadBeats,
	success: boolean
): LeadBeats {
	const found = steps.indexOf(current);
	const longer = steps.filter((step) => step >= current).length - 1;
	const index = found >= 0 ? found : Math.max(longer, 0);
	const nextIndex = success ? Math.min(index + 1, steps.length - 1) : Math.max(index - 1, 0);
	return steps[nextIndex];
}

/** Beats that bound a round on the beat, set by its time relation. */
export interface BeatRoundBounds {
	/** The late capture never runs past this beat (the next prompt's string preview). */
	captureLimitBeat: number;
	/** First beat the next prompt may show on. */
	earliestPromptBeat: number;
}

/** One prompt on the beat: the first answer in the window, or off beat in the late capture. */
export class BeatRound implements Round {
	readonly targetBeatIndex: number;
	readonly promptTime: number;
	private readonly targetTime: number;
	private readonly window: { opensAt: number; closesAt: number };
	private readonly captureEnd: number;
	private state: State = 'listening';
	/** Index of the beat on which the window closed unanswered, if it did. */
	private closingBeat: number | null = null;
	/** A reading taken as the answer, waiting for a better reading of the same attack. */
	private pending: RoundObservation | null = null;

	constructor(
		readonly promptBeatIndex: number,
		leadBeats: number,
		beatTime: (index: number) => number,
		private readonly bounds: BeatRoundBounds
	) {
		this.targetBeatIndex = promptBeatIndex + leadBeats;
		this.promptTime = beatTime(promptBeatIndex);
		this.targetTime = beatTime(this.targetBeatIndex);
		this.window = answerWindow(this.promptTime, this.targetTime);
		this.captureEnd = lateCaptureEnd(this.targetTime, beatTime(bounds.captureLimitBeat));
	}

	observe(observation: RoundObservation): RoundEvent {
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
		// First attack is the answer: while one of its readings waits, another attack is not.
		if (this.pending && this.pending.time !== time) return { kind: 'ignored', reason: 'settled' };
		if (observation.final === false && !observation.correct) {
			this.pending = observation;
			return { kind: 'pending' };
		}
		this.pending = null;
		this.state = 'settled';
		return { kind: 'settled', outcome: this.outcomeOf(observation) };
	}

	onBeat(beat: { index: number; time: number }): RoundEvent {
		if (this.state === 'listening' && beat.time >= this.window.closesAt) {
			this.state = 'capturing';
			this.closingBeat = beat.index;
			// A reading still waiting is the answer: no miss to show before it is judged.
			if (this.pending) return { kind: 'none' };
			return { kind: 'provisional', outcome: this.unanswered() };
		}
		if (this.state === 'capturing' && beat.time >= this.captureEnd) {
			return { kind: 'settled', outcome: this.settleAsIs() };
		}
		return { kind: 'none' };
	}

	abandon(): RoundOutcome | null {
		if (this.state === 'settled') return null;
		if (this.state === 'listening' && !this.pending) return null;
		return this.settleAsIs();
	}

	/** Settles on the reading still waiting, judged as it is, or as unanswered without one. */
	private settleAsIs(): RoundOutcome {
		const pending = this.pending;
		this.pending = null;
		this.state = 'settled';
		return pending ? this.outcomeOf(pending) : this.unanswered();
	}

	private outcomeOf(observation: RoundObservation): RoundOutcome {
		const { time } = observation;
		const captured = !isInWindow(time, this.window) && time > this.window.closesAt;
		const offsetMs = secondsToMs(time - this.targetTime);
		const verdict: Verdict = !observation.correct
			? 'wrong'
			: captured
				? 'offbeat'
				: timingVerdict(offsetMs);
		return {
			verdict,
			correct: observation.correct,
			answer: observation.answer,
			...(observation.confusion !== undefined && { confusion: observation.confusion }),
			timingOffsetMs: offsetMs,
			reactionMs: secondsToMs(time - this.promptTime),
			laneBeat: this.targetBeatIndex
		};
	}

	after(): { advanceAt: number; earliestPrompt: number } | null {
		if (this.state !== 'settled') return null;
		return {
			advanceAt: (this.closingBeat ?? this.targetBeatIndex) + 1,
			earliestPrompt: this.bounds.earliestPromptBeat
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

/** Mode 1 on the beat, at the rhythm of an exercise: its lead ladder and its breathing bars. */
export function createBeatTiming(pacing: ExercisePacing): TimingRelation {
	const steps = pacing.leadSteps;
	return {
		id: 'beat',
		usesTempo: true,
		previewBeats: STRING_PREVIEW_BEATS,
		initialLead: steps[0],
		promptBeat: (earliest, planned) =>
			alignedPromptBeat(earliest, planned.leadBeats ?? FALLBACK_LEAD),
		open: ({ planned, promptBeat, beatTime }) => {
			const lead = planned.leadBeats ?? FALLBACK_LEAD;
			const nextPrompt = respirationStart(promptBeat + lead, pacing.respirationBars);
			return new BeatRound(promptBeat, lead, beatTime, {
				captureLimitBeat: nextPrompt - STRING_PREVIEW_BEATS,
				earliestPromptBeat: nextPrompt
			});
		},
		isDirectRecall: (attempt) => {
			// Found after the window means found by calculation: never direct recall.
			if (!attempt.correct || attempt.verdict === 'offbeat') return false;
			if (attempt.leadBeats === null || attempt.tempoBpm === null) return false;
			return (attempt.leadBeats * 60_000) / attempt.tempoBpm <= RECALL_THRESHOLD_MS;
		},
		learnedLead: (tempoBpm) =>
			tempoBpm === null ? steps[steps.length - 1] : leadForThreshold(steps, tempoBpm),
		adjustLead: (current, success) => adjustLeadBeats(steps, current, success)
	};
}

/** Mode 1: play the note on a target beat, a lead of beats after the prompt. */
export const beatTiming: TimingRelation = createBeatTiming(DEFAULT_PACING);
