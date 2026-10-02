import { describe, expect, it } from 'vitest';
import { MIN_COLD_DELAY_MS } from './constants';
import { classifyTemperature } from './temperature';

const NOW = 1_000_000;

describe('classifyTemperature', () => {
	it('is cold when never attempted and not yet tried this session', () => {
		expect(classifyTemperature({ lastAttemptAt: null, attemptedInSession: false, now: NOW })).toBe(
			'cold'
		);
	});

	it('is hot once the card was already tried in this session', () => {
		expect(
			classifyTemperature({
				lastAttemptAt: NOW - MIN_COLD_DELAY_MS * 2,
				attemptedInSession: true,
				now: NOW
			})
		).toBe('hot');
	});

	it('is hot when the previous attempt is still inside the cold delay', () => {
		expect(
			classifyTemperature({
				lastAttemptAt: NOW - MIN_COLD_DELAY_MS + 1,
				attemptedInSession: false,
				now: NOW
			})
		).toBe('hot');
	});

	it('is cold when the previous attempt is at least MIN_COLD_DELAY_MS ago', () => {
		expect(
			classifyTemperature({
				lastAttemptAt: NOW - MIN_COLD_DELAY_MS,
				attemptedInSession: false,
				now: NOW
			})
		).toBe('cold');
		expect(
			classifyTemperature({
				lastAttemptAt: NOW - MIN_COLD_DELAY_MS - 1,
				attemptedInSession: false,
				now: NOW
			})
		).toBe('cold');
	});
});
