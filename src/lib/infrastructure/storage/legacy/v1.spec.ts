import { describe, expect, it } from 'vitest';
import { convertV1, type V1Data } from './v1';

const NOW = 50_000;

function v1Attempt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: 1,
		sessionId: 's1',
		cardKey: 'locate:6:A',
		target: { direction: 'locate', string: 6, pitch: 'A' },
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: 2,
		promptedAt: 1000,
		answer: { kind: 'note', midi: 45 },
		correct: true,
		verdict: 'perfect',
		timingOffsetMs: 10,
		reactionMs: 1510,
		confusion: null,
		...overrides
	};
}

const IDENTIFY_ATTEMPT = v1Attempt({
	id: 2,
	cardKey: 'identify:6:3',
	target: { direction: 'identify', string: 6, fret: 3 },
	leadBeats: null,
	answer: { kind: 'name', pitch: 'A' },
	correct: false,
	verdict: 'wrong',
	timingOffsetMs: null,
	reactionMs: 1400,
	confusion: { kind: 'semitone', delta: 2 }
});

function v1Card(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		key: 'locate:6:A',
		target: { direction: 'locate', string: 6, pitch: 'A' },
		introducedAt: 1000,
		introducedInSession: 's1',
		leadBeats: 4,
		scheduling: {
			due: 2000,
			stability: 1,
			difficulty: 5,
			elapsedDays: 0,
			scheduledDays: 1,
			learningSteps: 0,
			reps: 1,
			lapses: 0,
			state: 2,
			lastReview: 1000
		},
		learnedAt: 1000,
		acquiredAt: null,
		masteredAt: null,
		...overrides
	};
}

function v1Session(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		id: 's1',
		kind: 'learn',
		startedAt: 900,
		endedAt: 5000,
		fatigueDetected: false,
		tempoBpm: 100,
		...overrides
	};
}

function data(overrides: Partial<V1Data> = {}): V1Data {
	return {
		settings: { locale: 'fr', calibrationOffsetMs: 35 },
		cards: [],
		attempts: [],
		sessions: [],
		...overrides
	};
}

