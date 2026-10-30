// What the `figure` view computes, kept pure: where the marks of a round go over an
// engraving, the plain-words line of a round, where the cursor stands, and when it may show.
import type {
	FigureStageModel,
	SettledCycle,
	WrongNote
} from '$lib/application/session/series/figureStage';
import {
	attackPositions,
	barLength,
	beatPositions,
	Fraction,
	loopFigure,
	type CycleFailure,
	type CycleReport,
	type CycleVerdict,
	type Feedback,
	type Figure,
	type Meter
} from '$lib/domain/time';
import type { Locale } from '$lib/domain/types';
import type { FigureLayout } from '$lib/ui/notation';
import { FIGURE_MESSAGES, signed, type DriftWords } from './figureMessages';

/** The smallest visible offset of a mark that is not dead on its note, in px. */
export const MARK_MIN_OFFSET_PX = 6;
/** Offsets are drawn this many times their share of the beat, to be read from a metre away. */
export const MARK_EXAGGERATION = 3;
/** A mark never stands further from its note than this share of a beat: it stays by its note. */
export const MARK_MAX_OFFSET_BEATS = 1 / 2;
/** Room between two added attacks drawn after the last note, in px. */
const EXTRA_GAP_PX = 2 * MARK_MIN_OFFSET_PX;
/** Steps per whole note of the position an added attack is drawn at (well under a ms). */
const EXTRA_POSITION_STEPS = 1920;
/** Under this, an offset or a spread (ms) is not worth a sentence. */
export const WORDS_MIN_MS = 15;
/** Under this, a drift of the hold (ms per bar) is not worth « accélères » or « ralentis ». */
export const WORDS_MIN_DRIFT_MS_PER_BAR = 5;

/** Bars a sum-up of wrong notes names at most, the rest left to « … » and the marks. */
export const FEEDBACK_MAX_BARS = 4;

export type MarkKind = 'early' | 'late' | 'on-time' | 'missed' | 'extra' | 'wrong-pitch';

export interface Mark {
	/** Centre of the mark, in the engraving's px, on its `line`. */
	x: number;
	/** The engraved line the mark belongs to (0 is the first). */
	line: number;
	kind: MarkKind;
	/** The offset as a figure (« −35 »), for marks out of the window; null otherwise. */
	label: string | null;
}

export type FeedbackTerm = 'hold' | 'placement' | 'precision' | 'regularity' | 'fidelity';

/**
 * How far from its note an offset is drawn: its share of the beat times `MARK_EXAGGERATION`,
 * never under `MARK_MIN_OFFSET_PX` (unless dead on), never past `MARK_MAX_OFFSET_BEATS`.
 */
export function markOffsetPx(offsetMs: number, beatWidthPx: number, beatMs: number): number {
	if (offsetMs === 0 || !(beatMs > 0)) return 0;
	const drawn = (Math.abs(offsetMs) / beatMs) * beatWidthPx * MARK_EXAGGERATION;
	const most = Math.max(MARK_MIN_OFFSET_PX, beatWidthPx * MARK_MAX_OFFSET_BEATS);
	return Math.sign(offsetMs) * Math.min(most, Math.max(MARK_MIN_OFFSET_PX, drawn));
}

/**
 * Marks of a cycle over the layout of its figure: offsets drawn exaggerated (×3 of the beat
 * width share), never under MARK_MIN_OFFSET_PX. `every-cycle` marks every expectation,
 * `out-of-tolerance` only those out of the window (and the added attacks), `summary` none.
 * The layout's attacks follow the plan's expectations (the cycle's figure engraved whole). An
 * added attack is drawn where it fell, between the notes around it (`cursorX` over `figure`, the
 * figure engraved), held inside the figure; a report from before `extraAtMs`, or no `figure`,
 * draws it after the last note. `beatMs` is the length of the beat the layout gives
 * `beatWidthPx` to, a bar's share of the meter's beats.
 */
