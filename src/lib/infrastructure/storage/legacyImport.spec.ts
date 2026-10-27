import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { responseAttempt } from '$lib/testing/attempts';
import { applyColdAttempt } from '$lib/domain/progress';
import type { Attempt } from '$lib/domain/types';
import { createDatabase } from './db';
import { DexieAttemptRepository } from './DexieAttemptRepository';
import { DexieBackup } from './DexieBackup';
import { DexieCardStateRepository } from './DexieCardStateRepository';
import { DexieLevelStateRepository } from './DexieLevelStateRepository';
import { DexieProgressionRepository } from './DexieProgressionRepository';
import { DexieSessionRepository } from './DexieSessionRepository';
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
		expect(cards.get('locate:6:A')).toMatchObject({
			mechanic: 'locate',
			item: { string: 6, pitch: 'A' },
			learnedAt: T0 - 2 * DAY
		});
		expect(cards.get('locate:6:A')?.scheduling).toEqual(scheduling(1));
		expect(cards.get('locate:5:D')).toMatchObject({
			mechanic: 'locate',
			item: { string: 5, pitch: 'D' }
		});
		expect(cards.get('locate:5:D')?.scheduling.state).toBe(1);
		expect(cards.get('identify:6:3')).toMatchObject({
			mechanic: 'identify',
			item: { string: 6, fret: 3 }
		});
		expect([...cards.values()].some((card) => 'target' in card)).toBe(false);
		// The leads became levels: the one-beat step at the top of the ladder.
		expect([...cards.values()].some((card) => 'leadBeats' in card)).toBe(false);
		const levels = new Map(
			(await new DexieLevelStateRepository(db).all()).map((s) => [
				`${s.exerciseId}/${s.item}`,
				s.level
			])
		);
		expect(levels).toEqual(
			new Map([
				['locate-neck/6:A', 2],
				['locate-neck/5:D', 1],
				['identify-neck/6:3', 1]
			])
		);

		const attempts = await new DexieAttemptRepository(db).all();
		expect(attempts.map((a) => a.leadBeats)).toEqual([1, 4, null]);
		expect(attempts.map((a) => a.tempoBpm)).toEqual([80, 80, null]);
		expect(attempts.map((a) => a.observations)).toEqual([null, null, null]);
		const sessions = await new DexieSessionRepository(db).list();
		expect(sessions.map((s) => s.latencyMs)).toEqual(sessions.map(() => null));
		expect(sessions.length).toBeGreaterThan(0);
		expect(attempts.map((a) => a.exerciseId)).toEqual([
			'locate-neck',
			'locate-neck',
			'identify-neck'
		]);
		expect(attempts.map((a) => a.data)).toEqual([
			{ item: { string: 6, pitch: 'A' }, answer: null, confusion: null },
			{
				item: { string: 5, pitch: 'D' },
				answer: { midi: 45 },
				confusion: { kind: 'other', semitones: -5 }
			},
			{ item: { string: 6, fret: 3 }, answer: { pitch: 'G' }, confusion: null }
		]);

		expect(await new DexieProgressionRepository(db).get('locate-neck')).toMatchObject({
			mechanic: 'locate',
			tempoBpm: 80
		});

		const settings = await new DexieSettingsRepository(db).get();
		expect(settings).toMatchObject({
			latency: {
				note: { ms: 35, provenance: 'player' },
				chord: { ms: 35, provenance: 'player' }
			},
			clickBleed: false,
			inputDeviceId: null
		});
		expect(settings).not.toHaveProperty('calibrationOffsetMs');
		expect(settings).not.toHaveProperty('tempoBpm');
		db.close();
	});

	it('lets a card stuck in Learning reach Review on its next cold success', async () => {
		const db = createDatabase(crypto.randomUUID());
		await new DexieBackup(db).importAll(JSON.parse(JSON.stringify(EXPORT_2026_10_04)));
		const card = (await new DexieCardStateRepository(db).get('locate:6:A'))!;
		const now = T0 + 2 * DAY;
		const [stored] = await new DexieAttemptRepository(db).listByCard('locate:6:A');
		const success: Attempt = responseAttempt({
			...stored,
			id: undefined,
			sessionId: 's3',
			tempoBpm: 80,
			leadBeats: 2,
			promptedAt: now,
			correct: true,
			verdict: 'perfect',
			timingOffsetMs: 10,
			reactionMs: 1510,
			data: { item: card.item, answer: { midi: 45 }, confusion: null }
		});
		const after = applyColdAttempt(card, success, [success], now, (a) => a.success);
		expect(after.scheduling.state).toBe(2);
		expect(after.acquiredAt).toBe(now);
		db.close();
	});
});
