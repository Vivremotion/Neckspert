import { describe, expect, it } from 'vitest';
import { LOCATE_NECK, RHYTHM_SILENT_BARS, type ExerciseDefinition } from '$lib/domain/exercise';
import { compileRound } from '$lib/domain/exercise/round';
import {
	Fraction,
	METER_4_4,
	clickAccompaniment,
	type CycleReport,
	type RoundOutcome
} from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';
import {
	aidedBeyondLevel,
	blockReadingOf,
	compilePlan,
	contentFigure,
	listenOf,
	roundGiven,
	runSetup
} from './compilePlan';

const note: PlannedItem = {
	exerciseId: LOCATE_NECK.id,
	mechanic: 'locate',
	exerciseLevel: 0,
	item: { string: 3, fret: 5 },
	phase: 'free',
	temperature: 'hot',
	aid: 'show-position',
	leadBeats: 4
};

const eighths = (level: number): PlannedItem => ({
	exerciseId: RHYTHM_SILENT_BARS.id,
	mechanic: 'rhythm-figure',
	exerciseLevel: level,
	item: { figureId: 'eighths', level },
	phase: 'free',
	temperature: 'hot',
	aid: 'none',
	leadBeats: null
});

const context = { previewBeats: 2, fromRunStart: 7 };
const planOf = (definition: ExerciseDefinition, item: PlannedItem) =>
	compilePlan(definition, item, METER_4_4, context);

const threeOne = clickAccompaniment({
	meter: METER_4_4,
	beats: [1, 2, 3, 4],
	accent: [1],
	bars: ['on', 'on', 'on', 'off']
});

