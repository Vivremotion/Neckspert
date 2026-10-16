import { describe, expect, it } from 'vitest';
import type { Alignment, ExpectationVerdict, TimedExpectation } from './align';
import { cycleReport, cycleVerdict, type CycleReport } from './measures';

/** One expectation per entry, in bar `bar`; an offset of `null` is an expectation nobody answered. */
function scenario(entries: { bar: number; offsetMs: number | null }[]) {
	const expectations: TimedExpectation[] = entries.map((e, index) => ({
		index,
		time: index,
		zoneS: 0.1,
		windowS: 0.05,
		bar: e.bar
	}));
	const pairs: Alignment['pairs'] = [];
	const missed: number[] = [];
	entries.forEach((e, index) => {
		if (e.offsetMs === null) missed.push(index);
		else {
			const verdict: Exclude<ExpectationVerdict, 'missed'> =
				Math.abs(e.offsetMs) <= 50 ? 'on-time' : e.offsetMs < 0 ? 'early' : 'late';
			pairs.push({ expectation: index, attack: pairs.length, offsetMs: e.offsetMs, verdict });
		}
	});
	const alignment: Alignment = {
		pairs,
		missed,
		dropped: [],
		extra: [],
		shift: null,
		clampedWindows: 0
	};
	return { alignment, expectations };
}

const player = { ms: 20, provenance: 'player' } as const;
const system = { ms: 20, provenance: 'system' } as const;

function report(
	entries: { bar: number; offsetMs: number | null }[],
	opts: {
		mutedBars?: number[];
		latency?: CycleReport['latency'];
		patch?: Partial<Alignment>;
		attacks?: number[];
		startS?: number;
	} = {}
) {
	const { alignment, expectations } = scenario(entries);
	return cycleReport({
		alignment: { ...alignment, ...opts.patch },
		expectations,
		attacks: opts.attacks ?? Array.from({ length: 10 }, (_, i) => i),
		startS: opts.startS ?? 0,
		mutedBars: opts.mutedBars ?? [],
		latency: opts.latency === undefined ? system : opts.latency
	});
}

const exact = [0, 1, 2, 3].map((bar) => ({ bar, offsetMs: 0 }));
const strict = { precision: 60, regularity: 30, holdOffset: 40, holdDrift: 10 };

