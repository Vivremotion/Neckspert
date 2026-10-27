import { secondsToMs } from '$lib/domain/scoring/timing';
import { IDENTIFY_RECALL_THRESHOLD_MS } from '$lib/domain/types';
import type { Round, RoundEvent, RoundObservation, RoundOutcome, TimingRelation } from './types';

class FreeRound implements Round {
	readonly targetBeatIndex = null;
	private outcome: RoundOutcome | null = null;
	private answeredAt: number | null = null;

	constructor(
		readonly promptBeatIndex: number,
		readonly promptTime: number,
		private readonly recallThresholdMs: number,
		private readonly beatZeroTime: number,
		private readonly secondsPerBeat: number
	) {}

	observe(observation: RoundObservation): RoundEvent {
		if (this.outcome) return { kind: 'ignored', reason: 'settled' };
		const reactionMs = secondsToMs(observation.time - this.promptTime);
		if (reactionMs < 0) return { kind: 'ignored', reason: 'before-window' };
		this.answeredAt = observation.time;
		this.outcome = {
			verdict: !observation.correct
				? 'wrong'
				: reactionMs <= this.recallThresholdMs
					? 'perfect'
					: 'late',
			correct: observation.correct,
			answer: observation.answer,
			...(observation.confusion !== undefined && { confusion: observation.confusion }),
			timingOffsetMs: null,
			reactionMs,
			laneBeat: null
		};
		return { kind: 'settled', outcome: this.outcome };
	}

	onBeat(): RoundEvent {
		return { kind: 'none' };
	}

	abandon(): RoundOutcome | null {
		return null;
	}

	after(): { advanceAt: number; earliestPrompt: number } | null {
		if (this.answeredAt === null) return null;
		const beat = Math.floor((this.answeredAt - this.beatZeroTime) / this.secondsPerBeat) + 1;
		return { advanceAt: beat, earliestPrompt: beat };
	}
}

/** Answer at your own pace: the verdict is the reaction time against a threshold. */
export function createFreeTiming(options: { recallThresholdMs: number }): TimingRelation {
	return {
		id: 'free',
		usesTempo: false,
		previewBeats: 0,
		promptBeat: (earliest) => earliest,
		open: ({ promptBeat, now, beatTime, secondsPerBeat }) =>
			new FreeRound(promptBeat, now, options.recallThresholdMs, beatTime(0), secondsPerBeat),
		isDirectRecall: (attempt) =>
			attempt.success &&
			attempt.reactionMs !== null &&
			attempt.reactionMs <= options.recallThresholdMs
	};
}

export const identifyTiming = createFreeTiming({
	recallThresholdMs: IDENTIFY_RECALL_THRESHOLD_MS
});
