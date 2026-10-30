import { resolvedParamsOf } from '$lib/domain/exercise/levels';
import { ITEM_FIGURES } from '$lib/domain/derivations';
import { compileRound } from '$lib/domain/exercise/round';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import type { RhythmItem } from '$lib/domain/mechanics';
import {
	LISTEN_IN_BARS,
	MATCH_LIMIT,
	accompanimentFrom,
	landingBar,
	unmuted,
	type Accompaniment,
	type Aid,
	type CycleReport,
	type CycleVerdict,
	type Figure,
	type Fraction,
	type LevelParams,
	type Meter,
	type ResponseValue,
	type RoundOutcome,
	type RoundPlan
} from '$lib/domain/time';
import type { Attempt, CardKey, Execution, PlannedItem } from '$lib/domain/types';
import { aidsOf } from '../aids';
import { compileCycle, figureOf, SETTLE_AFTER_BARS } from '../cycle/compileCycle';
import { cycleAids, levelAided, recordCycle } from '../cycle/recordCycle';
import { rhythmParamsOf } from '../cycle/rhythmExercise';
import { responseAttempt } from './recordResponse';

/**
 * How the series plays an item's round: the one place that tells a cycle (an exercise that writes
 * `figures`, compiled from its figure by `compileCycle`, D8) from a round of a template
 * (`compileRound`). Everything the series asks of a round's data goes through here; the rest of
 * the series knows neither.
 */

/**
 * Its rounds are cycles of a figure (D8): its items are the figures it writes (`ITEM_FIGURES`),
 * until the rhythm is written as a round template whose figure entry reads them.
 */
export function playsCycles(definition: ExerciseDefinition): boolean {
	return (
		(definition.figures?.length ?? 0) > 0 &&
		Object.values(ITEM_FIGURES).some((reader) => reader.reads.includes(definition.mechanic))
	);
}

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
	if (playsCycles(definition)) {
		const startBar = context.fromRunStart ?? undefined;
		return compileCycle(definition, item as PlannedItem<RhythmItem>, meter, startBar);
	}
	return compileRound(definition, item, meter, {
		previewBeats: context.previewBeats,
		fromRunStart: context.fromRunStart
	});
}

/** What the level of a round gives its judge beyond its plan, and how long it keeps listening. */
export interface RoundGiven {
	/** The thresholds a verdict that reads them judges against; null when the exercise writes none. */
	thresholds: LevelParams['thresholds'] | null;
	/** The aids the round is played with. */
	aids: Aid[];
	/**
	 * Bars after its handover the round keeps taking what it captured but was heard late, the next
	 * round open meanwhile; null: it closes at its handover.
	 */
	settleAfter: Fraction | null;
}

/** How the series helped a round beyond its item: its content heard before it, or played along. */
export interface RoundHelp {
	/** The content was just heard (a listen, a demonstration). */
	listened: boolean;
	/** The content sounds with the player (the anti-blocking's play-along). */
	playAlong: boolean;
}

const UNHELPED: RoundHelp = { listened: false, playAlong: false };

export function roundGiven(
	definition: ExerciseDefinition,
	item: PlannedItem,
	help: RoundHelp = UNHELPED
): RoundGiven {
	if (playsCycles(definition)) {
		const params = rhythmParamsOf(definition, item.exerciseLevel);
		return {
			thresholds: params.thresholds,
			aids: cycleAids({
				params,
				aidLevel: item.exerciseLevel < 0,
				listened: help.listened,
				playAlong: help.playAlong
			}),
			settleAfter: SETTLE_AFTER_BARS
		};
	}
	const { thresholds } = resolvedParamsOf(definition, {
		exerciseLevel: item.exerciseLevel,
		itemLevel: item.level ?? null,
		mechanic: item.mechanic
	});
	return {
		thresholds:
			typeof thresholds === 'object' && thresholds !== null
				? (thresholds as LevelParams['thresholds'])
				: null,
		aids: aidsOf(item),
		settleAfter: null
	};
}

/**
 * Whether a round's aids helped beyond what its level gives (`nextLevelState`'s `aided`): for a
 * cycle, its level's cursor and aid level are the level itself (`levelAided`); otherwise any aid.
 */
export function aidedBeyondLevel(
	definition: ExerciseDefinition,
	item: PlannedItem,
	aids: readonly Aid[]
): boolean {
	if (playsCycles(definition)) {
		return levelAided(aids, rhythmParamsOf(definition, item.exerciseLevel));
	}
	return aids.length > 0;
}

