import { describe, expect, it } from 'vitest';
import { RHYTHM_OFFBEATS } from '$lib/domain/exercise';
import { figureToJson } from '$lib/domain/time';
import type { Attempt } from '$lib/domain/types';
import type { DiagnosticTakeRow } from './diagnosticsDb';
import {
	ORACLE_MARGIN_S,
	ORACLE_TAKES,
	audacityLabels,
	buildOracleSuite,
	oracleRuns,
	parseAudacityLabels,
	pickOracleRuns,
	type OracleRun
} from './oracle';

const figure = RHYTHM_OFFBEATS.figures?.[0]?.figure;
if (!figure) throw new Error('no offbeats figure');

/** ♩ = 80 bpm, one bar per cycle: 3 s. */
const CYCLE_MS = 3000;

function cycle(id: number, sessionId: string, promptedAt: number, contested = false): Attempt {
	return {
		id,
		sessionId,
		exerciseId: RHYTHM_OFFBEATS.id,
		mechanic: 'rhythm-figure',
		cardKey: `rhythm-figure:offbeats-1@0`,
		phase: 'free',
		temperature: 'hot',
		aids: [],
		promptedAt,
		tempoBpm: 80,
		leadBeats: null,
		timingOffsetMs: null,
		reactionMs: null,
		correct: null,
		success: false,
		verdict: { relation: 'cycle', version: 1, value: { passed: false, reasons: ['extra'] } },
		measures: {},
		plan: {
			figureId: 'offbeats-1',
			figure: figureToJson(figure as NonNullable<typeof figure>),
			cycleBars: 1,
			startBar: 0,
			accompaniment: { figure: figureToJson(figure as NonNullable<typeof figure>), bars: ['on'] },
			tempo: { at: '0', bpm: 80, unit: '1/4' },
			window: { ms: 80 },
			thresholds: {}
		},
		data: {
			item: { figureId: 'offbeats-1', level: 0 },
			level: 0,
			report: { latency: { ms: 20, provenance: 'system' } }
		},
		observations: [],
		...(contested && { contested: true })
	};
}

function take(id: string, startedAt: number, endedAt: number | null): DiagnosticTakeRow {
	return {
		id,
		startedAt,
		startedAudioTime: 2,
		endedAt,
		input: {} as DiagnosticTakeRow['input'],
		bytes: 1,
		truncated: false
	};
}

describe('oracleRuns', () => {
	it('splits a session where cycles stop chaining', () => {
		const attempts = [
			...[0, 1, 2, 3].map((i) => cycle(i + 1, 's', 10_000 + i * CYCLE_MS)),
			// a breath of 3 s: the next cycle starts 6 s after the last one ended
			...[0, 1, 2, 3].map((i) => cycle(i + 5, 's', 10_000 + 7 * CYCLE_MS + i * CYCLE_MS, i === 2))
		];
		const runs = oracleRuns(attempts);
		expect(runs).toHaveLength(2);
		expect(runs[0]).toEqual({
			sessionId: 's',
			attemptIds: [1, 2, 3, 4],
			fromMs: 10_000,
			toMs: 10_000 + 4 * CYCLE_MS,
			contested: false
		});
		expect(runs[1].attemptIds).toEqual([5, 6, 7, 8]);
		expect(runs[1].contested).toBe(true);
	});

	it('keeps sessions apart and leaves out attempts without a cycle plan', () => {
		const other = { ...cycle(3, 's2', 10_000 + CYCLE_MS) };
		const plain = { ...cycle(4, 's', 10_000 + CYCLE_MS), plan: null };
		const runs = oracleRuns([cycle(1, 's', 10_000), other, plain]);
		expect(runs.map((run) => run.attemptIds)).toEqual([[1], [3]]);
	});
});

describe('pickOracleRuns', () => {
	const run = (i: number, contested = false): OracleRun => ({
		sessionId: 's',
		attemptIds: [i],
		fromMs: 1000 + i * 100,
		toMs: 1050 + i * 100,
		contested
	});

	it('takes the contested first, then at random, within takes', () => {
		const runs = [
			...Array.from({ length: 20 }, (_, i) => run(i)),
			run(30, true),
			run(31, true),
			run(32, true)
		];
		const picked = pickOracleRuns(runs, [take('t', 0, 100_000)], () => 0);
		expect(picked).toHaveLength(ORACLE_TAKES);
		expect(picked.slice(0, 3).every((r) => r.contested)).toBe(true);
	});

	it('leaves out a run no take covers', () => {
		const picked = pickOracleRuns([run(1), run(2)], [take('t', 0, 1150)], () => 0);
		expect(picked.map((r) => r.attemptIds[0])).toEqual([1]);
	});
});

describe('Audacity labels', () => {
	it('round-trip', () => {
		const text = audacityLabels([0.5, 1.25]);
		expect(text).toBe('0.500000\t0.500000\t1\n1.250000\t1.250000\t2\n');
		expect(parseAudacityLabels(text)).toEqual([0.5, 1.25]);
	});

	it('ignore an unreadable line and sort the attacks', () => {
		expect(parseAudacityLabels('2\t2\tb\nnot a label\n1.5\t1.5\ta\n')).toEqual([1.5, 2]);
	});
});

describe('buildOracleSuite', () => {
	it("covers the run with its margins, with the sensor's attacks in it", () => {
		const row = take('t1', 1_000, 60_000);
		const run: OracleRun = {
			sessionId: 's',
			attemptIds: [1],
			fromMs: 11_000,
			toMs: 14_000,
			contested: false
		};
		const rate = 100;
		const chunk = {
			audioTime: 2,
			sampleRate: rate,
			samples: Int16Array.from({ length: 30 * rate }, (_, i) => i % 1000)
		};
		const { suite, wav } = buildOracleSuite({
			name: 'suite-01',
			run,
			take: row,
			events: [
				{ audioTime: 12.4, kind: 'attack.detected', data: { strength: 1 } },
				{ audioTime: 12.4, kind: 'note.attack', data: {} },
				{ audioTime: 30, kind: 'attack.detected', data: { strength: 1 } }
			],
			chunks: [chunk],
			attempts: [cycle(1, 's', 11_000)]
		});
		// The take opened at epoch 1 000 ms, audio 2 s: the run starts at audio 12 s.
		expect(suite.sliceStartAudioS).toBeCloseTo(12 - ORACLE_MARGIN_S, 9);
		expect(suite.detected).toHaveLength(1);
		expect(suite.detected[0]).toBeCloseTo(1.4, 9);
		expect(suite.cycles).toHaveLength(1);
		expect(suite.cycles[0].startS).toBeCloseTo(ORACLE_MARGIN_S, 9);
		expect(suite.cycles[0].latency).toEqual({ ms: 20, provenance: 'system' });
		expect(suite.sampleRate).toBe(rate);
		// 3 s and the two margins, 16-bit mono, after the 44-byte header.
		expect(wav.length).toBe(44 + (3 + 2 * ORACLE_MARGIN_S) * rate * 2);
	});
});
