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
			mutedBars: []
		};
		expect(validateRoundPlan(plan)).toBeNull();
	});
});
