import { describe, expect, it } from 'vitest';
import { cyclePlan } from '../testing/cyclePlan';
import { Fraction } from '../fraction';
import type { Figure, FigureElement } from '../figure';
import { METER_4_4 } from '../meter';
import { type RoundPlan } from '../plan';
import { alignAttacks, alignContext, timeExpectations } from '../judge/align';
import { createTempoMap } from '../tempoMap';
import { alignmentPairing } from './alignment';
import type { Attack, Pairing } from './types';
import { roundTimes } from './times';

const of = Fraction.of;
const map = createTempoMap(0, [{ at: Fraction.ZERO, bpm: 100, unit: of(1, 4) }]);
const start = of(1);

function figure(pattern: string): Figure {
	return {
		schema: 2,
		meter: METER_4_4,
		bars: 1,
		voices: [
			{
				id: 'main',
				elements: [...pattern].map((c): FigureElement =>
					c === '1'
						? { kind: 'note', duration: of(1, 8), content: null }
						: { kind: 'rest', duration: of(1, 8) }
				)
			}
		]
	};
}

function planOf(pattern: string, cycleBars: number): RoundPlan {
	return cyclePlan({
		figure: figure(pattern),
		cycleBars,
		startBar: 0,
		sensor: 'attack',
		window: { ms: 20 },
		accompanimentBars: ['on']
	});
}

function pairingOf(plan: RoundPlan): Pairing {
	const clock = { map, start };
	return alignmentPairing.create({
		plan,
		times: roundTimes(plan, clock),
		clock,
		judge: () => null
	});
}

const attack = (time: number): Attack => ({ time, sensor: 'attack', final: true, payload: null });

