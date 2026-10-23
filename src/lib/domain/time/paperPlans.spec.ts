import { describe, expect, it } from 'vitest';
import { Fraction } from './fraction';
import { validateRoundPlan, type Expectation, type RoundPlan, type RoundPolicy } from './plan';
import type { LateCapture, Opening } from './modes';

// Paper plans (spec 2026-10-14, section 3): the existing timing relations written by hand
// on the expectation contract, to prove it carries them before the engine is written.

const of = Fraction.of;
const target = (
	at: Fraction | null,
	sensor: string,
	extra: Partial<Expectation> = {}
): Expectation => ({
	at,
	span: 'point',
	role: 'target',
	sensor,
	content: null,
	window: { ms: 100 },
	bar: 0,
	...extra
});

const firstAnswer = (
	opens: Opening,
	lateCapture: LateCapture,
	correction: boolean
): RoundPolicy => ({
	unit: 'response',
	pairing: { mode: 'first-answer', opens, lateMs: 400, lateCapture },
	verdict: 'response',
	correction
});

describe('paper plans of the existing relations', () => {
	it('beat (locate): the string shows two beats ahead, one note on the downbeat', () => {
		const plan: RoundPlan = {
			prompt: of(-2, 4),
			expectations: [
				target(of(0), 'note', {
					content: { kind: 'note-on-string', value: { string: 2, note: 'F' } }
				})
			],
			length: of(1),
			policy: firstAnswer({ afterPromptMs: 300 }, { ms: 2000 }, false),
			mutedBars: []
		};
		expect(validateRoundPlan(plan)).toBeNull();
		expect(plan.prompt?.equals(of(-1, 2))).toBe(true);
		expect(plan.expectations[0].sensor).toBe('note');
		expect(plan.expectations[0].content).toEqual({
			kind: 'note-on-string',
			value: { string: 2, note: 'F' }
		});
		expect(plan.policy.pairing).toEqual({
			mode: 'first-answer',
			opens: { afterPromptMs: 300 },
			lateMs: 400,
			lateCapture: { ms: 2000 }
		});
	});

	it('anchor (triads): the root on the downbeat, then the chord from beat 2 to the bar end', () => {
		const plan: RoundPlan = {
			prompt: of(-2, 4),
			expectations: [
				target(of(0), 'note', { content: { kind: 'degree', value: 'root' } }),
				target(of(1, 4), 'chord', {
					span: { until: of(1) },
					content: { kind: 'triad', value: 'triad' }
				})
			],
			length: of(1),
			policy: firstAnswer({ afterPromptMs: 300 }, { ms: 2000 }, true),
			mutedBars: []
		};
		expect(validateRoundPlan(plan)).toBeNull();
		expect(plan.expectations.map((e) => e.sensor)).toEqual(['note', 'chord']);
		expect(plan.expectations[1].span).toEqual({ until: of(1) });
		expect(plan.policy.correction).toBe(true);
		expect(plan.policy.verdict).toBe('response');
	});

	it('gridChange (gesture): one round per change, handed over a little before the next change', () => {
		const plan: RoundPlan = {
			prompt: null,
			expectations: [
				target(of(0), 'chord', {
					content: { kind: 'chord', value: 'chord-0' },
					window: { ofGap: of(1, 2) }
				})
			],
			length: of(1),
			policy: firstAnswer({ beforeMs: 200, maxBeats: 0.4 }, 'to-end', false),
			handover: of(39, 40),
			mutedBars: []
		};
		expect(validateRoundPlan(plan)).toBeNull();
		expect(plan.prompt).toBeNull();
		expect(plan.policy.pairing).toMatchObject({
			opens: { beforeMs: 200, maxBeats: 0.4 },
			lateCapture: 'to-end'
		});
		expect(plan.handover?.compare(plan.length)).toBe(-1);
	});

	it('free: a note played at any time, no position in the round', () => {
		const plan: RoundPlan = {
			prompt: null,
			expectations: [target(null, 'note', { content: { kind: 'note', value: 'F' } })],
			length: of(1),
			policy: firstAnswer({ afterPromptMs: 0 }, null, false),
			mutedBars: []
		};
		expect(validateRoundPlan(plan)).toBeNull();
		expect(plan.expectations[0].at).toBeNull();
	});
});