export function cycleMarks(
	report: CycleReport,
	layout: FigureLayout,
	feedback: Feedback,
	beatWidthPx: number,
	beatMs: number,
	figure?: Figure
): Mark[] {
	const notes = layout.noteX.length;
	if (import.meta.env.DEV && report.expectations.length !== notes) {
		// Marks would land on the wrong notes: the cycle is not the figure engraved (a cycle
		// starting inside a multi-bar figure, or another figure of the run).
		console.error(
			`rhythm marks: ${report.expectations.length} expectations over ${notes} engraved attacks`
		);
	}
	if (feedback === 'summary') return [];
	const marks: Mark[] = [];
	if (notes > 0) {
		for (const { index, verdict, offsetMs } of report.expectations) {
			if (verdict === 'dropped') continue;
			const slot = index % notes;
			const x = layout.noteX[slot];
			const line = layout.noteLine[slot] ?? 0;
			// A wrong note in place is marked on its note: what was wrong is its pitch.
			if (verdict === 'wrong-pitch') {
				marks.push({ x, line, kind: 'wrong-pitch', label: null });
				continue;
			}
			if (verdict === 'missed' || offsetMs === null) {
				marks.push({ x, line, kind: 'missed', label: null });
				continue;
			}
			marks.push({
				x: x + markOffsetPx(offsetMs, beatWidthPx, beatMs),
				line,
				kind: verdict,
				label: verdict === 'on-time' ? null : signed(offsetMs)
			});
		}
	}
	const lastX = notes > 0 ? layout.noteX[notes - 1] : 0;
	const lastLine = notes > 0 ? (layout.noteLine[notes - 1] ?? 0) : 0;
	const placed =
		figure && report.extraAtMs && beatMs > 0
			? report.extraAtMs.map((ms) => extraPlace(figure, layout, ms, beatMs))
			: [];
	for (let k = 0; k < report.extra; k++) {
		const at = placed[k] ?? {
			x: Math.min(layout.width, lastX + (k + 1) * EXTRA_GAP_PX),
			line: lastLine
		};
		marks.push({ ...at, kind: 'extra', label: null });
	}
	return feedback === 'out-of-tolerance' ? marks.filter((m) => m.kind !== 'on-time') : marks;
}

/** Where an attack `ms` after the cycle's start stands on the engraving, held inside the figure. */
function extraPlace(
	figure: Figure,
	layout: FigureLayout,
	ms: number,
	beatMs: number
): { x: number; line: number } | null {
	const bar = barLength(figure.meter).toNumber();
	const wholes = (ms / beatMs) * (bar / beatPositions(figure.meter).length);
	const last = Math.round(figure.bars * bar * EXTRA_POSITION_STEPS) - 1;
	const steps = Math.min(last, Math.max(0, Math.round(wholes * EXTRA_POSITION_STEPS)));
	return cursorX(figure, layout, Fraction.of(steps, EXTRA_POSITION_STEPS));
}

/** Room kept between two figures on the same row, in px. */
const LABEL_GAP_PX = 4;

/**
 * The row of each mark's figure (0 the first, 1 the second), left to right: a figure goes on
 * the first row where it does not overlap the one before it, else the second, else it is left
 * out (the mark keeps its shape, and its offset in words for assistive technology). Null for a
 * mark without a figure. Each line of the engraving has its own rows.
 */
export function labelRows(marks: readonly Mark[], charWidthPx: number): (0 | 1 | null)[] {
	const ends = new Map<number, [number, number]>();
	return marks.map((mark) => {
		if (mark.label === null) return null;
		const half = (mark.label.length * charWidthPx) / 2;
		const rows = ends.get(mark.line) ?? [-Infinity, -Infinity];
		ends.set(mark.line, rows);
		for (const row of [0, 1] as const) {
			if (mark.x - half >= rows[row] + LABEL_GAP_PX) {
				rows[row] = mark.x + half;
				return row;
			}
		}
		return null;
	});
}

/**
 * A feedback line: its words, its term, and the number the term goes with once the plain words
 * have faded (null when it has none: the line then stays in words).
 */
type Line = { words: string; term: FeedbackTerm | null; value: string | null };
/** A line as told before the plain words fade: the lost or added beat's is marked as such. */
type ToldLine = Line & { shift?: true };
type Messages = (typeof FIGURE_MESSAGES)[Locale];
type Words = Messages['words'];

