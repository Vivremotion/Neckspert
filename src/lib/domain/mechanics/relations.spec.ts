import { describe, expect, it } from 'vitest';
import { RESPONSE_RELATIONS } from '$lib/domain/types';
import { isTimed, MECHANIC_RULES } from './index';

// The storage migration wraps the bare verdict of every stored attempt for the relation of its
// mechanic, as a one-answer verdict: each mechanic's relation must be one of those.
describe('the time relations of the mechanics', () => {
	it('are one-answer relations for every mechanic', () => {
		for (const rules of MECHANIC_RULES) {
			if (!isTimed(rules)) continue; // rhythm-figure: judged by a plan, not a relation
			expect(RESPONSE_RELATIONS).toContain(rules.timing.id);
		}
	});
});
