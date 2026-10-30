import { rhythmFigureRules, type RhythmItem } from '$lib/domain/mechanics';
import {
	figureToJson,
	type Aid,
	type CycleReport,
	type Figure,
	type LevelParams,
	type RoundOutcome
} from '$lib/domain/time';
import { cardKey, type Attempt, type RecordedObservation } from '$lib/domain/types';
import { tempoSegmentOf } from './rhythmExercise';

/** `Attempt.data` of a rhythm cycle: the figure and level played, and the judge's report. */
export interface RhythmAttemptData {
	item: RhythmItem;
	level: number;
	report: CycleReport;
}

/** What a played cycle was set to: the figure, the level and its params, the landing bar. */
export interface CycleSetup {
	figureId: string;
	figure: Figure;
	/** Level index (0 = level 1, aid levels negative). */
	level: number;
	params: LevelParams;
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
	thresholds: LevelParams['thresholds'];
	/**
	 * Audio time (s) the cycle started, on the clock the diagnostic journal uses too: the oracle
	 * places the cycle by it. Absent from the cycles stored before it was kept.
	 */
	startAudioS?: number;
}

export function cyclePlanRecord(setup: CycleSetup): CyclePlanRecord {
	const { params } = setup;
	const { window, accompaniment } = params;
	const tempo = tempoSegmentOf(params);
	return {
		figureId: setup.figureId,
		figure: figureToJson(setup.figure),
		cycleBars: params.cycleBars,
		startBar: setup.startBar,
		accompaniment: {
			figure: figureToJson(accompaniment.figure),
			bars: [...accompaniment.bars]
		},
		tempo: { at: tempo.at.toString(), bpm: tempo.bpm, unit: tempo.unit.toString() },
		window: 'ms' in window ? { ms: window.ms } : { ofGap: window.ofGap.toString() },
		thresholds: { ...params.thresholds }
	};
}

/**
 * The aids a cycle is played with: the cursor when the level gives it, a listen to the figure
 * just before when the level counts listening as an aid (`listen: 'aid'`), the aid level, and
 * the figure played along with it (the anti-blocking's remedy).
 */
export function cycleAids(input: {
	params: LevelParams;
	aidLevel: boolean;
	listened: boolean;
	playAlong: boolean;
}): Aid[] {
	const { params, aidLevel, listened, playAlong } = input;
	return [
		...(params.cursor ? (['cursor'] as const) : []),
		...(listened && params.listen === 'aid' ? (['listen'] as const) : []),
		...(aidLevel ? (['aid-level'] as const) : []),
		...(playAlong ? (['play-along'] as const) : [])
	];
}

/**
 * Whether a cycle had help beyond its level's own (`nextLevelState`'s `aided`): the cursor the
 * level gives and the aid level are the level itself, so a cycle with them alone still counts
 * to move up; any other aid (a listen worth an aid, playing along) does not.
 */
export function levelAided(aids: readonly Aid[], params: LevelParams): boolean {
	return aids.some((aid) => !(aid === 'aid-level' || (aid === 'cursor' && params.cursor)));
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
		tempoBpm: setup.params.tempo,
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
