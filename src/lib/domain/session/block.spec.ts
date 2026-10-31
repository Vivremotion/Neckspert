import { describe, expect, it } from 'vitest';
import type { CycleFailure, CycleReport } from '$lib/domain/time';
import { breakingMeasure, diagnoseBlock, type SettledRound } from './block';

type Faults = { missed?: number[]; wrong?: number[]; extraAtMs?: number[] };

function report(input: Faults = {}): CycleReport {
	const missed = new Set(input.missed ?? []);
	const wrong = new Set(input.wrong ?? []);
	return {
		expectations: Array.from({ length: 8 }, (_, index) => ({
			index,
			verdict: missed.has(index) ? 'missed' : wrong.has(index) ? 'wrong-pitch' : 'on-time',
			offsetMs: missed.has(index) ? null : 0
		})),
		dropped: [],
		extra: input.extraAtMs?.length ?? 0,
		extraAtMs: input.extraAtMs ?? [],
		shift: null,
		measures: {},
		latency: null
	};
}

function round(reasons: CycleFailure[], input: Faults & { item?: string } = {}): SettledRound {
	return {
		level: 0,
		item: input.item ?? 'a@0',
		success: reasons.length === 0,
		aided: false,
		report: report(input),
		verdict: reasons.length === 0 ? { passed: true } : { passed: false, reasons },
		spotMs: 75
	};
}

describe('diagnoseBlock', () => {
	it('unclear for rounds judged without a report', () => {
		const bare = ({ report: _report, verdict: _verdict, ...rest }: SettledRound) => rest;
		expect(
			diagnoseBlock([
				bare(round(['missed'], { missed: [3] })),
				bare(round(['missed'], { missed: [3] }))
			])
		).toBe('unclear');
		expect(breakingMeasure([bare(round(['hold']))])).toBeNull();
	});

	it('execution when the figure is played and the measures fail', () => {
		expect(diagnoseBlock([round(['regularity']), round(['hold']), round(['shift', 'hold'])])).toBe(
			'execution'
		);
	});

	it('reading when the same expectation is missed again', () => {
		expect(
			diagnoseBlock([
				round(['missed'], { missed: [3] }),
				round(['regularity']),
				round(['missed'], { missed: [3, 5] })
			])
		).toBe('reading');
	});

	it('reading when the same note is played wrong again, as when it is missed', () => {
		expect(
			diagnoseBlock([
				round(['wrong-pitch'], { wrong: [3] }),
				round(['regularity']),
				round(['missed'], { missed: [3] })
			])
		).toBe('reading');
		// A wrong note is not the figure played: never an execution block.
		expect(
			diagnoseBlock([
				round(['wrong-pitch'], { wrong: [1] }),
				round(['wrong-pitch'], { wrong: [4] }),
				round(['hold'])
			])
		).toBe('unclear');
	});

	it('reading when extras fall on the same spot', () => {
		expect(
			diagnoseBlock([
				round(['extra'], { extraAtMs: [910] }),
				round(['extra'], { extraAtMs: [880] }),
				round(['regularity'])
			])
		).toBe('reading');
	});

	it('extras far apart are not the same spot', () => {
		expect(
			diagnoseBlock([
				round(['extra'], { extraAtMs: [910] }),
				round(['extra'], { extraAtMs: [400] }),
				round(['regularity'])
			])
		).toBe('unclear');
	});

	it('never reading across different figures', () => {
		expect(
			diagnoseBlock([
				round(['missed'], { item: 'a@0', missed: [3] }),
				round(['missed'], { item: 'b@0', missed: [3] }),
				round(['missed'], { item: 'c@0', missed: [3] })
			])
		).toBe('unclear');
	});

	it('unclear when the signs mix', () => {
		expect(
			diagnoseBlock([
				round(['missed'], { missed: [1] }),
				round(['regularity']),
				round(['regularity'])
			])
		).toBe('unclear');
	});
});

describe('breakingMeasure', () => {
	it('takes the most frequent reason', () => {
		expect(
			breakingMeasure([
				round(['hold']),
				round(['hold', 'regularity']),
				round(['regularity', 'hold'])
			])
		).toBe('hold');
	});

	it("takes the judge's order on a tie", () => {
		expect(breakingMeasure([round(['hold']), round(['regularity'])])).toBe('regularity');
	});

	it('names wrong notes, after the missed ones on a tie', () => {
		expect(breakingMeasure([round(['wrong-pitch']), round(['wrong-pitch', 'hold'])])).toBe(
			'wrong-pitch'
		);
		expect(breakingMeasure([round(['wrong-pitch']), round(['missed'])])).toBe('missed');
		expect(breakingMeasure([round(['extra']), round(['wrong-pitch'])])).toBe('wrong-pitch');
	});

	it('is null without a failure', () => {
		expect(breakingMeasure([round([]), round([])])).toBeNull();
	});
});
