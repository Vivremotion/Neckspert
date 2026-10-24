import { describe, expect, it } from 'vitest';
import { Fraction } from '../fraction';
import type { Figure, FigureElement } from '../figure';
import { METER_4_4 } from '../meter';
import { compileCyclePlan, type RoundPlan } from '../plan';
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
		schema: 1,
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
	return compileCyclePlan({
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
