import { describe, expect, it } from 'vitest';
import { finishDestination } from './finishDestination';

describe('finishDestination', () => {
	it('sends a finished free play to its summary', () => {
		expect(finishDestination('free', 'abc')).toBe('/summary?sessionId=abc');
		expect(finishDestination('free', 'a b')).toBe('/summary?sessionId=a%20b');
	});

	it('leaves daily and placement on the play screen', () => {
		expect(finishDestination('daily', 'abc')).toBeNull();
		expect(finishDestination('placement', 'abc')).toBeNull();
	});
});