describe('cycleReport', () => {
	it('measures a regular and exact cycle', () => {
		const r = report(exact);
		expect(r.measures.fidelity).toEqual({ value: 1, unit: 'ratio' });
		expect(r.measures.regularity?.value).toBeCloseTo(0);
		expect(r.measures.placement?.value).toBeCloseTo(0);
		expect(r.measures.precision?.unit).toBe('ms');
		expect(r.extra).toBe(0);
		expect(r.expectations.map((e) => e.verdict)).toEqual([
			'on-time',
			'on-time',
			'on-time',
			'on-time'
		]);
	});

	it('reads alternating offsets as centred but not precise', () => {
		const r = report([40, -40, 40, -40].map((offsetMs, bar) => ({ bar, offsetMs })));
		expect(r.measures.placement?.value).toBeCloseTo(0);
		expect(r.measures.precision?.value).toBeCloseTo(40);
		expect(r.measures.regularity?.value).toBeCloseTo(40);
	});

	it('lists missed, dropped and extra expectations and counts fidelity over all of them', () => {
		const r = report(
			[
				{ bar: 0, offsetMs: 10 },
				{ bar: 0, offsetMs: null },
				{ bar: 1, offsetMs: null },
				{ bar: 1, offsetMs: -20 }
			],
			{ patch: { missed: [1], dropped: [2], extra: [7, 8], shift: { bar: 1, byS: 0.5 } } }
		);
		expect(r.expectations).toEqual([
			{ index: 0, verdict: 'on-time', offsetMs: 10 },
			{ index: 1, verdict: 'missed', offsetMs: null },
			{ index: 2, verdict: 'dropped', offsetMs: null },
			{ index: 3, verdict: 'on-time', offsetMs: -20 }
		]);
		expect(r.dropped).toEqual([2]);
		expect(r.extra).toBe(2);
		expect(r.shift).toEqual({ bar: 1, byS: 0.5 });
		expect(r.measures.fidelity?.value).toBeCloseTo(0.5);
	});

	it('times the extra attacks in ms from the cycle start', () => {
		const r = report(exact, {
			patch: { extra: [1, 3] },
			attacks: [10, 10.25, 10.5, 11.125],
			startS: 10
		});
		expect(r.extra).toBe(2);
		expect(r.extraAtMs?.map((ms) => +ms.toFixed(6))).toEqual([250, 1125]);
	});

	it('keeps the latency and its provenance', () => {
		expect(report(exact, { latency: player }).latency).toEqual(player);
		expect(report(exact, { latency: null }).latency).toBeNull();
	});

	it('reads muted bars played ahead as a negative hold offset', () => {
		const r = report(
			[
				{ bar: 0, offsetMs: 0 },
				{ bar: 1, offsetMs: 0 },
				{ bar: 2, offsetMs: -35 },
				{ bar: 3, offsetMs: -35 }
			],
			{ mutedBars: [2, 3] }
		);
		expect(r.measures.holdOffset?.value).toBeCloseTo(-35);
		expect(r.measures.holdOffset?.unit).toBe('ms');
	});

	it('reads the drift as the slope of the offsets over the muted bars', () => {
		const r = report(
			[
				{ bar: 0, offsetMs: 0 },
				{ bar: 1, offsetMs: 0 },
				{ bar: 2, offsetMs: -5 },
				{ bar: 3, offsetMs: -10 },
				{ bar: 4, offsetMs: -15 }
			],
			{ mutedBars: [2, 3, 4] }
		);
		expect(r.measures.holdDrift?.value).toBeCloseTo(-5);
		expect(r.measures.holdDrift?.unit).toBe('ms/bar');
	});

	it('averages the offsets of a bar before fitting the slope', () => {
		const r = report(
			[
				{ bar: 2, offsetMs: -4 },
				{ bar: 2, offsetMs: -6 },
				{ bar: 3, offsetMs: -9 },
				{ bar: 3, offsetMs: -11 }
			],
			{ mutedBars: [2, 3] }
		);
		expect(r.measures.holdDrift?.value).toBeCloseTo(-5);
	});

	it('leaves the hold measures out without muted bars', () => {
		const r = report(exact);
		expect(r.measures.holdOffset).toBeUndefined();
		expect(r.measures.holdDrift).toBeUndefined();
	});

	it('needs two muted bars with data for a drift, and clicked bars for an offset', () => {
		const one = report(
			[
				{ bar: 0, offsetMs: 0 },
				{ bar: 1, offsetMs: -10 },
				{ bar: 2, offsetMs: null }
			],
			{ mutedBars: [1, 2] }
		);
		expect(one.measures.holdOffset?.value).toBeCloseTo(-10);
		expect(one.measures.holdDrift).toBeUndefined();
		const allMuted = report(
			[
				{ bar: 0, offsetMs: 5 },
				{ bar: 1, offsetMs: 7 }
			],
			{ mutedBars: [0, 1] }
		);
		expect(allMuted.measures.holdOffset).toBeUndefined();
		expect(allMuted.measures.holdDrift?.value).toBeCloseTo(2);
	});

	it('has no measure other than fidelity when nothing was played, and no NaN', () => {
		const r = report(
			[0, 1, 2].map((bar) => ({ bar, offsetMs: null })),
			{ mutedBars: [1, 2] }
		);
		expect(Object.keys(r.measures)).toEqual(['fidelity']);
		expect(r.measures.fidelity?.value).toBe(0);
		expect(JSON.stringify(r)).not.toContain('NaN');
		expect(JSON.stringify(r.measures)).not.toContain('null');
		expect(r.expectations.every((e) => e.verdict === 'missed' && e.offsetMs === null)).toBe(true);
	});

	it('has no measure at all for an empty plan', () => {
		expect(report([]).measures).toEqual({});
	});
});

