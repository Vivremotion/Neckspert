import type { ExercisePacing } from '$lib/domain/exercise/types';
import { BeatRound, createBeatTiming } from './beat';
import { BEATS_PER_BAR, respirationStart, STRING_PREVIEW_BEATS } from './grid';
import type { Round, RoundEvent, RoundObservation, RoundOutcome, TimingRelation } from './types';

/** The sensor that hears the root, on the target beat. */
const ROOT_SENSOR = 'note';
/** The sensor that hears the chord, later in the target bar. */
const CHORD_SENSOR = 'chord';

/** The chord is taken from this many beats after the target (beat 2 of the bar). To calibrate. */
export const ANCHOR_CHORD_FROM_BEATS = 1;
/** …until this many beats after it, excluded: the end of the target bar. To calibrate. */
export const ANCHOR_CHORD_UNTIL_BEATS = BEATS_PER_BAR;

/** The confusion of an anchor whose root was right and whose chord never came in its window. */
export const NO_CHORD = { kind: 'no-chord', part: 'chord' } as const;

/** Far below a millisecond: only absorbs floating-point error on the window edges. */
const EDGE_TOLERANCE_S = 1e-6;

/** A lead is always set on the beat; one bar when a prompt has none. */
const FALLBACK_LEAD = BEATS_PER_BAR;

/**
 * Two targets in one bar: the root on its first beat, judged as a located note (perfect, early,
 * late, off beat, wrong); then the chord, any time from beat 2 to the end of the bar, the first
 * attack being the answer and its readings refining it, awaited until the next prompt's preview.
 * Right when both are; the verdict in time is the root's. Settled when both are known.
 */
class AnchorRound implements Round {
	readonly targetBeatIndex: number;
	readonly followUp: { fromBeat: number; untilBeat: number };
	readonly promptTime: number;
	private readonly root: BeatRound;
	private readonly chordOpens: number;
	private readonly chordCloses: number;
	/** Readings of a chord attacked in its window are awaited until the next prompt's preview. */
	private readonly chordWaitEnd: number;
	private rootOutcome: RoundOutcome | null = null;
	/** The chord answer: undefined while it may still come, null when none came. */
	private chord: RoundObservation | null | undefined = undefined;
	/** A reading of the chord attack, waiting for a better one. */
	private chordPending: RoundObservation | null = null;
	private outcome: RoundOutcome | null = null;

	constructor(
		readonly promptBeatIndex: number,
		leadBeats: number,
		beatTime: (index: number) => number,
		private readonly respirationBars: number
	) {
		const target = promptBeatIndex + leadBeats;
		const barEnd = target + ANCHOR_CHORD_UNTIL_BEATS;
		// The root's late capture stops where the chord's window opens: a strum is never a root.
		this.root = new BeatRound(promptBeatIndex, leadBeats, beatTime, {
			captureLimitBeat: target + ANCHOR_CHORD_FROM_BEATS,
			earliestPromptBeat: barEnd
		});
		this.targetBeatIndex = target;
		this.followUp = { fromBeat: target + ANCHOR_CHORD_FROM_BEATS, untilBeat: barEnd };
		this.promptTime = this.root.promptTime;
		this.chordOpens = beatTime(target + ANCHOR_CHORD_FROM_BEATS);
		this.chordCloses = beatTime(barEnd);
		this.chordWaitEnd = beatTime(respirationStart(barEnd, respirationBars) - STRING_PREVIEW_BEATS);
	}

	observe(observation: RoundObservation): RoundEvent {
		if (this.outcome) return { kind: 'ignored', reason: 'settled' };
		if (observation.sensor === ROOT_SENSOR) {
			const event = this.root.observe(observation);
			if (event.kind !== 'settled') return event;
			this.rootOutcome = event.outcome;
			return this.settleIfKnown();
		}
		if (observation.sensor === CHORD_SENSOR) return this.observeChord(observation);
		throw new Error(`The anchor hears a root and a chord, not: ${observation.sensor}`);
	}

