import { describe, expect, it, vi } from 'vitest';
import type { RhythmStageModel, SettledCycle } from '$lib/application/session/cycle/rhythmStage';
import {
	attackPositions,
	Fraction,
	METER_4_4,
	type CycleReport,
	type Figure,
	type FigureElement
} from '$lib/domain/time';
import type { FigureLayout } from '$lib/ui/notation';
import {
	MARK_EXAGGERATION,
	MARK_MIN_OFFSET_PX,
	cursorVisible,
	cursorX,
	cycleFigure,
	cycleMarks,
	feedbackLine,
	labelRows,
	markOffsetPx,
	shiftMark,
	toldCycle
} from './rhythmFigure';

const of = Fraction.of;
const note = (n: number, d: number, tieToNext = false): FigureElement => ({
	kind: 'note',
	duration: of(n, d),
	...(tieToNext ? { tieToNext } : {}),
	content: null
});
const rest = (n: number, d: number): FigureElement => ({ kind: 'rest', duration: of(n, d) });
const figureOf = (elements: FigureElement[], bars = 1): Figure => ({
	schema: 2,
	meter: METER_4_4,
	bars,
	voices: [{ id: 'main', elements }]
});

/** Four quarter notes on one line, 100 px apart; a bar 440 px wide from x = 10. */
const LAYOUT: FigureLayout = {
	noteX: [60, 160, 260, 360],
	barX: [10],
	width: 452,
	height: 90,
	noteLine: [0, 0, 0, 0],
	lineY: [0],
	rowHeight: 90,
	barWidth: 440
};
/** ♩ = 90: a beat lasts 666.7 ms and is drawn 100 px wide. */
const BEAT_MS = 60000 / 90;
const BEAT_PX = 100;

function report(overrides: Partial<CycleReport> = {}): CycleReport {
	return {
		expectations: [0, 1, 2, 3].map((index) => ({ index, verdict: 'on-time', offsetMs: 0 })),
		dropped: [],
		extra: 0,
		shift: null,
		measures: {},
		latency: { ms: 20, provenance: 'player' },
		...overrides
	};
}

const entry = (
	index: number,
	verdict: CycleReport['expectations'][number]['verdict'],
	offsetMs: number | null
) => ({ index, verdict, offsetMs });

/** The four expectations of `LAYOUT`, on time, with the entries given put in their place. */
const played = (...entries: ReturnType<typeof entry>[]) =>
	[0, 1, 2, 3].map((index) => entries.find((e) => e.index === index) ?? entry(index, 'on-time', 0));

describe('markOffsetPx', () => {
	it('draws a 5 ms offset at the minimal visible offset, on its side', () => {
		expect(markOffsetPx(5, BEAT_PX, BEAT_MS)).toBe(MARK_MIN_OFFSET_PX);
		expect(markOffsetPx(-5, BEAT_PX, BEAT_MS)).toBe(-MARK_MIN_OFFSET_PX);
	});

	it('exaggerates a larger offset by its share of the beat', () => {
		// 35 ms is 5.25 % of the beat: 5.25 px, times 3.
		expect(markOffsetPx(-35, BEAT_PX, BEAT_MS)).toBeCloseTo(
			-(35 / BEAT_MS) * BEAT_PX * MARK_EXAGGERATION
		);
	});

	it('leaves an exact hit on its note and never runs past half a beat', () => {
		expect(markOffsetPx(0, BEAT_PX, BEAT_MS)).toBe(0);
		expect(markOffsetPx(400, BEAT_PX, BEAT_MS)).toBe(BEAT_PX / 2);
	});
});

