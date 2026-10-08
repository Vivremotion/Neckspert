import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '$lib/domain/types';
import { createDatabase, type NeckspertDb } from './db';
import { DexieAttemptRepository } from './DexieAttemptRepository';
import { DexieBackup } from './DexieBackup';
import { DexieCardStateRepository } from './DexieCardStateRepository';
import { DexieProgressionRepository } from './DexieProgressionRepository';
import { DexieSessionRepository } from './DexieSessionRepository';
import { DexieSettingsRepository } from './DexieSettingsRepository';
import {
	makeAttempt,
	makeBackup,
	makeBackupV2,
	makeCard,
	makeProgression,
	makeSession
} from './testing/fixtures';
import { validateBackup } from './validateBackup';

/** Two progressions, two cards, three attempts, two sessions, two changed settings. */
async function seed(db: NeckspertDb): Promise<void> {
	await new DexieSettingsRepository(db).update({ locale: 'en', calibrationOffsetMs: 42 });
	const progressions = new DexieProgressionRepository(db);
	await progressions.put(makeProgression());
	await progressions.put(
		makeProgression({ exerciseId: 'identify-neck', mechanic: 'identify', tempoBpm: 80 })
	);
	await new DexieCardStateRepository(db).putMany([
		makeCard(),
		makeCard({ mechanic: 'identify', leadBeats: 2 })
	]);
	const attempts = new DexieAttemptRepository(db);
	await attempts.add(makeAttempt({ promptedAt: 3000, verdict: 'late', reactionMs: 1800 }));
	await attempts.add(makeAttempt({ promptedAt: 1000 }));
	await attempts.add(
		makeAttempt({
			mechanic: 'identify',
			promptedAt: 2000,
			data: { item: { string: 5, fret: 8 }, answer: { pitch: 'E' }, confusion: null },
			correct: false,
			verdict: 'wrong'
		})
	);
	const sessions = new DexieSessionRepository(db);
	await sessions.put(
		makeSession({
			id: 's2',
			startedAt: 2500,
			endedAt: null,
			executions: [{ exerciseId: 'locate-neck', tempoBpm: 96 }]
		})
	);
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
			expect(file.version).toBe(3);
			expect(file.exportedAt).toBe(123);
			expect(file.settings).toEqual({ ...DEFAULT_SETTINGS, locale: 'en', calibrationOffsetMs: 42 });
			expect(file.cards.map((card) => card.key).sort()).toEqual(['identify:5:8', 'locate:2:F']);
			expect(file.attempts.map((attempt) => attempt.promptedAt)).toEqual([1000, 2000, 3000]);
			expect(file.attempts.every((attempt) => typeof attempt.id === 'number')).toBe(true);
			expect(file.sessions.map((session) => session.id)).toEqual(['s1', 's2']);
		});

		it('exports an empty database with the default settings', async () => {
			expect(await new DexieBackup(db, () => 5).exportAll()).toEqual({
				app: 'neckspert-play',
				version: 3,
				exportedAt: 5,
				settings: DEFAULT_SETTINGS,
				progressions: [],
				cards: [],
				attempts: [],
				sessions: []
			});
		});

		it('exports version 3 with progressions', async () => {
			await seed(db);
			const file = await new DexieBackup(db, () => 123).exportAll();
			expect(file.version).toBe(3);
			expect(
				[...file.progressions].sort((a, b) => a.exerciseId.localeCompare(b.exerciseId))
			).toEqual([
				makeProgression({ exerciseId: 'identify-neck', mechanic: 'identify', tempoBpm: 80 }),
				makeProgression()
			]);
			expect(file.sessions.map((session) => session.executions)).toEqual([
				makeSession().executions,
				[{ exerciseId: 'locate-neck', tempoBpm: 96 }]
			]);
			expect(file.settings).not.toHaveProperty('tempoBpm');
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
			expect(await new DexieProgressionRepository(db).all()).toEqual(file.progressions);
			expect(await new DexieCardStateRepository(db).all()).toEqual(file.cards);
			expect(await new DexieAttemptRepository(db).all()).toEqual(file.attempts);
			expect(await new DexieSessionRepository(db).list()).toEqual(file.sessions);
		});

		it('keeps every setting but the input device, which belongs to the exporting browser', async () => {
			const file = makeBackup({
				settings: { ...DEFAULT_SETTINGS, locale: 'en', inputDeviceId: 'usb-elsewhere' }
			});
			await new DexieBackup(db).importAll(file);
			const settings = await new DexieSettingsRepository(db).get();
			expect(settings).toMatchObject({ locale: 'en', inputDeviceId: null });
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
			expect(await db.progressions.count()).toBe(2);
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
			expect((await new DexieSettingsRepository(db).get()).locale).toBe('en');
			expect(await db.progressions.count()).toBe(2);
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

	it('round-trips the diagnostics setting', async () => {
		await new DexieSettingsRepository(db).update({
			diagnostics: { enabled: true, budgetMb: 1000 }
		});
		const file = await new DexieBackup(db, () => 1000).exportAll();

		const fresh = createDatabase(crypto.randomUUID());
		await new DexieBackup(fresh, () => 0).importAll(JSON.parse(JSON.stringify(file)));
		expect((await new DexieSettingsRepository(fresh).get()).diagnostics).toEqual({
			enabled: true,
			budgetMb: 1000
		});
	});

	it('restores progressions and executions after an export and an import', async () => {
		await seed(db);
		const file = await new DexieBackup(db, () => 1000).exportAll();

		const fresh = createDatabase(crypto.randomUUID());
		await new DexieBackup(fresh).importAll(JSON.parse(JSON.stringify(file)));

		const byExercise = (a: { exerciseId: string }, b: { exerciseId: string }) =>
			a.exerciseId.localeCompare(b.exerciseId);
		expect((await new DexieProgressionRepository(fresh).all()).sort(byExercise)).toEqual(
			(await new DexieProgressionRepository(db).all()).sort(byExercise)
		);
		expect(await new DexieSessionRepository(fresh).list()).toEqual(
			await new DexieSessionRepository(db).list()
		);
		expect(
			(await new DexieSessionRepository(fresh).list()).map((session) => session.executions)
		).toEqual([makeSession().executions, [{ exerciseId: 'locate-neck', tempoBpm: 96 }]]);
		expect(await fresh.progressions.count()).toBe(2);
	});

	it('round-trips observations and latency, null, empty or listed', async () => {
		const observation = {
			atMs: 1200,
			sensor: 'note',
			fate: 'answer',
			correct: true,
			payload: { midi: 45 }
		} as const;
		const attempts = new DexieAttemptRepository(db);
		await attempts.add(makeAttempt({ promptedAt: 1000, observations: null }));
		await attempts.add(makeAttempt({ promptedAt: 2000, observations: [] }));
		await attempts.add(
			makeAttempt({
				promptedAt: 3000,
				observations: [
					observation,
					{ ...observation, fate: 'settled', correct: null, payload: null }
				]
			})
		);
		const sessions = new DexieSessionRepository(db);
		await sessions.put(makeSession({ id: 's1', latencyMs: null }));
		await sessions.put(makeSession({ id: 's2', startedAt: 2500, latencyMs: 12 }));
		const first = await new DexieBackup(db, () => 1000).exportAll();

		const fresh = createDatabase(crypto.randomUUID());
		await new DexieBackup(fresh, () => 0).importAll(JSON.parse(JSON.stringify(first)));

		expect(await new DexieAttemptRepository(fresh).all()).toEqual(first.attempts);
		expect(first.attempts.map((a) => a.observations?.length ?? null)).toEqual([null, 0, 2]);
		expect(await new DexieSessionRepository(fresh).list()).toEqual(first.sessions);
		expect(first.sessions.map((s) => s.latencyMs)).toEqual([null, 12]);
	});

	it('round-trips a chord observation, scores and decisions of every variant', async () => {
		const payload = {
			windowMs: 2000,
			decided: '2,3,2',
			variants: [
				{ id: 'default', decided: '2,3,2', scores: { '2,3,2': 0.61, '7,7,5': 0.2 } },
				{ id: 'strict', decided: null, scores: { '2,3,2': 0.41, '7,7,5': 0.2 } }
			]
		};
		const attempts = new DexieAttemptRepository(db);
		await attempts.add(
			makeAttempt({
				promptedAt: 1000,
				observations: [{ atMs: 40, sensor: 'chord', fate: 'answer', correct: true, payload }]
			})
		);
		const exported = await new DexieBackup(db, () => 1000).exportAll();

		const fresh = createDatabase(crypto.randomUUID());
		await new DexieBackup(fresh, () => 0).importAll(JSON.parse(JSON.stringify(exported)));

		const [restored] = await new DexieAttemptRepository(fresh).all();
		expect(restored.observations?.[0].payload).toEqual(payload);
	});

	it('round-trips a contested attempt and a triads session', async () => {
		const attempts = new DexieAttemptRepository(db);
		const id = await attempts.add(makeAttempt({ promptedAt: 1000 }));
		await attempts.setContested(id);
		await new DexieSessionRepository(db).put(makeSession({ kind: 'triads' }));
		const exported = await new DexieBackup(db, () => 1000).exportAll();

		const fresh = createDatabase(crypto.randomUUID());
		await new DexieBackup(fresh, () => 0).importAll(JSON.parse(JSON.stringify(exported)));

		expect((await new DexieAttemptRepository(fresh).all())[0].contested).toBe(true);
		expect((await new DexieSessionRepository(fresh).list())[0].kind).toBe('triads');
	});

	it('imports a version 2 file with no observations and no latency', async () => {
		await new DexieBackup(db).importAll(makeBackupV2());

		expect((await new DexieAttemptRepository(db).all()).map((a) => a.observations)).toEqual([null]);
		expect((await new DexieSessionRepository(db).list()).map((s) => s.latencyMs)).toEqual([null]);
	});

	it('imports a version 1 file through the conversion, at the time of the import', async () => {
		const v1 = {
			app: 'neckspert-play',
			version: 1,
			exportedAt: 5,
			settings: { locale: 'fr', tempoBpm: 104, calibrationOffsetMs: null, inputDeviceId: 'usb' },
			cards: [],
			attempts: [],
			sessions: []
		};
		await seed(db);

		await new DexieBackup(db, () => 777).importAll(v1);

		expect(await new DexieProgressionRepository(db).all()).toEqual([
			{ exerciseId: 'locate-neck', mechanic: 'locate', tempoBpm: 104, updatedAt: 777 }
		]);
		expect(await db.settings.get('settings')).toEqual({
			id: 'settings',
			locale: 'fr',
			calibrationOffsetMs: null,
			inputDeviceId: null
		});
		expect(await db.cards.count()).toBe(0);
	});
});