/**
 * The wrong notes of the round told, at their places in a meter, when the breath knows them.
 * With `engraved`, the figure the marks are drawn over (`cycleFigure`), each is told in the bar
 * and beat of the engraved note its mark sits on (`index` in its attacks), else at its place in
 * the round.
 */
export interface ToldWrongNotes {
	wrongNotes: readonly WrongNote[];
	meter: Meter;
	engraved?: Figure;
}

/** Where a wrong note is told: on the engraved note its mark sits on, else its place in the round. */
function toldAt(note: WrongNote, engraved: Figure | undefined): Fraction {
	const attacks = engraved ? attackPositions(engraved) : [];
	return attacks.length > 0 ? attacks[note.index % attacks.length] : note.at;
}

/** A note of a figure by its bar and beat, from 1: « mesure 6, temps 3 ». */
export function notePlace(at: Fraction, meter: Meter): { bar: number; beat: number } {
	const bar = barLength(meter);
	const index = Math.floor(at.div(bar).toNumber());
	const inBar = at.sub(bar.mul(Fraction.of(index)));
	const beats = beatPositions(meter);
	const beat = beats.findLastIndex((position) => position.compare(inBar) <= 0);
	return { bar: index + 1, beat: Math.max(0, beat) + 1 };
}

/** The order a failed cycle's reasons are told in (`cycleVerdict` lists them in another order). */
const REASON_ORDER: readonly CycleFailure[] = [
	'shift',
	'missed',
	'wrong-pitch',
	'extra',
	'hold',
	'regularity',
	'precision'
];

/** A lost or added beat (a negative shift is a beat lost), or null. */
function shiftLine(report: CycleReport, words: Words): ToldLine | null {
	if (!report.shift) return null;
	const bar = report.shift.bar + 1;
	return {
		words: report.shift.byS < 0 ? words.lost(bar) : words.added(bar),
		term: 'fidelity',
		value: null,
		shift: true
	};
}

/** The notes forgotten and the notes added, or null. */
function fidelityLine(report: CycleReport, words: Words): Line | null {
	const forgotten = report.expectations.filter((e) => e.verdict === 'missed').length;
	if (forgotten === 0 && report.extra === 0) return null;
	const parts = [
		forgotten > 0 ? words.forgotten(forgotten) : null,
		report.extra > 0 ? words.extra(report.extra) : null
	].filter((part) => part !== null);
	return { words: parts.join(', '), term: 'fidelity', value: fidelityValue(report) };
}

/** The share of the notes played right, as the term says it: « 10/12 ». */
function fidelityValue(report: CycleReport): string {
	const heard = report.expectations.filter(
		(e) => e.verdict !== 'missed' && e.verdict !== 'dropped' && e.verdict !== 'wrong-pitch'
	).length;
	return `${heard}/${report.expectations.length}`;
}

/**
 * The wrong notes, or null: one or two told by their bar and beat and what was played (« Mesure
 * 6, temps 3 : G au lieu de A »), more summed up by their bars, at most `FEEDBACK_MAX_BARS`;
 * counted only when their places are not known. No number: where to look stays in words once
 * the plain words have faded.
 */
function wrongPitchLine(
	report: CycleReport,
	words: Words,
	told: ToldWrongNotes | null
): Line | null {
	const count = report.expectations.filter((e) => e.verdict === 'wrong-pitch').length;
	if (count === 0) return null;
	const line = (text: string): Line => ({ words: text, term: 'fidelity', value: null });
	const notes = told?.wrongNotes ?? [];
	if (!told || notes.length !== count) return line(words.wrongNotes(count));
	const places = notes.map((note) => ({
		...notePlace(toldAt(note, told.engraved), told.meter),
		gap: note.gap
	}));
	if (count <= 2) return line(words.wrongAt(places));
	const bars = [...new Set(places.map((place) => place.bar))].sort((a, b) => a - b);
	return line(
		words.wrongInBars(count, bars.slice(0, FEEDBACK_MAX_BARS), bars.length > FEEDBACK_MAX_BARS)
	);
}