describe('cycleMarks', () => {
	it('puts a 5 ms late attack MARK_MIN_OFFSET_PX right of its note', () => {
		const marks = cycleMarks(
			report({ expectations: played(entry(0, 'late', 5)) }),
			LAYOUT,
			'every-cycle',
			BEAT_PX,
			BEAT_MS
		);
		expect(marks[0]).toEqual({ x: 60 + MARK_MIN_OFFSET_PX, line: 0, kind: 'late', label: '+5' });
	});

	it('gives every expectation its mark: early left with its figure, missed on the note', () => {
		const marks = cycleMarks(
			report({
				expectations: [
					entry(0, 'on-time', 0),
					entry(1, 'early', -35),
					entry(2, 'missed', null),
					entry(3, 'on-time', 10)
				]
			}),
			LAYOUT,
			'every-cycle',
			BEAT_PX,
			BEAT_MS
		);
		expect(marks.map((m) => m.kind)).toEqual(['on-time', 'early', 'missed', 'on-time']);
		expect(marks[0]).toEqual({ x: 60, line: 0, kind: 'on-time', label: null });
		expect(marks[1].x).toBeCloseTo(160 - (35 / BEAT_MS) * BEAT_PX * 3);
		expect(marks[1].label).toBe('−35');
		expect(marks[2]).toEqual({ x: 260, line: 0, kind: 'missed', label: null });
		expect(marks[3].x).toBe(360 + MARK_MIN_OFFSET_PX);
	});

	it('keeps only the marks out of the window in out-of-tolerance', () => {
		const marks = cycleMarks(
			report({
				expectations: [
					entry(0, 'on-time', 3),
					entry(1, 'late', 90),
					entry(2, 'missed', null),
					entry(3, 'on-time', -12)
				],
				extra: 1
			}),
			LAYOUT,
			'out-of-tolerance',
			BEAT_PX,
			BEAT_MS
		);
		expect(marks.map((m) => m.kind)).toEqual(['late', 'missed', 'extra']);
	});

	it('draws no mark in summary: the cycle is told passed or failed', () => {
		const marks = cycleMarks(
			report({ expectations: played(entry(0, 'late', 90)) }),
			LAYOUT,
			'summary',
			BEAT_PX,
			BEAT_MS
		);
		expect(marks).toEqual([]);
	});

	it('puts the added attacks of a report without their times after the last note, and skips what a shift dropped', () => {
		const marks = cycleMarks(
			report({
				expectations: [
					entry(0, 'on-time', 0),
					entry(1, 'dropped', null),
					entry(2, 'on-time', 0),
					entry(3, 'on-time', 0)
				],
				dropped: [1],
				extra: 2
			}),
			LAYOUT,
			'every-cycle',
			BEAT_PX,
			BEAT_MS
		);
		expect(marks.map((m) => m.kind)).toEqual(['on-time', 'on-time', 'on-time', 'extra', 'extra']);
		const extras = marks.filter((m) => m.kind === 'extra');
		expect(extras.every((m) => m.x > 360 && m.x <= LAYOUT.width && m.line === 0)).toBe(true);
		expect(extras[1].x).toBeGreaterThan(extras[0].x);
	});

	it('draws each added attack where it fell, between the notes around it, held inside the figure', () => {
		const quarters = figureOf([note(1, 4), note(1, 4), note(1, 4), note(1, 4)]);
		const marks = cycleMarks(
			report({ extra: 4, extraAtMs: [BEAT_MS / 2, 2 * BEAT_MS, -40, 5 * BEAT_MS] }),
			LAYOUT,
			'every-cycle',
			BEAT_PX,
			BEAT_MS,
			quarters
		);
		const extras = marks.filter((m) => m.kind === 'extra');
		expect(extras).toHaveLength(4);
		expect(extras[0].x).toBeCloseTo(110);
		expect(extras[1].x).toBeCloseTo(260);
		// Before the cycle: on its first note; past it: by the bar's right edge.
		expect(extras[2].x).toBeCloseTo(60);
		expect(extras[3].x).toBeCloseTo(450, 0);
		expect(extras.every((m) => m.line === 0)).toBe(true);
	});

	it('draws an added attack on the line of its bar when the figure wraps', () => {
		const twoBars = figureOf(
			Array.from({ length: 8 }, () => note(1, 4)),
			2
		);
		const wrapped: FigureLayout = {
			...LAYOUT,
			noteX: [60, 160, 260, 360, 60, 160, 260, 360],
			noteLine: [0, 0, 0, 0, 1, 1, 1, 1],
			barX: [10, 10],
			lineY: [0, 90]
		};
		const marks = cycleMarks(
			report({
				expectations: Array.from({ length: 8 }, (_, i) => entry(i, 'on-time', 0)),
				extra: 1,
				extraAtMs: [5.5 * BEAT_MS]
			}),
			wrapped,
			'every-cycle',
			BEAT_PX,
			BEAT_MS,
			twoBars
		);
		expect(marks.find((m) => m.kind === 'extra')).toMatchObject({ x: 210, line: 1 });
	});

	it('places a mark on the line its note was engraved on', () => {
		const wrapped: FigureLayout = { ...LAYOUT, noteLine: [0, 0, 1, 1], lineY: [0, 90] };
		const marks = cycleMarks(
			report({ expectations: played() }),
			wrapped,
			'every-cycle',
			BEAT_PX,
			BEAT_MS
		);
		expect(marks[2]).toMatchObject({ x: 260, line: 1 });
	});

	it('says in development when the cycle and the engraving do not match', () => {
		const error = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			cycleMarks(report(), LAYOUT, 'every-cycle', BEAT_PX, BEAT_MS);
			expect(error).not.toHaveBeenCalled();
			const eight = report({
				expectations: Array.from({ length: 8 }, (_, i) => entry(i, 'on-time', 0))
			});
			cycleMarks(eight, LAYOUT, 'every-cycle', BEAT_PX, BEAT_MS);
			expect(error).toHaveBeenCalledWith(expect.stringContaining('8 expectations'));
		} finally {
			error.mockRestore();
		}
	});
});

