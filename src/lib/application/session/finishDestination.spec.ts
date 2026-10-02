import { describe, expect, it } from 'vitest';
import { finishDestination } from './finishDestination';

describe('finishDestination', () => {
	it('sends a finished free play to its summary', () => {
		expect(finishDestination('free', 'abc')).toBe('/summary?sessionId=abc');
		expect(finishDestination('free', 'a b')).toBe('/summary?sessionId=a%20b');
	});

	it('leaves learn and placement on the play screen', () => {
		expect(finishDestination('learn', 'abc')).toBeNull();
		expect(finishDestination('placement', 'abc')).toBeNull();
	});
});
