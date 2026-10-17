import { describe, expect, it } from 'vitest';
import type { CycleFailure, Measures } from '$lib/domain/time';
import type { Attempt } from '$lib/domain/types';
import { summarizeSeries } from './summary';
import { TraceBuilder, type Segment } from './trace';

function attempt(
	id: number,
	reasons: CycleFailure[] | null,
	options: { measures?: Measures; aids?: Attempt['aids'] } = {}
): Attempt {
	return {
		id,
		sessionId: 's',
		exerciseId: 'x',
		mechanic: 'm',
		cardKey: `m:${id}`,
		phase: 'free',
		temperature: 'hot',
		aids: options.aids ?? [],
		promptedAt: id,
		tempoBpm: 80,
		leadBeats: null,
		timingOffsetMs: null,
		reactionMs: null,
		correct: null,
		success: reasons !== null && reasons.length === 0,
		verdict: {
			relation: 'cycle',
			version: 1,
			value:
				reasons === null || reasons.length === 0 ? { passed: true } : { passed: false, reasons }
		},
		measures: options.measures ?? {},
		plan: null,
		data: null,
		observations: []
	};
}

/** A series of runs of 10 s rounds, each run followed by a 5 s breath; `levels` per run. */
function series(runs: { level: number; attempts: number[]; listen?: boolean }[], reason?: 'quit') {
	const trace = new TraceBuilder(0);
	const id = trace.open('series', 0, { exerciseId: 'x' });
	let t = 0;
	for (const run of runs) {
		const r = trace.open('run', t, { level: run.level });
		if (run.listen) {
			const l = trace.open('listen', t);
			t += 10;
			trace.close(l, t);
		}
		for (const attemptId of run.attempts) {
			const round = trace.open('round', t, { level: run.level, attemptId });
			t += 10;
			trace.close(round, t);
		}
		trace.close(r, t);
		const b = trace.open('breath', t);
		t += 5;
		trace.close(b, t);
	}
	trace.set(id, { reason: reason ?? 'time' });
	trace.close(id, t);
	return trace.tree().children[0] as Segment;
}

const aidedByListen = (a: Attempt) => a.aids.includes('listen');

describe('summarizeSeries', () => {
	it('counts rounds, successes, aided and listens', () => {
		const attempts = [
			attempt(1, []),
			attempt(2, ['hold']),
			attempt(3, [], { aids: ['listen'] }),
			attempt(4, ['hold']),
			attempt(5, []),
			attempt(6, ['hold']),
			attempt(7, ['hold']),
			attempt(8, ['hold'])
		];
		const summary = summarizeSeries({
			series: series([
				{ level: 0, attempts: [1, 2, 3, 4], listen: true },
				{ level: 0, attempts: [5, 6, 7, 8] }
			]),
			attempts,
			aided: aidedByListen
		});
		expect(summary).toMatchObject({ rounds: 8, successes: 3, aided: 1, listens: 1 });
	});

	it('levels merges repeats', () => {
		const summary = summarizeSeries({
			series: series([
				{ level: 0, attempts: [] },
				{ level: 0, attempts: [] },
				{ level: 1, attempts: [] },
				{ level: -1, attempts: [] }
			]),
			attempts: [],
			aided: aidedByListen
		});
		expect(summary.levels).toEqual([0, 1, -1]);
	});

	it('playedShare is round time over series time', () => {
		// 4 rounds of 10 s + one breath of 5 s = 45 s, 40 s in rounds; then 2 rounds + breath = 25 s.
		const summary = summarizeSeries({
			series: series([
				{ level: 0, attempts: [1, 2, 3, 4] },
				{ level: 0, attempts: [5, 6] }
			]),
			attempts: [],
			aided: aidedByListen
		});
		expect(summary.playedShare).toBeCloseTo(60 / 70);
	});

	it("a run's measures are means over its rounds", () => {
		const summary = summarizeSeries({
			series: series([{ level: 0, attempts: [1, 2] }]),
			attempts: [
				attempt(1, [], { measures: { regularity: { value: 20, unit: 'ms' } } }),
				attempt(2, [], { measures: { regularity: { value: 30, unit: 'ms' } } })
			],
			aided: aidedByListen
		});
		expect(summary.runs[0].measures).toEqual({ regularity: { value: 25, unit: 'ms' } });
	});

	it("failed lists the run's failed rounds with their reasons", () => {
		const summary = summarizeSeries({
			series: series([{ level: 0, attempts: [1, 2] }]),
			attempts: [attempt(1, []), attempt(2, ['regularity', 'hold'])],
			aided: aidedByListen
		});
		expect(summary.runs[0]).toMatchObject({
			level: 0,
			rounds: 2,
			successes: 1,
			ended: 'done',
			failed: [{ attemptId: 2, reasons: ['regularity', 'hold'] }]
		});
	});

	it('ended and breaking come from the series segment', () => {
		const segment = series([{ level: -1, attempts: [] }]);
		const summary = summarizeSeries({
			series: { ...segment, reason: 'change-of-air', breaking: 'hold' },
			attempts: [],
			aided: aidedByListen
		});
		expect(summary).toMatchObject({ exerciseId: 'x', ended: 'change-of-air', breaking: 'hold' });
		expect(
			summarizeSeries({ series: series([], 'quit'), attempts: [], aided: aidedByListen }).ended
		).toBe('quit');
	});
});

describe('summarizeSeries, a round cut short', () => {
	it('counts only the rounds that were judged', () => {
		const trace = new TraceBuilder(0);
		const series = trace.open('series', 0, { exerciseId: 'x' });
		const run = trace.open('run', 0, { level: 0 });
		const judged = trace.open('round', 0, { level: 0, attemptId: 1 });
		trace.close(judged, 10);
		trace.open('round', 10, { level: 0 });
		trace.close(run, 14, 'interrupted');
		trace.set(series, { reason: 'quit' });
		trace.closeAll(14, 'done');
		const summary = summarizeSeries({
			series: trace.tree().children[0],
			attempts: [attempt(1, [])],
			aided: () => false
		});
		expect(summary.rounds).toBe(1);
		expect(summary.runs[0]).toMatchObject({ rounds: 1, successes: 1, ended: 'interrupted' });
	});
});
