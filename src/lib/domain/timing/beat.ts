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
import type { Round, RoundEvent, RoundOutcome, TimingRelation } from './types';

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
		beatTime: (index: number) => number,
		private readonly respirationBars: number
	) {
		this.targetBeatIndex = promptBeatIndex + leadBeats;
		this.promptTime = beatTime(promptBeatIndex);
		this.targetTime = beatTime(this.targetBeatIndex);
		this.window = answerWindow(this.promptTime, this.targetTime);
		this.captureEnd = lateCaptureEnd(
			this.targetTime,
			beatTime(respirationStart(this.targetBeatIndex, respirationBars) - STRING_PREVIEW_BEATS)
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
			earliestPrompt: respirationStart(this.targetBeatIndex, this.respirationBars)
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
		open: ({ planned, promptBeat, beatTime }) =>
			new BeatRound(
				promptBeat,
				planned.leadBeats ?? FALLBACK_LEAD,
				beatTime,
				pacing.respirationBars
			),
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
