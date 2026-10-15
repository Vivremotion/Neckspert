// What the `rhythm-figure` view computes, kept pure: where the marks of a cycle go over an
// engraving, the plain-words line of a cycle, where the cursor stands, and when it may show.
import type { RhythmStageModel, SettledCycle } from '$lib/application/session/plan/rhythmStage';
import {
	attackPositions,
	barLength,
	Fraction,
	type CycleReport,
	type Feedback,
	type Figure,
	type Voice
} from '$lib/domain/time';
import type { Locale } from '$lib/domain/types';
import type { FigureLayout } from '$lib/ui/notation';
import { RHYTHM_MESSAGES, signed, type DriftWords } from './rhythmMessages';

/** The smallest visible offset of a mark that is not dead on its note, in px. */
export const MARK_MIN_OFFSET_PX = 6;
/** Offsets are drawn this many times their share of the beat, to be read from a metre away. */
export const MARK_EXAGGERATION = 3;
/** A mark never stands further from its note than this share of a beat: it stays by its note. */
export const MARK_MAX_OFFSET_BEATS = 1 / 2;
/** Room between two added attacks drawn after the last note, in px. */
const EXTRA_GAP_PX = 2 * MARK_MIN_OFFSET_PX;
/** Under this, an offset or a spread (ms) is not worth a sentence. */
export const WORDS_MIN_MS = 15;
/** Under this, a drift of the hold (ms per bar) is not worth « accélères » or « ralentis ». */
export const WORDS_MIN_DRIFT_MS_PER_BAR = 5;

export type MarkKind = 'early' | 'late' | 'on-time' | 'missed' | 'extra';

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
 * The layout's attacks follow the plan's expectations (the cycle's figure engraved whole). The
 * report does not say where an added attack fell: it is drawn after the last note. `beatMs` is
 * the length of the beat the layout gives `beatWidthPx` to.
 */
export function cycleMarks(
	report: CycleReport,
	layout: FigureLayout,
	feedback: Feedback,
	beatWidthPx: number,
	beatMs: number
): Mark[] {
	if (feedback === 'summary') return [];
	const notes = layout.noteX.length;
	const marks: Mark[] = [];
	if (notes > 0) {
		for (const { index, verdict, offsetMs } of report.expectations) {
			if (verdict === 'dropped') continue;
			const slot = index % notes;
			const x = layout.noteX[slot];
			const line = layout.noteLine[slot] ?? 0;
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
	for (let k = 0; k < report.extra; k++) {
		const x = Math.min(layout.width, lastX + (k + 1) * EXTRA_GAP_PX);
		marks.push({ x, line: lastLine, kind: 'extra', label: null });
	}
	return feedback === 'out-of-tolerance' ? marks.filter((m) => m.kind !== 'on-time') : marks;
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
 * The plain-words line and its term, by locale: « Sans clic, tu passes devant (−35 ms) · tenue ».
 * One thing is told, the first that applies: a lost or added beat, the notes forgotten or
 * added, the hold, the spread, then (only when the latency was measured without the player)
 * the placement and the precision; « En place » when nothing is worth a sentence.
 */
export function feedbackLine(
	report: CycleReport,
	locale: Locale
): { words: string; term: FeedbackTerm | null } {
	const { words } = RHYTHM_MESSAGES[locale];
	const { measures } = report;

	if (report.shift) {
		const bar = report.shift.bar + 1;
		return {
			words: report.shift.byS < 0 ? words.lost(bar) : words.added(bar),
			term: 'fidelity'
		};
	}
	const forgotten = report.expectations.filter((e) => e.verdict === 'missed').length;
	if (forgotten > 0 || report.extra > 0) {
		const parts = [
			forgotten > 0 ? words.forgotten(forgotten) : null,
			report.extra > 0 ? words.extra(report.extra) : null
		].filter((part) => part !== null);
		return { words: parts.join(', '), term: 'fidelity' };
	}

	const offset = measures.holdOffset?.value;
	const drift = measures.holdDrift?.value;
	const holdOffset = offset !== undefined && Math.abs(offset) >= WORDS_MIN_MS ? offset : null;
	const holdDrift: DriftWords =
		drift === undefined || Math.abs(drift) < WORDS_MIN_DRIFT_MS_PER_BAR
			? null
			: drift < 0
				? 'rush'
				: 'drag';
	if (holdOffset !== null || holdDrift !== null) {
		return { words: words.hold(holdOffset, holdDrift), term: 'hold' };
	}

	const spread = measures.regularity?.value;
	if (spread !== undefined && spread >= WORDS_MIN_MS) {
		return { words: words.uneven(Math.round(spread)), term: 'regularity' };
	}

	if (report.latency?.provenance === 'system') {
		const placement = measures.placement?.value;
		if (placement !== undefined && Math.abs(placement) >= WORDS_MIN_MS) {
			return { words: words.placement(placement), term: 'placement' };
		}
		const precision = measures.precision?.value;
		if (precision !== undefined && precision >= WORDS_MIN_MS) {
			return { words: words.precision(Math.round(precision)), term: 'precision' };
		}
	}
	return { words: words.inPlace, term: null };
}

/** The cursor shows only on the figure played or heard, and never during a muted bar. */
export function cursorVisible(model: RhythmStageModel): boolean {
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
 * The figure as a cycle plays it: repeated over `cycleBars` bars, so its attacks follow the
 * cycle's expectations one for one. The figure itself when it fills the cycle already.
 */
export function cycleFigure(figure: Figure, cycleBars: number): Figure {
	const copies = cycleBars / figure.bars;
	if (!Number.isInteger(copies) || copies <= 1) return figure;
	const repeat = (voice: Voice): Voice => {
		const length = voice.elements.length;
		const elements = Array.from({ length: copies }, () => voice.elements).flat();
		const tuplets = voice.tuplets?.length
			? Array.from({ length: copies }, (_, k) =>
					(voice.tuplets ?? []).map((t) => ({
						...t,
						from: t.from + k * length,
						to: t.to + k * length
					}))
				).flat()
			: undefined;
		return { ...voice, elements, ...(tuplets ? { tuplets } : {}) };
	};
	return { ...figure, bars: cycleBars, voices: figure.voices.map(repeat) };
}

/** The cycle the breath tells in words: the last one that failed, else the last one. */
export function toldCycle(settled: readonly SettledCycle[]): SettledCycle | null {
	for (let i = settled.length - 1; i >= 0; i--) {
		if (!settled[i].verdict.passed) return settled[i];
	}
	return settled.at(-1) ?? null;
}
