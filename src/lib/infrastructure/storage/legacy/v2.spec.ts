import { describe, expect, it } from 'vitest';
import { fromV2 } from './v2';

describe('fromV2', () => {
	const file = {
		app: 'neckspert-play',
		version: 2,
		exportedAt: 5,
		settings: { locale: 'fr' },
		progressions: [{ exerciseId: 'locate-neck' }],
		cards: [{ key: 'locate:2:F' }],
		attempts: [
			{ id: 1, sessionId: 's1', verdict: 'perfect' },
			{ id: 2, sessionId: 's1', verdict: 'late' }
		],
		sessions: [{ id: 's1', kind: 'learn' }]
	};

	it('gives attempts no observations and sessions no latency, at version 3', () => {
		const converted = fromV2(file);
		expect(converted.version).toBe(3);
		expect(converted.attempts).toEqual([
			{ id: 1, sessionId: 's1', verdict: 'perfect', observations: null },
			{ id: 2, sessionId: 's1', verdict: 'late', observations: null }
		]);
		expect(converted.sessions).toEqual([{ id: 's1', kind: 'learn', latencyMs: null }]);
	});

	it('leaves everything else as it was, and the input untouched', () => {
		const converted = fromV2(file);
		expect(converted).toMatchObject({
			app: file.app,
			exportedAt: file.exportedAt,
			settings: file.settings,
			progressions: file.progressions,
			cards: file.cards
		});
		expect(file.version).toBe(2);
		expect(file.attempts[0]).not.toHaveProperty('observations');
	});
});
