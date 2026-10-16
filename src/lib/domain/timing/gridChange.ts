import { LATE_LIMIT_MS, secondsToMs, timingVerdict } from '$lib/domain/scoring/timing';
import { SHORTEST_LEAD, type ResponseVerdict } from '$lib/domain/types';
import { alignedPromptBeat } from './grid';
import type { Round, RoundEvent, RoundObservation, RoundOutcome, TimingRelation } from './types';

/** How early an attack still answers a chord change. To calibrate. */
export const GRID_EARLY_MS = 200;

/**
 * …never more than this part of a beat: under half a beat, an attack of the previous chord on
 * the eighth before is never taken for the change. To calibrate.
 */
export const GRID_EARLY_MAX_BEATS = 0.4;

/** Far below a millisecond: only absorbs floating-point error on the window edges. */
const EDGE_TOLERANCE_S = 1e-6;

/** What the relation reads of a change item: its length in beats. */
export interface GridChangeTiming {
	lengthBeats: number;
}

type State = 'listening' | 'capturing' | 'settled';

/** The early tolerance at a tempo, in seconds. */
function earlyTolerance(secondsPerBeat: number): number {
	return Math.min(GRID_EARLY_MS, GRID_EARLY_MAX_BEATS * secondsPerBeat * 1000) / 1000;
}

/**
 * One chord change of a grid (spec 2026-10-10, section 4). It listens from the change minus the
 * early tolerance to its handover, the next change minus that tolerance, where the next round
 * opens without a gap. The first attack is the answer, its readings refining it: in time up to
 * LATE_LIMIT_MS after the change, off beat after it. A window closed unanswered shows a
 * provisional miss; the session settles the round at its handover, never a beat.
 */
class GridRound implements Round {
	readonly promptTime: number;
	readonly handover: { beat: number; time: number };
	private readonly changeTime: number;
	private readonly opensAt: number;
	private readonly closesAt: number;
	private state: State = 'listening';
	/** A reading taken as the answer, waiting for a better reading of the same attack. */
	private pending: RoundObservation | null = null;

	constructor(
		readonly promptBeatIndex: number,
		readonly targetBeatIndex: number,
		lengthBeats: number,
		beatTime: (index: number) => number,
		secondsPerBeat: number,
		chained: boolean
	) {
		const early = earlyTolerance(secondsPerBeat);
		this.changeTime = beatTime(targetBeatIndex);
		this.opensAt = this.changeTime - early;
		const handoverBeat = targetBeatIndex + lengthBeats;
		this.handover = { beat: handoverBeat, time: beatTime(handoverBeat) - early };
		this.closesAt = Math.min(this.changeTime + LATE_LIMIT_MS / 1000, this.handover.time);
		// Chained, the round shows at the handover before it; else on its prompt beat.
		this.promptTime = chained ? this.opensAt : beatTime(promptBeatIndex);
	}

	observe(observation: RoundObservation): RoundEvent {
		if (this.state === 'settled') return { kind: 'ignored', reason: 'settled' };
		const { time } = observation;
		if (time < this.opensAt - EDGE_TOLERANCE_S) return { kind: 'ignored', reason: 'before-window' };
		if (time >= this.handover.time - EDGE_TOLERANCE_S) {
			return { kind: 'ignored', reason: 'after-capture' };
		}
		// The first attack is the answer: while one of its readings waits, another attack is not.
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
		if (this.state !== 'listening' || beat.time < this.closesAt - EDGE_TOLERANCE_S) {
			return { kind: 'none' };
		}
		this.state = 'capturing';
		// A reading still waiting is the answer: no miss to show before it is judged.
		if (this.pending) return { kind: 'none' };
		return { kind: 'provisional', outcome: this.unanswered() };
	}

	/** At the handover: the reading still waiting as it is, else unanswered. Before the window closed unanswered (a pause): dropped. */
	abandon(now?: number): RoundOutcome | null {
		if (this.state === 'settled') return null;
		const open = now !== undefined && now < this.closesAt - EDGE_TOLERANCE_S;
		if (this.state === 'listening' && !this.pending && open) return null;
		const pending = this.pending;
		this.pending = null;
		this.state = 'settled';
		return pending ? this.outcomeOf(pending) : this.unanswered();
	}

	after(): { advanceAt: number; earliestPrompt: number } | null {
		if (this.state !== 'settled') return null;
		// Only the handover moves on; a wait on the grid starts on the first whole beat after it.
		return { advanceAt: Infinity, earliestPrompt: Math.ceil(this.handover.beat) };
	}

	private outcomeOf(observation: RoundObservation): RoundOutcome {
		const { time } = observation;
		const offsetMs = secondsToMs(time - this.changeTime);
		const inTime = time <= this.closesAt + EDGE_TOLERANCE_S;
		const verdict: ResponseVerdict = !observation.correct
			? 'wrong'
			: inTime
				? timingVerdict(offsetMs)
				: 'offbeat';
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

/**
 * The changes of a chord grid, rounds handing over without a gap. Reads each item's length
 * through `timingOf`: the mechanic gives it, the relation knows no grid. A round after a wait
 * opens on beat 4 of a bar, its change on the 1 after; a chained one changes on its handover beat.
 */
export function createGridTiming(timingOf: (item: unknown) => GridChangeTiming): TimingRelation {
	return {
		id: 'grid-change',
		usesTempo: true,
		previewBeats: 0,
		// Opened a beat before its change, so an early attack counts; the count ends on the change.
		targetOffset: 1,
		initialLead: SHORTEST_LEAD,
		promptBeat: (earliest) => alignedPromptBeat(earliest, 1),
		open: ({ planned, promptBeat, beatTime, secondsPerBeat, chained = false }) =>
			new GridRound(
				promptBeat,
				chained ? promptBeat : promptBeat + 1,
				timingOf(planned.item).lengthBeats,
				beatTime,
				secondsPerBeat,
				chained
			),
		// A gesture is a skill, measured by its tempo: nothing here is recall.
		isDirectRecall: () => false,
		learnedLead: () => SHORTEST_LEAD,
		adjustLead: () => SHORTEST_LEAD
	};
}
