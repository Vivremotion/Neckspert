import { describe, expect, it } from 'vitest';
import { sessionTempo } from './executions';

describe('sessionTempo', () => {
	it('is the only tempo of the executions', () => {
		expect(
			sessionTempo([
				{ exerciseId: 'locate-neck', tempoBpm: 100 },
				{ exerciseId: 'identify-neck', tempoBpm: null }
			])
		).toBe(100);
	});

	it('is the default tempo when no execution has one', () => {
		expect(sessionTempo([{ exerciseId: 'identify-neck', tempoBpm: null }])).toBe(80);
	});

	it('refuses two different tempos, naming decision 4', () => {
		expect(() =>
			sessionTempo([
				{ exerciseId: 'locate-neck', tempoBpm: 100 },
				{ exerciseId: 'locate-g', tempoBpm: 120 }
			])
		).toThrow(/decision 4/);
	});
});