describe('labelRows', () => {
	const mark = (x: number, label: string | null) => ({
		x,
		line: 0,
		kind: label ? ('late' as const) : ('on-time' as const),
		label
	});

	it('gives each figure a row of its own when the next one would overlap it', () => {
		// « +35 » is 3 characters of 10 px: 30 px wide, centred on its mark.
		const marks = [mark(100, '+35'), mark(120, '−40'), mark(115, '+12'), mark(300, '+50')];
		expect(labelRows(marks, 10)).toEqual([0, 1, null, 0]);
	});

	it('leaves the marks without a figure out', () => {
		expect(labelRows([mark(100, null), mark(105, '+35')], 10)).toEqual([null, 0]);
	});

	it('keeps the lines apart: a figure on the next line never collides with this one', () => {
		const marks = [mark(100, '+35'), { ...mark(100, '+35'), line: 1 }];
		expect(labelRows(marks, 10)).toEqual([0, 0]);
	});
});

describe('feedbackLine', () => {
	it('tells the hold offset in plain words, with its term', () => {
		const line = feedbackLine(
			report({ measures: { holdOffset: { value: -35, unit: 'ms' } } }),
			'fr'
		);
		expect(line).toMatchObject({ words: 'Sans clic, tu passes devant (−35 ms)', term: 'hold' });
		expect(
			feedbackLine(report({ measures: { holdOffset: { value: 28.4, unit: 'ms' } } }), 'fr').words
		).toBe('Sans clic, tu passes derrière (+28 ms)');
	});

	it('says rushing only from the drift', () => {
		const rushing = feedbackLine(
			report({ measures: { holdDrift: { value: -12, unit: 'ms/bar' } } }),
			'fr'
		);
		expect(rushing.words).toBe('Sans clic, tu accélères');
		expect(rushing.term).toBe('hold');
		expect(
			feedbackLine(report({ measures: { holdDrift: { value: 9, unit: 'ms/bar' } } }), 'fr').words
		).toBe('Sans clic, tu ralentis');
	});

	it('tells a lost or added beat with its bar, before anything else', () => {
		const lost = feedbackLine(
			report({
				shift: { bar: 2, byS: -0.66 },
				measures: { holdOffset: { value: -35, unit: 'ms' } }
			}),
			'fr'
		);
		expect(lost).toMatchObject({ words: 'Temps perdu mesure 3', term: 'fidelity' });
		expect(feedbackLine(report({ shift: { bar: 0, byS: 0.66 } }), 'fr').words).toBe(
			'Temps ajouté mesure 1'
		);
	});

	it('counts the notes forgotten and the notes added', () => {
		const missed = report({
			expectations: [
				entry(0, 'missed', null),
				entry(1, 'on-time', 0),
				entry(2, 'missed', null),
				entry(3, 'on-time', 0)
			]
		});
		expect(feedbackLine(missed, 'fr')).toMatchObject({
			words: '2 notes oubliées',
			term: 'fidelity'
		});
		expect(feedbackLine(report({ extra: 1 }), 'fr').words).toBe('1 note en trop');
	});

	it('tells an uneven cycle by its spread', () => {
		expect(
			feedbackLine(report({ measures: { regularity: { value: 27.6, unit: 'ms' } } }), 'fr')
		).toMatchObject({ words: 'Irrégulier (± 28 ms)', term: 'regularity' });
	});

	it('tells the placement only when the latency was measured without the player', () => {
		const measures: CycleReport['measures'] = {
			placement: { value: -22, unit: 'ms' },
			precision: { value: 24, unit: 'ms' }
		};
		expect(feedbackLine(report({ measures }), 'fr').term).not.toBe('placement');
		const system = feedbackLine(
			report({ measures, latency: { ms: 12, provenance: 'system' } }),
			'fr'
		);
		expect(system).toMatchObject({ words: 'Tu joues devant le temps (−22 ms)', term: 'placement' });
	});

	it('says « En place » when there is nothing to tell', () => {
		expect(feedbackLine(report(), 'fr')).toMatchObject({ words: 'En place', term: null });
	});

	it('tells what failed the cycle, not a measure that passed', () => {
		// Silent bars at the base thresholds: regularity 45 > 40 fails, hold −20 (of 60) passes.
		const measures: CycleReport['measures'] = {
			regularity: { value: 45, unit: 'ms' },
			holdOffset: { value: -20, unit: 'ms' }
		};
		expect(
			feedbackLine(report({ measures }), 'fr', { passed: false, reasons: ['regularity'] })
		).toMatchObject({ words: 'Irrégulier (± 45 ms)', term: 'regularity' });
		// Passed, the same cycle is told by its hold.
		expect(feedbackLine(report({ measures }), 'fr', { passed: true }).term).toBe('hold');
	});

	it('tells a failed precision by its precision, not by the placement', () => {
		const line = feedbackLine(
			report({
				measures: {
					placement: { value: -30, unit: 'ms' },
					precision: { value: 70, unit: 'ms' }
				},
				latency: { ms: 12, provenance: 'system' }
			}),
			'fr',
			{ passed: false, reasons: ['precision'] }
		);
		expect(line).toMatchObject({ words: 'À 70 ms du temps en moyenne', term: 'precision' });
	});

	it('tells a failed hold even under the word cut-offs', () => {
		const line = feedbackLine(
			report({ measures: { holdDrift: { value: -3, unit: 'ms/bar' } } }),
			'fr',
			{ passed: false, reasons: ['hold'] }
		);
		expect(line).toMatchObject({ words: 'Sans clic, tu accélères', term: 'hold' });
	});

	it('follows the judge’s order when several reasons failed the cycle', () => {
		const line = feedbackLine(
			report({
				extra: 1,
				measures: { regularity: { value: 50, unit: 'ms' } }
			}),
			'fr',
			{ passed: false, reasons: ['extra', 'regularity'] }
		);
		expect(line).toMatchObject({ words: '1 note en trop', term: 'fidelity' });
	});

	it('speaks English', () => {
		expect(
			feedbackLine(report({ measures: { holdOffset: { value: -35, unit: 'ms' } } }), 'en').words
		).toBe('Without the click, you get ahead (−35 ms)');
		expect(feedbackLine(report({ extra: 2 }), 'en').words).toBe('2 extra notes');
	});
});

