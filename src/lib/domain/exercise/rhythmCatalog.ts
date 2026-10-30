import {
	clickAccompaniment,
	METER_4_4,
	type Accompaniment,
	type CycleThresholds,
	type ExpectationWindow,
	type Figure
} from '$lib/domain/time';
import type { FigureParams } from './figureParams';
import { parseLilyPond } from '$lib/domain/time/notation/lilypond';
import type { LevelOverrides } from './levels';
import type { RoundTemplate } from './round';
import type { ExerciseDefinition, ExercisePacing } from './types';

/**
 * The pure rhythm exercises (spec 2026-10-14, section 9): a figure played over and over, cycle
 * after cycle, the accompaniment taken away or the tempo raised as the player gets it. Figures
 * are written in LilyPond once, here, and are plain data afterwards; the how-to texts are ours.
 *
 * Their params are what their round reads (accompaniment, cycle bars, window) and their figure
 * params (`FigureParams`); each writes its tempo as its own `tempo`, in quarter notes per minute,
 * and its `pacing`: two bars of listen-in, runs of cycles and a breath of at least
 * `SHORTEST_BREATH_MS` between them. A level overrides dotted paths of the exercise's params
 * alone (`resolvedParamsOf`), the tempo included, so each level below states everything that
 * differs from the params, the changes of the levels before it included. Each asks the
 * anti-blocking (`flow.antiBlocking`).
 */

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
const BASE_THRESHOLDS: CycleThresholds = {
	regularity: 40,
	holdOffset: 60,
	holdDrift: 25,
	precision: 60
};

/** The shortest breath between two runs of cycles, rounded up to whole bars. */
const SHORTEST_BREATH_MS = 4000;

/** Bars of the accompaniment alone before a run's counted bar. */
const RHYTHM_LISTEN_IN_BARS = 2;

/** The params of a rhythm exercise: what its round reads, its figure params and its pacing. */
type RhythmParams = FigureParams & {
	accompaniment: Accompaniment;
	cycleBars: number;
	window: ExpectationWindow;
	pacing: Pick<ExercisePacing, 'roundsPerBreath' | 'breathMinMs' | 'listenInBars' | 'countIn'>;
};

/**
 * Two bars of listen-in, then runs of `rounds` cycles chained without a gap, a breath of at least
 * `SHORTEST_BREATH_MS` after each.
 */
function runsOf(rounds: number): RhythmParams['pacing'] {
	return {
		listenInBars: RHYTHM_LISTEN_IN_BARS,
		roundsPerBreath: rounds,
		breathMinMs: SHORTEST_BREATH_MS
	};
}

function figureOf(text: string): Figure {
	return parseLilyPond(text, { meter: METER_4_4 });
}

/**
 * The round of every rhythm exercise: its item's figure looped over the cycle's bars, judged as a
 * whole by the alignment; the cycle follows its accompaniment and window, both of its level.
 */
const CYCLE_ROUND: RoundTemplate = {
	expectations: [
		{
			figure: { item: 'figure' },
			at: { bars: 0 },
			sensor: 'attack',
			content: null,
			window: { param: 'window' }
		}
	],
	accompaniment: { param: 'accompaniment' },
	length: { bars: { param: 'cycleBars' } },
	handover: 'end',
	policy: { unit: 'cycle', verdict: 'cycle', correction: false, pairing: { mode: 'alignment' } }
};

// Mesures silencieuses ---------------------------------------------------------------------

const SILENT_BARS_PARAMS: RhythmParams = {
	accompaniment: clicks(EVERY_BEAT, playedThenSilent(3, 1), [1]),
	cycleBars: 4,
	window: { ms: 80 },
	feedback: 'every-cycle',
	listen: 'free',
	cursor: true,
	pacing: runsOf(4),
	thresholds: BASE_THRESHOLDS
};

/** The click plays `played` bars, then `muted` stay silent. */
const silent = (played: number, muted: number): LevelOverrides => ({
	accompaniment: clicks(EVERY_BEAT, playedThenSilent(played, muted), [1])
});

/** Slower is harder: the same ladder again at ♩ = 65, the cursor gone and the windows tighter. */
const SLOW: LevelOverrides = { tempo: 65, cursor: false, window: { ms: 50 } };

