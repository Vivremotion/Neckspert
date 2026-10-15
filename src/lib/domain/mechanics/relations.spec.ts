import { describe, expect, it } from 'vitest';
import { EXERCISES } from '$lib/domain/exercise/catalog';
import { DEFAULT_PACING, pacingOf } from '$lib/domain/exercise/pacing';
import { RESPONSE_RELATIONS } from '$lib/domain/types';
import { MECHANIC_RULES, mechanicRules } from './index';

// The storage migration wraps the bare verdict of every stored attempt for the relation of its
// mechanic, as a one-answer verdict: each mechanic's relation must be one of those.
describe('the time relations of the mechanics', () => {
	it('are one-answer relations for every mechanic', () => {
		for (const rules of MECHANIC_RULES) {
			expect(RESPONSE_RELATIONS).toContain(rules.timing.id);
			const paced = rules.timingFor?.(DEFAULT_PACING);
			if (paced) expect(RESPONSE_RELATIONS).toContain(paced.id);
		}
	});

	it('stay the same relation at the pacing of every exercise', () => {
		for (const exercise of EXERCISES) {
			const rules = mechanicRules(exercise.mechanic);
			const paced = rules.timingFor?.(pacingOf(exercise));
			if (paced) expect(paced.id).toBe(rules.timing.id);
		}
		expect.assertions(EXERCISES.filter((e) => mechanicRules(e.mechanic).timingFor).length);
	});
});
