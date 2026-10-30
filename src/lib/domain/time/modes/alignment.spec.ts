import { describe, expect, it } from 'vitest';
import { loopedFigurePlan } from './testing/plans';
import { Fraction } from '../fraction';
import type { Figure, FigureElement } from '../figure';
import { METER_4_4 } from '../meter';
import { type Judged, type RoundPlan } from '../plan';
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
	return loopedFigurePlan(figure(pattern), cycleBars, { ms: 20 });
}

/** For specs: an exact pitch, as the pitch judge reads it, without importing the judges. */
function judgePitch(plan: RoundPlan, index: number, payload: unknown): Judged | null {
	const content = plan.expectations[index].content;
	if (!content) return null;
	const { midi } = payload as { midi: number };
	const correct = (content.value as { midi: number }).midi === midi;
	return { correct, answer: { midi }, confusion: null };
}

function pairingOf(plan: RoundPlan): Pairing {
	const clock = { map, start };
	return alignmentPairing.create({
		plan,
		times: roundTimes(plan, clock),
		clock,
		judge: (index, payload) => judgePitch(plan, index, payload)
	});
}

/** The plan of `pattern` whose `k`-th note asks for MIDI `midis[k]`. */
function pitchedPlanOf(pattern: string, cycleBars: number, midis: number[]): RoundPlan {
	const plan = planOf(pattern, cycleBars);
	return {
		...plan,
		expectations: plan.expectations.map((e, k) => ({
			...e,
			content: { kind: 'pitch', value: { midi: midis[k] } }
		}))
	};
}

