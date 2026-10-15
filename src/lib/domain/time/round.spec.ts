import { describe, expect, it } from 'vitest';
import { Fraction } from './fraction';
import type { Figure, FigureElement } from './figure';
import { METER_4_4 } from './meter';
import { compileCyclePlan, type RoundPlan } from './plan';
import { createTempoMap } from './tempoMap';
import { PlanRound, type Aid, type PlanObservation } from './round';

const of = Fraction.of;

/** A bar of 4/4 in eighths: the off-beats only (a rest, then a note, four times). */
const offBeats: Figure = {
	schema: 1,
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

function cyclePlan(cycleBars = 2): RoundPlan {
	return compileCyclePlan({
		figure: offBeats,
		cycleBars,
		startBar: 0,
		sensor: 'attack',
		window: { ms: 120 },
		accompanimentBars: ['on']
	});
}

// ♩ = 100 bpm: an eighth lasts 0.3 s, a bar 2.4 s; the cycle starts at bar 1 (2.4 s).
const map = createTempoMap(0, [{ at: Fraction.ZERO, bpm: 100, unit: of(1, 4) }]);
const start = of(1);
const THRESHOLDS = { precision: 40, regularity: 30 };
const SYSTEM = { ms: 20, provenance: 'system' as const };

function round(plan = cyclePlan(), aids: Aid[] = []) {
	return new PlanRound({
		plan,
		map,
		start,
		latency: SYSTEM,
		thresholds: THRESHOLDS,
		aids
	});
}

const attack = (time: number): PlanObservation => ({
	time,
	sensor: 'attack',
	readable: true,
	payload: null
});

/** The exact times of the off-beats of the two bars from the start. */
function exactTimes(plan: RoundPlan): number[] {
	return plan.expectations.map((e) => map.toSeconds(start.add(e.at)));
}

describe('PlanRound', () => {
	it('spans the plan from its start to its start plus its length, in audio seconds', () => {
		const r = round();
		expect(r.startTime).toBeCloseTo(2.4, 9);
		expect(r.endTime).toBeCloseTo(2.4 + 4.8, 9);
	});

	it('passes a cycle of exact off-beats, with no judge verdict of its own', () => {
		const plan = cyclePlan();
		const r = round(plan);
		for (const time of exactTimes(plan)) expect(r.observe(attack(time))).toBe('answer');
		const outcome = r.settle();
		expect(outcome.success).toBe(true);
		expect(outcome.correct).toBeNull();
		expect(outcome.verdict).toEqual({ relation: 'cycle', version: 1, value: { passed: true } });
		expect(outcome.measures.fidelity?.value).toBe(1);
		expect(outcome.measures).toEqual((outcome.detail as { measures: unknown }).measures);
	});

	it('reports the cycle report as the detail, with the latency it was given', () => {
		const plan = cyclePlan();
		const r = round(plan);
		for (const time of exactTimes(plan)) r.observe(attack(time));
		const detail = r.settle().detail as { latency: unknown; expectations: unknown[] };
		expect(detail.latency).toEqual(SYSTEM);
		expect(detail.expectations).toHaveLength(plan.expectations.length);
	});

	it('fails a cycle where nothing was played, and says it missed', () => {
		const outcome = round().settle();
		expect(outcome.success).toBe(false);
		expect(outcome.correct).toBeNull();
		expect(outcome.verdict.value).toEqual({ passed: false, reasons: ['missed'] });
	});

	it('ignores an observation of another sensor', () => {
		const plan = cyclePlan();
		const r = round(plan);
		const note: PlanObservation = { time: 3.0, sensor: 'note', readable: true, payload: 'E' };
		expect(r.observe(note)).toBe('other-sensor');
		for (const time of exactTimes(plan)) r.observe(attack(time));
		const outcome = r.settle();
		expect(outcome.success).toBe(true);
		expect((outcome.detail as { extra: number }).extra).toBe(0);
	});

	it('ignores an unreadable observation', () => {
		const plan = cyclePlan();
		const r = round(plan);
		expect(r.observe({ time: 3.0, sensor: 'attack', readable: false, payload: null })).toBe(
			'unreadable'
		);
		for (const time of exactTimes(plan)) r.observe(attack(time));
		expect(r.settle().success).toBe(true);
	});

	it('hands back what falls outside the cycle to the neighbouring round', () => {
		const plan = cyclePlan();
		const r = round(plan);
		expect(r.observe(attack(r.startTime - 0.01))).toBe('after-capture');
		expect(r.observe(attack(r.endTime))).toBe('after-capture');
		expect(r.observe(attack(r.endTime + 1))).toBe('after-capture');
		expect(r.observe(attack(r.startTime))).toBe('answer');
		expect(r.observe(attack(r.endTime - 0.001))).toBe('answer');
	});

	it('does not count an attack handed back as an added one', () => {
		const plan = cyclePlan();
		const r = round(plan);
		r.observe(attack(r.endTime + 0.3));
		for (const time of exactTimes(plan)) r.observe(attack(time));
		expect(r.settle().success).toBe(true);
	});

	it('counts an extra attack of the cycle against it', () => {
		const plan = cyclePlan();
		const r = round(plan);
		for (const time of exactTimes(plan)) r.observe(attack(time));
		r.observe(attack(exactTimes(plan)[0] + 0.15));
		const outcome = r.settle();
		expect(outcome.success).toBe(false);
		expect(outcome.verdict.value).toEqual({ passed: false, reasons: ['extra'] });
	});

	it('closes once settled: later observations belong to the next round', () => {
		const r = round();
		r.settle();
		expect(r.observe(attack(3))).toBe('after-capture');
	});

	it('hands the aids over as given', () => {
		const aids: Aid[] = ['cursor', 'listen'];
		const outcome = round(cyclePlan(), aids).settle();
		expect(outcome.aids).toEqual(['cursor', 'listen']);
	});

	it('settles to the same outcome each time', () => {
		const plan = cyclePlan();
		const r = round(plan);
		for (const time of exactTimes(plan)) r.observe(attack(time));
		expect(r.settle()).toEqual(r.settle());
	});
});