describe('compilePlan', () => {
	it('compiles every round from its template, a cycle where it falls in its run', () => {
		expect(compilePlan(LOCATE_NECK, note, METER_4_4, context)).toEqual(
			compileRound(LOCATE_NECK, note, METER_4_4, context)
		);
		const cycle = compilePlan(RHYTHM_SILENT_BARS, eighths(0), METER_4_4, context);
		expect(cycle.policy.unit).toBe('cycle');
		// Bar 7 of its run: the silence is its first bar.
		expect(cycle.mutedBars).toEqual([0]);
		// Not known yet: where a run's first cycle starts, on the first silence.
		const first = compilePlan(RHYTHM_SILENT_BARS, eighths(0), METER_4_4, {
			...context,
			fromRunStart: null
		});
		expect(first.mutedBars).toEqual([0]);
	});

	it('gives a cycle its level’s thresholds and aids, and a settlement past its end', () => {
		const given = roundGiven(
			RHYTHM_SILENT_BARS,
			eighths(0),
			planOf(RHYTHM_SILENT_BARS, eighths(0))
		);
		expect(given.thresholds).toEqual({
			regularity: 40,
			holdOffset: 60,
			holdDrift: 25,
			precision: 60
		});
		expect(given.aids).toEqual(['cursor']);
		expect(given.settleAfter).toEqual(Fraction.of(1, 4));
		// The aid level is an aid of its own.
		expect(
			roundGiven(RHYTHM_SILENT_BARS, eighths(-1), planOf(RHYTHM_SILENT_BARS, eighths(-1))).aids
		).toEqual(['cursor', 'aid-level']);
		// The cursor and the aid level are the level's: a cycle with them alone is not helped.
		expect(aidedBeyondLevel(RHYTHM_SILENT_BARS, eighths(-1), ['cursor', 'aid-level'])).toBe(false);
		expect(aidedBeyondLevel(RHYTHM_SILENT_BARS, eighths(0), ['cursor', 'listen'])).toBe(true);
	});

	it('gives a response round its item’s aids, and thresholds only to a verdict that reads them', () => {
		expect(roundGiven(LOCATE_NECK, note, planOf(LOCATE_NECK, note))).toEqual({
			thresholds: null,
			aids: ['show-position'],
			settleAfter: null
		});
		const thresholds = { regularity: 1, holdOffset: 2, holdDrift: 3, precision: 4 };
		const judged: ExerciseDefinition = {
			...LOCATE_NECK,
			params: { ...LOCATE_NECK.params, thresholds }
		};
		// The response verdict judges no measure: thresholds written are not read.
		expect(roundGiven(judged, note, planOf(judged, note)).thresholds).toBeNull();
		const silent: ExerciseDefinition = {
			...RHYTHM_SILENT_BARS,
			params: { ...RHYTHM_SILENT_BARS.params, thresholds }
		};
		expect(roundGiven(silent, eighths(0), planOf(silent, eighths(0))).thresholds).toEqual(
			thresholds
		);
		expect(aidedBeyondLevel(LOCATE_NECK, note, ['show-position'])).toBe(true);
		expect(aidedBeyondLevel(LOCATE_NECK, note, [])).toBe(false);
	});

	it('opens a cycle’s run with its listen-in, its accompaniment and its entry', () => {
		const setup = runSetup(RHYTHM_SILENT_BARS, 0);
		expect(setup).toMatchObject({ listenInBars: 2, countIn: true, entryBars: 3 });
		expect(setup.listenIn?.bars).toEqual(['on']);
		// Its bar 0 on transport bar 3: bars 3, 4, 5 clicked, 6 silent.
		const run = setup.accompaniment(3);
		expect([3, 4, 5, 6].map((bar) => run?.bars[bar % 4])).toEqual(['on', 'on', 'on', 'off']);
	});

	it('opens a template’s run on the series’ click, or on the accompaniment its round writes', () => {
		const plain = runSetup(LOCATE_NECK, 0);
		expect(plain).toMatchObject({ listenIn: null, listenInBars: 0, countIn: true, entryBars: 0 });
		expect(plain.accompaniment(2)).toBeNull();
		const round = LOCATE_NECK.round!;
		const accompanied = runSetup(
			{ ...LOCATE_NECK, round: { ...round, accompaniment: threeOne } },
			0
		);
		expect(accompanied.listenIn?.bars).toEqual(['on']);
		expect(accompanied.accompaniment(1)?.bars).toEqual(['off', 'on', 'on', 'on']);
		// Its first round lands on the first muted bar, as a cycle's.
		expect(accompanied.entryBars).toBe(3);
	});

	it('opens a template’s run with the listen-in and the count its pacing writes', () => {
		const paced = (pacing: Record<string, unknown>): ExerciseDefinition => ({
			...LOCATE_NECK,
			params: { ...LOCATE_NECK.params, pacing: { respirationBars: 1, ...pacing } }
		});
		expect(runSetup(paced({ listenInBars: 1, countIn: false }), 0)).toMatchObject({
			listenInBars: 1,
			countIn: false
		});
		// Nothing to hear before playing: no listen-in and no counted bar.
		expect(() => runSetup(paced({ listenInBars: 0, countIn: false }), 0)).toThrow(/listen-in/);
		expect(() => runSetup(paced({ listenInBars: 1.5 }), 0)).toThrow(/whole number/);
	});

	it('opens a run with the listen-in and the count a level writes over its pacing', () => {
		const leveled: ExerciseDefinition = {
			...LOCATE_NECK,
			levels: [{ params: {} }, { params: { 'pacing.listenInBars': 1, 'pacing.countIn': false } }]
		};
		// Level 1 writes none: the defaults, no listen-in and a counted bar.
		expect(runSetup(leveled, 0)).toMatchObject({ listenInBars: 0, countIn: true });
		expect(runSetup(leveled, 1)).toMatchObject({ listenInBars: 1, countIn: false });
	});

	it('gives a cycle the listening and the playing along it was helped with', () => {
		const plan = planOf(RHYTHM_SILENT_BARS, eighths(0));
		const helped = roundGiven(RHYTHM_SILENT_BARS, eighths(0), plan, {
			listened: true,
			playAlong: true
		});
		// Listening is free at this level: no aid; playing along is one.
		expect(helped.aids).toEqual(['cursor', 'play-along']);
		const heard = roundGiven(RHYTHM_SILENT_BARS, eighths(0), plan, {
			listened: true,
			playAlong: false
		});
		expect(heard.aids).toEqual(['cursor']);
		// Where its level gives no listen, listening is worth nothing: the round keeps its item's aids.
		expect(
			roundGiven(LOCATE_NECK, note, planOf(LOCATE_NECK, note), { listened: true, playAlong: false })
				.aids
		).toEqual(['show-position']);
	});

	it('makes a cycle’s figure sound, and lets its level say what listening is worth', () => {
		const figure = contentFigure(RHYTHM_SILENT_BARS, eighths(0));
		expect(figure).toBe(RHYTHM_SILENT_BARS.figures?.find((f) => f.id === 'eighths')?.figure);
		expect(listenOf(RHYTHM_SILENT_BARS, 0)).toBe('free');
		// A template has no content to sound, nor to listen to.
		expect(contentFigure(LOCATE_NECK, note)).toBeNull();
		expect(listenOf(LOCATE_NECK, 0)).toBe('none');
	});

	it('hands the anti-blocking a cycle’s report and its spot, a response round nothing to compare', () => {
		const report = { expectations: [], extra: 0 } as unknown as CycleReport;
		const outcome = {
			detail: report,
			verdict: { relation: 'cycle', version: 1, value: { passed: false, reasons: ['missed'] } }
		} as unknown as RoundOutcome;
		expect(blockReadingOf(outcome, 2)).toEqual({
			report,
			verdict: { passed: false, reasons: ['missed'] },
			// A sixteenth of a whole note of two seconds.
			spotMs: 125
		});
		const response = {
			...outcome,
			verdict: { relation: 'response', version: 1, value: { kind: 'wrong' } }
		} as unknown as RoundOutcome;
		expect(blockReadingOf(response, 2)).toEqual({ spotMs: 0 });
	});
});
