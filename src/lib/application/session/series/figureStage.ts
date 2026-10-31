import {
	Fraction,
	METER_4_4,
	attackNotes,
	barLength,
	beatPositions,
	levelRange,
	loopFigure,
	type CycleReport,
	type CycleVerdict,
	type Feedback,
	type Figure,
	type Level,
	type LiveReading,
	type Meter,
	type RoundOutcome,
	type RoundPlan,
	type TempoSegment
} from '$lib/domain/time';
import {
	exerciseLevelsOf,
	figureParamsOf,
	notationOf,
	tempoOf,
	type ExerciseDefinition,
	type FigureParams,
	type Notation
} from '$lib/domain/exercise';
import { FIGURE_CONTENT, isFigureEntry, roundFigureOf } from '$lib/domain/exercise/round';
import type { ChordDiagramStyle, Locale, PlannedItem } from '$lib/domain/types';
import { CONTENT_DERIVATIONS } from '$lib/domain/derivations';
import { CONTENT_VIEWS } from '$lib/application/presentation/contentViews';
import {
	DERIVED_PICTURES,
	PICTURES,
	neckPicture,
	neckWithNext,
	type Picture
} from '$lib/application/presentation/pictures';
import { presentPrompt } from '$lib/application/presentation/presentPrompt';

/**
 * What the figure view shows at a moment of the series: the accompaniment alone before playing
 * (`listen-in`), the counted bar (`count-in`), the rounds played (`play`, the entry bars
 * included), a figure heard rather than played (`listening`), and the breath between runs.
 */
export type FigurePhase = 'listen-in' | 'count-in' | 'play' | 'listening' | 'breath';

/**
 * A note played wrong in place: where it stands in its round (from the round's start, in whole
 * notes), its expectation's index in the round's plan (the mark's note on the engraving), and
 * what tells it from the note asked (« A au lieu de G »), null when not known.
 */
export interface WrongNote {
	at: Fraction;
	index: number;
	gap: string | null;
}

/** One settled round of the run, as the breath shows it. */
export interface SettledCycle {
	report: CycleReport;
	verdict: CycleVerdict;
	/** Its wrong notes, in plan order. */
	wrongNotes: WrongNote[];
	/** Failed, a round whose notes derive from its item shows what was asked (its shape). */
	expected: Picture | null;
}

/** A round of the run once settled, as the series kept it: its item, its plan, its outcome. */
export interface SettledRound {
	item: PlannedItem;
	plan: RoundPlan;
	outcome: RoundOutcome;
}

/** The screen model of a round that plays a figure: opaque to the core, read by the figure view. */
export interface FigureStageModel {
	phase: FigurePhase;
	exerciseLabel: string;
	/**
	 * The level played: `shown` is its number on screen (1 for the first level; an aid level,
	 * below it, shows 0 or less and has `aid`), `of` the number of regular levels.
	 */
	level: { shown: number; of: number; aid: boolean };
	/** « ♩ = 100 bpm »: the beats per minute and the glyph of the beat unit. */
	tempo: { bpm: number; unit: string };
	/**
	 * The figure played (or heard); at the breath, the one just played: as its round plays it
	 * (`roundFigure`), one loop when the round repeats it whole, else looped over the round and its
	 * last loop cut, so its attacks are the round's notes. Notes its round derives from its item
	 * carry the pitch and the string derived, so its tab can be engraved.
	 */
	figure: Figure;
	/** At the breath, the figure to play next (its derived notes written likewise); null otherwise. */
	next: Figure | null;
	/** Bar of the cycle from 0; the entry bars count as the end of a cycle before the first. */
	barInCycle: number;
	/** The whole bars the round spans: a round cut inside a bar counts that bar. */
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
	/** What listening to the figure is worth at this level (`listen()`); `none` hides the button. */
	listen: FigureParams['listen'];
	/** The feedback is told in plain words; once the exercise is familiar, by its term alone. */
	plainWords: boolean;
	/** The exercise's prompt above the figure (`presentPrompt`); null when it writes none. */
	prompt: { primary: string; secondary: string | null } | null;
	/**
	 * How the figure to play is engraved: its staff, its tab, both joined, or neither (the rhythm
	 * line), as its level writes, else as its round's content gives (`notationOf`).
	 */
	notation: Notation;
	/**
	 * The notes its round derives from its item, on the neck, when its level draws them, those of
	 * what comes next added once it shows them; else null.
	 */
	neck: Picture | null;
	/** The prompt of what comes next, in the last beats of a round whose level shows it; else null. */
	nextPrompt: Prompt;
	/**
	 * What was heard of the round under way, as far as it can be told, when its level marks it on
	 * the figure; else null, so the view keeps no room for it.
	 */
	live: LiveReading | null;
	/** How the chord shapes it shows are drawn. */
	chordDiagram: ChordDiagramStyle;
}