export const RHYTHM_SILENT_BARS: ExerciseDefinition = {
	id: 'rhythm-silent-bars',
	version: 1,
	title: { fr: 'Mesures silencieuses', en: 'Silent bars' },
	mechanic: 'figure',
	params: { sensor: 'attack', ...SILENT_BARS_PARAMS },
	tempo: 80,
	// Its instruction is told until the player has played it once.
	flow: { antiBlocking: true, briefing: 'first-encounter' },
	view: 'rhythm-figure',
	round: CYCLE_ROUND,
	howTo: {
		fr: 'Joue des croches continues, une attaque sur chaque demi-temps. Le clic se tait sur certaines mesures : garde le même tempo, comme s’il continuait, et retrouve-le quand il revient. Tu entends la figure d’abord, puis tu la joues par séries de quatre tours.',
		en: 'Play steady eighth notes, one attack on every half beat. The click drops out on some bars: keep the same tempo as if it carried on, and meet it again when it returns. You hear the figure first, then play it in runs of four turns.'
	},
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
				'thresholds.regularity': 20,
				'thresholds.holdOffset': 25,
				'thresholds.holdDrift': 10,
				'thresholds.precision': 30
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

const TWO_FOUR_PARAMS: RhythmParams = {
	accompaniment: clicks([2, 4], ['on']),
	cycleBars: 4,
	window: { ms: 80 },
	feedback: 'every-cycle',
	listen: 'aid',
	cursor: true,
	// A new line at each cycle: one cycle, then a breath. The click on 2 and 4 is the count: the
	// line starts right after two bars of it.
	pacing: { ...runsOf(1), countIn: false },
	thresholds: BASE_THRESHOLDS
};

export const RHYTHM_TWO_FOUR: ExerciseDefinition = {
	id: 'rhythm-two-four',
	version: 1,
	title: { fr: 'Métronome sur 2 et 4', en: 'Click on 2 and 4' },
	mechanic: 'figure',
	params: { sensor: 'attack', ...TWO_FOUR_PARAMS },
	tempo: 100,
	// Its instruction is told until the player has played it once.
	flow: { antiBlocking: true, briefing: 'first-encounter' },
	view: 'rhythm-figure',
	round: CYCLE_ROUND,
	howTo: {
		fr: 'Lis la ligne de quatre mesures et joue-la d’un trait. Le clic ne marque que les temps 2 et 4 : le 1 et le 3, c’est à toi de les porter. Une nouvelle ligne vient à chaque tour. Tu peux réécouter la ligne avant de la jouer.',
		en: 'Read the four-bar line and play it in one go. The click only marks beats 2 and 4: beats 1 and 3 are yours to carry. A new line comes each turn. You can listen to the line before you play it.'
	},
	figures: TWO_FOUR_LINES.map((text, i) => ({ id: `line-${i + 1}`, figure: figureOf(text) })),
	pick: 'next',
	levels: [
		{ aid: true, params: { accompaniment: clicks(EVERY_BEAT, ['on']) } },
		{ params: {} },
		{ params: { tempo: 120 } },
		{ params: { tempo: 140, cursor: false } }
	]
};

// Contretemps ------------------------------------------------------------------------------

const OFFBEAT_BAR = 'c8 c r c r c r c';

const OFFBEATS_PARAMS: RhythmParams = {
	accompaniment: clicks(EVERY_BEAT, ['on'], [1]),
	cycleBars: 1,
	window: { ms: 80 },
	feedback: 'every-cycle',
	listen: 'free',
	cursor: true,
	pacing: runsOf(4),
	thresholds: BASE_THRESHOLDS
};

export const RHYTHM_OFFBEATS: ExerciseDefinition = {
	id: 'rhythm-offbeats',
	version: 1,
	title: { fr: 'Contretemps', en: 'Offbeats' },
	mechanic: 'figure',
	params: { sensor: 'attack', ...OFFBEATS_PARAMS },
	tempo: 80,
	// Its instruction is told until the player has played it once.
	flow: { antiBlocking: true, briefing: 'first-encounter' },
	view: 'rhythm-figure',
	round: CYCLE_ROUND,
	howTo: {
		fr: 'Joue les contretemps : une attaque sur le « et » de chaque temps, plus le premier temps de la mesure. D’abord une mesure en boucle, sans ajouter ni retirer un seul temps ; puis deux mesures dont la seconde ne tombe pas sur le 1.',
		en: 'Play the offbeats: one attack on the “and” of each beat, plus the first beat of the bar. First one bar on a loop, without adding or dropping a single beat; then two bars whose second does not land on the 1.'
	},
	figures: [
		{ id: 'offbeats-1', figure: figureOf(OFFBEAT_BAR) },
		{ id: 'offbeats-2', figure: figureOf(`${OFFBEAT_BAR} | r c r c r c r c`) }
	],
	pick: 'loop',
	levels: [
		{ aid: true, params: { tempo: 70 } },
		{
			params: {
				// The teacher's criterion: no beat added, none dropped. Faithfulness alone counts.
				'thresholds.regularity': 80,
				'thresholds.holdOffset': 200,
				'thresholds.holdDrift': 100
			}
		},
		{ params: { cycleBars: 2 } },
		{ params: { cycleBars: 2, tempo: 90 } },
		{ params: { cycleBars: 2, tempo: 100, cursor: false } }
	]
};

export const RHYTHM_EXERCISES: readonly ExerciseDefinition[] = [
	RHYTHM_SILENT_BARS,
	RHYTHM_TWO_FOUR,
	RHYTHM_OFFBEATS
];
