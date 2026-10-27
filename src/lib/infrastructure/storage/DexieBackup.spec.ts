import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS } from '$lib/domain/types';
import { createDatabase, type NeckspertDb } from './db';
import { DexieAttemptRepository } from './DexieAttemptRepository';
import { DexieBackup } from './DexieBackup';
import { DexieCardStateRepository } from './DexieCardStateRepository';
import { DexieLevelStateRepository } from './DexieLevelStateRepository';
import { DexieSessionRepository } from './DexieSessionRepository';
import { DexieSettingsRepository } from './DexieSettingsRepository';
import {
	makeAttempt,
	makeBackup,
	makeBackupV2,
	makeBackupV5,
	makeBackupV6,
	makeCard,
	makeCardV5,
	makeLevelState,
	makeProgressionV6,
	makeSession
} from './testing/fixtures';
import v3Export from './fixtures/backup-v3.json';
import { validateBackup } from './validateBackup';

const LATENCY = { note: { ms: 42, provenance: 'player' as const } };

/**
 * Two cards, three attempts (one in a scope), two sessions, two changed settings, two level
 * states.
 */
async function seed(db: NeckspertDb): Promise<void> {
	await new DexieSettingsRepository(db).update({ locale: 'en', latency: LATENCY });
	const levels = new DexieLevelStateRepository(db);
	await levels.put(makeLevelState());
	await levels.put(makeLevelState({ exerciseId: 'gesture-climb', scope: 'iohefy-a', level: 2 }));
	await new DexieCardStateRepository(db).putMany([makeCard(), makeCard({ mechanic: 'identify' })]);
	const attempts = new DexieAttemptRepository(db);
	await attempts.add(
		makeAttempt({
			promptedAt: 3000,
			verdict: { relation: 'beat', version: 1, value: 'late' },
			reactionMs: 1800
		})
	);
	await attempts.add(makeAttempt({ promptedAt: 1000, scope: 'iohefy-a' }));
	await attempts.add(
		makeAttempt({
			mechanic: 'identify',
			promptedAt: 2000,
			data: { item: { string: 5, fret: 8 }, answer: { pitch: 'E' }, confusion: null },
			correct: false,
			success: false,
			verdict: { relation: 'free', version: 1, value: 'wrong' }
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
			expect(file.version).toBe(7);
			expect(file.exportedAt).toBe(123);
			expect(file.settings).toEqual({ ...DEFAULT_SETTINGS, locale: 'en', latency: LATENCY });
			expect(file.levelStates).toHaveLength(2);
			expect(file.cards.map((card) => card.key).sort()).toEqual(['identify:5:8', 'locate:2:F']);
			expect(file.attempts.map((attempt) => attempt.promptedAt)).toEqual([1000, 2000, 3000]);
			expect(file.attempts.every((attempt) => typeof attempt.id === 'number')).toBe(true);
			expect(file.sessions.map((session) => session.id)).toEqual(['s1', 's2']);
		});

		it('exports an empty database with the default settings', async () => {
			expect(await new DexieBackup(db, () => 5).exportAll()).toEqual({
				app: 'neckspert-play',
				version: 7,
				exportedAt: 5,
				settings: DEFAULT_SETTINGS,
				cards: [],
				attempts: [],
				sessions: [],
				levelStates: []
			});
		});

		it('exports version 7 without progressions, attempts with their scope', async () => {
			await seed(db);
			const file = await new DexieBackup(db, () => 123).exportAll();
			expect(file.version).toBe(7);
			expect(file).not.toHaveProperty('progressions');
			expect(file.attempts.map((attempt) => attempt.scope)).toEqual([
				'iohefy-a',
				undefined,
				undefined
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
			expect(await new DexieCardStateRepository(db).all()).toEqual(file.cards);
			expect(await new DexieAttemptRepository(db).all()).toEqual(file.attempts);
			expect(await new DexieSessionRepository(db).list()).toEqual(file.sessions);
			expect(await new DexieLevelStateRepository(db).all()).toEqual([]);
		});

		it('keeps the level an exercise session ended on through an export and an import', async () => {
			const held = makeSession({
				id: 'rhythm',
				kind: 'exercise',
				exerciseId: 'rhythm-offbeats',
				levelReached: 2
			});
			await new DexieSessionRepository(db).put(held);
			const file = JSON.parse(JSON.stringify(await new DexieBackup(db).exportAll()));
			expect(file.sessions[0].levelReached).toBe(2);

			await db.sessions.clear();
			await new DexieBackup(db).importAll(file);
			expect(await new DexieSessionRepository(db).get('rhythm')).toEqual(held);
		});

		it('keeps every setting but the input device, which belongs to the exporting browser', async () => {
			const file = makeBackup({
				settings: { ...DEFAULT_SETTINGS, locale: 'en', inputDeviceId: 'usb-elsewhere' }
			});
			await new DexieBackup(db).importAll(file);
			const settings = await new DexieSettingsRepository(db).get();
			expect(settings).toMatchObject({ locale: 'en', inputDeviceId: null });
		});

		it('imports an old export with a one-beat triad card at the top of its ladder, its lead gone', async () => {
			const key = 'D|maj|3:5,2:1,1:3';
			const card = makeCardV5({
				key: `triad-anchor:${key}`,
				mechanic: 'triad-anchor',
				item: { voicingKey: key },
				leadBeats: 1
			});

			await new DexieBackup(db).importAll(makeBackupV5({ cards: [card] }));

			const { leadBeats: _lead, ...withoutLead } = card;
			expect(await new DexieCardStateRepository(db).all()).toEqual([withoutLead]);
			expect(
				await new DexieLevelStateRepository(db).get({
					exerciseId: 'triads-anchor',
					scope: '',
					item: key
				})
			).toMatchObject({ level: 2, successes: 0, failures: 0 });
		});

		it('rejects an invalid file and keeps the stored data', async () => {
			await seed(db);
			await expect(new DexieBackup(db).importAll({ app: 'other' })).rejects.toThrow(
				'Not a Neckspert Play backup'
			);
			expect(await db.attempts.count()).toBe(3);
			expect(await db.cards.count()).toBe(2);
			expect(await db.sessions.count()).toBe(2);
			expect(await db.levelStates.count()).toBe(2);
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
			expect(await db.levelStates.count()).toBe(2);
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

	it('restores executions after an export and an import', async () => {
		await seed(db);
		const file = await new DexieBackup(db, () => 1000).exportAll();

		const fresh = createDatabase(crypto.randomUUID());
		await new DexieBackup(fresh).importAll(JSON.parse(JSON.stringify(file)));

		expect(await new DexieSessionRepository(fresh).list()).toEqual(
			await new DexieSessionRepository(db).list()
		);
		expect(
			(await new DexieSessionRepository(fresh).list()).map((session) => session.executions)
		).toEqual([makeSession().executions, [{ exerciseId: 'locate-neck', tempoBpm: 96 }]]);
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

		// Its tempo became a locate progression, which version 7 drops: locate plays at 80 bpm.
		expect(await db.levelStates.count()).toBe(0);
		expect(await new DexieBackup(db).exportAll()).not.toHaveProperty('progressions');
		expect(await db.settings.get('settings')).toEqual({
			id: 'settings',
			locale: 'fr',
			inputDeviceId: null,
			latency: {},
			clickBleed: false
		});
		expect(await db.cards.count()).toBe(0);
	});

	it("imports a version 6 file: a gesture progression becomes its scope's level", async () => {
		const file = makeBackupV6({
			progressions: [
				makeProgressionV6(),
				makeProgressionV6({
					exerciseId: 'gesture-climb',
					mechanic: 'chord-grid',
					scope: 'blues-f',
					tempoBpm: 110
				})
			],
			attempts: [{ ...makeAttempt({ id: 1 }), tempoScope: 'blues-f' }]
		});

		await new DexieBackup(db).importAll(JSON.parse(JSON.stringify(file)));

		expect(await new DexieLevelStateRepository(db).all()).toEqual([
			makeLevelState({ exerciseId: 'gesture-climb', scope: 'blues-f', level: 6, successes: 0 })
		]);
		expect(await new DexieAttemptRepository(db).all()).toEqual([
			makeAttempt({ id: 1, scope: 'blues-f' })
		]);
	});

	it('gives back the same level states after an export and an import', async () => {
		await seed(db);
		const file = await new DexieBackup(db, () => 1000).exportAll();

		const fresh = createDatabase(crypto.randomUUID());
		await new DexieBackup(fresh).importAll(JSON.parse(JSON.stringify(file)));

		const levels = new DexieLevelStateRepository(fresh);
		expect(await levels.all()).toEqual(await new DexieLevelStateRepository(db).all());
		expect(await levels.get({ exerciseId: 'rhythm-silent-bars', scope: '', item: '' })).toEqual(
			makeLevelState()
		);
	});

	it('imports the version 3 export of the application before version 4 and exports it as 7', async () => {
		const v3 = structuredClone(v3Export);
		await new DexieBackup(db, () => 0).importAll(v3);

		const exported = await new DexieBackup(db, () => 1000).exportAll();
		const expected = validateBackup(structuredClone(v3Export));
		expect(exported.version).toBe(7);
		expect(exported.cards).toEqual(expected.cards);
		expect(exported.attempts).toEqual(expected.attempts);
		expect(exported.settings).toEqual({ ...expected.settings, inputDeviceId: null });
		expect(validateBackup(JSON.parse(JSON.stringify(exported)))).toEqual(exported);
	});
});
