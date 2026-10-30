import { describe, expect, it } from 'vitest';
import { Fraction } from '../fraction';
import type { Figure, FigureElement } from '../figure';
import { METER_4_4, barLength } from '../meter';
import { figureExpectations, type ExpectationWindow, type RoundPlan } from '../plan';
import { createTempoMap } from '../tempoMap';
import { CYCLE_VERDICT_VERSION as PUBLIC } from '..';
import { CYCLE_VERDICT_VERSION, cycleVerdictMode } from './cycleVerdict';
import { timeExpectations } from '../judge/align';
import type { CycleReport } from '../judge/measures';
import type { PairedAnswer, PairingResult, RoundClock, VerdictContext } from './types';
import { roundTimes } from './times';

/** `figure` looped over `bars` bars from its first, judged whole by the alignment, handed over at its end. */
function looped(figure: Figure, bars: number, window: ExpectationWindow): RoundPlan {
	const length = barLength(figure.meter).mul(Fraction.of(bars));
	return {
		prompt: null,
		expectations: figureExpectations({
			figure,
			at: Fraction.ZERO,
			bars,
			startBar: 0,
			sensor: 'attack',
			window,
			content: () => null
		}),
		length,
		policy: { unit: 'cycle', pairing: { mode: 'alignment' }, verdict: 'cycle', correction: false },
		handover: length,
		mutedBars: []
	};
}

const of = Fraction.of;

const eighth = (c: string): FigureElement =>
	c === '1'
		? { kind: 'note', duration: of(1, 8), content: null }
		: { kind: 'rest', duration: of(1, 8) };
const start = (c: RoundClock): Fraction => ('start' in c ? c.start : Fraction.ZERO);

/** The cycle of `round.spec.ts`: a bar of 4/4 in eighths, the off-beats only, over two bars. */
const offBeats: Figure = {
	schema: 2,
	meter: METER_4_4,
	bars: 1,
	voices: [
		{
			id: 'main',
			elements: [...'01010101'].map((c): FigureElement =>
				c === '1'
					? { kind: 'note', duration: of(1, 8), content: null }
					: { kind: 'rest', duration: of(1, 8) }
			)
		}
	]
};
const plan = looped(offBeats, 2, { ms: 120 });
// ♩ = 100 bpm: an eighth lasts 0.3 s, a bar 2.4 s; the cycle starts at bar 1 (2.4 s).
const clock: RoundClock = {
	map: createTempoMap(0, [{ at: Fraction.ZERO, bpm: 100, unit: of(1, 4) }]),
	start: of(1)
};

function context(thresholds: VerdictContext['thresholds']): VerdictContext {
	return {
		plan,
		times: roundTimes(plan, clock),
		clock,
		latency: { ms: 20, provenance: 'system' },
		thresholds,
		aids: ['cursor']
	};
}

/**
 * The exact off-beats, the first 10 ms late, the third 20 ms early, and an extra attack after
 * the first: as the alignment pairs them (attacks in time order).
 */
const attacks = [
	2.7099999999999995, 2.8499999999999996, 3.3, 3.88, 4.5, 5.1, 5.7, 6.3, 6.8999999999999995
];
const offsets = [9.999999999999787, 0, -20.000000000000018, 0, 0, 0, 0, 0];
const result: PairingResult = {
	pairs: offsets.map((offsetMs, expectation): PairedAnswer => ({
		expectation,
		time: attacks[expectation === 0 ? 0 : expectation + 1],
		judged: null,
		late: false,
		pending: false,
		correction: null,
		timing: 'on-time',
		offsetMs
	})),
	missed: [],
	dropped: [],
	extra: [2.8499999999999996],
	shift: null,
	clampedWindows: 0,
	attacks
};

const measures = {
	fidelity: { value: 1, unit: 'ratio' },
	placement: { value: -1.2500000000000289, unit: 'ms' },
	precision: { value: 3.7499999999999756, unit: 'ms' },
	regularity: { value: 7.806247497997965, unit: 'ms' }
};