describe('alignmentPairing', () => {
	it('is the alignment mode and needs a tempo map', () => {
		expect(alignmentPairing.id).toBe('alignment');
		const plan = planOf('01010101', 2);
		expect(() =>
			alignmentPairing.create({
				plan,
				times: roundTimes(plan, { promptS: 0 }),
				clock: { promptS: 0 },
				judge: () => null
			})
		).toThrow('an alignment needs a tempo map');
	});

	it('keeps the attacks of its capture window and leaves the rest to its neighbours', () => {
		const plan = planOf('01010101', 2);
		const pairing = pairingOf(plan);
		const startS = map.toSeconds(start);
		const endS = map.toSeconds(start.add(plan.length));
		expect(pairing.offer(attack(startS - 0.2)).fate).toBe('after-capture');
		expect(pairing.offer(attack(startS - 0.01))).toEqual({ fate: 'answer', judged: null });
		expect(pairing.offer(attack(startS + 0.3))).toEqual({ fate: 'answer', judged: null });
		expect(pairing.offer(attack(endS)).fate).toBe('after-capture');
		expect(pairing.offer(attack(endS + 1)).fate).toBe('after-capture');
		expect(pairing.result().attacks).toEqual([startS - 0.01, startS + 0.3]);
		expect(pairing.droppable(startS)).toBe(false);
		expect(pairing.shownMisses(endS)).toEqual([]);
	});

	it('is done once the capture window has closed', () => {
		const plan = planOf('01010101', 2);
		const pairing = pairingOf(plan);
		const endS = map.toSeconds(start.add(plan.length));
		expect(pairing.done(endS - 0.5)).toBe(false);
		expect(pairing.done(endS)).toBe(true);
	});

	it('accepts the plans of a cycle, and refuses what it cannot time or would not judge', () => {
		const plan = planOf('01010101', 2);
		const validate = (expectations: RoundPlan['expectations']) =>
			alignmentPairing.validate?.({ ...plan, expectations });
		const [first, second] = plan.expectations;
		expect(alignmentPairing.validate?.(plan)).toBeNull();
		// A judged rest is left out of the alignment: an attack there is an extra, judged so.
		expect(validate([first, { ...second, role: 'judged-rest' }])).toBeNull();
		expect(validate([{ ...first, at: null }])).toBe(
			'expectation 0 is in free time: an alignment times attacks on the tempo map'
		);
		expect(validate([first, { ...second, span: { until: of(1) } }])).toBe(
			'expectation 1 is a stretch: an alignment times each attack against a point'
		);
		expect(validate([{ ...first, content: { kind: 'note', value: 'F' } }])).toBe(
			'expectation 0 asks for content (note): an alignment times attacks and judges no content'
		);
		expect(validate([first, { ...second, at: first.at }])).toBe(
			'expectations 0 and 1 fall at the same place: an alignment pairs one attack with one place'
		);
		expect(validate([first, { ...second, sensor: 'note' }])).toBe(
			'its expectations are heard by attack, note: an alignment pairs the attacks of one sensor, by time alone'
		);
	});

	it('takes another reading of an attack it kept as the same attack', () => {
		const pairing = pairingOf(planOf('01010101', 2));
		const startS = map.toSeconds(start);
		expect(pairing.offer(attack(startS + 0.3)).fate).toBe('answer');
		expect(pairing.offer({ ...attack(startS + 0.3), payload: 'better' }).fate).toBe('answer');
		expect(pairing.result().attacks).toEqual([startS + 0.3]);
		expect(pairing.result().extra).toEqual([]);
	});

	it('hears a first attack a little early in a round that does not loop', () => {
		const loop = planOf('10000000', 1);
		const plan: RoundPlan = { ...loop, handover: undefined };
		const startS = map.toSeconds(start);
		// ♩ = 100: a sixteenth, the zone of a lone target, lasts 0.15 s.
		const pairing = pairingOf(plan);
		expect(pairing.offer(attack(startS - 0.2)).fate).toBe('after-capture');
		expect(pairing.offer(attack(startS - 0.02)).fate).toBe('answer');
		expect(pairing.result().pairs[0]).toMatchObject({ expectation: 0, timing: 'on-time' });
		const endS = map.toSeconds(start.add(plan.length));
		expect(pairing.offer(attack(endS - 0.01)).fate).toBe('answer');
		expect(pairing.offer(attack(endS)).fate).toBe('after-capture');
	});

	it('stops taking attacks where its plan stops listening, and is done there', () => {
		const loop = planOf('01010101', 2);
		// A round that does not loop, listening up to its last beat.
		const plan: RoundPlan = { ...loop, handover: undefined, listenUntil: of(7, 4) };
		const pairing = pairingOf(plan);
		const listenUntilS = map.toSeconds(start.add(of(7, 4)));
		expect(pairing.offer(attack(listenUntilS - 0.01)).fate).toBe('answer');
		expect(pairing.offer(attack(listenUntilS + 0.01)).fate).toBe('after-capture');
		expect(pairing.done(listenUntilS - 0.02)).toBe(false);
		expect(pairing.done(listenUntilS)).toBe(true);
	});

	it('aligns what it kept as the cycle judge does', () => {
		const plan = planOf('11100100', 4);
		const timed = timeExpectations(plan, map, start);
		const pairing = pairingOf(plan);
		// A beat lost from bar 2: the player comes in a beat early from there.
		const heard = timed.map((e) => e.time + (e.bar >= 2 ? -0.6 : 0));
		for (const time of heard) expect(pairing.offer(attack(time)).fate).toBe('answer');
		const expected = alignAttacks(timed, heard, alignContext(plan, map, start));
		const result = pairing.result();
		expect(expected.shift).not.toBeNull();
		expect(result.shift).toEqual(expected.shift);
		expect(result.dropped).toEqual(expected.dropped);
		expect(result.missed).toEqual(expected.missed);
		expect(result.pairs).toHaveLength(expected.pairs.length);
		expect(result.pairs[0]).toEqual({
			expectation: expected.pairs[0].expectation,
			time: heard[expected.pairs[0].attack],
			judged: null,
			late: false,
			pending: false,
			correction: null,
			timing: expected.pairs[0].verdict,
			offsetMs: expected.pairs[0].offsetMs
		});
	});
});
