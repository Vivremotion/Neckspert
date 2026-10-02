import { describe, expect, it } from 'vitest';
import { finishDestination } from './finishDestination';

describe('finishDestination', () => {
	it('opens the summary of the session that ended', () => {
		expect(finishDestination('abc')).toBe('/summary?sessionId=abc');
		expect(finishDestination('a b')).toBe('/summary?sessionId=a%20b');
	});
});