/** The exercise can make its content sound (a figure): it can be listened to, and played along. */
export function canSound(definition: ExerciseDefinition): boolean {
	return playsCycles(definition);
}

/**
 * The figure `item`'s round plays, which the series can make sound (a demonstration, a listen, a
 * play-along); null when the exercise cannot make its content sound (a template).
 */
export function contentFigure(definition: ExerciseDefinition, item: PlannedItem): Figure | null {
	if (!playsCycles(definition)) return null;
	return figureOf(definition, (item as PlannedItem<RhythmItem>).item.figureId);
}

/** What listening to the content is worth at exercise level `level`: free, an aid, or none. */
export function listenOf(definition: ExerciseDefinition, level: number): LevelParams['listen'] {
	return playsCycles(definition) ? rhythmParamsOf(definition, level).listen : 'none';
}

/**
 * What the anti-blocking reads of a settled round (`SettledRound`): a cycle's report and verdict,
 * and the spot (`MATCH_LIMIT` at a whole note of `wholeS` seconds) within which extras fall on the
 * same place; a round judged otherwise gives nothing to compare.
 */
export function blockReadingOf(
	definition: ExerciseDefinition,
	outcome: RoundOutcome,
	wholeS: number
): { report?: CycleReport; verdict?: CycleVerdict; spotMs: number } {
	if (!playsCycles(definition)) return { spotMs: 0 };
	return {
		report: outcome.detail as CycleReport,
		verdict: outcome.verdict.value as CycleVerdict,
		spotMs: MATCH_LIMIT.toNumber() * wholeS * 1000
	};
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

/** The run of `definition` at exercise level `exerciseLevel`: from its params, the cycle's or any exercise's. */
export function runSetup(definition: ExerciseDefinition, exerciseLevel: number): RunSetup {
	if (playsCycles(definition)) {
		const params = rhythmParamsOf(definition, exerciseLevel);
		return {
			listenIn: unmuted(params.accompaniment),
			accompaniment: (origin) => accompanimentFrom(params.accompaniment, origin),
			listenInBars: params.listenInBars ?? LISTEN_IN_BARS,
			countIn: params.countIn ?? true,
			entryBars: landingBar(params.accompaniment)
		};
	}
	const { accompaniment } = resolvedParamsOf(definition, { exerciseLevel, itemLevel: null });
	const written = isAccompaniment(accompaniment) ? accompaniment : null;
	return {
		listenIn: written && unmuted(written),
		accompaniment: (origin) => written && accompanimentFrom(written, origin),
		listenInBars: 0,
		countIn: true,
		entryBars: 0
	};
}

function isAccompaniment(value: unknown): value is Accompaniment {
	return (
		typeof value === 'object' &&
		value !== null &&
		'figure' in value &&
		Array.isArray((value as { bars?: unknown }).bars)
	);
}

/**
 * The attempt of a settled round: a cycle's (`recordCycle`, its figure and level, the resolved
 * plan) or a response round's (`responseAttempt`, with its presenter's `data`).
 */
export function roundAttempt(input: {
	definition: ExerciseDefinition;
	item: PlannedItem;
	plan: RoundPlan;
	outcome: RoundOutcome;
	/** The mechanic's data for a response value (`MechanicPresenter.attemptData`). */
	data: (value: ResponseValue) => unknown;
	sessionId: string;
	execution: Execution;
	/** Epoch ms of the prompt (a cycle's: its first bar). */
	promptedAt: number;
	/** Audio seconds of the round's start. */
	startAudioS: number;
	cardKey: CardKey;
	/** Whole bars from its run's first bar to its start; null when not known. */
	fromRunStart: number | null;
}): Omit<Attempt, 'id'> {
	const { definition, item, outcome } = input;
	if (playsCycles(definition)) {
		const params = rhythmParamsOf(definition, item.exerciseLevel);
		const { figureId } = (item as PlannedItem<RhythmItem>).item;
		return recordCycle({
			sessionId: input.sessionId,
			exerciseId: item.exerciseId,
			setup: {
				figureId,
				figure: figureOf(definition, figureId),
				level: item.exerciseLevel,
				params,
				startBar: input.fromRunStart ?? landingBar(params.accompaniment)
			},
			outcome,
			promptedAt: input.promptedAt,
			startAudioS: input.startAudioS,
			observations: []
		});
	}
	return responseAttempt({
		outcome,
		item,
		plan: input.plan,
		data: input.data(outcome.verdict.value as ResponseValue),
		sessionId: input.sessionId,
		execution: input.execution,
		promptedAt: input.promptedAt,
		cardKey: input.cardKey
	});
}
