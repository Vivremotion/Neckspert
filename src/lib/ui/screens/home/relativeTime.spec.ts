import { describe, expect, it } from 'vitest';
import { formatRelativeDelay } from './relativeTime';

const t = {
	soon: 'bientôt',
	inMinutes: (n: number) => (n === 1 ? 'dans 1 min' : `dans ${n} min`),
	inHours: (n: number) => (n === 1 ? 'dans 1 h' : `dans ${n} h`),
	inDays: (n: number) => (n === 1 ? 'dans 1 j' : `dans ${n} j`)
};

describe('formatRelativeDelay', () => {
	it('uses soon under one minute', () => {
		expect(formatRelativeDelay(30_000, 0, t)).toBe('bientôt');
	});

	it('rounds up to whole minutes under one hour', () => {
		expect(formatRelativeDelay(90_000, 0, t)).toBe('dans 2 min');
		expect(formatRelativeDelay(60_000, 0, t)).toBe('dans 1 min');
	});

	it('rounds to whole hours under one day', () => {
		expect(formatRelativeDelay(2 * 60 * 60 * 1000, 0, t)).toBe('dans 2 h');
		expect(formatRelativeDelay(90 * 60 * 1000, 0, t)).toBe('dans 2 h');
	});

	it('rounds to whole days beyond one day', () => {
		expect(formatRelativeDelay(36 * 60 * 60 * 1000, 0, t)).toBe('dans 2 j');
	});

	it('treats a past target as soon', () => {
		expect(formatRelativeDelay(0, 5_000, t)).toBe('bientôt');
	});
});
