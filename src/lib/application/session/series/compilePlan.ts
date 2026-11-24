import { figureParamsOf, writesFigure, type FigureParams } from '$lib/domain/exercise/figureParams';
import { pacingAt } from '$lib/domain/exercise/levels';
import { compileRound, roundAccompanimentOf, roundFigureOf } from '$lib/domain/exercise/round';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import {
	METER_4_4,
	ROUND_MODES,
	accompanimentFrom,
	checkStart,
	landingBar,
	unmuted,
	type Accompaniment,
	type CycleThresholds,
	type Figure,
	Fraction,
	type Meter,
	type ResponseValue,
	type RoundOutcome,
	type RoundPlan
} from '$lib/domain/time';
import type { Attempt, CardKey, Execution, PlannedItem } from '$lib/domain/types';
import { recordedAttempt } from './recordResponse';

/**
 * How the series plays an item's round: what it asks of a round's data beyond its plan, read for
 * every exercise from its compiled round and its resolved params (`figureParamsOf`, `pacing`), with
 * no question of what kind of round it is. Every round compiles from its exercise's template
 * (`compileRound`).
 */

/**
 * A cycle is settled this far (in bars) after its last bar ends, so an attack reported a little
 * late (detection, the scheduler's wake-up) still reaches it.
 */
export const SETTLE_AFTER_BARS = Fraction.of(1, 4);

/**
 * The plan of `item`'s round in `meter`. `fromRunStart`: where it starts, in whole bars from the
 * first bar of its run (the bar 0 of its accompaniment), null when not known yet (the round then
 * takes the first one's place: the accompaniment's first muted bar).
 */
export function compilePlan(
	definition: ExerciseDefinition,
	item: PlannedItem,
	meter: Meter,
	context: { previewBeats: number; fromRunStart: number | null }
): RoundPlan {
	return compileRound(definition, item, meter, {
		previewBeats: context.previewBeats,
		fromRunStart: context.fromRunStart
	});
}

/** What the level of a round gives its judge beyond its plan, and how long it keeps listening. */
export interface RoundGiven {
	/** The thresholds a verdict that reads them judges against; null for a verdict that reads none. */
	thresholds: CycleThresholds | null;
	/**
	 * Bars after its handover the round keeps taking what it captured but was heard late, the next
	 * round open meanwhile; null: it closes at its handover.
	 */
	settleAfter: Fraction | null;
	/** The level marks on the figure, as it plays, what was heard of each note. */
	liveMarks: boolean;
}

export function roundGiven(
	definition: ExerciseDefinition,
	item: PlannedItem,
	plan: RoundPlan
): RoundGiven {
	const params = figureParamsOf(definition, item.exerciseLevel);
	return {
		thresholds: ROUND_MODES.verdicts[plan.policy.verdict]?.readsThresholds
			? params.thresholds
			: null,
		settleAfter: plan.policy.unit === 'cycle' ? SETTLE_AFTER_BARS : null,
		liveMarks: params.liveMarks
	};
}

/** The exercise can make its content sound (a figure): it can be listened to. */
export function canSound(definition: ExerciseDefinition): boolean {
	return writesFigure(definition);
}

/** The meter an exercise is played in. */
function meterOf(definition: ExerciseDefinition): Meter {
	return definition.meter ?? METER_4_4;
}

/**
 * The figure `item`'s round plays (its round's first figure entry), which the series can make
 * sound (a demonstration, a listen, a play-along); null when the round writes none.
 */
export function contentFigure(definition: ExerciseDefinition, item: PlannedItem): Figure | null {
	return roundFigureOf(definition, item, meterOf(definition))?.figure ?? null;
}

/** Whether the player may ask to hear the content at exercise level `level`: free, or none. */
export function listenOf(definition: ExerciseDefinition, level: number): FigureParams['listen'] {
	return figureParamsOf(definition, level).listen;
}

/** How a run of an exercise opens and what plays under it. */
export interface RunSetup {
	/** What the listen-in plays: the accompaniment with no bar muted; null: the series' click. */
	listenIn: Accompaniment | null;
	/** The run's accompaniment, its bar 0 on transport bar `origin`; null: the series' click. */
	accompaniment(origin: number): Accompaniment | null;
	/** Bars of accompaniment alone before the counted bar (none: 0). */
	listenInBars: number;
	/** False: play starts right after the listen-in, with no counted bar. */
	countIn: boolean;
	/**
	 * Clicked bars the player plays before the run's first round, not judged: a cycle starts on
	 * the first muted bar, so the click's return is judged once, in the silence's cycle.
	 */
	entryBars: number;
}

/**
 * The run of `definition` at exercise level `exerciseLevel`, for any exercise: its round's
 * accompaniment (none: the series' click), the listen-in and the count of its pacing
 * (`pacing.listenInBars`, none by default; `pacing.countIn`, a counted bar by default), and its
 * entry: the bars before the accompaniment's first muted bar. Throws on a start the player could
 * not use (`checkStart`).
 */
export function runSetup(definition: ExerciseDefinition, exerciseLevel: number): RunSetup {
	const accompaniment = roundAccompanimentOf(definition, exerciseLevel);
	const pacing = pacingAt(definition, exerciseLevel);
	const start = { listenInBars: pacing.listenInBars ?? 0, countIn: pacing.countIn ?? true };
	checkStart(start);
	return {
		listenIn: accompaniment && unmuted(accompaniment),
		accompaniment: (origin) => accompaniment && accompanimentFrom(accompaniment, origin),
		...start,
		entryBars: landingBar(accompaniment)
	};
}

/**
 * The attempt of a settled round, every round one way (`recordedAttempt`): its plan with where it
 * started, the tempo it was played at (the execution's, in its meter's unit; none in free time)
 * and the thresholds its verdict read (`roundGiven`).
 */
export function roundAttempt(input: {
	definition: ExerciseDefinition;
	item: PlannedItem;
	plan: RoundPlan;
	outcome: RoundOutcome;
	/** The presenter's data for a response value (`SetPresenter.attemptData`). */
	data: (value: ResponseValue) => unknown;
	sessionId: string;
	execution: Execution;
	/** Epoch ms of the prompt (a cycle's: its first bar). */
	promptedAt: number;
	/** Audio seconds of the round's start. */
	startAudioS: number;
	cardKey: CardKey;
}): Omit<Attempt, 'id'> {
	const { definition, item, plan, execution } = input;
	const { tempoBpm } = execution;
	return recordedAttempt({
		outcome: input.outcome,
		item,
		plan,
		data: input.data,
		sessionId: input.sessionId,
		execution,
		promptedAt: input.promptedAt,
		cardKey: input.cardKey,
		startAudioS: input.startAudioS,
		tempo:
			tempoBpm === null
				? null
				: { at: Fraction.ZERO, bpm: tempoBpm, unit: meterOf(definition).unit },
		thresholds: roundGiven(definition, item, plan).thresholds
	});
}
