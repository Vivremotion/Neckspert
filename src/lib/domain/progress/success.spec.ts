import { describe, expect, it } from 'vitest';
import { responseAttempt, type AttemptOverrides } from '$lib/testing/attempts';
import type { Attempt } from '$lib/domain/types';
import { cardSuccessRate, successRate } from './success';

function attempt(overrides: AttemptOverrides = {}): Attempt {
	return responseAttempt({
		sessionId: 's',
		exerciseId: 'locate-note-string',
		skill: 'locate-note-string',
		cardKey: 'locate-note-string:6:G',
		phase: 'learning',
		temperature: 'hot',
		aid: 'none',
		promptedAt: 0,
		tempoBpm: 80,
		leadBeats: 2,
		timingOffsetMs: 0,
		reactionMs: 1000,
		correct: true,
		verdict: 'perfect',
		data: { item: { string: 6, pitch: 'G' }, answer: null, confusion: null },
		observations: [],
		...overrides
	});
}

const miss = attempt({ correct: false, verdict: 'wrong' });
const offbeat = attempt({ verdict: 'offbeat' });

describe('successRate', () => {
	it('counts right answers in time; off beat and wrong are misses', () => {
		expect(successRate([attempt(), miss, offbeat, attempt({ verdict: 'late' })])).toBe(0.5);
		expect(successRate([])).toBeNull();
	});
});

describe('cardSuccessRate', () => {
	it('looks at the card’s last five attempts of the session', () => {
		const other = attempt({ cardKey: 'locate-note-string:5:C' });
		const own = [miss, attempt(), attempt(), attempt(), attempt(), miss];
		expect(
			cardSuccessRate([attempt({ phase: 'learning' }), ...own, other], 'locate-note-string:6:G', 5)
		).toBe(0.8);
		expect(cardSuccessRate([other], 'locate-note-string:6:G', 5)).toBeNull();
	});
});
