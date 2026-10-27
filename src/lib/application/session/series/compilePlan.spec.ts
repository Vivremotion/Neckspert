import { describe, expect, it } from 'vitest';
import { LOCATE_NECK, RHYTHM_SILENT_BARS, type ExerciseDefinition } from '$lib/domain/exercise';
import { compileRound } from '$lib/domain/exercise/round';
import { Fraction, LISTEN_IN_BARS, METER_4_4, clickAccompaniment } from '$lib/domain/time';
import type { PlannedItem } from '$lib/domain/types';
import { aidedBeyondLevel, compilePlan, playsCycles, roundGiven, runSetup } from './compilePlan';

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

const threeOne = clickAccompaniment({
	meter: METER_4_4,
	beats: [1, 2, 3, 4],
	accent: [1],
	bars: ['on', 'on', 'on', 'off']
});

describe('compilePlan', () => {
	it('tells a cycle of a figure from a round of a template', () => {
		expect(playsCycles(RHYTHM_SILENT_BARS)).toBe(true);
		expect(playsCycles(LOCATE_NECK)).toBe(false);
		const context = { previewBeats: 2, fromRunStart: 7 };
		expect(compilePlan(LOCATE_NECK, note, METER_4_4, context)).toEqual(
			compileRound(LOCATE_NECK, note, METER_4_4, { previewBeats: 2 })
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
		const given = roundGiven(RHYTHM_SILENT_BARS, eighths(0));
		expect(given.thresholds).toEqual({
			regularity: 40,
			holdOffset: 60,
			holdDrift: 25,
			precision: 60
		});
		expect(given.aids).toEqual(['cursor']);
		expect(given.settleAfter).toEqual(Fraction.of(1, 4));
		// The aid level is an aid of its own.
		expect(roundGiven(RHYTHM_SILENT_BARS, eighths(-1)).aids).toEqual(['cursor', 'aid-level']);
		// The cursor and the aid level are the level's: a cycle with them alone is not helped.
		expect(aidedBeyondLevel(RHYTHM_SILENT_BARS, eighths(-1), ['cursor', 'aid-level'])).toBe(false);
		expect(aidedBeyondLevel(RHYTHM_SILENT_BARS, eighths(0), ['cursor', 'listen'])).toBe(true);
	});

	it('gives a template round its item’s aids, and its params’ thresholds when written', () => {
		expect(roundGiven(LOCATE_NECK, note)).toEqual({
			thresholds: null,
			aids: ['show-position'],
			settleAfter: null
		});
		const thresholds = { regularity: 1, holdOffset: 2, holdDrift: 3, precision: 4 };
		const judged: ExerciseDefinition = {
			...LOCATE_NECK,
			params: { ...LOCATE_NECK.params, thresholds }
		};
		expect(roundGiven(judged, note).thresholds).toEqual(thresholds);
		expect(aidedBeyondLevel(LOCATE_NECK, note, ['show-position'])).toBe(true);
		expect(aidedBeyondLevel(LOCATE_NECK, note, [])).toBe(false);
	});

	it('opens a cycle’s run with its listen-in, its accompaniment and its entry', () => {
		const setup = runSetup(RHYTHM_SILENT_BARS, 0);
		expect(setup).toMatchObject({ listenInBars: LISTEN_IN_BARS, countIn: true, entryBars: 3 });
		expect(setup.listenIn?.bars).toEqual(['on']);
		// Its bar 0 on transport bar 3: bars 3, 4, 5 clicked, 6 silent.
		const run = setup.accompaniment(3);
		expect([3, 4, 5, 6].map((bar) => run?.bars[bar % 4])).toEqual(['on', 'on', 'on', 'off']);
	});

	it('opens a template’s run on the series’ click, or on the accompaniment it writes', () => {
		const plain = runSetup(LOCATE_NECK, 0);
		expect(plain).toMatchObject({ listenIn: null, listenInBars: 0, countIn: true, entryBars: 0 });
		expect(plain.accompaniment(2)).toBeNull();
		const accompanied = runSetup(
			{ ...LOCATE_NECK, params: { ...LOCATE_NECK.params, accompaniment: threeOne } },
			0
		);
		expect(accompanied.listenIn?.bars).toEqual(['on']);
		expect(accompanied.accompaniment(1)?.bars).toEqual(['off', 'on', 'on', 'on']);
	});
});
