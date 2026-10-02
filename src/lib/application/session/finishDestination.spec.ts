import { describe, expect, it } from 'vitest';
import { finishDestination } from './finishDestination';

describe('finishDestination', () => {
	it('opens the summary after learning and free play', () => {
		expect(finishDestination('learn', 'abc')).toBe('/summary?sessionId=abc');
		expect(finishDestination('free', 'a b')).toBe('/summary?sessionId=a%20b');
	});

	it('leaves placement on the play screen', () => {
		expect(finishDestination('placement', 'abc')).toBeNull();
	});
});
