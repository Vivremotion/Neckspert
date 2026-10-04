import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { applyColdAttempt } from '$lib/domain/progress';
import type { Attempt } from '$lib/domain/types';
import { createDatabase } from './db';
import { DexieAttemptRepository } from './DexieAttemptRepository';
import { DexieBackup } from './DexieBackup';
import { DexieCardStateRepository } from './DexieCardStateRepository';
import { DexieSettingsRepository } from './DexieSettingsRepository';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.parse('2026-10-03T09:00:00.000Z');

function scheduling(state: 0 | 1 | 2, overrides: Record<string, number | null> = {}) {
	return {
		due: T0 + DAY,
		stability: 0.2,
		difficulty: 9.8,
		elapsedDays: 0,
		scheduledDays: 0,
		learningSteps: 1,
		reps: 6,
		lapses: 0,
		state,
		lastReview: T0,
		...overrides
	};
}

/**
 * A hand-made, anonymous excerpt shaped like an export of 2026-10-04: a 1-beat card stuck in
 * Learning, a 4-beat card in Learning, an identify card at the old 1-beat lead, attempts at 1
 * beat and in mode 2, a confusion, a device id from the exporting browser.
 */
const EXPORT_2026_10_04 = {
	app: 'neckspert-play',
	version: 1,
	exportedAt: T0 + DAY,
	settings: {
		locale: 'fr',
		tempoBpm: 80,
		calibrationOffsetMs: 35,
		inputDeviceId: 'a1b2c3-device-of-the-exporting-browser',
		builtInInputGain: 8
	},
	cards: [
		{
			key: 'locate:6:A',
			target: { direction: 'locate', string: 6, pitch: 'A' },
			introducedAt: T0 - 2 * DAY,
			introducedInSession: 's1',
			leadBeats: 1,
			scheduling: scheduling(1),
			learnedAt: T0 - 2 * DAY,
			acquiredAt: null,
			masteredAt: null
		},
		{
			key: 'locate:5:D',
			target: { direction: 'locate', string: 5, pitch: 'D' },
			introducedAt: T0 - 2 * DAY,
			introducedInSession: 's1',
			leadBeats: 4,
			scheduling: scheduling(1),
			learnedAt: T0 - 2 * DAY,
			acquiredAt: null,
			masteredAt: null
		},
		{
			key: 'identify:6:3',
			target: { direction: 'identify', string: 6, fret: 3 },
			introducedAt: T0 - DAY,
			introducedInSession: 's2',
			leadBeats: 1,
			scheduling: scheduling(2, { stability: 3 }),
			learnedAt: T0 - DAY,
			acquiredAt: T0 - DAY,
			masteredAt: null
		}
	],
	attempts: [
		{
			id: 1,
			sessionId: 's2',
			cardKey: 'locate:6:A',
			target: { direction: 'locate', string: 6, pitch: 'A' },
			phase: 'review',
			temperature: 'cold',
			aid: 'none',
			leadBeats: 1,
			promptedAt: T0 - DAY,
			answer: null,
			correct: false,
			verdict: 'wrong',
			timingOffsetMs: null,
			reactionMs: null,
			confusion: null
		},
		{
			id: 2,
			sessionId: 's2',
			cardKey: 'locate:5:D',
			target: { direction: 'locate', string: 5, pitch: 'D' },
			phase: 'consolidation',
			temperature: 'hot',
			aid: 'none',
			leadBeats: 4,
			promptedAt: T0 - DAY + 10_000,
			answer: { kind: 'note', midi: 45 },
			correct: false,
			verdict: 'wrong',
			timingOffsetMs: -20,
			reactionMs: 2980,
			confusion: { kind: 'other', semitones: -5 }
		},
		{
			id: 3,
			sessionId: 's2',
			cardKey: 'identify:6:3',
			target: { direction: 'identify', string: 6, fret: 3 },
			phase: 'probe',
			temperature: 'cold',
			aid: 'none',
			leadBeats: null,
			promptedAt: T0 - DAY + 20_000,
			answer: { kind: 'name', pitch: 'G' },
			correct: true,
			verdict: 'perfect',
			timingOffsetMs: null,
			reactionMs: 1400,
			confusion: null
		}
	],
	sessions: [
		{
			id: 's1',
			kind: 'learn',
			startedAt: T0 - 2 * DAY,
			endedAt: null,
			fatigueDetected: true,
			tempoBpm: 80
		},
		{
			id: 's2',
			kind: 'learn',
			startedAt: T0 - DAY,
			endedAt: T0 - DAY + 300_000,
			fatigueDetected: false,
			tempoBpm: 80
		}
	]
};

describe('importing an export of 2026-10-04', () => {
	it('passes validation and lands on the current model', async () => {
		const db = createDatabase(crypto.randomUUID());
		await new DexieBackup(db).importAll(JSON.parse(JSON.stringify(EXPORT_2026_10_04)));

		const cards = new Map((await new DexieCardStateRepository(db).all()).map((c) => [c.key, c]));
		expect(cards.get('locate:6:A')).toMatchObject({ leadBeats: 2, learnedAt: T0 - 2 * DAY });
		expect(cards.get('locate:6:A')?.scheduling).toEqual(scheduling(1));
		expect(cards.get('locate:5:D')).toMatchObject({ leadBeats: 4 });
		expect(cards.get('locate:5:D')?.scheduling.state).toBe(1);
		expect(cards.get('identify:6:3')?.leadBeats).toBe(2);

		const attempts = await new DexieAttemptRepository(db).all();
		expect(attempts.map((a) => a.leadBeats)).toEqual([1, 4, null]);

		const settings = await new DexieSettingsRepository(db).get();
		expect(settings).toMatchObject({ tempoBpm: 80, calibrationOffsetMs: 35, inputDeviceId: null });
		db.close();
	});

	it('lets a card stuck in Learning reach Review on its next cold success', async () => {
		const db = createDatabase(crypto.randomUUID());
		await new DexieBackup(db).importAll(JSON.parse(JSON.stringify(EXPORT_2026_10_04)));
		const card = (await new DexieCardStateRepository(db).get('locate:6:A'))!;
		const now = T0 + 2 * DAY;
		const success: Attempt = {
			...(EXPORT_2026_10_04.attempts[0] as Attempt),
			id: undefined,
			sessionId: 's3',
			leadBeats: card.leadBeats,
			promptedAt: now,
			answer: { kind: 'note', midi: 45 },
			correct: true,
			verdict: 'perfect',
			timingOffsetMs: 10,
			reactionMs: 1510
		};
		const after = applyColdAttempt(card, success, [success], now, 80);
		expect(after.scheduling.state).toBe(2);
		expect(after.acquiredAt).toBe(now);
		db.close();
	});
});
