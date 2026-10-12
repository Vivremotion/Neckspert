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

	it('is the tempo of the first prompt when the executions have several', () => {
		const executions = [
			{ exerciseId: 'locate-neck', tempoBpm: 100 },
			{ exerciseId: 'locate-g', tempoBpm: 120 }
		];
		expect(sessionTempo(executions, 'locate-g')).toBe(120);
		expect(sessionTempo(executions)).toBe(100);
	});

	it('is the tempo of the first prompt execution, matched by its scope too', () => {
		const executions = [
			{ exerciseId: 'gesture-climb', scope: 'iohefy-a', tempoBpm: 95 },
			{ exerciseId: 'gesture-climb', scope: 'blues-f', tempoBpm: 110 }
		];
		expect(sessionTempo(executions, 'gesture-climb', 'blues-f')).toBe(110);
		expect(sessionTempo(executions, 'gesture-climb', 'iohefy-a')).toBe(95);
	});
});
