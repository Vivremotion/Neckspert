import { describe, expect, it } from 'vitest';
import { Fraction } from '../fraction';
import type { Expectation, RoundPlan } from '../plan';
import { createTempoMap } from '../tempoMap';
import { EDGE_TOLERANCE_S, roundTimes } from './zones';

const F = Fraction.of;
const quarter = F(1, 4);
const mapAt = (bpm: number) => createTempoMap(0.1, [{ at: Fraction.ZERO, bpm, unit: quarter }]);
const map = mapAt(80);

function expectation(at: Fraction, span: Expectation['span'], sensor: string): Expectation {
	return {
		at,
		span,
		role: 'target',
		sensor,
		content: null,
		window: { ms: 80 },
		bar: 0
	};
}

function locatePlan(): RoundPlan {
	return {
		prompt: F(-1),
		expectations: [expectation(Fraction.ZERO, 'point', 'note')],
		length: F(1),
		listenUntil: F(3, 4),
		mutedBars: [],
		policy: {
			unit: 'response',
			verdict: 'response',
			correction: false,
			pairing: {
				mode: 'first-answer',
				opens: { afterPromptMs: 300 },
				lateMs: 400,
				lateCapture: { ms: 2000 }
			}
		}
	};
}

function anchorPlan(): RoundPlan {
	const plan = locatePlan();
	return {
		...plan,
		expectations: [...plan.expectations, expectation(quarter, { until: F(1) }, 'chord')],
		length: F(2),
		listenUntil: F(7, 4)
	};
}

function gridPlan(): RoundPlan {
	return {
		prompt: F(-1, 4),
		expectations: [expectation(Fraction.ZERO, 'point', 'chord')],
		length: F(1),
		handover: F(1),
		mutedBars: [],
		policy: {
			unit: 'response',
			verdict: 'response',
			correction: false,
			pairing: {
				mode: 'first-answer',
				opens: { beforeMs: 200, maxBeats: 0.4 },
				lateMs: 400,
				lateCapture: 'to-end'
			}
		}
	};
}

describe('roundTimes', () => {
	it('times a located note as the beat relation does', () => {
		const t = roundTimes(locatePlan(), { map, start: F(2) }, false);
		expect(t.promptS).toBeCloseTo(3.1, 9);
		expect(t.zones).toHaveLength(1);
		expect(t.zones[0].opensS).toBeCloseTo(3.4, 9);
		expect(t.zones[0].inTimeEndS).toBeCloseTo(6.5, 9);
		expect(t.zones[0].captureEndS).toBeCloseTo(8.35, 9);
		expect(t.listenUntilS).toBeCloseTo(8.35, 9);
		expect(t.startS).toBeCloseTo(6.1, 9);
		expect(t.endS).toBeCloseTo(6.1 + 3, 9);
		expect(t.handoverS).toBeNull();
	});

	it('ends the root’s late capture where the chord’s span opens', () => {
		const t = roundTimes(anchorPlan(), { map, start: F(2) }, false);
		const [root, chord] = t.zones;
		expect(root.captureEndS).toBeCloseTo(6.85, 9);
		expect(chord.opensS).toBeCloseTo(6.85, 9);
		expect(chord.inTimeEndS).toBeCloseTo(9.1, 9);
		expect(chord.captureEndS).toBeCloseTo(9.1, 9);
		expect(chord.span).toBe('span');
		expect(t.listenUntilS).toBeCloseTo(11.35, 9);
	});

	it('opens a grid change early by its tolerance, capped in beats', () => {
		const m = mapAt(120);
		const startS = m.toSeconds(F(1));
		const t = roundTimes(gridPlan(), { map: m, start: F(1) }, false);
		expect(t.zones[0].opensS).toBeCloseTo(startS - 0.2, 9);
		expect(t.zones[0].inTimeEndS).toBeCloseTo(startS + 0.4, 9);
		expect(t.handoverS).toBeCloseTo(startS + 2 - 0.2, 9);
		expect(t.listenUntilS).toBeCloseTo(startS + 2 - 0.2, 9);
		expect(t.zones[0].captureEndS).toBeCloseTo(startS + 2 - 0.2, 9);
		const slow = roundTimes(gridPlan(), { map: mapAt(160), start: F(1) }, false);
		expect(slow.zones[0].opensS).toBeCloseTo(mapAt(160).toSeconds(F(1)) - 0.15, 9);
	});

	it('shows a chained grid change at its opening', () => {
		const chained = roundTimes(gridPlan(), { map, start: F(1) }, true);
		expect(chained.promptS).toBeCloseTo(chained.zones[0].opensS, 9);
		const alone = roundTimes(gridPlan(), { map, start: F(1) }, false);
		expect(alone.promptS).toBeCloseTo(map.toSeconds(F(1)) - 0.75, 9);
		expect(EDGE_TOLERANCE_S).toBe(1e-6);
	});

	it('opens a free-time expectation at the prompt and never closes it', () => {
		const plan: RoundPlan = {
			...locatePlan(),
			prompt: null,
			expectations: [{ ...expectation(Fraction.ZERO, 'point', 'note'), at: null }]
		};
		const t = roundTimes(plan, { promptS: 10 }, false);
		expect(t.zones[0].opensS).toBeCloseTo(10.3, 9);
		expect(t.zones[0].inTimeEndS).toBe(Infinity);
		expect(t.zones[0].captureEndS).toBe(Infinity);
		expect(t.zones[0].atS).toBeNull();
		expect(t.listenUntilS).toBe(Infinity);
		expect(t.handoverS).toBeNull();
	});

	it('gives no zones to an aligned plan', () => {
		const plan: RoundPlan = {
			...locatePlan(),
			prompt: null,
			handover: F(1),
			listenUntil: undefined,
			policy: {
				...locatePlan().policy,
				unit: 'cycle',
				verdict: 'cycle',
				pairing: { mode: 'alignment' }
			}
		};
		const t = roundTimes(plan, { map, start: F(2) }, false);
		expect(t.zones).toEqual([]);
		expect(t.startS).toBeCloseTo(6.1, 9);
		expect(t.endS).toBeCloseTo(9.1, 9);
	});
});
