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
	type TempoSegment
} from '$lib/domain/time';

/**
 * What the rhythm view shows at a moment of the series: the accompaniment alone before playing
 * (`listen-in`), the counted bar (`count-in`), the cycles played (`play`, the entry bars
 * included), a figure heard rather than played (`listening`), and the breath between runs.
 */
export type RhythmPhase = 'listen-in' | 'count-in' | 'play' | 'listening' | 'breath';

export type Announcement =
	'level-up' | 'level-down' | 'aid-level' | 'listen-remedy' | 'play-along' | 'change-of-air';

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
}

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
export function levelView(levels: readonly Level[], index: number): RhythmStageModel['level'] {
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
