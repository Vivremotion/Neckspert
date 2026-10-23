import { describe, expect, it } from 'vitest';
import type { Judged, RoundPlan } from '../plan';
import { firstAnswerPairing } from './firstAnswer';
import { anchorPlan, F, freeTimePlan, gridPlan, locatePlan, map } from './testing/plans';
import type { Attack, Pairing, RoundClock } from './types';
import { roundTimes } from './zones';

const right: Judged = { correct: true, answer: 'right', confusion: null };
const wrong: Judged = { correct: false, answer: 'wrong', confusion: 'other' };

function pairingOf(plan: RoundPlan, clock: RoundClock = { map, start: F(2) }): Pairing {
	return firstAnswerPairing.create({
		plan,
		times: roundTimes(plan, clock, false),
		clock,
		judge: (_, payload) => payload as Judged
	});
}

function attack(time: number, judged: Judged = right, sensor = 'note', final = true): Attack {
	return { time, sensor, final, payload: judged };
}

describe('firstAnswerPairing', () => {
	it('is the first-answer mode', () => {
		expect(firstAnswerPairing.id).toBe('first-answer');
	});

	it('takes the first attack in the window and ignores the next', () => {
		const pairing = pairingOf(locatePlan());
		expect(pairing.offer(attack(6.13))).toEqual({ fate: 'answer', judged: right });
		expect(pairing.offer(attack(6.2)).fate).toBe('settled');
		expect(pairing.done(6.13)).toBe(true);
		const result = pairing.result();
		expect(result.pairs).toEqual([
			{
				expectation: 0,
				time: 6.13,
				judged: right,
				late: false,
				pending: false,
				correction: null,
				timing: null,
				offsetMs: null
			}
		]);
		expect(result.missed).toEqual([]);
		expect(result.attacks).toEqual([6.13]);
		expect(result).toMatchObject({ dropped: [], extra: [], shift: null, clampedWindows: 0 });
	});

	it('gives an attack before the opening to the previous prompt', () => {
		const pairing = pairingOf(locatePlan());
		expect(pairing.offer(attack(3.39)).fate).toBe('before-window');
		expect(pairing.offer(attack(3.4)).fate).toBe('answer');
	});

	it('keeps a right note after the in-time zone as off the beat', () => {
		const pairing = pairingOf(locatePlan());
		expect(pairing.offer(attack(7.0)).fate).toBe('answer');
		expect(pairing.result().pairs[0]).toMatchObject({ time: 7.0, late: true, judged: right });
	});

	it('ignores an attack past the late capture', () => {
		const pairing = pairingOf(locatePlan());
		expect(pairing.offer(attack(8.36)).fate).toBe('after-capture');
		expect(pairing.offer(attack(8.35)).fate).toBe('answer');
	});

	it('waits for a better reading of the same attack and ignores another one meanwhile', () => {
		const pairing = pairingOf(locatePlan());
		expect(pairing.offer(attack(6.13, wrong, 'note', false))).toEqual({
			fate: 'answer',
			judged: wrong
		});
		expect(pairing.done(6.13)).toBe(false);
		expect(pairing.result().pairs[0]).toMatchObject({ pending: true, judged: wrong });
		expect(pairing.offer(attack(6.4)).fate).toBe('settled');
		expect(pairing.offer(attack(6.13, right, 'note', true)).fate).toBe('answer');
		expect(pairing.done(6.2)).toBe(true);
		expect(pairing.result().pairs[0]).toMatchObject({ time: 6.13, pending: false, judged: right });
	});

	it('takes a pending reading as it stands once listening ends', () => {
		const pairing = pairingOf(locatePlan());
		pairing.offer(attack(6.13, wrong, 'note', false));
		expect(pairing.done(8.35)).toBe(true);
		pairing.advance(8.35);
		expect(pairing.result().pairs[0]).toMatchObject({ pending: false, judged: wrong });
		expect(pairing.offer(attack(6.13, right)).fate).toBe('settled');
	});

	it('shows a miss once the in-time zone closes unanswered, not while a reading waits', () => {
		const silent = pairingOf(locatePlan());
		expect(silent.shownMisses(6.49)).toEqual([]);
		expect(silent.shownMisses(6.5)).toEqual([0]);
		expect(silent.result().missed).toEqual([0]);
		const waiting = pairingOf(locatePlan());
		waiting.offer(attack(6.13, wrong, 'note', false));
		expect(waiting.shownMisses(6.5)).toEqual([]);
	});

	it('drops a round closed before its in-time zone ends with nothing heard', () => {
		const pairing = pairingOf(locatePlan());
		expect(pairing.droppable(6.0)).toBe(true);
		expect(pairing.droppable(6.5)).toBe(false);
		pairing.offer(attack(6.13));
		expect(pairing.droppable(6.0)).toBe(false);
	});

	it('misses a root nobody played once its zone is over, and stops listening at the chord’s end', () => {
		const pairing = pairingOf(anchorPlan());
		expect(pairing.done(9.0)).toBe(false);
		expect(pairing.done(9.1)).toBe(true);
		expect(pairing.done(11.35)).toBe(true);
		expect(pairing.shownMisses(9.1)).not.toContain(1);
		expect(pairing.shownMisses(9.1)).toEqual([0]);
		expect(pairing.result().missed).toEqual([0, 1]);
	});

	it('takes a root reading still waiting as it stands once the chord’s span opens', () => {
		const pairing = pairingOf(anchorPlan());
		pairing.offer(attack(6.13, wrong, 'note', false));
		pairing.advance(6.8);
		expect(pairing.result().pairs[0].pending).toBe(true);
		pairing.advance(6.85);
		expect(pairing.result().pairs[0]).toMatchObject({ pending: false, judged: wrong });
	});

	it('puts a wrong first chord right with a later right one in the span', () => {
		const pairing = pairingOf({
			...anchorPlan(),
			policy: { ...anchorPlan().policy, correction: true }
		});
		expect(pairing.offer(attack(6.1)).fate).toBe('answer');
		expect(pairing.offer(attack(7.0, wrong, 'chord')).fate).toBe('answer');
		expect(pairing.shownMisses(7.0)).toContain(1);
		expect(pairing.done(8.0)).toBe(false);
		expect(pairing.offer(attack(8.0, right, 'chord'))).toEqual({ fate: 'answer', judged: right });
		expect(pairing.result().pairs[1]).toMatchObject({
			time: 7.0,
			judged: wrong,
			correction: { time: 8.0, judged: right }
		});
		expect(pairing.shownMisses(8.0)).not.toContain(1);
		expect(pairing.done(8.0)).toBe(true);
		expect(pairing.offer(attack(8.5, right, 'chord')).fate).toBe('settled');
	});

	it('stops correcting a span that is not the last once its zone has passed', () => {
		const plan = anchorPlan();
		const pairing = pairingOf({
			...plan,
			expectations: [...plan.expectations, { ...plan.expectations[0], at: F(3, 2), sensor: 'tap' }],
			policy: { ...plan.policy, correction: true }
		});
		pairing.offer(attack(6.1));
		pairing.offer(attack(7.0, wrong, 'chord'));
		pairing.advance(9.1);
		expect(pairing.offer(attack(8.0, right, 'chord')).fate).toBe('settled');
	});

	it('closes a correction still awaited once listening ends', () => {
		const pairing = pairingOf({
			...anchorPlan(),
			policy: { ...anchorPlan().policy, correction: true }
		});
		pairing.offer(attack(6.1));
		pairing.offer(attack(7.0, wrong, 'chord'));
		expect(pairing.done(11.3)).toBe(false);
		expect(pairing.done(11.35)).toBe(true);
		pairing.advance(11.35);
	});

	it('waits for the last expectation until listenUntil while the chain before it holds', () => {
		const pairing = pairingOf(anchorPlan());
		pairing.offer(attack(6.1));
		expect(pairing.done(9.1)).toBe(false);
		expect(pairing.done(11.35)).toBe(true);
	});

	it('takes a chord reading still waiting as it stands at the bar’s end after a wrong root', () => {
		const pairing = pairingOf(anchorPlan());
		pairing.offer(attack(6.1, wrong));
		pairing.offer(attack(7.0, wrong, 'chord', false));
		expect(pairing.result().pairs[1].pending).toBe(true);
		pairing.advance(9.1);
		expect(pairing.done(9.1)).toBe(true);
		expect(pairing.result().pairs[1]).toMatchObject({ pending: false, judged: wrong });
	});

	it('settles every later attack of a decided point, and judges a span by its zone', () => {
		const located = pairingOf(locatePlan());
		expect(located.offer(attack(8.36)).fate).toBe('after-capture');
		located.offer(attack(6.13));
		expect(located.offer(attack(8.36)).fate).toBe('settled');
		expect(located.offer(attack(3.0)).fate).toBe('settled');

		const answeredRoot = pairingOf(anchorPlan());
		answeredRoot.offer(attack(6.1));
		expect(answeredRoot.offer(attack(7.0)).fate).toBe('settled');

		const silentRoot = pairingOf(anchorPlan());
		expect(silentRoot.offer(attack(7.0)).fate).toBe('after-capture');
		silentRoot.advance(6.85);
		expect(silentRoot.offer(attack(7.0)).fate).toBe('settled');

		const anchor = pairingOf({
			...anchorPlan(),
			policy: { ...anchorPlan().policy, correction: true }
		});
		anchor.offer(attack(6.1));
		anchor.offer(attack(7.0, wrong, 'chord'));
		expect(anchor.offer(attack(9.1, right, 'chord')).fate).toBe('after-capture');
		expect(anchor.offer(attack(6.5, right, 'chord')).fate).toBe('before-window');
	});

	it('never corrects a point, nor a chord after a wrong root', () => {
		const correcting = { ...anchorPlan().policy, correction: true };
		const point = pairingOf({
			...locatePlan(),
			policy: { ...locatePlan().policy, correction: true }
		});
		point.offer(attack(6.1, wrong));
		expect(point.offer(attack(6.2)).fate).toBe('settled');
		expect(point.result().pairs[0].correction).toBeNull();

		const anchor = pairingOf({ ...anchorPlan(), policy: correcting });
		anchor.offer(attack(6.1, wrong));
		anchor.offer(attack(7.0, wrong, 'chord'));
		expect(anchor.shownMisses(7.0)).not.toContain(1);
		expect(anchor.offer(attack(8.0, right, 'chord')).fate).toBe('settled');
		expect(anchor.result().pairs.map((p) => p.correction)).toEqual([null, null]);
	});

	it('hands over at the next change: an attack on the handover is not this round’s', () => {
		const plan = gridPlan();
		const clock: RoundClock = { map, start: F(2) };
		const handoverS = roundTimes(plan, clock, false).handoverS as number;
		const pairing = pairingOf(plan, clock);
		expect(pairing.offer(attack(handoverS, right, 'chord')).fate).toBe('after-capture');
		expect(pairing.offer(attack(handoverS - 0.001, right, 'chord')).fate).toBe('answer');
		expect(pairing.result().pairs[0].late).toBe(true);
	});

	it('opens a grid change early, before its beat', () => {
		const pairing = pairingOf(gridPlan());
		expect(pairing.offer(attack(5.89, right, 'chord')).fate).toBe('before-window');
		expect(pairing.offer(attack(5.9, right, 'chord')).fate).toBe('answer');
		expect(pairing.result().pairs[0].late).toBe(false);
	});

	it('answers in free time at any moment after the prompt', () => {
		const pairing = pairingOf(freeTimePlan(), { promptS: 10 });
		expect(pairing.offer(attack(9.99)).fate).toBe('before-window');
		expect(pairing.offer(attack(14)).fate).toBe('answer');
		expect(pairing.result().pairs[0].late).toBe(false);
		expect(pairing.done(14)).toBe(true);
	});

	it('takes an answer without content as right', () => {
		const plan = locatePlan();
		const clock: RoundClock = { map, start: F(2) };
		const pairing = firstAnswerPairing.create({
			plan,
			times: roundTimes(plan, clock, false),
			clock,
			judge: () => null
		});
		expect(pairing.offer({ time: 6.1, sensor: 'note', final: false, payload: null })).toEqual({
			fate: 'answer',
			judged: null
		});
		expect(pairing.done(6.1)).toBe(true);
	});
});