/** The hold, its offset and its drift, each told from its cut-off (0: whatever its size). */
function holdLine(
	report: CycleReport,
	words: Words,
	cutOffs: { ms: number; msPerBar: number }
): Line | null {
	const offset = report.measures.holdOffset?.value;
	const drift = report.measures.holdDrift?.value;
	const said = (value: number | undefined, cutOff: number): value is number =>
		value !== undefined && value !== 0 && Math.abs(value) >= cutOff;
	const holdOffset = said(offset, cutOffs.ms) ? offset : null;
	const holdDrift: DriftWords = said(drift, cutOffs.msPerBar)
		? drift < 0
			? 'rush'
			: 'drag'
		: null;
	if (holdOffset === null && holdDrift === null) return null;
	const value = [
		holdOffset === null ? null : `${signed(holdOffset)} ms`,
		holdDrift === null || drift === undefined ? null : `${signed(drift)} ${words.perBar}`
	]
		.filter((part) => part !== null)
		.join(', ');
	return { words: words.hold(holdOffset, holdDrift), term: 'hold', value };
}

function regularityLine(report: CycleReport, words: Words, cutOff: number): Line | null {
	const spread = report.measures.regularity?.value;
	if (spread === undefined || spread < cutOff) return null;
	return {
		words: words.uneven(Math.round(spread)),
		term: 'regularity',
		value: `± ${Math.round(spread)} ms`
	};
}

function precisionLine(report: CycleReport, words: Words, cutOff: number): Line | null {
	const precision = report.measures.precision?.value;
	if (precision === undefined || precision < cutOff) return null;
	return {
		words: words.precision(Math.round(precision)),
		term: 'precision',
		value: `${Math.round(precision)} ms`
	};
}

/** The line of one failure reason, whatever the size of its measure. */
function reasonLine(
	reason: CycleFailure,
	report: CycleReport,
	words: Words,
	told: ToldWrongNotes | null
): ToldLine | null {
	switch (reason) {
		case 'shift':
			return shiftLine(report, words);
		case 'wrong-pitch':
			return wrongPitchLine(report, words, told);
		case 'missed':
		case 'extra':
			return fidelityLine(report, words);
		case 'hold':
			return holdLine(report, words, { ms: 0, msPerBar: 0 });
		case 'regularity':
			return regularityLine(report, words, 0);
		case 'precision':
			return precisionLine(report, words, 0);
	}
}

/**
 * The plain-words line and its term, by locale: « Sans clic, tu passes devant (−35 ms) · tenue ».
 * One thing is told. A failed cycle is told by what failed it: the first of its `verdict`
 * reasons in `REASON_ORDER` (shift, missed, wrong notes, extra, hold, regularity, precision),
 * whatever its size. Otherwise (passed, or no verdict) the first that applies and is worth a
 * sentence (`WORDS_MIN_MS`, `WORDS_MIN_DRIFT_MS_PER_BAR`): a lost or added beat, the notes
 * forgotten or added, the wrong notes, the hold, the spread, then (only when the latency was
 * measured without the player) the placement and the precision; « En place » when nothing is.
 * The wrong notes are told by their places when `told` gives them, else counted.
 */
export function feedbackLine(
	report: CycleReport,
	locale: Locale,
	verdict?: CycleVerdict,
	plain = true,
	told: ToldWrongNotes | null = null
): Line {
	const messages = FIGURE_MESSAGES[locale];
	const { shift, ...line } = toldLine(report, messages.words, verdict, told);
	if (plain) return line;
	// The plain words faded (`PLAIN_WORDS_SESSIONS`): the term and its number stay.
	if (line.term && line.value !== null) {
		return { ...line, words: `${messages.term[line.term]} ${line.value}` };
	}
	if (shift && report.shift) {
		const bar = report.shift.bar + 1;
		return {
			...line,
			words: report.shift.byS < 0 ? messages.brief.lost(bar) : messages.brief.added(bar)
		};
	}
	return line;
}

