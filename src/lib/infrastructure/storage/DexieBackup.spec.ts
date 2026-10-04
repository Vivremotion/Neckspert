import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '$lib/domain/types';
import { createDatabase, type NeckspertDb } from './db';
import { DexieAttemptRepository } from './DexieAttemptRepository';
import { DexieBackup } from './DexieBackup';
import { DexieCardStateRepository } from './DexieCardStateRepository';
import { DexieSessionRepository } from './DexieSessionRepository';
import { DexieSettingsRepository } from './DexieSettingsRepository';
import {
	IDENTIFY_TARGET,
	makeAttempt,
	makeBackup,
	makeCard,
	makeSession
} from './testing/fixtures';
import { validateBackup } from './validateBackup';

/** Two cards, three attempts, two sessions, two changed settings. */
async function seed(db: NeckspertDb): Promise<void> {
	await new DexieSettingsRepository(db).update({ tempoBpm: 96, calibrationOffsetMs: 42 });
	await new DexieCardStateRepository(db).putMany([
		makeCard(),
		makeCard({ target: IDENTIFY_TARGET, leadBeats: 2 })
	]);
	const attempts = new DexieAttemptRepository(db);
	await attempts.add(makeAttempt({ promptedAt: 3000, verdict: 'late', reactionMs: 1800 }));
	await attempts.add(makeAttempt({ promptedAt: 1000 }));
	await attempts.add(
		makeAttempt({
			target: IDENTIFY_TARGET,
			promptedAt: 2000,
			leadBeats: null,
			answer: { kind: 'name', pitch: 'F' },
			timingOffsetMs: null
		})
	);
	const sessions = new DexieSessionRepository(db);
	await sessions.put(makeSession({ id: 's2', startedAt: 2500, endedAt: null }));
	await sessions.put(makeSession({ id: 's1', startedAt: 500 }));
}

describe('DexieBackup', () => {
	let db: NeckspertDb;

	beforeEach(() => {
		db = createDatabase(crypto.randomUUID());
	});

	describe('exportAll', () => {
		it('exports every table with the app header', async () => {
			await seed(db);
			const file = await new DexieBackup(db, () => 123).exportAll();
			expect(file.app).toBe('neckspert-play');
			expect(file.version).toBe(1);
			expect(file.exportedAt).toBe(123);
			expect(file.settings).toEqual({ ...DEFAULT_SETTINGS, tempoBpm: 96, calibrationOffsetMs: 42 });
			expect(file.cards.map((card) => card.key).sort()).toEqual(['identify:5:8', 'locate:2:F']);
			expect(file.attempts.map((attempt) => attempt.promptedAt)).toEqual([1000, 2000, 3000]);
			expect(file.attempts.every((attempt) => typeof attempt.id === 'number')).toBe(true);
			expect(file.sessions.map((session) => session.id)).toEqual(['s1', 's2']);
		});

		it('exports an empty database with the default settings', async () => {
			expect(await new DexieBackup(db, () => 5).exportAll()).toEqual({
				app: 'neckspert-play',
				version: 1,
				exportedAt: 5,
				settings: DEFAULT_SETTINGS,
				cards: [],
				attempts: [],
				sessions: []
			});
		});

		it('stamps the current time by default', async () => {
			const before = Date.now();
			const file = await new DexieBackup(db).exportAll();
			expect(file.exportedAt).toBeGreaterThanOrEqual(before);
			expect(file.exportedAt).toBeLessThanOrEqual(Date.now());
		});

		it('produces a file that passes validation after JSON', async () => {
			await seed(db);
			const file = await new DexieBackup(db, () => 123).exportAll();
			expect(validateBackup(JSON.parse(JSON.stringify(file)))).toEqual(file);
		});
	});

	describe('importAll', () => {
		it('replaces all stored data with the file', async () => {
			await seed(db);
			const file = makeBackup({
				settings: { ...DEFAULT_SETTINGS, locale: 'en' },
				sessions: [makeSession({ id: 'imported' })]
			});

			await new DexieBackup(db).importAll(file);

			expect(await new DexieSettingsRepository(db).get()).toEqual(file.settings);
			expect(await new DexieCardStateRepository(db).all()).toEqual(file.cards);
			expect(await new DexieAttemptRepository(db).all()).toEqual(file.attempts);
			expect(await new DexieSessionRepository(db).list()).toEqual(file.sessions);
		});

		it('keeps every setting but the input device, which belongs to the exporting browser', async () => {
			const file = makeBackup({
				settings: { ...DEFAULT_SETTINGS, tempoBpm: 96, inputDeviceId: 'usb-elsewhere' }
			});
			await new DexieBackup(db).importAll(file);
			const settings = await new DexieSettingsRepository(db).get();
			expect(settings).toMatchObject({ tempoBpm: 96, inputDeviceId: null });
		});

		it('imports an old export with a one-beat card on the shortest lead left', async () => {
			const file = makeBackup({ cards: [makeCard({ leadBeats: 1 as never })] });

			await new DexieBackup(db).importAll(file);

			expect((await new DexieCardStateRepository(db).all()).map((card) => card.leadBeats)).toEqual([
				2
			]);
		});

		it('rejects an invalid file and keeps the stored data', async () => {
			await seed(db);
			await expect(new DexieBackup(db).importAll({ app: 'other' })).rejects.toThrow(
				'Not a Neckspert Play backup'
			);
			expect(await db.attempts.count()).toBe(3);
			expect(await db.cards.count()).toBe(2);
			expect(await db.sessions.count()).toBe(2);
		});

		it('keeps the stored data when writing fails midway', async () => {
			await seed(db);
			const broken = makeBackup({
				attempts: [makeAttempt({ id: 1 }), makeAttempt({ id: 1, promptedAt: 2000 })]
			});

			await expect(new DexieBackup(db).importAll(broken)).rejects.toThrow();

			expect(await db.attempts.count()).toBe(3);
			expect(await db.cards.count()).toBe(2);
			expect((await new DexieSessionRepository(db).list()).map((s) => s.id)).toEqual(['s1', 's2']);
			expect((await new DexieSettingsRepository(db).get()).tempoBpm).toBe(96);
		});
	});

	it('round-trips through a fresh database', async () => {
		await seed(db);
		const first = await new DexieBackup(db, () => 1000).exportAll();

		const fresh = createDatabase(crypto.randomUUID());
		await new DexieBackup(fresh, () => 0).importAll(JSON.parse(JSON.stringify(first)));
		const second = await new DexieBackup(fresh, () => 2000).exportAll();

		expect(second.exportedAt).toBe(2000);
		expect({ ...second, exportedAt: first.exportedAt }).toEqual(first);
	});
});
