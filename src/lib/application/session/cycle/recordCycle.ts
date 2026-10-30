import { rhythmFigureRules, type RhythmItem } from '$lib/domain/mechanics';
import type { FigureParams } from '$lib/domain/exercise/figureParams';
import {
	figureToJson,
	type Accompaniment,
	type Aid,
	type CycleReport,
	type CycleThresholds,
	type ExpectationWindow,
	type Figure,
	type RoundOutcome,
	type TempoSegment
} from '$lib/domain/time';
import { cardKey, type Attempt, type RecordedObservation } from '$lib/domain/types';

/** `Attempt.data` of a rhythm cycle: the figure and level played, and the judge's report. */
export interface RhythmAttemptData {
	item: RhythmItem;
	level: number;
	report: CycleReport;
}

/**
 * What a played cycle was set to: the figure, the level and what it played at (its bars, its
 * accompaniment, its tempo, its window and its thresholds), the landing bar.
 */
export interface CycleSetup {
	figureId: string;
	figure: Figure;
	/** Level index (0 = level 1, aid levels negative). */
	level: number;
	cycleBars: number;
	accompaniment: Accompaniment;
	/** From the start, its beat the exercise's. */
	tempo: TempoSegment;
	window: ExpectationWindow;
	thresholds: CycleThresholds;
	/** The cycle's first bar in the loops of the figure and of the accompaniment (`figureExpectations`). */
	startBar: number;
}

/**
 * The resolved plan of a cycle as its attempt keeps it, in plain JSON (fractions as text,
 * figures in their versioned JSON), so the attempt can be replayed whatever the catalog becomes.
 */
export interface CyclePlanRecord {
	figureId: string;
	figure: unknown;
	cycleBars: number;
	startBar: number;
	accompaniment: { figure: unknown; bars: ('on' | 'off')[] };
	tempo: { at: string; bpm: number; unit: string };
	window: { ms: number } | { ofGap: string };
	thresholds: CycleThresholds;
	/**
	 * Audio time (s) the cycle started, on the clock the diagnostic journal uses too: the oracle
	 * places the cycle by it. Absent from the cycles stored before it was kept.
	 */
	startAudioS?: number;
}

export function cyclePlanRecord(setup: CycleSetup): CyclePlanRecord {
	const { window, accompaniment, tempo } = setup;
	return {
		figureId: setup.figureId,
		figure: figureToJson(setup.figure),
		cycleBars: setup.cycleBars,
		startBar: setup.startBar,
		accompaniment: {
			figure: figureToJson(accompaniment.figure),
			bars: [...accompaniment.bars]
		},
		tempo: { at: tempo.at.toString(), bpm: tempo.bpm, unit: tempo.unit.toString() },
		window: 'ms' in window ? { ms: window.ms } : { ofGap: window.ofGap.toString() },
		thresholds: { ...setup.thresholds }
	};
}

/**
 * The aids a round is played with beyond its item's: the cursor when the level gives it, a listen
 * to the content just before when the level counts listening as an aid (`listen: 'aid'`), the aid
 * level, and the content played along with it (the anti-blocking's remedy).
 */
export function cycleAids(input: {
	cursor: boolean;
	listen: FigureParams['listen'];
	aidLevel: boolean;
	listened: boolean;
	playAlong: boolean;
}): Aid[] {
	const { cursor, listen, aidLevel, listened, playAlong } = input;
	return [
		...(cursor ? (['cursor'] as const) : []),
		...(listened && listen === 'aid' ? (['listen'] as const) : []),
		...(aidLevel ? (['aid-level'] as const) : []),
		...(playAlong ? (['play-along'] as const) : [])
	];
}

/**
 * Whether a round had help beyond its level's own (`nextLevelState`'s `aided`): the cursor the
 * level gives (`cursor`) and the aid level are the level itself, so a round with them alone still
 * counts to move up; any other aid (a listen worth an aid, playing along) does not.
 */
export function levelAided(aids: readonly Aid[], cursor: boolean): boolean {
	return aids.some((aid) => !(aid === 'aid-level' || (aid === 'cursor' && cursor)));
}

/**
 * A settled cycle as an attempt: a hot free attempt of the `rhythm-figure` mechanic on the card
 * of its figure at its level. `correct` is null (a cycle judges time only); `success`, verdict,
 * measures and aids are the round's; the placement, when measured, is the timing offset.
 */
export function recordCycle(input: {
	sessionId: string;
	exerciseId: string;
	setup: CycleSetup;
	outcome: RoundOutcome;
	/** Epoch ms of the cycle's first bar. */
	promptedAt: number;
	/** Audio time (s) of the cycle's first bar. */
	startAudioS: number;
	observations: RecordedObservation[];
}): Attempt<RhythmAttemptData> {
	const { setup, outcome } = input;
	const item: RhythmItem = { figureId: setup.figureId, level: setup.level };
	return {
		sessionId: input.sessionId,
		exerciseId: input.exerciseId,
		mechanic: rhythmFigureRules.id,
		cardKey: cardKey(rhythmFigureRules.id, rhythmFigureRules.itemKey(item)),
		phase: 'free',
		temperature: 'hot',
		aids: [...outcome.aids],
		promptedAt: input.promptedAt,
		tempoBpm: setup.tempo.bpm,
		leadBeats: null,
		timingOffsetMs: outcome.measures.placement?.value ?? null,
		reactionMs: null,
		correct: null,
		success: outcome.success,
		verdict: outcome.verdict,
		measures: outcome.measures,
		plan: { ...cyclePlanRecord(setup), startAudioS: input.startAudioS },
		data: { item, level: setup.level, report: outcome.detail as CycleReport },
		observations: input.observations
	};
}
