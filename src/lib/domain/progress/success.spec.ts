import { describe, expect, it } from 'vitest';
import type { Attempt } from '$lib/domain/types';
import { cardSuccessRate, sessionSuccessRate, successRate } from './success';

function attempt(overrides: Partial<Attempt> = {}): Attempt {
	return {
		sessionId: 's',
		exerciseId: 'locate-neck',
		mechanic: 'locate',
		cardKey: 'locate:6:G',
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
		...overrides
	};
}

const miss = attempt({ correct: false, verdict: 'wrong' });
const offbeat = attempt({ verdict: 'offbeat' });

describe('successRate', () => {
	it('counts right answers in time; off beat and wrong are misses', () => {
		expect(successRate([attempt(), miss, offbeat, attempt({ verdict: 'late' })])).toBe(0.5);
		expect(successRate([])).toBeNull();
	});
});

describe('sessionSuccessRate', () => {
	it('looks at the last ten mode 1 prompts, probes and mode 2 left out', () => {
		const old = Array.from({ length: 5 }, () => miss);
		const recent = Array.from({ length: 10 }, () => attempt());
		const ignored = [
			attempt({ phase: 'probe', correct: false, verdict: 'wrong' }),
			attempt({
				exerciseId: 'identify-neck',
				mechanic: 'identify',
				cardKey: 'identify:6:3',
				tempoBpm: null,
				leadBeats: null,
				data: { item: { string: 6, fret: 3 }, answer: null, confusion: null },
				correct: false,
				verdict: 'wrong'
			})
		];
		expect(sessionSuccessRate([...old, ...recent, ...ignored])).toBe(1);
		expect(sessionSuccessRate([...recent.slice(0, 7), miss, miss, miss])).toBe(0.7);
		expect(sessionSuccessRate(ignored)).toBeNull();
	});
});

describe('cardSuccessRate', () => {
	it('looks at the card’s last five attempts of the session, probe left out', () => {
		const other = attempt({ cardKey: 'locate:5:C' });
		const own = [miss, attempt(), attempt(), attempt(), attempt(), miss];
		expect(cardSuccessRate([attempt({ phase: 'probe' }), ...own, other], 'locate:6:G')).toBe(0.8);
		expect(cardSuccessRate([other], 'locate:6:G')).toBeNull();
	});
});
