// A removed definition file takes its objects out of the registries and keeps every stored row:
// the services the home, the neck map, the summary and the settings call meet progress whose
// skill, exercise or routine no file defines, and must not break on it.
import { afterEach, describe, expect, it } from 'vitest';
import type { AppServices } from '$lib/application/app';
import type { BackupPort, CalibrationOutcome, CalibrationPort } from '$lib/application/ports';
import type { SessionDeps } from '$lib/application/session/SessionDeps';
import { SessionMemory } from '$lib/application/session/sessionMemory';
import { SET_PRESENTERS, VIEW_PRESENTERS } from '$lib/application/sets';
import { attackSensor, chordSensor, noteSensor, tapSensor } from '$lib/application/session/sensors';
import {
	allExercises,
	clearExercises,
	registerExercise,
	IDENTIFY_NECK_ID,
	LOCATE_NECK_ID,
	ROUTINE_NOTES_ID
} from '$lib/domain/exercise';
import { introduceCard, markLearned } from '$lib/domain/progress';
import type { Attempt, BackupFile, CardState, LevelState, SessionRecord } from '$lib/domain/types';
import { responseAttempt } from '$lib/testing/attempts';
import {
	FakeAttackDetector,
	FakeChordVerifier,
	FakeClock,
	FakeDefinitionsService,
	FakeDiagnostics,
	FakeNoteDetector,
	FakeSoundScheduler,
	FakeTakeBuffer,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository,
	InMemoryLevelStateRepository,
	InMemorySessionRepository,
	InMemorySettingsRepository
} from '$lib/testing/fakes';
import { createAppServices } from './createAppServices';

const GONE_SKILL = 'gone-skill';
const GONE_EXERCISE = 'gone-exercise';
const GONE_ROUTINE = 'gone-routine';

/** A backup port over the fake repositories: it exports what they hold and imports it back. */
class RepositoryBackup implements BackupPort {
	imported: unknown = null;
	constructor(private readonly deps: SessionDeps) {}
	async exportAll(): Promise<BackupFile> {
		const { deps } = this;
		return {
			app: 'neckspert-play',
			version: 9,
			exportedAt: 0,
			settings: await deps.settings.get(),
			cards: await deps.cards.all(),
			attempts: await deps.attempts.all(),
			sessions: await deps.sessions.list(),
			levelStates: await deps.levels.all(),
			definitionFiles: []
		};
	}
	async importAll(file: unknown): Promise<void> {
		this.imported = file;
	}
}

class FakeCalibration implements CalibrationPort {
	async run(): Promise<CalibrationOutcome> {
		return { ok: false, reason: 'cancelled' };
	}
	async runOnClick(): Promise<CalibrationOutcome> {
		return { ok: false, reason: 'cancelled' };
	}
	cancel(): void {}
}

function harness(): {
	services: AppServices;
	deps: SessionDeps & { clock: FakeClock };
	backup: RepositoryBackup;
} {
	const clock = new FakeClock();
	const detector = new FakeNoteDetector();
	const deps: SessionDeps & { clock: FakeClock } = {
		clock,
		detector,
		attempts: new InMemoryAttemptRepository(),
		cards: new InMemoryCardStateRepository(),
		sessions: new InMemorySessionRepository(),
		settings: new InMemorySettingsRepository(),
		now: () => clock.toEpochMs(clock.now()),
		random: () => 0,
		newId: () => `id-${Math.random().toString(16).slice(2)}`,
		presenters: SET_PRESENTERS,
		views: VIEW_PRESENTERS,
		sensors: {
			note: noteSensor(detector),
			tap: tapSensor(),
			chord: chordSensor(new FakeChordVerifier()),
			attack: attackSensor(new FakeAttackDetector())
		},
		sounds: new FakeSoundScheduler(clock),
		takes: new FakeTakeBuffer(),
		memory: new SessionMemory(),
		levels: new InMemoryLevelStateRepository()
	};
	const backup = new RepositoryBackup(deps);
	const services = createAppServices({
		...deps,
		backup,
		definitions: new FakeDefinitionsService(),
		calibration: new FakeCalibration(),
		diagnostics: new FakeDiagnostics()
	});
	return { services, deps, backup };
}