describe('convertV1', () => {
	it('turns a v1 attempt into a mechanic attempt at its session tempo', () => {
		const { attempts } = convertV1(data({ attempts: [v1Attempt()], sessions: [v1Session()] }), NOW);
		expect(attempts).toEqual([
			{
				id: 1,
				sessionId: 's1',
				exerciseId: 'locate-neck',
				mechanic: 'locate',
				cardKey: 'locate:6:A',
				phase: 'review',
				temperature: 'cold',
				aid: 'none',
				promptedAt: 1000,
				tempoBpm: 100,
				leadBeats: 2,
				timingOffsetMs: 10,
				reactionMs: 1510,
				correct: true,
				verdict: 'perfect',
				data: { item: { string: 6, pitch: 'A' }, answer: { midi: 45 }, confusion: null }
			}
		]);
		expect(attempts[0]).not.toHaveProperty('target');
		expect(attempts[0]).not.toHaveProperty('answer');
		expect(attempts[0]).not.toHaveProperty('confusion');
	});

	it('falls back on the settings tempo, then 80', () => {
		const withoutTempo = v1Session({ tempoBpm: undefined });
		const fromSettings = convertV1(
			data({
				settings: { locale: 'fr', tempoBpm: 96 },
				attempts: [v1Attempt()],
				sessions: [withoutTempo]
			}),
			NOW
		);
		expect(fromSettings.attempts[0].tempoBpm).toBe(96);

		const nullTempo = convertV1(
			data({
				settings: { locale: 'fr', tempoBpm: 96 },
				attempts: [v1Attempt()],
				sessions: [v1Session({ tempoBpm: null })]
			}),
			NOW
		);
		expect(nullTempo.attempts[0].tempoBpm).toBe(96);

		const fromDefault = convertV1(data({ attempts: [v1Attempt()], sessions: [withoutTempo] }), NOW);
		expect(fromDefault.attempts[0].tempoBpm).toBe(80);
		expect(fromDefault.progressions).toEqual([]);
	});

	it('falls back for an attempt whose session is missing', () => {
		const withSettings = convertV1(
			data({ settings: { locale: 'fr', tempoBpm: 120 }, attempts: [v1Attempt()] }),
			NOW
		);
		expect(withSettings.attempts[0].tempoBpm).toBe(120);
		const withoutSettings = convertV1(data({ attempts: [v1Attempt()] }), NOW);
		expect(withoutSettings.attempts[0].tempoBpm).toBe(80);
	});

	it('leaves identify attempts without tempo', () => {
		const { attempts } = convertV1(
			data({
				settings: { locale: 'fr', tempoBpm: 96 },
				attempts: [IDENTIFY_ATTEMPT],
				sessions: [v1Session()]
			}),
			NOW
		);
		expect(attempts[0]).toMatchObject({
			exerciseId: 'identify-neck',
			mechanic: 'identify',
			cardKey: 'identify:6:3',
			leadBeats: null,
			data: {
				item: { string: 6, fret: 3 },
				answer: { pitch: 'A' },
				confusion: { kind: 'semitone', delta: 2 }
			}
		});
		expect(attempts[0].tempoBpm).toBeNull();
	});

	it('always writes a tempo on attempts: a number for locate, null for identify', () => {
		const { attempts } = convertV1(
			data({
				attempts: [
					v1Attempt(),
					v1Attempt({ id: 3, sessionId: 'gone' }),
					IDENTIFY_ATTEMPT,
					v1Attempt({ id: 4, answer: null, correct: false, verdict: 'wrong' })
				],
				sessions: [v1Session({ tempoBpm: null })]
			}),
			NOW
		);
		for (const attempt of attempts) {
			expect(attempt).toHaveProperty('tempoBpm');
			expect(attempt.tempoBpm).not.toBeUndefined();
			if (attempt.mechanic === 'locate') expect(typeof attempt.tempoBpm).toBe('number');
			else expect(attempt.tempoBpm).toBeNull();
		}
		expect(attempts[3].data).toEqual({
			item: { string: 6, pitch: 'A' },
			answer: null,
			confusion: null
		});
	});

	it('moves the settings tempo to the locate-neck progression', () => {
		const converted = convertV1(
			data({ settings: { locale: 'en', tempoBpm: 60, calibrationOffsetMs: 35 } }),
			NOW
		);
		expect(converted.progressions).toEqual([
			{ exerciseId: 'locate-neck', mechanic: 'locate', tempoBpm: 80, updatedAt: NOW }
		]);
		expect(converted.settings).toEqual({ locale: 'en', calibrationOffsetMs: 35 });
		expect(converted.settings).not.toHaveProperty('tempoBpm');

		const fast = convertV1(data({ settings: { tempoBpm: 132 } }), NOW);
		expect(fast.progressions).toEqual([
			{ exerciseId: 'locate-neck', mechanic: 'locate', tempoBpm: 132, updatedAt: NOW }
		]);
	});

	it('gives each session its two executions', () => {
		const { sessions } = convertV1(
			data({
				settings: { tempoBpm: 104 },
				sessions: [v1Session(), v1Session({ id: 's2', tempoBpm: null })]
			}),
			NOW
		);
		expect(sessions).toEqual([
			{
				id: 's1',
				kind: 'learn',
				startedAt: 900,
				endedAt: 5000,
				fatigueDetected: false,
				executions: [
					{ exerciseId: 'locate-neck', tempoBpm: 100 },
					{ exerciseId: 'identify-neck', tempoBpm: null }
				]
			},
			{
				id: 's2',
				kind: 'learn',
				startedAt: 900,
				endedAt: 5000,
				fatigueDetected: false,
				executions: [
					{ exerciseId: 'locate-neck', tempoBpm: 104 },
					{ exerciseId: 'identify-neck', tempoBpm: null }
				]
			}
		]);
	});

	it('turns a v1 card into a mechanic card with the same key', () => {
		const { cards } = convertV1(
			data({
				cards: [
					v1Card(),
					v1Card({
						key: 'identify:5:8',
						target: { direction: 'identify', string: 5, fret: 8 },
						leadBeats: 2
					})
				]
			}),
			NOW
		);
		const { target: _target, ...rest } = v1Card();
		expect(cards[0]).toEqual({ ...rest, mechanic: 'locate', item: { string: 6, pitch: 'A' } });
		expect(cards[1]).toMatchObject({
			key: 'identify:5:8',
			mechanic: 'identify',
			item: { string: 5, fret: 8 }
		});
		expect(cards[1]).not.toHaveProperty('target');
	});

	it('moves one-beat cards to two', () => {
		const { cards, attempts } = convertV1(
			data({ cards: [v1Card({ leadBeats: 1 })], attempts: [v1Attempt({ leadBeats: 1 })] }),
			NOW
		);
		expect(cards[0].leadBeats).toBe(2);
		expect(attempts[0].leadBeats).toBe(1);
	});

	it('names a row whose target has no known direction', () => {
		expect(() =>
			convertV1(data({ cards: [v1Card({ target: { direction: 'chords' } })] }), NOW)
		).toThrow('Cannot convert v1 card locate:6:A: unknown direction chords');
		expect(() => convertV1(data({ attempts: [v1Attempt({ target: undefined })] }), NOW)).toThrow(
			'Cannot convert v1 attempt 1: unknown direction undefined'
		);
	});
});
