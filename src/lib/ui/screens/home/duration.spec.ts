import { describe, expect, it } from 'vitest';
import { formatMinutes } from './duration';

const fr = { short: (n: number) => `${n}′`, spoken: (n: number) => `${n} min` };

describe('formatMinutes', () => {
	it('rounds to the minute, short and spoken', () => {
		expect(formatMinutes(300_000, fr)).toEqual({ text: '5′', spoken: '5 min' });
	});

	it('never says less than one minute', () => {
		expect(formatMinutes(20_000, fr).text).toBe('1′');
	});
});