/** Nothing told yet: before the round, or as it opens. */
const NOTHING_HEARD: LiveReading = { expectations: [], extraAtMs: [] };

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
export function tempoView(tempo: TempoSegment): FigureStageModel['tempo'] {
	return { bpm: tempo.bpm, unit: UNIT_GLYPHS[tempo.unit.toString()] ?? tempo.unit.toString() };
}

/** Level `index` (0 = level 1, aid levels negative) as the screen numbers it. */
export function levelView(
	levels: readonly Level<unknown>[],
	index: number
): FigureStageModel['level'] {
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

/** Where the series stands, as the figure view reads it (`figureStage`). */
export type CycleMoment =
	/** Before play: the start screen. */
	| 'waiting'
	| 'listen-in'
	| 'count-in'
	/** The run's clicked bars before its first cycle: played, not judged. */
	| 'entry'
	| 'round'
	/** A cycle heard rather than played: a listen, or the demonstration of a first encounter. */
	| 'listening'
	/** Between two runs: the run played, with its marks, and what comes next. */
	| 'breath';

/** The figure `item`'s round plays; throws when its round writes none. */
function figureOf(definition: ExerciseDefinition, item: PlannedItem, meter: Meter): Figure {
	const found = roundFigureOf(definition, item, meter);
	if (!found) throw new Error(`${definition.id}: its round plays no figure`);
	return found.figure;
}

/** The whole bars a compiled round spans: a round cut inside a bar counts that bar. */
function barsOf(plan: RoundPlan, meter: Meter): number {
	return Math.ceil(plan.length.div(barLength(meter)).toNumber() - 1e-9);
}

/** The derivation the round's first figure entry spreads over its notes; null when it derives none. */
function derivationOf(definition: ExerciseDefinition): string | null {
	const entry = definition.round?.expectations.find(isFigureEntry);
	const from = entry?.content?.from;
	return from === undefined || from === FIGURE_CONTENT ? null : from;
}

/** The pitch and the string a content gives a note (`{ midi, string? }`); null when it gives none. */
function pitchOf(value: unknown): { pitch?: number; string?: number } | null {
	if (typeof value !== 'object' || value === null) return null;
	const { midi, string } = value as Record<string, unknown>;
	if (typeof midi !== 'number') return null;
	return { pitch: midi, ...(typeof string === 'number' ? { string } : {}) };
}

/** The figure each plan engraves, kept by plan: one figure per plan, engraved once. */
const ENGRAVED = new WeakMap<RoundPlan, { written: Figure; startBar: number; engraved: Figure }>();

/**
 * The derived notes of the attacks of a figure's first voice: each attack carries the pitch and
 * the string of its expectation in `contents` (a tied note those of its attack).
 */
function withContents(figure: Figure, contents: readonly unknown[]): Figure {
	const [first, ...others] = figure.voices;
	let attack = 0;
	let held: ReturnType<typeof pitchOf> = null;
	const elements = first.elements.map((element, i) => {
		if (element.kind === 'rest') return element;
		const before = first.elements[i - 1];
		const tiedIn = before !== undefined && before.kind !== 'rest' && before.tieToNext === true;
		if (!tiedIn) held = pitchOf(contents[attack++]);
		return held ? { ...element, ...held } : element;
	});
	return { ...figure, voices: [{ ...first, elements }, ...others] };
}

/** The same pitch and string, read as `pitchOf` reads them. */
function sameNote(a: unknown, b: unknown): boolean {
	const one = pitchOf(a);
	const other = pitchOf(b);
	return one?.pitch === other?.pitch && one?.string === other?.string;
}

/**
 * The figure as `plan` plays it, from bar `startBar` of its loop: looped over the round and its
 * last loop cut at the round's end (`loopFigure`), so its attacks are the plan's expectations one
 * for one; when the round derives its notes from its item, each attack carries the pitch and the
 * string of its expectation. A round of whole loops from the figure's first bar, each loop
 * playing the same notes, engraves one loop: the figure itself, its notes derived.
 */
function roundFigure(
	definition: ExerciseDefinition,
	figure: Figure,
	plan: RoundPlan,
	startBar: number
): Figure {
	const kept = ENGRAVED.get(plan);
	if (kept?.written === figure && kept.startBar === startBar) return kept.engraved;
	const derived = derivationOf(definition) !== null;
	// The entries before the round's first figure entry are places: one expectation each.
	const from = definition.round?.expectations.findIndex(isFigureEntry) ?? 0;
	const contents = plan.expectations.slice(Math.max(0, from)).map((e) => e.content?.value);
	const loop = barLength(figure.meter).mul(Fraction.of(figure.bars));
	const loops = plan.length.div(loop);
	const perLoop = attackNotes(figure).length;
	const once =
		loops.d === 1 &&
		startBar % figure.bars === 0 &&
		(!derived || contents.every((value, k) => sameNote(value, contents[k % perLoop])));
	const played = once ? figure : loopFigure(figure, { length: plan.length, startBar });
	const engraved = derived ? withContents(played, contents) : played;
	ENGRAVED.set(plan, { written: figure, startBar, engraved });
	return engraved;
}

type Prompt = FigureStageModel['prompt'];

/** The prompt of each item, by locale: presented once, not on every beat. */
const PROMPTS = new WeakMap<PlannedItem, { locale: Locale; prompt: Prompt }>();

/** The exercise's prompt for `item` (`presentPrompt`), null when it writes none. */
function promptOf(
	definition: ExerciseDefinition,
	item: PlannedItem,
	locale: Locale,
	random: () => number
): Prompt {
	if (!definition.presentation) return null;
	const kept = PROMPTS.get(item);
	if (kept?.locale === locale) return kept.prompt;
	const { primary, secondary } = presentPrompt(definition, item, locale, random);
	const prompt = { primary, secondary };
	PROMPTS.set(item, { locale, prompt });
	return prompt;
}

/** The picture of what a failed round derived its notes from (its shape); null when none. */
function expectedPicture(definition: ExerciseDefinition, item: PlannedItem): Picture | null {
	const from = derivationOf(definition);
	const name = from === null ? undefined : DERIVED_PICTURES[from];
	const picture = name === undefined ? undefined : PICTURES[name];
	if (!picture || !picture.reads.includes(item.mechanic)) return null;
	return picture.draw(item.item);
}

/** The neck of each item: drawn once, not on every beat. */
const NECKS = new WeakMap<PlannedItem, Picture | null>();

/** Where the notes `item`'s round derives from it stand on the neck; null when it derives no list. */
function neckOf(definition: ExerciseDefinition, item: PlannedItem): Picture | null {
	const kept = NECKS.get(item);
	if (kept !== undefined) return kept;
	const from = derivationOf(definition);
	const derivation = from === null ? undefined : CONTENT_DERIVATIONS[from];
	const neck =
		derivation?.list && derivation.reads.includes(item.mechanic)
			? neckPicture(derivation.derive(item.item, definition) as unknown[])
			: null;
	NECKS.set(item, neck);
	return neck;
}

/**
 * The wrong notes of a settled round, in plan order: each at its place in the round and told by
 * the view of its content against the note asked (`CONTENT_VIEWS`).
 */
function wrongNotesOf(
	report: CycleReport,
	plan: RoundPlan,
	locale: Locale,
	random: () => number
): WrongNote[] {
	return report.expectations.flatMap((entry) => {
		if (entry.verdict !== 'wrong-pitch') return [];
		const expectation = plan.expectations[entry.index];
		if (!expectation || expectation.at === null) return [];
		const content = expectation.content;
		const view =
			content && Object.hasOwn(CONTENT_VIEWS, content.kind) ? CONTENT_VIEWS[content.kind] : null;
		const gap =
			view && content && entry.answer !== undefined
				? view.miss(content.value, { answer: entry.answer, confusion: null }, locale, random).gap
				: null;
		return [{ at: expectation.at, index: entry.index, gap }];
	});
}

/** A settled round as the breath shows it. */
function settledCycle(
	definition: ExerciseDefinition,
	round: SettledRound,
	locale: Locale,
	random: () => number
): SettledCycle {
	const report = round.outcome.detail as CycleReport;
	const verdict = round.outcome.verdict.value as CycleVerdict;
	return {
		report,
		verdict,
		wrongNotes: wrongNotesOf(report, round.plan, locale, random),
		expected: verdict.passed ? null : expectedPicture(definition, round.item)
	};
}

/**
 * The figure view's model of `item`'s round at a moment of the series, built from the series'
 * events: what it plays now (`moment`), the bar of the round (`barInRound`, negative in the
 * entry) and the beat, where the round starts in the loops of its figure (`startBar`), whether the
 * click is silent in this bar, the rounds of the run settled so far, and how familiar the exercise
 * is (`endedSessions`). `plan` is `item`'s round as the series compiled it: nothing is compiled
 * here, on every beat. At the breath, `item` is the round to come, at the level it will play, and
 * `played` the run's last one with its plan: its figure and its bars carry the run's marks. The
 * figure shown is the one its round plays (`roundFigure`), its bars counted whole.
 */
export function figureStage(input: {
	definition: ExerciseDefinition;
	item: PlannedItem;
	plan: RoundPlan;
	moment: CycleMoment;
	barInRound: number;
	beat: number;
	startBar: number;
	muted: boolean;
	settled: readonly SettledRound[];
	/**
	 * The run's last round, its plan and where it started in the loops of its figure (absent: its
	 * first bar), shown at the breath; null when none was played.
	 */
	played: { item: PlannedItem; plan: RoundPlan; startBar?: number } | null;
	locale: Locale;
	/** Spells an altered note: the same for every call on one item. */
	random: () => number;
	chordDiagram: ChordDiagramStyle;
	endedSessions: number;
	/** What the round under way can already tell; null when it tells nothing yet. */
	live?: LiveReading | null;
	/** What the series will play after the round under way, when it knows. */
	coming?: PlannedItem | null;
}): FigureStageModel {
	const { definition, item, moment, barInRound, locale, random } = input;
	const level = item.exerciseLevel;
	const meter = definition.meter ?? METER_4_4;
	const params = figureParamsOf(definition, level);
	const figure = roundFigure(
		definition,
		figureOf(definition, item, meter),
		input.plan,
		input.startBar
	);
	const cycleBars = barsOf(input.plan, meter);
	const breath = moment === 'breath';
	const played = breath && input.played ? input.played : null;
	const playedParams = played ? figureParamsOf(definition, played.item.exerciseLevel) : params;
	const playing = moment === 'entry' || moment === 'round';
	const listening = moment === 'listening';
	const barInCycle =
		moment === 'round' || listening ? barInRound : moment === 'entry' ? cycleBars + barInRound : 0;
	const muted = (moment === 'round' || listening) && input.muted;
	// A heard cycle shows where the figure stands, whatever the level gives.
	const cursorShown = listening || (playing && params.cursor && !muted);
	const prompt = promptOf(definition, item, locale, random);
	const coming = moment === 'round' && params.nextBeats > 0 ? (input.coming ?? null) : null;
	// Beats left in the round, its first beat counted from its start whatever bar it opens in.
	const left = input.plan.length
		.sub(
			barLength(meter)
				.mul(Fraction.of(barInRound))
				.add(beatPositions(meter)[input.beat] ?? Fraction.ZERO)
		)
		.div(meter.unit)
		.toNumber();
	const nextDue = coming !== null && left <= params.nextBeats;
	const neck = params.neck ? neckOf(definition, item) : null;
	const comingNeck = neck && coming ? neckOf(definition, coming) : null;
	return {
		phase: playing
			? 'play'
			: listening
				? 'listening'
				: breath
					? 'breath'
					: moment === 'count-in'
						? 'count-in'
						: 'listen-in',
		exerciseLabel: definition.title?.[locale] ?? definition.id,
		level: levelView(exerciseLevelsOf(definition), level),
		tempo: tempoView({ at: Fraction.ZERO, bpm: tempoOf(definition, level), unit: meter.unit }),
		figure: played
			? roundFigure(
					definition,
					figureOf(definition, played.item, meter),
					played.plan,
					played.startBar ?? 0
				)
			: figure,
		next: breath ? figure : null,
		barInCycle,
		cycleBars: played ? barsOf(played.plan, meter) : cycleBars,
		muted,
		cursor: cursorShown
			? // The figure shown starts where the round does (`roundFigure`).
				figurePosition({ figure, startBar: 0, barInCycle: barInRound, beat: input.beat })
			: null,
		feedback: playedParams.feedback,
		settled: input.settled.map((round) => settledCycle(definition, round, locale, random)),
		listen: params.listen,
		plainWords: input.endedSessions < PLAIN_WORDS_SESSIONS,
		prompt,
		notation: notationOf(definition, level),
		neck:
			neck?.kind === 'neck' && comingNeck?.kind === 'neck'
				? neckWithNext(neck, comingNeck, nextDue)
				: neck,
		nextPrompt: nextDue ? promptOf(definition, coming, locale, random) : null,
		live: params.liveMarks ? ((moment === 'round' ? input.live : null) ?? NOTHING_HEARD) : null,
		chordDiagram: input.chordDiagram
	};
}