const note = (time: number, midi: number, final = true): Attack => ({
	time,
	sensor: 'attack',
	final,
	payload: { midi }
});

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
		expect(validate([first, { ...second, at: first.at }])).toBe(
			'expectations 0 and 1 fall at the same place: an alignment pairs one attack with one place'
		);
		expect(validate([first, { ...second, sensor: 'note' }])).toBe(
			'its expectations are heard by attack, note: an alignment pairs the attacks of one sensor, by time alone'
		);
	});

	it('accepts content', () => {
		const plan = pitchedPlanOf('01010101', 2, [60, 62, 64, 65, 67, 69, 71, 72]);
		expect(alignmentPairing.validate?.(plan)).toBeNull();
	});

	it('judges each note against the expectation it pairs with, a wrong one in place', () => {
		const plan = pitchedPlanOf('10101010', 1, [60, 62, 64, 65]);
		const timed = timeExpectations(plan, map, start);
		const pairing = pairingOf(plan);
		const midis = [60, 62, 63, 65];
		timed.forEach((e, k) => pairing.offer(note(e.time, midis[k])));
		const result = pairing.result();
		expect(result.missed).toEqual([]);
		expect(result.extra).toEqual([]);
		expect(result.pairs.map((p) => [p.expectation, p.judged?.correct])).toEqual([
			[0, true],
			[1, true],
			[2, false],
			[3, true]
		]);
		expect(result.pairs[2].judged).toEqual({
			correct: false,
			answer: { midi: 63 },
			confusion: null
		});
	});

	it('keeps the final reading of an attack', () => {
		const plan = pitchedPlanOf('10000000', 1, [60]);
		const startS = map.toSeconds(start);
		const pairing = pairingOf(plan);
		// A first reading, not final and wrong, then the final one, right.
		expect(pairing.offer(note(startS, 62, false)).fate).toBe('answer');
		expect(pairing.offer(note(startS, 60)).fate).toBe('answer');
		const result = pairing.result();
		expect(result.attacks).toEqual([startS]);
		expect(result.extra).toEqual([]);
		expect(result.pairs).toHaveLength(1);
		expect(result.pairs[0].judged?.correct).toBe(true);
		// A reading that is not final never replaces a final one.
		pairing.offer(note(startS, 62, false));
		expect(pairing.result().pairs[0].judged?.correct).toBe(true);
		// Without a final reading, the last one received stands.
		const again = pairingOf(plan);
		again.offer(note(startS, 60, false));
		again.offer(note(startS, 62, false));
		expect(again.result().pairs[0].judged?.correct).toBe(false);
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

	describe('live', () => {
		// Eighths at ♩ = 100 from 2.4 s: a note every 0.3 s, a zone of 0.15 s either side.
		const startS = map.toSeconds(start);
		const pitched = () => pitchedPlanOf('11111111', 1, [60, 62, 64, 65, 67, 69, 71, 72]);

		it('tells a right note as soon as it is heard, and nothing it cannot know yet', () => {
			const pairing = pairingOf(pitched());
			pairing.offer(note(startS + 0.05, 60));
			expect(pairing.live?.(startS + 0.05)).toEqual({
				expectations: [{ index: 0, verdict: 'late', offsetMs: expect.closeTo(50) }],
				extraAtMs: []
			});
		});

		it('waits for the end of its zone to tell a wrong note: a right one may still come', () => {
			const pairing = pairingOf(pitched());
			pairing.offer(note(startS, 61));
			expect(pairing.live?.(startS + 0.1).expectations).toEqual([]);
			expect(pairing.live?.(startS + 0.15).expectations).toEqual([
				{ index: 0, verdict: 'wrong-pitch', offsetMs: expect.closeTo(0) }
			]);
		});

		it('waits for a better reading of a note before telling it, unless its zone has closed', () => {
			const pairing = pairingOf(pitched());
			pairing.offer(note(startS, 60, false));
			expect(pairing.live?.(startS + 0.01).expectations).toEqual([]);
			expect(pairing.live?.(startS + 0.15).expectations.map((e) => e.verdict)).toEqual(['on-time']);
		});

		it('tells a note missed once its zone has closed', () => {
			const pairing = pairingOf(pitched());
			expect(pairing.live?.(startS + 0.14).expectations).toEqual([]);
			expect(pairing.live?.(startS + 0.15).expectations).toEqual([
				{ index: 0, verdict: 'missed', offsetMs: null }
			]);
		});

		it('tells an added attack, from the round start, once no open zone can take it', () => {
			const pairing = pairingOf(pitched());
			pairing.offer(note(startS, 60));
			pairing.offer(note(startS + 0.05, 60));
			expect(pairing.live?.(startS + 0.05)).toEqual({
				expectations: [{ index: 0, verdict: 'on-time', offsetMs: expect.closeTo(0) }],
				extraAtMs: [expect.closeTo(50)]
			});
		});

		it('never takes back what it told', () => {
			const pairing = pairingOf(pitched());
			pairing.offer(note(startS + 0.05, 60));
			const told = pairing.live?.(startS + 0.05).expectations;
			pairing.offer(note(startS + 0.06, 60));
			pairing.offer(note(startS + 0.3, 62));
			expect(pairing.live?.(startS + 0.5).expectations.slice(0, 1)).toEqual(told);
		});

		it('agrees with the judge on a run with no lost beat', () => {
			const pairing = pairingOf(pitched());
			const played: [number, number][] = [
				[0, 60],
				[0.31, 62],
				[0.55, 64],
				[0.9, 66],
				[1.5, 69],
				[1.8, 71]
			];
			for (const [at, midi] of played) {
				pairing.offer(note(startS + at, midi));
				pairing.live?.(startS + at);
			}
			const told = pairing.live?.(startS + 2.4);
			const judged = pairing.result();
			expect(told?.expectations.map((e) => e.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
			expect(told?.expectations.filter((e) => e.verdict === 'missed').map((e) => e.index)).toEqual(
				judged.missed
			);
			expect(
				told?.expectations
					.filter((e) => e.verdict !== 'missed')
					.map((e) => [e.index, e.offsetMs, e.verdict])
			).toEqual(
				judged.pairs.map((p) => [
					p.expectation,
					p.offsetMs,
					p.judged?.correct ? p.timing : 'wrong-pitch'
				])
			);
		});

		it('says when each zone closes, so a silence is told without waiting for the next beat', () => {
			const closes = pairingOf(pitched()).liveWakes?.() ?? [];
			expect(closes).toHaveLength(8);
			expect(closes[0]).toBeCloseTo(startS + 0.15);
			expect(closes[1]).toBeCloseTo(startS + 0.45);
		});
	});
});