describe('cycleVerdictMode', () => {
	it('judges a cycle as the plan round did', () => {
		expect(cycleVerdictMode.id).toBe('cycle');
		expect(cycleVerdictMode.outcome(result, context({ precision: 40, regularity: 30 }))).toEqual({
			success: false,
			correct: null,
			verdict: { relation: 'cycle', version: 1, value: { passed: false, reasons: ['extra'] } },
			measures,
			aids: ['cursor'],
			detail: {
				expectations: offsets.map((offsetMs, index) => ({
					index,
					verdict: 'on-time',
					offsetMs
				})),
				dropped: [],
				extra: 1,
				extraAtMs: [449.9999999999997],
				shift: null,
				measures,
				latency: { ms: 20, provenance: 'system' }
			}
		});
	});

	it('fails a cycle with a wrong note', () => {
		const wrong: PairingResult = {
			...result,
			extra: [],
			attacks: attacks.filter((t) => t !== 2.8499999999999996),
			pairs: result.pairs.map((p) =>
				p.expectation === 3
					? { ...p, judged: { correct: false, answer: { midi: 61 }, confusion: null } }
					: { ...p, judged: { correct: true, answer: { midi: 60 }, confusion: null } }
			)
		};
		const outcome = cycleVerdictMode.outcome(wrong, context({ precision: 40, regularity: 30 }));
		expect(outcome.success).toBe(false);
		expect(outcome.verdict.value).toEqual({ passed: false, reasons: ['wrong-pitch'] });
		const report = outcome.detail as CycleReport;
		expect(report.expectations[3]).toEqual({ index: 3, verdict: 'wrong-pitch', offsetMs: 0 });
		expect(outcome.measures.fidelity).toEqual({ value: 7 / 8, unit: 'ratio' });
	});

	it('passes above thresholds.fidelity', () => {
		// Ten eighths over two bars, the fourth played wrong: a fidelity of 0.9.
		const ten = looped(
			{ ...offBeats, voices: [{ id: 'main', elements: [...'11111000'].map(eighth) }] },
			2,
			{ ms: 120 }
		);
		const timed = timeExpectations(ten, clock.map, start(clock));
		const played: PairingResult = {
			pairs: timed.map((e) => ({
				expectation: e.index,
				time: e.time,
				judged: { correct: e.index !== 3, answer: null, confusion: null },
				late: false,
				pending: false,
				correction: null,
				timing: 'on-time',
				offsetMs: 0
			})),
			missed: [],
			dropped: [],
			extra: [],
			shift: null,
			clampedWindows: 0,
			attacks: timed.map((e) => e.time)
		};
		const judged = (fidelity?: number) =>
			cycleVerdictMode.outcome(played, {
				...context({ precision: 40, regularity: 30, fidelity }),
				plan: ten,
				times: roundTimes(ten, clock)
			});
		expect(judged(0.8).measures.fidelity?.value).toBeCloseTo(0.9);
		expect(judged(0.8).success).toBe(true);
		expect(judged(0.8).verdict.value).toEqual({ passed: true });
		expect(judged(0.95).verdict.value).toEqual({ passed: false, reasons: ['wrong-pitch'] });
		expect(judged(undefined).verdict.value).toEqual({ passed: false, reasons: ['wrong-pitch'] });
	});

	it('needs thresholds', () => {
		expect(() => cycleVerdictMode.outcome(result, context(null))).toThrow(
			'a cycle verdict needs thresholds'
		);
	});

	it('judges against thresholds, so a caller without them cannot run it', () => {
		expect(cycleVerdictMode.readsThresholds).toBe(true);
		expect(() => cycleVerdictMode.outcome(result, context(null))).toThrow(
			'a cycle verdict needs thresholds'
		);
	});

	it('accepts a cycle timed by the alignment, and refuses any other plan', () => {
		expect(cycleVerdictMode.validate?.(plan)).toBeNull();
		expect(
			cycleVerdictMode.validate?.({ ...plan, policy: { ...plan.policy, unit: 'response' } })
		).toBe('a cycle verdict judges a whole cycle (unit "cycle"), got unit "response"');
		expect(
			cycleVerdictMode.validate?.({
				...plan,
				policy: { ...plan.policy, pairing: { mode: 'first-answer' } }
			})
		).toBe(
			'a cycle verdict needs pairs timed by the alignment (pairing "alignment"), got "first-answer"'
		);
		const free = { ...plan, expectations: [{ ...plan.expectations[0], at: null }] };
		expect(cycleVerdictMode.validate?.(free)).toBe(
			'a cycle verdict needs a tempo map: expectation 0 is in free time'
		);
	});

	it('keeps its version in the public API of the time domain', () => {
		expect(CYCLE_VERDICT_VERSION).toBe(1);
		expect(PUBLIC).toBe(CYCLE_VERDICT_VERSION);
	});
});