function learned(card: Pick<CardState, 'key' | 'skill' | 'item'>): CardState {
	const introduced = markLearned(introduceCard(card, 0, 's-normal'), 0);
	return { ...introduced, scheduling: { ...introduced.scheduling, due: 0 } };
}

function attempt(fields: {
	sessionId: string;
	exerciseId: string;
	skill: string;
	cardKey: string;
	item: unknown;
}): Attempt {
	return responseAttempt({
		sessionId: fields.sessionId,
		exerciseId: fields.exerciseId,
		skill: fields.skill,
		cardKey: fields.cardKey,
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		promptedAt: 1000,
		tempoBpm: 80,
		leadBeats: 2,
		timingOffsetMs: 10,
		reactionMs: 900,
		correct: true,
		verdict: 'perfect',
		data: { item: fields.item, answer: { midi: 65 }, confusion: null },
		observations: []
	});
}

function session(fields: Partial<SessionRecord> & { id: string }): SessionRecord {
	return {
		startedAt: 1000,
		endedAt: 2000,
		fatigueDetected: false,
		executions: [],
		latencyMs: 0,
		...fields
	};
}

function levelState(fields: Partial<LevelState>): LevelState {
	return {
		exerciseId: GONE_EXERCISE,
		scope: '',
		item: '',
		level: 2,
		successes: 0,
		failures: 0,
		resumeAfter: null,
		...fields
	};
}

/**
 * A normal progress (a locate note learned, its attempt, a notes session) and beside it: a card
 * and attempts of a skill no file defines; attempts, levels and a session of an exercise no file
 * defines; a session of an unknown routine.
 */
async function seed(deps: SessionDeps): Promise<void> {
	const locate = { string: 6, pitch: 'G' };
	await deps.cards.putMany([
		learned({ key: 'locate-note-string:6:G', skill: 'locate-note-string', item: locate }),
		learned({ key: `${GONE_SKILL}:x`, skill: GONE_SKILL, item: { x: 1 } })
	]);
	for (const row of [
		attempt({
			sessionId: 's-normal',
			exerciseId: 'locate-note-string',
			skill: 'locate-note-string',
			cardKey: 'locate-note-string:6:G',
			item: locate
		}),
		attempt({
			sessionId: 's-normal',
			exerciseId: GONE_EXERCISE,
			skill: GONE_SKILL,
			cardKey: `${GONE_SKILL}:x`,
			item: { x: 1 }
		}),
		attempt({
			sessionId: 's-gone-exercise',
			exerciseId: GONE_EXERCISE,
			skill: GONE_SKILL,
			cardKey: `${GONE_SKILL}:x`,
			item: { x: 1 }
		}),
		attempt({
			sessionId: 's-gone-routine',
			exerciseId: GONE_EXERCISE,
			skill: 'locate-note-string',
			cardKey: 'locate-note-string:6:G',
			item: locate
		})
	]) {
		await deps.attempts.add(row);
	}
	await deps.levels.put(levelState({ resumeAfter: Number.MAX_SAFE_INTEGER }));
	await deps.levels.put(levelState({ item: 'x', level: 1 }));
	await deps.sessions.put(
		session({
			id: 's-normal',
			routine: ROUTINE_NOTES_ID,
			executions: [
				{ exerciseId: 'locate-note-string', tempoBpm: 80 },
				{ exerciseId: GONE_EXERCISE, tempoBpm: 80 }
			]
		})
	);
	await deps.sessions.put(
		session({
			id: 's-gone-exercise',
			exercise: GONE_EXERCISE,
			free: true,
			levelReached: 2,
			executions: [{ exerciseId: GONE_EXERCISE, tempoBpm: 80 }]
		})
	);
	await deps.sessions.put(
		session({
			id: 's-gone-routine',
			routine: GONE_ROUTINE,
			executions: [{ exerciseId: GONE_EXERCISE, tempoBpm: null }]
		})
	);
}

/** Moves the clock until `done`, the transport's wake-ups run. */
async function runOnTransport(deps: { clock: FakeClock; sounds: unknown }, done: () => boolean) {
	for (let step = 0; step < 1000 && !done(); step++) {
		deps.clock.advance(0.01);
		(deps.sounds as FakeSoundScheduler).flush();
		await Promise.resolve();
		await Promise.resolve();
	}
}

