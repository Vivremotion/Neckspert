import { describe, expect, it } from 'vitest';
import type { CycleFailure, CycleReport } from '$lib/domain/time';
import { breakingMeasure, diagnoseBlock, type SettledRound } from './block';

function report(input: { missed?: number[]; extraAtMs?: number[] } = {}): CycleReport {
	const missed = new Set(input.missed ?? []);
	return {
		expectations: Array.from({ length: 8 }, (_, index) => ({
			index,
			verdict: missed.has(index) ? 'missed' : 'on-time',
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

function round(
	reasons: CycleFailure[],
	input: { item?: string; missed?: number[]; extraAtMs?: number[] } = {}
): SettledRound {
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

	it('is null without a failure', () => {
		expect(breakingMeasure([round([]), round([])])).toBeNull();
	});
});