describe('cycleVerdict', () => {
	it('passes a regular and exact cycle', () => {
		expect(cycleVerdict(report(exact), strict)).toEqual({ passed: true });
	});

	it('does not let precision judge a player-measured latency', () => {
		const wide = [70, 70, 70, 70].map((offsetMs, bar) => ({ bar, offsetMs }));
		const asPlayer = report(wide, { latency: player });
		expect(asPlayer.measures.precision?.value).toBeCloseTo(70);
		expect(cycleVerdict(asPlayer, strict)).toEqual({ passed: true });
		expect(cycleVerdict(report(wide, { latency: system }), strict)).toEqual({
			passed: false,
			reasons: ['precision']
		});
		expect(cycleVerdict(report(wide, { latency: null }), strict)).toEqual({ passed: true });
	});

	it('fails on a missed expectation', () => {
		const r = report([
			{ bar: 0, offsetMs: 0 },
			{ bar: 1, offsetMs: null }
		]);
		expect(cycleVerdict(r, strict)).toEqual({ passed: false, reasons: ['missed'] });
	});

	it('fails on an added attack', () => {
		const r = report(exact, { patch: { extra: [9] } });
		expect(cycleVerdict(r, strict)).toEqual({ passed: false, reasons: ['extra'] });
	});

	it('fails on a shift, without a missed reason for the expectations it dropped', () => {
		const r = report(
			[
				{ bar: 0, offsetMs: 0 },
				{ bar: 1, offsetMs: 0 },
				{ bar: 2, offsetMs: null }
			],
			{ patch: { missed: [], dropped: [2], shift: { bar: 1, byS: 0.5 } } }
		);
		expect(cycleVerdict(r, strict)).toEqual({ passed: false, reasons: ['shift'] });
	});

	it('fails on irregularity', () => {
		const r = report(
			[40, -40, 40, -40].map((offsetMs, bar) => ({ bar, offsetMs })),
			{ latency: player }
		);
		expect(cycleVerdict(r, strict)).toEqual({ passed: false, reasons: ['regularity'] });
	});

	it('fails on the hold, by offset or by drift, in absolute value', () => {
		const ahead = report(
			[
				{ bar: 0, offsetMs: 0 },
				{ bar: 1, offsetMs: -50 },
				{ bar: 2, offsetMs: -50 }
			],
			{ mutedBars: [1, 2], latency: player }
		);
		expect(cycleVerdict(ahead, { ...strict, regularity: 100 })).toEqual({
			passed: false,
			reasons: ['hold']
		});
		const drifting = report(
			[
				{ bar: 0, offsetMs: 0 },
				{ bar: 1, offsetMs: 0 },
				{ bar: 2, offsetMs: 12 }
			],
			{ mutedBars: [1, 2], latency: player }
		);
		expect(cycleVerdict(drifting, { ...strict, holdOffset: 100, regularity: 100 })).toEqual({
			passed: false,
			reasons: ['hold']
		});
	});

	it('does not judge a measure that has no data or no threshold', () => {
		expect(cycleVerdict(report(exact), {})).toEqual({ passed: true });
		expect(cycleVerdict(report(exact), { holdOffset: 0, holdDrift: 0 })).toEqual({
			passed: true
		});
	});

	it('gives every reason of a bad cycle, in a fixed order', () => {
		const r = report(
			[
				{ bar: 0, offsetMs: 90 },
				{ bar: 1, offsetMs: -90 },
				{ bar: 2, offsetMs: null }
			],
			{ patch: { extra: [5], shift: { bar: 1, byS: 0.25 } } }
		);
		expect(cycleVerdict(r, strict)).toEqual({
			passed: false,
			reasons: ['missed', 'extra', 'shift', 'precision', 'regularity']
		});
	});

	it('fails a cycle where nothing was played with a missed reason only', () => {
		const r = report(
			[0, 1, 2].map((bar) => ({ bar, offsetMs: null })),
			{ mutedBars: [1, 2] }
		);
		expect(r.measures.placement).toBeUndefined();
		expect(cycleVerdict(r, strict)).toEqual({ passed: false, reasons: ['missed'] });
	});
});
