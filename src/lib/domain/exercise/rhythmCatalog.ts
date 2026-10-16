import {
	clickAccompaniment,
	Fraction,
	METER_4_4,
	type Accompaniment,
	type Figure,
	type Level,
	type LevelParams,
	type TempoSegment
} from '$lib/domain/time';
import { parseLilyPondRhythm } from '$lib/domain/time/notation/lilypond';
import type { ExerciseDefinition } from './types';

/**
 * The pure rhythm exercises (spec 2026-10-14, section 9): a figure played over and over, cycle
 * after cycle, the accompaniment taken away or the tempo raised as the player gets it. Figures
 * are written in LilyPond once, here, and are plain data afterwards; the how-to texts are ours.
 *
 * A level overrides the exercise's `base` params alone (`resolveLevel`), so each level below
 * states everything that differs from the base, the changes of the levels before it included.
 */

const QUARTER = Fraction.of(1, 4);

/** The tempo of a level, in quarter notes per minute. */
const tempo = (bpm: number): TempoSegment => ({ at: Fraction.ZERO, bpm, unit: QUARTER });

/** One 4/4 bar of clicks on `beats` (accent on `accent`), the bars switched on or off in turn. */
function clicks(beats: number[], bars: ('on' | 'off')[], accent: number[] = []): Accompaniment {
	return clickAccompaniment({ meter: METER_4_4, beats, accent, bars });
}

const EVERY_BEAT = [1, 2, 3, 4];

/** The bars of an accompaniment, written as the bars played then the bars left silent. */
function playedThenSilent(played: number, silent: number): ('on' | 'off')[] {
	return [...Array<'on'>(played).fill('on'), ...Array<'off'>(silent).fill('off')];
}

/** The thresholds that every rhythm exercise starts from (the measures of the judge, 0-100 or ms). */
const BASE_THRESHOLDS = { regularity: 40, holdOffset: 60, holdDrift: 25, precision: 60 };

function figureOf(text: string): Figure {
	return parseLilyPondRhythm(text, { meter: METER_4_4 });
}

// Mesures silencieuses ---------------------------------------------------------------------

const SILENT_BARS_BASE: LevelParams = {
	accompaniment: clicks(EVERY_BEAT, playedThenSilent(3, 1), [1]),
	cycleBars: 4,
	tempo: tempo(80),
	window: { ms: 80 },
	feedback: 'every-cycle',
	listen: 'free',
	cursor: true,
	cyclesPerBreath: 4,
	cyclesPerSeries: 1,
	thresholds: BASE_THRESHOLDS
};

/** The click plays `played` bars, then `muted` stay silent. */
const silent = (played: number, muted: number): Level['params'] => ({
	accompaniment: clicks(EVERY_BEAT, playedThenSilent(played, muted), [1])
});

/** Slower is harder: the same ladder again at ♩ = 65, the cursor gone and the windows tighter. */
const SLOW: Level['params'] = { tempo: tempo(65), cursor: false, window: { ms: 50 } };

export const RHYTHM_SILENT_BARS: ExerciseDefinition = {
	id: 'rhythm-silent-bars',
	version: 1,
	title: { fr: 'Mesures silencieuses', en: 'Silent bars' },
	mechanic: 'rhythm-figure',
	params: { sensor: 'attack' },
	view: 'rhythm-figure',
	howTo: {
		fr: 'Joue des croches continues, une attaque sur chaque demi-temps. Le clic se tait sur certaines mesures : garde le même tempo, comme s’il continuait, et retrouve-le quand il revient. Tu entends la figure d’abord, puis tu la joues par séries de quatre tours.',
		en: 'Play steady eighth notes, one attack on every half beat. The click drops out on some bars: keep the same tempo as if it carried on, and meet it again when it returns. You hear the figure first, then play it in runs of four turns.'
	},
	base: SILENT_BARS_BASE,
	figures: [{ id: 'eighths', figure: figureOf('c8 c c c c c c c') }],
	pick: 'loop',
	levels: [
		{ aid: true, params: silent(4, 0) },
		{ params: silent(3, 1) },
		{ params: silent(2, 2) },
		{ params: silent(1, 3) },
		{ params: { ...silent(3, 1), ...SLOW } },
		{ params: { ...silent(2, 2), ...SLOW, feedback: 'summary' } },
		{
			params: {
				...silent(1, 3),
				...SLOW,
				window: { ms: 30 },
				feedback: 'out-of-tolerance',
				thresholds: { regularity: 20, holdOffset: 25, holdDrift: 10, precision: 30 }
			}
		}
	]
};

// Métronome sur 2 et 4 ---------------------------------------------------------------------

const TWO_FOUR_LINES = [
	'c4 c4 c4 c4 | c4 c4 c2 | c2 c4 c4 | c4 c4 c4 c4',
	'c4 c8 c8 c4 c4 | c8 c8 c8 c8 c4 c4 | c2 c4 c4 | c4 c4 c2',
	'c2 c2 | c4 c4 c8 c8 c4 | c8 c8 c4 c8 c8 c4 | c4 c4 c4 c4',
	'c8 c8 c8 c8 c8 c8 c8 c8 | c4 c4 c2 | c4 c8 c8 c4 c8 c8 | c2 c2',
	'c4 c4 c4 c4 | c2 c4 c8 c8 | c8 c8 c8 c8 c4 c4 | c4 c2 c4',
	'c4 r4 c4 c4 | c8 c8 c8 c8 c2 | c4 c4 c8 c8 c4 | c2 c4 r4'
];