describe('stored progress whose definition is gone', () => {
	it('resolves the home services', async () => {
		const { services, deps } = harness();
		await seed(deps);
		const stats = await services.homeStats();
		expect(stats.dueCount).toBeGreaterThanOrEqual(0);
		expect(await services.triads()).toMatchObject({ anchorDue: 0 });
		expect(await services.gesture()).toEqual({ open: false });
		expect(await services.resting([GONE_EXERCISE])).toEqual([GONE_EXERCISE]);
	});

	it('draws the neck map', async () => {
		const { services, deps } = harness();
		await seed(deps);
		const map = await services.neckMap();
		expect(map).toBeDefined();
	});

	it('sums up every session, its exercise or routine gone or not', async () => {
		const { services, deps } = harness();
		await seed(deps);
		for (const id of ['s-normal', 's-gone-exercise', 's-gone-routine']) {
			const summary = await services.sessionSummary(id);
			expect(summary).toBeDefined();
		}
	});

	it('exports the rows as stored, none dropped', async () => {
		const { services, deps, backup } = harness();
		await seed(deps);
		const file = await services.backup.exportAll();
		expect(file.cards.map((card) => card.skill)).toContain(GONE_SKILL);
		expect(file.attempts).toHaveLength(4);
		expect(file.sessions).toHaveLength(3);
		expect(file.levelStates).toHaveLength(2);
		await services.backup.importAll(file);
		expect(backup.imported).toBe(file);
		// Nothing was written away.
		expect(await deps.attempts.all()).toHaveLength(4);
		expect(await deps.cards.all()).toHaveLength(2);
		expect(await deps.sessions.list()).toHaveLength(3);
		expect(await deps.levels.all()).toHaveLength(2);
	});

	it('starts a learning session', async () => {
		const { services, deps } = harness();
		await seed(deps);
		const controller = await services.startSession('learn');
		await controller.start();
		await runOnTransport(deps, () => controller.view.status === 'awaiting');
		expect(controller.view.status).toBe('awaiting');
		controller.quit();
	});
});

describe('a track exercise no file defines', () => {
	const catalog = allExercises();
	afterEach(() => {
		clearExercises();
		for (const exercise of catalog) registerExercise(exercise, 'catalog');
	});

	/** The registry as it would be once the file of `id` is removed. */
	function withoutExercise(id: string): void {
		clearExercises();
		for (const exercise of catalog.filter((exercise) => exercise.id !== id)) {
			registerExercise(exercise, 'catalog');
		}
	}

	it('starts the triads without identify (D9)', async () => {
		const { services, deps } = harness();
		withoutExercise(IDENTIFY_NECK_ID);
		const controller = await services.startSession('triads');
		await controller.start();
		await runOnTransport(deps, () => controller.view.status === 'awaiting');
		expect(controller.view.status).toBe('awaiting');
		controller.quit();
	});

	it('refuses a notes session without its own exercise, naming it', async () => {
		const { services } = harness();
		withoutExercise(IDENTIFY_NECK_ID);
		await expect(services.startSession('learn')).rejects.toThrow(
			`Unknown exercise: ${IDENTIFY_NECK_ID}`
		);
	});

	it('sums up a notes session once locate is gone', async () => {
		const { services, deps } = harness();
		await seed(deps);
		withoutExercise(LOCATE_NECK_ID);
		const summary = await services.sessionSummary('s-normal');
		expect(summary).toMatchObject({ kind: 'learn', tempoBpm: 80 });
		expect((await services.homeStats()).dueCount).toBeGreaterThan(0);
		expect(await services.neckMap()).not.toHaveLength(0);
	});

	it('keeps the home services without a gesture exercise', async () => {
		const { services } = harness();
		withoutExercise('grid-reading');
		expect(await services.gesture()).toEqual({ open: false });
		expect(await services.triads()).toMatchObject({ anchorDue: 0 });
		expect((await services.homeStats()).dueCount).toBe(0);
		expect(await services.resting(['grid-reading'])).toEqual([]);
	});
});
