import { describe, expect, it } from 'vitest';
import { Fraction } from './fraction';
import { validateRoundPlan, type Expectation, type RoundPlan } from './plan';

// Paper plans (spec 2026-10-14, section 3): the existing timing relations written by hand
// on the expectation contract, to prove it carries them before the engine is written.

const of = Fraction.of;
const target = (at: Fraction, sensor: string, extra: Partial<Expectation> = {}): Expectation => ({
	at,
	span: 'point',
	role: 'target',
	sensor,
	content: null,
	window: { ms: 100 },
	bar: 0,
	...extra
});

describe('paper plans of the existing relations', () => {
	it('beat (locate): the string shows two beats ahead, one note on the downbeat', () => {
		const plan: RoundPlan = {
			prompt: of(-2, 4),
			expectations: [target(of(0), 'note', { content: { string: 2, note: 'F' } })],
			length: of(1),
			policy: { unit: 'response', firstAnswerOnly: true, lateCapture: true, provisional: false },
			mutedBars: []
		};
		expect(validateRoundPlan(plan)).toBeNull();
		expect(plan.prompt?.equals(of(-1, 2))).toBe(true);
		expect(plan.expectations).toHaveLength(1);
		expect(plan.expectations[0].sensor).toBe('note');
		expect(plan.expectations[0].span).toBe('point');
		expect(plan.expectations[0].content).toEqual({ string: 2, note: 'F' });
		expect(plan.policy).toEqual({
			unit: 'response',
			firstAnswerOnly: true,
			lateCapture: true,
			provisional: false
		});
	});

	it('anchor (triads): the root on the downbeat, then the chord from beat 2 to the bar end', () => {
		const plan: RoundPlan = {
			prompt: of(-2, 4),
			expectations: [
				target(of(0), 'note', { content: 'root' }),
				target(of(1, 4), 'chord', { span: { until: of(1) }, content: 'triad' })
			],
			length: of(1),
			policy: { unit: 'response', firstAnswerOnly: false, lateCapture: false, provisional: true },
			mutedBars: []
		};
		expect(validateRoundPlan(plan)).toBeNull();
		expect(plan.expectations.map((e) => e.sensor)).toEqual(['note', 'chord']);
		expect(plan.expectations[0].span).toBe('point');
		expect(plan.expectations[0].content).toBe('root');
		expect(plan.expectations[1].span).toEqual({ until: of(1) });
		expect(plan.expectations[1].content).toBe('triad');
		expect(plan.policy.provisional).toBe(true);
		expect(plan.policy.unit).toBe('response');
	});

	it('gridChange (gesture): one chord expectation per change, rounds handed over', () => {
		const changes = [0, 1, 2, 3].map((bar) =>
			target(of(bar), 'chord', { content: `chord-${bar}`, bar, window: { ofGap: of(1, 2) } })
		);
		const plan: RoundPlan = {
			prompt: null,
			expectations: changes,
			length: of(4),
			policy: { unit: 'cycle', firstAnswerOnly: false, lateCapture: false, provisional: false },
			handover: of(4),
			mutedBars: []
		};
		expect(validateRoundPlan(plan)).toBeNull();
		expect(plan.prompt).toBeNull();
		expect(plan.expectations).toHaveLength(4);
		expect(plan.expectations.every((e) => e.sensor === 'chord' && e.span === 'point')).toBe(true);
		expect(plan.expectations.map((e) => e.content)).toEqual([
			'chord-0',
			'chord-1',
			'chord-2',
			'chord-3'
		]);
		expect(plan.policy.unit).toBe('cycle');
		expect(plan.handover?.equals(plan.length)).toBe(true);
	});
});