const TWO_FOUR_BASE: LevelParams = {
	accompaniment: clicks([2, 4], ['on']),
	cycleBars: 4,
	tempo: tempo(100),
	window: { ms: 80 },
	feedback: 'every-cycle',
	listen: 'aid',
	cursor: true,
	cyclesPerBreath: 1,
	cyclesPerSeries: 1,
	thresholds: BASE_THRESHOLDS
};

export const RHYTHM_TWO_FOUR: ExerciseDefinition = {
	id: 'rhythm-two-four',
	version: 1,
	title: { fr: 'Métronome sur 2 et 4', en: 'Click on 2 and 4' },
	mechanic: 'rhythm-figure',
	params: { sensor: 'attack' },
	view: 'rhythm-figure',
	howTo: {
		fr: 'Lis la ligne de quatre mesures et joue-la d’un trait. Le clic ne marque que les temps 2 et 4 : le 1 et le 3, c’est à toi de les porter. Une nouvelle ligne vient à chaque tour. Tu peux réécouter la ligne avant de la jouer.',
		en: 'Read the four-bar line and play it in one go. The click only marks beats 2 and 4: beats 1 and 3 are yours to carry. A new line comes each turn. You can listen to the line before you play it.'
	},
	base: TWO_FOUR_BASE,
	figures: TWO_FOUR_LINES.map((text, i) => ({ id: `line-${i + 1}`, figure: figureOf(text) })),
	pick: 'next',
	levels: [
		{ aid: true, params: { accompaniment: clicks(EVERY_BEAT, ['on']) } },
		{ params: {} },
		{ params: { tempo: tempo(120) } },
		{ params: { tempo: tempo(140), cursor: false } }
	]
};

// Contretemps ------------------------------------------------------------------------------

const OFFBEAT_BAR = 'c8 c r c r c r c';

const OFFBEATS_BASE: LevelParams = {
	accompaniment: clicks(EVERY_BEAT, ['on'], [1]),
	cycleBars: 1,
	tempo: tempo(80),
	window: { ms: 80 },
	feedback: 'every-cycle',
	listen: 'free',
	cursor: true,
	cyclesPerBreath: 4,
	cyclesPerSeries: 1,
	thresholds: BASE_THRESHOLDS
};

export const RHYTHM_OFFBEATS: ExerciseDefinition = {
	id: 'rhythm-offbeats',
	version: 1,
	title: { fr: 'Contretemps', en: 'Offbeats' },
	mechanic: 'rhythm-figure',
	params: { sensor: 'attack' },
	view: 'rhythm-figure',
	howTo: {
		fr: 'Joue les contretemps : une attaque sur le « et » de chaque temps, plus le premier temps de la mesure. D’abord une mesure en boucle, sans ajouter ni retirer un seul temps ; puis deux mesures dont la seconde ne tombe pas sur le 1.',
		en: 'Play the offbeats: one attack on the “and” of each beat, plus the first beat of the bar. First one bar on a loop, without adding or dropping a single beat; then two bars whose second does not land on the 1.'
	},
	base: OFFBEATS_BASE,
	figures: [
		{ id: 'offbeats-1', figure: figureOf(OFFBEAT_BAR) },
		{ id: 'offbeats-2', figure: figureOf(`${OFFBEAT_BAR} | r c r c r c r c`) }
	],
	pick: 'loop',
	levels: [
		{ aid: true, params: { tempo: tempo(70) } },
		{
			params: {
				// The teacher's criterion: no beat added, none dropped. Faithfulness alone counts.
				thresholds: { regularity: 80, holdOffset: 200, holdDrift: 100 }
			}
		},
		{ params: { cycleBars: 2 } },
		{ params: { cycleBars: 2, tempo: tempo(90) } },
		{ params: { cycleBars: 2, tempo: tempo(100), cursor: false } }
	]
};

export const RHYTHM_EXERCISES: readonly ExerciseDefinition[] = [
	RHYTHM_SILENT_BARS,
	RHYTHM_TWO_FOUR,
	RHYTHM_OFFBEATS
];

/**
 * The figures of an exercise a level can play: those whose bars divide the level's cycle, the
 * longest ones only (a cycle of two bars plays the two-bar figure, not the bar twice).
 */
export function eligibleFigures(
	exercise: Pick<ExerciseDefinition, 'figures'>,
	params: Pick<LevelParams, 'cycleBars'>
): { id: string; figure: Figure }[] {
	const fitting = (exercise.figures ?? []).filter(
		({ figure }) => params.cycleBars % figure.bars === 0
	);
	const longest = Math.max(0, ...fitting.map(({ figure }) => figure.bars));
	return fitting.filter(({ figure }) => figure.bars === longest);
}
