import { describe, expect, it } from 'vitest';
import { formatTrend } from './trend';

const t = { improving: 'en baisse', stable: 'stable', worsening: 'en hausse' };

describe('formatTrend', () => {
	it('returns null when there is no trend', () => {
		expect(formatTrend(null, t)).toBeNull();
	});

	it('maps each trend to its label', () => {
		expect(formatTrend('improving', t)).toBe('en baisse');
		expect(formatTrend('stable', t)).toBe('stable');
		expect(formatTrend('worsening', t)).toBe('en hausse');
	});
});