/** The plain-words line (see `feedbackLine`). */
function toldLine(
	report: CycleReport,
	words: Words,
	verdict: CycleVerdict | undefined,
	told: ToldWrongNotes | null
): ToldLine {
	if (verdict && !verdict.passed) {
		for (const reason of REASON_ORDER) {
			if (!verdict.reasons.includes(reason)) continue;
			const line = reasonLine(reason, report, words, told);
			if (line) return line;
		}
	}

	const line =
		shiftLine(report, words) ??
		fidelityLine(report, words) ??
		wrongPitchLine(report, words, told) ??
		holdLine(report, words, { ms: WORDS_MIN_MS, msPerBar: WORDS_MIN_DRIFT_MS_PER_BAR }) ??
		regularityLine(report, words, WORDS_MIN_MS);
	if (line) return line;

	if (report.latency?.provenance === 'system') {
		const placement = report.measures.placement?.value;
		if (placement !== undefined && Math.abs(placement) >= WORDS_MIN_MS) {
			return {
				words: words.placement(placement),
				term: 'placement',
				value: `${signed(placement)} ms`
			};
		}
		const precision = precisionLine(report, words, WORDS_MIN_MS);
		if (precision) return precision;
	}
	return { words: words.inPlace, term: null, value: null };
}

/** Where a beat was lost or added in a cycle (its bar, from 0), or null without a shift. */
export function shiftMark(report: CycleReport): { bar: number; lost: boolean } | null {
	if (!report.shift) return null;
	return { bar: report.shift.bar, lost: report.shift.byS < 0 };
}

/** The cursor shows only on the figure played or heard, and never during a muted bar. */
export function cursorVisible(model: FigureStageModel): boolean {
	if (model.cursor === null || model.muted) return false;
	return model.phase === 'play' || model.phase === 'listening';
}

/** The line of each bar of a layout: a bar whose x does not move right starts a new line. */
function barLines(layout: FigureLayout): number[] {
	let line = 0;
	return layout.barX.map((x, b) => {
		if (b > 0 && x <= layout.barX[b - 1]) line++;
		return line;
	});
}

/**
 * Where `position` (from the figure's start, in whole notes) stands on the engraving: on an
 * attack when one falls there, else between the attacks (or bar edges) around it, on the line
 * of its bar. Null outside the figure.
 */
export function cursorX(
	figure: Figure,
	layout: FigureLayout,
	position: Fraction
): { x: number; line: number } | null {
	const bar = barLength(figure.meter);
	const index = Math.floor(position.div(bar).toNumber());
	if (position.compare(Fraction.ZERO) < 0 || index >= figure.bars) return null;
	const left = layout.barX[index];
	if (left === undefined) return null;
	const line = barLines(layout)[index];
	const start = bar.mul(Fraction.of(index));
	const end = start.add(bar);

	const anchors: { at: Fraction; x: number }[] = [];
	attackPositions(figure).forEach((at, i) => {
		const x = layout.noteX[i];
		if (x !== undefined && at.compare(start) >= 0 && at.compare(end) < 0) anchors.push({ at, x });
	});
	if (!anchors.some((a) => a.at.equals(start))) anchors.unshift({ at: start, x: left });
	anchors.push({ at: end, x: left + layout.barWidth });

	for (let i = 0; i < anchors.length - 1; i++) {
		const a = anchors[i];
		const b = anchors[i + 1];
		if (position.compare(b.at) >= 0) continue;
		const share = position.sub(a.at).div(b.at.sub(a.at)).toNumber();
		return { x: a.x + share * (b.x - a.x), line };
	}
	return null;
}

/**
 * The figure as a cycle plays it over its `cycleBars` whole bars, so its attacks follow the
 * cycle's expectations one for one: looped from its first bar (`loopFigure`), the figure itself
 * when it fills the cycle already. The model's figure is the one its round plays (one loop of a
 * round of whole loops, else the round's own bars, its last loop cut), so it always fills them.
 */
export function cycleFigure(figure: Figure, cycleBars: number): Figure {
	if (!Number.isInteger(cycleBars) || cycleBars <= figure.bars) return figure;
	return loopFigure(figure, {
		length: barLength(figure.meter).mul(Fraction.of(cycleBars)),
		startBar: 0
	});
}

/** The cycle the breath tells in words: the last one that failed, else the last one. */
export function toldCycle(settled: readonly SettledCycle[]): SettledCycle | null {
	for (let i = settled.length - 1; i >= 0; i--) {
		if (!settled[i].verdict.passed) return settled[i];
	}
	return settled.at(-1) ?? null;
}
