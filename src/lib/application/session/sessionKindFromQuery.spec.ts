import { describe, expect, it } from 'vitest';
import { sessionKindFromQuery } from './sessionKindFromQuery';

describe('sessionKindFromQuery', () => {
	it('runs free play only when asked, and learn for anything else', () => {
		expect(sessionKindFromQuery('free')).toBe('free');
		expect(sessionKindFromQuery('learn')).toBe('learn');
		expect(sessionKindFromQuery(null)).toBe('learn');
		expect(sessionKindFromQuery('placement')).toBe('learn');
	});

	it('runs the triads when asked', () => {
		expect(sessionKindFromQuery('triads')).toBe('triads');
	});
});
