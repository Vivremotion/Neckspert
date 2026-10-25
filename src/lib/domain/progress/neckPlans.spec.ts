import { describe, expect, it } from 'vitest';
import { IDENTIFY_NECK } from '$lib/domain/exercise/catalog';
import { recallThresholdOf } from '$lib/domain/exercise/recall';
import { Fraction } from '$lib/domain/time/fraction';
import { METER_4_4 } from '$lib/domain/time/meter';
import { validateRoundPlan } from '$lib/domain/time/plan';
import type { PlannedItem } from '$lib/domain/types';
import { neckPlan } from './neckPlans';

const planned = (over: Partial<PlannedItem>): PlannedItem => ({
	exerciseId: 'locate-neck',
	mechanic: 'locate',
	item: { string: 2, pitch: 'F' },
	phase: 'review',
	temperature: 'cold',
	aid: 'none',
	leadBeats: 8,
	...over
});

describe('neckPlan', () => {
	it('plans a locate prompt on the beat at its lead, then a breathing bar', () => {
		const plan = neckPlan(planned({}), METER_4_4);
		expect(plan.prompt?.toString()).toBe('-2');
		expect(plan.length.toString()).toBe('1');
		expect(plan.listenUntil?.toString()).toBe('3/4');
		expect(plan.expectations).toHaveLength(1);
		expect(plan.expectations[0]).toMatchObject({
			sensor: 'note',
			content: { kind: 'note', value: { string: 2, pitch: 'F' } }
		});
		expect(validateRoundPlan(plan)).toBeNull();
		expect(neckPlan(planned({ leadBeats: 4 }), METER_4_4).prompt?.equals(Fraction.of(-1))).toBe(
			true
		);
	});

	it('refuses a locate prompt without a lead', () => {
		expect(() => neckPlan(planned({ leadBeats: null }), METER_4_4)).toThrow();
	});

	it('plans an identify prompt in free time, judged by name', () => {
		const plan = neckPlan(
			planned({
				exerciseId: 'identify-neck',
				mechanic: 'identify',
				item: { string: 5, fret: 8 },
				leadBeats: null
			}),
			METER_4_4
		);
		expect(plan.expectations[0]).toMatchObject({
			sensor: 'tap',
			at: null,
			content: { kind: 'name', value: { string: 5, fret: 8 } },
			window: { ms: recallThresholdOf(IDENTIFY_NECK) }
		});
		expect(validateRoundPlan(plan)).toBeNull();
	});
});