	onBeat(beat: { index: number; time: number }): RoundEvent {
		if (this.outcome) return { kind: 'none' };
		let event: RoundEvent = { kind: 'none' };
		if (!this.rootOutcome) {
			const root = this.root.onBeat(beat);
			if (root.kind === 'settled') this.rootOutcome = root.outcome;
			else if (root.kind === 'provisional') event = root;
		}
		if (beat.time >= this.chordCloses - EDGE_TOLERANCE_S) {
			this.rootOutcome ??= this.root.abandon() ?? this.unanswered();
			// A chord attacked late in the bar is read after it: wait for its readings, unless the
			// root already decided the miss.
			if (!this.rootOutcome.correct || beat.time >= this.chordWaitEnd - EDGE_TOLERANCE_S) {
				this.closeChord();
			}
		}
		const settled = this.settleIfKnown();
		return settled.kind === 'settled' ? settled : event;
	}

	abandon(): RoundOutcome | null {
		if (this.outcome) return null;
		const root = this.rootOutcome ?? this.root.abandon();
		const chord = this.chord ?? this.chordPending;
		// Nothing heard yet, the root still listening: the prompt is dropped, as on the beat.
		if (!root && !chord) return null;
		this.rootOutcome = root ?? this.unanswered();
		this.closeChord();
		this.settleIfKnown();
		return this.outcome;
	}

	after(): { advanceAt: number; earliestPrompt: number } | null {
		if (!this.outcome) return null;
		const barEnd = this.targetBeatIndex + ANCHOR_CHORD_UNTIL_BEATS;
		// The prompt stays through the target bar; the breathing follows it.
		return { advanceAt: barEnd, earliestPrompt: respirationStart(barEnd, this.respirationBars) };
	}

	private observeChord(observation: RoundObservation): RoundEvent {
		const { time } = observation;
		if (time < this.chordOpens - EDGE_TOLERANCE_S)
			return { kind: 'ignored', reason: 'before-window' };
		if (time >= this.chordCloses - EDGE_TOLERANCE_S) {
			return { kind: 'ignored', reason: 'after-capture' };
		}
		if (this.chord !== undefined) return { kind: 'ignored', reason: 'settled' };
		// The first chord attack is the answer: another one is not, while its readings come.
		if (this.chordPending && this.chordPending.time !== time) {
			return { kind: 'ignored', reason: 'settled' };
		}
		if (observation.final === false && !observation.correct) {
			this.chordPending = observation;
			return { kind: 'pending' };
		}
		this.chordPending = null;
		this.chord = observation;
		return this.settleIfKnown();
	}

	/** The wait is over: the reading still waiting is the chord, as it is; else none came. */
	private closeChord(): void {
		if (this.chord !== undefined) return;
		this.chord = this.chordPending;
		this.chordPending = null;
	}

	private settleIfKnown(): RoundEvent {
		if (!this.rootOutcome || this.chord === undefined) return { kind: 'pending' };
		this.outcome = this.combine(this.rootOutcome, this.chord);
		return { kind: 'settled', outcome: this.outcome };
	}

	private combine(root: RoundOutcome, chord: RoundObservation | null): RoundOutcome {
		const correct = root.correct && chord?.correct === true;
		const answered = root.answer !== null || chord !== null;
		// Where it went wrong: the root first, as located; then the chord.
		const confusion = !root.correct
			? root.answer === null
				? null
				: (root.confusion ?? null)
			: chord === null
				? NO_CHORD
				: chord.correct
					? null
					: (chord.confusion ?? null);
		return {
			verdict: correct ? root.verdict : 'wrong',
			correct,
			answer: answered ? { root: root.answer, chord: chord?.answer ?? null } : null,
			confusion,
			timingOffsetMs: root.timingOffsetMs,
			reactionMs: root.reactionMs,
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
 * The anchor of a triad: its root on the target beat, its chord in the rest of the bar, at the
 * rhythm of an exercise. Prompts, leads and direct recall are those of the beat.
 */
export function createAnchorTiming(pacing: ExercisePacing): TimingRelation {
	const beat = createBeatTiming(pacing);
	return {
		...beat,
		id: 'anchor',
		open: ({ planned, promptBeat, beatTime }) =>
			new AnchorRound(
				promptBeat,
				planned.leadBeats ?? FALLBACK_LEAD,
				beatTime,
				pacing.respirationBars
			)
	};
}