function model(overrides: Partial<RhythmStageModel> = {}): RhythmStageModel {
	const figure = figureOf([note(1, 4), note(1, 4), note(1, 4), note(1, 4)]);
	return {
		phase: 'play',
		exerciseLabel: 'Contretemps',
		level: { shown: 3, of: 6, aid: false },
		tempo: { bpm: 90, unit: '♩' },
		figure,
		next: null,
		barInCycle: 0,
		cycleBars: 1,
		muted: false,
		cursor: Fraction.of(1, 4),
		feedback: 'every-cycle',
		settled: [],
		listen: 'free',
		plainWords: true,
		...overrides
	};
}

describe('feedbackLine without plain words', () => {
	const held = report({ measures: { holdOffset: { value: -35, unit: 'ms' } } });

	it('keeps the term and its number', () => {
		expect(feedbackLine(held, 'fr').words).toBe('Sans clic, tu passes devant (−35 ms)');
		expect(feedbackLine(held, 'fr', undefined, false).words).toBe('tenue −35 ms');
		expect(feedbackLine(held, 'en', undefined, false).words).toBe('hold −35 ms');
	});

	it('says the regularity, a lost beat and the fidelity by their term', () => {
		const uneven = report({ measures: { regularity: { value: 24.4, unit: 'ms' } } });
		expect(feedbackLine(uneven, 'fr', undefined, false).words).toBe('régularité ± 24 ms');
		const lost = report({ shift: { bar: 1, byS: -0.4 } });
		expect(feedbackLine(lost, 'fr', undefined, false).words).toBe('temps perdu, mesure 2');
		const forgot = report({ expectations: played(entry(1, 'missed', null)) });
		expect(feedbackLine(forgot, 'fr', undefined, false).words).toBe('fidélité à la figure 3/4');
	});

	it('a line without a number is the same either way', () => {
		expect(feedbackLine(report(), 'fr', undefined, false).words).toBe(
			feedbackLine(report(), 'fr').words
		);
	});
});

