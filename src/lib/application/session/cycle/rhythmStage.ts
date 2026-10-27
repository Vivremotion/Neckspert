import {
	Fraction,
	barLength,
	beatPositions,
	levelRange,
	type CycleReport,
	type CycleVerdict,
	type Feedback,
	type Figure,
	type Level,
	type LevelParams,
	type RoundOutcome,
	type TempoSegment
} from '$lib/domain/time';
import type { ExerciseDefinition } from '$lib/domain/exercise';
import type { RhythmItem } from '$lib/domain/mechanics';
import type { Locale, PlannedItem } from '$lib/domain/types';
import type { Announcement } from '../contract';
import { figureOf } from './compileCycle';
import { rhythmLevels, rhythmParamsOf, tempoSegmentOf } from './rhythmExercise';

/**
 * What the rhythm view shows at a moment of the series: the accompaniment alone before playing
 * (`listen-in`), the counted bar (`count-in`), the cycles played (`play`, the entry bars
 * included), a figure heard rather than played (`listening`), and the breath between runs.
 */
export type RhythmPhase = 'listen-in' | 'count-in' | 'play' | 'listening' | 'breath';

export type { Announcement } from '../contract';

/** One settled cycle of the run, as the breath shows it. */
export interface SettledCycle {
	report: CycleReport;
	verdict: CycleVerdict;
}

/** The screen model of a rhythm exercise: opaque to the core, read by the `rhythm-figure` view. */
export interface RhythmStageModel {
	phase: RhythmPhase;
	exerciseLabel: string;
	/**
	 * The level played: `shown` is its number on screen (1 for the first level; an aid level,
	 * below it, shows 0 or less and has `aid`), `of` the number of regular levels.
	 */
	level: { shown: number; of: number; aid: boolean };
	/** « ♩ = 100 bpm »: the beats per minute and the glyph of the beat unit. */
	tempo: { bpm: number; unit: string };
	/** The figure played (or heard); at the breath, the one just played. */
	figure: Figure;
	/** At the breath, the figure to play next; null otherwise. */
	next: Figure | null;
	/** Bar of the cycle from 0; the entry bars count as the end of a cycle before the first. */
	barInCycle: number;
	cycleBars: number;
	/** The click is silent in this bar. */
	muted: boolean;
	/**
	 * Where the beat stands in the figure (from its start, in whole notes); null when the level
	 * gives no cursor, in a muted bar, or outside the figure (listen-in, count, breath).
	 */
	cursor: Fraction | null;
	feedback: Feedback;
	/** The cycles of the run settled so far, oldest first; shown at the breath. */
	settled: SettledCycle[];
	/**
	 * What is said now: at the breath, the level the run moved to (an aid level is announced as
	 * such); during a cycle, the anti-blocking's remedy under way; once the series changes the
	 * air, that.
	 */
	announcement: Announcement | null;
	/** What listening to the figure is worth at this level (`listen()`); `none` hides the button. */
	listen: LevelParams['listen'];
	/** The feedback is told in plain words; once the exercise is familiar, by its term alone. */
	plainWords: boolean;
}

/** Sessions of an exercise after which its feedback drops the plain words and keeps the term. */
export const PLAIN_WORDS_SESSIONS = 3;

/** The note value of a beat unit, as a glyph; the fraction itself when it has none. */
const UNIT_GLYPHS: Record<string, string> = {
	'1/2': '𝅗𝅥',
	'1/4': '♩',
	'1/8': '♪',
	'3/8': '♩.',
	'3/4': '𝅗𝅥.'
};

/** « ♩ = 100 bpm » as data: the tempo's beats per minute and its unit's glyph. */
export function tempoView(tempo: TempoSegment): RhythmStageModel['tempo'] {
	return { bpm: tempo.bpm, unit: UNIT_GLYPHS[tempo.unit.toString()] ?? tempo.unit.toString() };
}

/** Level `index` (0 = level 1, aid levels negative) as the screen numbers it. */
export function levelView(
	levels: readonly Level<unknown>[],
	index: number
): RhythmStageModel['level'] {
	const { highest } = levelRange(levels);
	return { shown: index + 1, of: highest + 1, aid: index < 0 };
}

/** Where beat `beat` (from 0, in the meter's grouping) of cycle bar `barInCycle` stands in a figure whose cycle began at figure bar `startBar`. */
export function figurePosition(input: {
	figure: Figure;
	startBar: number;
	barInCycle: number;
	beat: number;
}): Fraction {
	const { figure, startBar, barInCycle, beat } = input;
	const figureBar = (((startBar + barInCycle) % figure.bars) + figure.bars) % figure.bars;
	return barLength(figure.meter)
		.mul(Fraction.of(figureBar))
		.add(beatPositions(figure.meter)[beat] ?? Fraction.ZERO);
}

/** Where the series stands, as the rhythm view reads it (`cycleStage`). */
export type CycleMoment =
	/** Before play: the start screen. */
	| 'waiting'
	| 'listen-in'
	| 'count-in'
	/** The run's clicked bars before its first cycle: played, not judged. */
	| 'entry'
	| 'round';

/**
 * The rhythm view's model of `item`'s cycle at a moment of the series, built from the series'
 * events: what it plays now (`moment`), the bar of the cycle (`barInRound`, negative in the entry)
 * and the beat, where the cycle starts in the loops of its figure (`startBar`), the bars it mutes,
 * the cycles of the run settled so far, and how familiar the exercise is (`endedSessions`).
 */
export function cycleStage(input: {
	definition: ExerciseDefinition;
	item: PlannedItem<RhythmItem>;
	moment: CycleMoment;
	barInRound: number;
	beat: number;
	startBar: number;
	mutedBars: readonly number[];
	settled: readonly RoundOutcome[];
	locale: Locale;
	endedSessions: number;
}): RhythmStageModel {
	const { definition, item, moment, barInRound } = input;
	const level = item.exerciseLevel;
	const params = rhythmParamsOf(definition, level);
	const figure = figureOf(definition, item.item.figureId);
	const playing = moment === 'entry' || moment === 'round';
	const barInCycle =
		moment === 'round' ? barInRound : moment === 'entry' ? params.cycleBars + barInRound : 0;
	const muted = moment === 'round' && input.mutedBars.includes(barInRound);
	return {
		phase: playing ? 'play' : moment === 'count-in' ? 'count-in' : 'listen-in',
		exerciseLabel: definition.title?.[input.locale] ?? definition.id,
		level: levelView(rhythmLevels(definition), level),
		tempo: tempoView(tempoSegmentOf(params)),
		figure,
		next: null,
		barInCycle,
		cycleBars: params.cycleBars,
		muted,
		cursor:
			playing && params.cursor && !muted
				? figurePosition({
						figure,
						startBar: input.startBar + barInRound,
						barInCycle: 0,
						beat: input.beat
					})
				: null,
		feedback: params.feedback,
		settled: input.settled.map((outcome) => ({
			report: outcome.detail as CycleReport,
			verdict: outcome.verdict.value as CycleVerdict
		})),
		announcement: null,
		listen: params.listen,
		plainWords: input.endedSessions < PLAIN_WORDS_SESSIONS
	};
}