describe('shiftMark', () => {
	it('names the bar of a lost beat, or of an added one', () => {
		expect(shiftMark(report({ shift: { bar: 2, byS: -0.3 } }))).toEqual({ bar: 2, lost: true });
		expect(shiftMark(report({ shift: { bar: 0, byS: 0.3 } }))).toEqual({ bar: 0, lost: false });
		expect(shiftMark(report())).toBeNull();
	});
});

describe('cursorVisible', () => {
	it('shows the cursor while a clicked bar is played', () => {
		expect(cursorVisible(model())).toBe(true);
	});

	it('never shows it in a muted bar, even when the model gives a position', () => {
		expect(cursorVisible(model({ muted: true }))).toBe(false);
	});

	it('hides it without a position, and outside the figure played or heard', () => {
		expect(cursorVisible(model({ cursor: null }))).toBe(false);
		expect(cursorVisible(model({ phase: 'breath' }))).toBe(false);
		expect(cursorVisible(model({ phase: 'count-in' }))).toBe(false);
		expect(cursorVisible(model({ phase: 'listening' }))).toBe(true);
	});
});

describe('cursorX', () => {
	const figure = figureOf([note(1, 8), note(1, 8), rest(1, 4), note(1, 2)]);
	// Attacks at 0, 1/8 and 1/2; the bar from x = 10 to 450.
	const layout: FigureLayout = { ...LAYOUT, noteX: [60, 110, 300] };

	it('stands on an attack at its position', () => {
		expect(cursorX(figure, layout, of(1, 8))).toEqual({ x: 110, line: 0 });
		expect(cursorX(figure, layout, of(1, 2))).toEqual({ x: 300, line: 0 });
	});

	it('runs between the attacks around a beat without one', () => {
		// 1/4 is a third of the way from 1/8 (x 110) to 1/2 (x 300).
		expect(cursorX(figure, layout, of(1, 4))?.x).toBeCloseTo(110 + (300 - 110) / 3);
		// 3/4: halfway from the last attack (x 300) to the bar's end (x 450).
		expect(cursorX(figure, layout, of(3, 4))?.x).toBeCloseTo(375);
	});

	it('gives nothing outside the figure', () => {
		expect(cursorX(figure, layout, of(1))).toBeNull();
	});
});

describe('cycleFigure', () => {
	it('repeats a one-bar figure over the bars of the cycle, one attack per expectation', () => {
		const eighths = figureOf(Array.from({ length: 8 }, () => note(1, 8)));
		const cycle = cycleFigure(eighths, 4);
		expect(cycle.bars).toBe(4);
		expect(attackPositions(cycle)).toHaveLength(32);
		expect(cycleFigure(eighths, 1)).toBe(eighths);
	});

	it('moves the tuplets with their copy', () => {
		const triplet = figureOf([note(1, 12), note(1, 12), note(1, 12), note(3, 4)]);
		triplet.voices[0].tuplets = [{ from: 0, to: 2, ratio: [3, 2] }];
		const cycle = cycleFigure(triplet, 2);
		expect(cycle.voices[0].elements).toHaveLength(8);
		expect(cycle.voices[0].tuplets).toEqual([
			{ from: 0, to: 2, ratio: [3, 2] },
			{ from: 4, to: 6, ratio: [3, 2] }
		]);
	});
});

describe('toldCycle', () => {
	const passed = (offset: number): SettledCycle => ({
		report: report({ measures: { holdOffset: { value: offset, unit: 'ms' } } }),
		verdict: { passed: true }
	});
	const failed: SettledCycle = {
		report: report({ extra: 1 }),
		verdict: { passed: false, reasons: ['extra'] }
	};

	it('tells the last failed cycle of the run, else the last one', () => {
		expect(toldCycle([passed(1), failed, passed(2)])).toBe(failed);
		const last = passed(3);
		expect(toldCycle([passed(1), last])).toBe(last);
		expect(toldCycle([])).toBeNull();
	});
});
