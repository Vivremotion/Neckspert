import { SessionMemory } from '$lib/application/session/sessionMemory';
import { describe, expect, it, vi } from 'vitest';
import { responseAttempt } from '$lib/testing/attempts';
import type { AppServices } from '$lib/application/app';
import type {
	BackupPort,
	CalibrationOutcome,
	CalibrationPort,
	CalibrationProgress
} from '$lib/application/ports';
import type { LaneEntry, PlayView, PromptView } from '$lib/application/session/contract';
import type { PromptStageModel } from '$lib/application/presentation';
import type { SessionDeps } from '$lib/application/session/SessionDeps';
import type { Attempt, BackupFile, CardState, SessionRecord } from '$lib/domain/types';
import { acceptableMidis, neckCardKey, practiceCards } from '$lib/domain/music';
import type { PitchName, StringNumber } from '$lib/domain/music/types';
import {
	FakeAttackDetector,
	FakeChordVerifier,
	FakeClock,
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
import { SessionController } from '$lib/application/session/SessionController.svelte';
import { createAppServices } from './createAppServices';
import { GESTURE_PRESENTERS, NECK_PRESENTERS, TRIAD_PRESENTERS } from '$lib/application/mechanics';
import { attackSensor, chordSensor, noteSensor, tapSensor } from '$lib/application/session/sensors';
import { FIGURE_PRESENTERS } from '$lib/application/mechanics/figurePresenters';
import {
	PLAIN_WORDS_SESSIONS,
	type FigureStageModel
} from '$lib/application/session/series/figureStage';
import { introduceCard, markLearned } from '$lib/domain/progress';
import { triadCards } from '$lib/testing/shapes';
import {
	exerciseSessionExercises,
	RHYTHM_OFFBEATS,
	RHYTHM_SILENT_BARS,
	RHYTHM_TWO_FOUR
} from '$lib/domain/exercise';
import { TraceBuilder } from '$lib/domain/session';

class FakeBackup implements BackupPort {
	async exportAll(): Promise<BackupFile> {
		throw new Error('not used');
	}
	async importAll(): Promise<void> {}
}

class FakeCalibration implements CalibrationPort {
	async run(
		_deviceId: string | null,
		_onProgress: (p: CalibrationProgress) => void
	): Promise<CalibrationOutcome> {
		return { ok: false, reason: 'cancelled' };
	}
	async runOnClick(): Promise<CalibrationOutcome> {
		return { ok: false, reason: 'cancelled' };
	}
	cancel(): void {}
}

function harness(options: { development?: boolean } = {}): {
	services: AppServices;
	deps: SessionDeps & {
		clock: FakeClock;
		detector: FakeNoteDetector;
	};
	chords: FakeChordVerifier;
	attacks: FakeAttackDetector;
} {
	const clock = new FakeClock();
	const detector = new FakeNoteDetector();
	const chords = new FakeChordVerifier();
	const attacks = new FakeAttackDetector();
	const deps: SessionDeps & {
		clock: FakeClock;
		detector: FakeNoteDetector;
	} = {
		clock,
		detector,
		attempts: new InMemoryAttemptRepository(),
		cards: new InMemoryCardStateRepository(),
		sessions: new InMemorySessionRepository(),
		settings: new InMemorySettingsRepository(),
		now: () => clock.toEpochMs(clock.now()),
		random: () => 0,
		newId: () => `id-${Math.random().toString(16).slice(2)}`,
		mechanics: {
			...NECK_PRESENTERS,
			...TRIAD_PRESENTERS,
			...GESTURE_PRESENTERS,
			...FIGURE_PRESENTERS
		},
		sensors: {
			note: noteSensor(detector),
			tap: tapSensor(),
			chord: chordSensor(chords),
			attack: attackSensor(attacks)
		},
		sounds: new FakeSoundScheduler(clock),
		takes: new FakeTakeBuffer(),
		memory: new SessionMemory(),
		levels: new InMemoryLevelStateRepository()
	};
	const services = createAppServices({
		...deps,
		backup: new FakeBackup(),
		calibration: new FakeCalibration(),
		diagnostics: new FakeDiagnostics(),
		development: options.development ?? false
	});
	return { services, deps, chords, attacks };
}

/** A learned triad card, due at once. */
function learnedTriad(mechanic: 'triad-anchor' | 'triad-zone', key: string): CardState {
	const card = markLearned(
		introduceCard({ key: `${mechanic}:${key}`, mechanic, item: { voicingKey: key } }, 0, 's-old'),
		0
	);
	return { ...card, scheduling: { ...card.scheduling, due: 0 } };
}

/** Moves the clock by steps (10 ms), the transport's wake-ups run, until `done` or the steps run out. */
async function runOnTransport(
	deps: { clock: FakeClock; sounds: unknown },
	done: () => boolean,
	stepS = 0.01,
	steps = 1000
) {
	for (let step = 0; step < steps && !done(); step++) {
		deps.clock.advance(stepS);
		(deps.sounds as FakeSoundScheduler).flush();
		await Promise.resolve();
	}
}

/** The note lane on stage, if a note to play is there. */
function noteLane(controller: { view: PlayView }): PromptStageModel | null {
	const stage = controller.view.stage;
	return stage?.view === 'lane' ? (stage.model as PromptStageModel) : null;
}

/** The lead of a note's round, in beats. */
function lead(lane: PromptStageModel | null): number | null {
	return lane?.anchorBeat != null && lane.promptBeat != null
		? lane.anchorBeat - lane.promptBeat
		: null;
}

const FR_STRING: Record<string, StringNumber> = {
	'corde de E aiguë': 1,
	'corde de B': 2,
	'corde de G': 3,
	'corde de D': 4,
	'corde de A': 5,
	'corde de E grave': 6
};

const FLAT_TO_SHARP: Record<string, PitchName> = {
	Db: 'C#',
	Eb: 'D#',
	Gb: 'F#',
	Ab: 'G#',
	Bb: 'A#'
};

function locateMidiFromPrompt(primary: string, secondary: string): number {
	const string = FR_STRING[secondary] ?? 6;
	const pitch = (FLAT_TO_SHARP[primary] ?? primary) as PitchName;
	return acceptableMidis({ string, pitch })[0];
}

describe('createAppServices', () => {
	it('hands the diagnostic journal to the screens as given', async () => {
		const { services } = harness();
		expect(await services.diagnostics.usage()).toEqual({ bytes: 0, takes: 0 });
	});

	it('wires homeStats, neckMap and sessionSummary through C and A', async () => {
		const { services } = harness();
		const stats = await services.homeStats();
		expect(stats.dueCount).toBe(0);
		const map = await services.neckMap();
		expect(map).toHaveLength(66);
		expect(map[0]).toHaveProperty('pitch');
	});

	it('startSession refuses an exercise session, which starts only through startExercise', async () => {
		const { services } = harness();
		await expect(services.startSession('exercise')).rejects.toThrow(/startExercise/);
	});

	it('plays learn and free sessions on the session controller', async () => {
		for (const kind of ['learn', 'free'] as const) {
			const { services, deps } = harness();
			const controller = await services.startSession(kind);
			expect(controller).toBeInstanceOf(SessionController);
			await controller.ready?.();
			await controller.start();
			expect((await deps.sessions.get(controller.sessionId))?.kind).toBe(kind);
			await runOnTransport(deps, () => controller.view.status === 'awaiting');
			expect(controller.view.status).toBe('awaiting');
			expect(['lane', 'answer-keys']).toContain(controller.view.stage?.view);
			controller.quit();
		}
	});

	it('startSession(learn) probes the first note of the queue without aid', async () => {
		const { services, deps } = harness();
		const controller = await services.startSession('learn');
		await controller.start();
		await runOnTransport(deps, () => controller.view.status === 'awaiting');
		const lane = noteLane(controller);
		expect(controller.view.stage?.view).toBe('lane');
		expect(lane?.prompt).toMatchObject({ primary: 'G', secondary: 'corde de E grave', aid: null });
		expect(lead(lane)).toBe(2);
		controller.quit();
	});

	it('serves the learning procedure with the stored levels, without null tempos', async () => {
		const { services, deps } = harness();
		// A note learned long ago, due: a cold review, served at its stored level.
		const item = { string: 6 as StringNumber, pitch: 'G' as PitchName };
		const learned = markLearned(
			introduceCard({ key: 'locate:6:G', mechanic: 'locate', item }, 0, 's-old'),
			0
		);
		await deps.cards.put({ ...learned, scheduling: { ...learned.scheduling, due: 0 } });
		// Locate is fixed at ♩ = 80 (ladder 8, 4, 2): level 2 is served at a lead of 2.
		await deps.levels.put({
			exerciseId: 'locate-neck',
			scope: '',
			item: '6:G',
			level: 2,
			successes: 0,
			failures: 0,
			resumeAfter: null
		});
		const controller = await services.startSession('learn');
		await controller.start();
		await runOnTransport(deps, () => controller.view.status === 'awaiting');
		const lane = noteLane(controller);
		expect(lane?.prompt).toMatchObject({ primary: 'G', secondary: 'corde de E grave' });
		expect(lead(lane)).toBe(2);
		controller.quit();
	});

	it('startSession(learn) probes first the notes of a triad being anchored', async () => {
		const { services, deps } = harness();
		const key = 'D|maj|3:5,2:1,1:3';
		await deps.cards.put({
			key: `triad-anchor:${key}`,
			mechanic: 'triad-anchor',
			item: { voicingKey: key },
			introducedAt: 0,
			introducedInSession: 's-old',
			scheduling: {
				due: 0,
				stability: 0,
				difficulty: 0,
				elapsedDays: 0,
				scheduledDays: 0,
				learningSteps: 0,
				reps: 0,
				lapses: 0,
				state: 0,
				lastReview: null
			},
			learnedAt: null,
			acquiredAt: null,
			masteredAt: null
		});
		const controller = await services.startSession('learn');
		await controller.start();
		await runOnTransport(deps, () => controller.view.status === 'awaiting');
		// A on the G string: the first note of D 2-3-2 that locate does not know.
		expect(noteLane(controller)?.prompt).toMatchObject({ primary: 'A', secondary: 'corde de G' });
		controller.quit();
	});

	it('runs locate at its level 0 tempo, 80 bpm', async () => {
		const { services, deps } = harness();
		const controller = await services.startSession('learn');
		await controller.start();
		expect(controller.view.tempoBpm).toBe(80);
		await runOnTransport(deps, () => controller.view.status === 'awaiting');
		controller.quit();
		await new Promise((resolve) => setTimeout(resolve, 0));
		// The session keeps the exercise it met, at the tempo of its first round.
		expect((await deps.sessions.get(controller.sessionId))?.executions).toEqual([
			{ exerciseId: 'locate-neck', tempoBpm: 80 }
		]);
	});

	it('free-plays a note at the lead of its stored level, on the ladder at 80 bpm', async () => {
		const { services, deps } = harness();
		// Every note at level 2: lead 2 at ♩ = 80.
		for (const card of practiceCards().filter((c) => c.mechanic === 'locate')) {
			await deps.levels.put({
				exerciseId: 'locate-neck',
				scope: '',
				item: neckCardKey(card).slice('locate:'.length),
				level: 2,
				successes: 0,
				failures: 0,
				resumeAfter: null
			});
		}
		const controller = await services.startSession('free');
		await controller.start();
		await runOnTransport(
			deps,
			() => {
				if (controller.view.stage?.view === 'answer-keys' && controller.view.status === 'awaiting')
					controller.answer('C');
				return controller.view.status === 'awaiting' && noteLane(controller) !== null;
			},
			0.05,
			2000
		);
		expect(lead(noteLane(controller))).toBe(2);
		controller.quit();
	});

	it('startSession(free) never prompts an open string', async () => {
		const { services, deps } = harness();
		const controller = await services.startSession('free');
		await controller.start();
		const prompts: string[] = [];
		await runOnTransport(
			deps,
			() => {
				if (controller.view.status === 'awaiting' && controller.view.stage) {
					const { prompt } = controller.view.stage.model as { prompt: PromptView };
					const key = `${prompt.primary}|${prompt.secondary}`;
					if (prompts.at(-1) !== key) prompts.push(key);
					if (controller.view.stage.view === 'answer-keys') controller.answer('C');
				}
				return controller.view.status === 'finished';
			},
			0.05,
			8000
		);
		expect(controller.view.status).toBe('finished');
		expect(prompts.length).toBeGreaterThan(0);
		expect(prompts.some((key) => key.startsWith('case 0|'))).toBe(false);
		expect(prompts).not.toContain('E|corde de E grave');
		expect(prompts).not.toContain('A|corde de A');
	});

	it('startSession(learn) runs the procedure and exposes a summary', async () => {
		const { services, deps } = harness();
		const controller = await services.startSession('learn');
		await controller.start();
		let answered: number | null = null;
		await runOnTransport(
			deps,
			() => {
				const stage = controller.view.stage;
				if (controller.view.status === 'awaiting' && stage?.view === 'lane') {
					const lane = stage.model as PromptStageModel;
					if (
						lane.anchorBeat !== null &&
						lane.anchorBeat !== answered &&
						controller.timeline.nowBeat() >= lane.anchorBeat
					) {
						answered = lane.anchorBeat;
						deps.detector.emitNote({
							time: deps.clock.now(),
							midi: locateMidiFromPrompt(lane.prompt.primary, lane.prompt.secondary ?? ''),
							frequencyHz: 82.41,
							clarity: 0.9
						});
					}
				} else if (controller.view.status === 'awaiting' && stage?.view === 'answer-keys') {
					controller.answer('C');
				}
				return controller.view.status === 'finished';
			},
			0.05,
			8000
		);
		for (let i = 0; i < 10; i++) await Promise.resolve();
		expect(controller.view.status).toBe('finished');
		expect(await deps.sessions.get(controller.sessionId)).toMatchObject({
			id: controller.sessionId,
			endedAt: expect.any(Number)
		});
		const attempts = await deps.attempts.listBySession(controller.sessionId);
		expect(attempts.length).toBeGreaterThan(0);
		// The first note was probed and played right: it is a card now, its level stored.
		expect(attempts[0]).toMatchObject({ phase: 'probe', success: true });
		expect(await deps.levels.all()).not.toHaveLength(0);
		const summary = await services.sessionSummary(controller.sessionId);
		expect(summary.sessionId).toBe(controller.sessionId);
	});

	it('counts the triad reviews due apart from the notes, the zone closed', async () => {
		const { services, deps } = harness();
		await deps.cards.put(learnedTriad('triad-anchor', 'D|maj|3:5,2:1,1:3'));
		expect(await services.triads()).toEqual({ anchorDue: 1, zoneDue: null });
		expect((await services.homeStats()).dueCount).toBe(0);
	});

	it('opens the zone once six triads are acquired in anchor, and counts its reviews', async () => {
		const { services, deps } = harness();
		const keys = [
			'C|maj|3:5,2:1,1:3',
			'C|maj|3:1,2:3,1:5',
			'C|maj|3:3,2:5,1:1',
			'C|min|3:5,2:1,1:b3',
			'C|min|3:1,2:b3,1:5',
			'C|min|3:b3,2:5,1:1'
		];
		for (const key of keys) {
			await deps.cards.put({ ...learnedTriad('triad-anchor', key), acquiredAt: 0 });
		}
		expect((await services.triads()).zoneDue).toBe(0);
		await deps.cards.put(learnedTriad('triad-zone', keys[0]));
		expect((await services.triads()).zoneDue).toBe(1);
	});
});

describe('the gesture track', () => {
	it('is open once a chord is acquired in anchor on a string set', async () => {
		const { services, deps } = harness();
		expect(await services.gesture()).toEqual({ open: false });
		await deps.cards.putMany(triadCards('triad-anchor', 'D', 'maj', [3, 2, 1]));
		expect(await services.gesture()).toEqual({ open: true });
	});

	it('plays a gesture session on the session controller', async () => {
		const { services, deps, chords } = harness();
		await deps.cards.putMany(triadCards('triad-anchor', 'D', 'maj', [3, 2, 1]));
		const controller = await services.startSession('gesture');
		expect(controller).toBeInstanceOf(SessionController);
		await controller.ready?.();
		// The first exercise's instruction, on the start screen.
		expect(controller.view.briefing?.text).toBeTruthy();
		await controller.start();
		expect(await deps.sessions.get(controller.sessionId)).toMatchObject({ kind: 'gesture' });
		expect(controller.view.stage?.view).toBe('link-lane');
		expect(deps.detector.running).toBe(true);
		// The transport counts a bar, then opens the first change.
		await runOnTransport(deps, () => controller.view.status === 'awaiting');
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.stage?.model).toMatchObject({ root: 'D', anchorBeat: 4, history: [] });
		expect(chords.expectations.at(-1)?.expected).toEqual(['D|maj|3:5,2:1,1:3@2-3-2']);
		controller.quit();
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect((await deps.sessions.get(controller.sessionId))?.executions).toEqual([
			{ exerciseId: 'gesture-link', tempoBpm: 80 }
		]);
	});

	it('shows « Joué juste » on a gesture session only in development', async () => {
		const played = async (development: boolean) => {
			const { services, deps, chords } = harness({ development });
			await deps.cards.putMany(triadCards('triad-anchor', 'D', 'maj', [3, 2, 1]));
			const controller = await services.startSession('gesture');
			await controller.start();
			await runOnTransport(deps, () => controller.view.status === 'awaiting');
			// Another chord on the target, a beat (0.75 s at ♩ = 80) after the prompt: a miss.
			const target = deps.clock.now() + 0.75;
			await runOnTransport(deps, () => deps.clock.now() >= target);
			chords.emit({ time: target, windowMs: 300, decided: 'G|maj', final: true, variants: [] });
			const history = () =>
				(controller.view.stage?.model as { history?: LaneEntry[] } | undefined)?.history ?? [];
			await runOnTransport(deps, () => history().length > 0);
			expect(history()).toEqual([{ beatIndex: 4, verdict: 'wrong' }]);
			const contest = controller.view.contest;
			controller.quit();
			return contest;
		};
		expect(await played(true)).toBe('available');
		expect(await played(false)).toBeNull();
	});

	it('contest labels an attempt and changes nothing else', async () => {
		const { services, deps } = harness();
		const id = await deps.attempts.add(
			responseAttempt({
				sessionId: 's1',
				exerciseId: 'gesture-jam',
				mechanic: 'chord-grid',
				cardKey: 'chord-grid:jam:blues-f#0',
				phase: 'free',
				temperature: 'hot',
				aid: 'none',
				promptedAt: 0,
				tempoBpm: 80,
				leadBeats: null,
				timingOffsetMs: null,
				reactionMs: null,
				correct: false,
				verdict: 'wrong',
				data: { item: { element: 'jam:blues-f', index: 0 }, answer: null, confusion: null },
				observations: []
			})
		);
		await services.contest(id);
		const [attempt] = await deps.attempts.all();
		expect(attempt).toMatchObject({
			contested: true,
			correct: false,
			success: false,
			verdict: { relation: 'grid-change', version: 1, value: 'wrong' }
		});
	});

	it('sums a gesture session up by exercise', async () => {
		const { services, deps } = harness();
		await deps.sessions.put({
			id: 'g1',
			kind: 'gesture',
			startedAt: 0,
			endedAt: 1,
			fatigueDetected: false,
			executions: [{ exerciseId: 'gesture-link', tempoBpm: 80 }],
			latencyMs: 0
		});
		const summary = await services.sessionSummary('g1');
		expect(summary).toMatchObject({ kind: 'gesture', gesture: { exercises: [], misses: [] } });
	});

	it('starts the gesture at the level it reached, read from the levels stored', async () => {
		const { services, deps } = harness();
		await deps.cards.putMany(triadCards('triad-anchor', 'D', 'maj', [3, 2, 1]));
		await deps.levels.put({
			exerciseId: 'gesture-link',
			scope: '',
			item: '',
			level: 2,
			successes: 0,
			failures: 0,
			resumeAfter: null
		});
		const controller = await services.startSession('gesture');
		await controller.start();
		// Level 3 of the link: ♩ = 90.
		expect(controller.view.tempoBpm).toBe(90);
		controller.quit();
	});
});

describe('the rhythm exercises', () => {
	it('starts a rhythm exercise on the session controller', async () => {
		const { services, attacks } = harness();
		const controller = await services.startExercise('rhythm-two-four');
		expect(controller).toBeInstanceOf(SessionController);
		await controller.ready?.();
		expect(controller.view.stage?.view).toBe('figure');
		await controller.start();
		// It listens to its own sensor, the attacks.
		expect(attacks.listeners).toBe(1);
		controller.quit();
	});

	it('opens no attack sensor for a session of the notes, the triads or the gesture', async () => {
		for (const kind of ['learn', 'free', 'triads', 'gesture'] as const) {
			const { services, attacks } = harness();
			const controller = await services.startSession(kind);
			await controller.start();
			expect([kind, attacks.listeners]).toEqual([kind, 0]);
			controller.quit();
		}
	});

	it('records an exercise session with its exercise and the level it reached', async () => {
		const { services, deps } = harness();
		const controller = await services.startExercise(RHYTHM_TWO_FOUR.id);
		await controller.start();
		controller.quit();
		await vi.waitFor(async () =>
			expect((await deps.sessions.get(controller.sessionId))?.endedAt).not.toBeNull()
		);
		expect(await deps.sessions.get(controller.sessionId)).toMatchObject({
			kind: 'exercise',
			exerciseId: RHYTHM_TWO_FOUR.id,
			levelReached: 0
		});
	});

	it('leaves the series of a rhythm session in memory for its summary', async () => {
		const { services, deps } = harness();
		const controller = await services.startExercise(RHYTHM_TWO_FOUR.id);
		await controller.start();
		await runOnTransport(
			deps,
			() => (controller.view.stage?.model as FigureStageModel | undefined)?.phase === 'play',
			0.01,
			2000
		);
		expect((controller.view.stage?.model as FigureStageModel).phase).toBe('play');
		controller.quit();
		await vi.waitFor(async () =>
			expect((await deps.sessions.get(controller.sessionId))?.endedAt).not.toBeNull()
		);
		const summary = (await services.sessionSummary(controller.sessionId)).exercise;
		expect(summary?.exerciseId).toBe(RHYTHM_TWO_FOUR.id);
		expect(summary?.series?.runs.length).toBe(1);
	});

	it('tells the feedback by its terms once the exercise has PLAIN_WORDS_SESSIONS ended sessions', async () => {
		const { services, deps } = harness();
		const plainWords = async () => {
			const controller = await services.startExercise(RHYTHM_TWO_FOUR.id);
			await controller.ready?.();
			const plain = (controller.view.stage?.model as FigureStageModel).plainWords;
			await controller.start();
			controller.quit();
			await vi.waitFor(async () =>
				expect((await deps.sessions.get(controller.sessionId))?.endedAt).not.toBeNull()
			);
			return plain;
		};
		const told: boolean[] = [];
		for (let i = 0; i <= PLAIN_WORDS_SESSIONS; i++) told.push(await plainWords());
		expect(told).toEqual([...Array(PLAIN_WORDS_SESSIONS).fill(true), false]);
	});

	it('startExercise plays the asked exercise, its how-to told the first time', async () => {
		const { services } = harness();
		const controller = await services.startExercise('rhythm-offbeats');
		await controller.ready?.();
		expect(controller.view.briefing?.text).toBe(RHYTHM_OFFBEATS.howTo?.fr);
		expect(controller.view.stage?.view).toBe('figure');
		expect(typeof controller.listen).toBe('function');
	});

	const rhythmSession = (overrides: Partial<SessionRecord> = {}): SessionRecord => ({
		id: 'r1',
		kind: 'exercise',
		exerciseId: RHYTHM_OFFBEATS.id,
		startedAt: 0,
		endedAt: 1,
		fatigueDetected: false,
		executions: [],
		latencyMs: 0,
		...overrides
	});
	const rhythmCycle = (level: number, success: boolean, sessionId = 'r1') =>
		({
			sessionId,
			exerciseId: RHYTHM_OFFBEATS.id,
			mechanic: 'figure',
			cardKey: `figure:offbeats-1@${level}`,
			phase: 'free',
			temperature: 'hot',
			aids: ['cursor'],
			promptedAt: 0,
			tempoBpm: 80,
			leadBeats: null,
			timingOffsetMs: null,
			reactionMs: null,
			correct: null,
			success,
			verdict: { relation: 'plan', version: 1, value: success ? 'ok' : 'miss' },
			measures: {},
			plan: null,
			data: { item: { figureId: 'offbeats-1', level }, level, report: {} },
			observations: []
		}) as Attempt;
	const heldLevel = (level: number) => ({
		exerciseId: RHYTHM_OFFBEATS.id,
		scope: '',
		item: '',
		level,
		successes: 0,
		failures: 0,
		resumeAfter: null
	});

	it('sums a rhythm session up from its cycles and the level it ended on', async () => {
		const { services, deps } = harness();
		await deps.sessions.put(rhythmSession({ levelReached: 1 }));
		await deps.attempts.add(rhythmCycle(0, true));
		await deps.attempts.add(rhythmCycle(1, true));
		await deps.attempts.add(rhythmCycle(1, false));
		await deps.attempts.add(rhythmCycle(0, true, 'other'));
		const summary = await services.sessionSummary('r1');
		expect(summary.kind).toBe('exercise');
		expect(summary.exercise).toEqual({
			exerciseId: RHYTHM_OFFBEATS.id,
			levelReached: { shown: 2, of: 4, aid: false },
			cycles: 3,
			successes: 2,
			aided: 0
		});
	});

	/** A trace of session r1: two runs, the first with attempt `a`, the second with `b`. */
	function rememberTwoRuns(deps: SessionDeps, a: number, b: number) {
		const trace = new TraceBuilder(0);
		const series = trace.open('series', 0, { exerciseId: RHYTHM_OFFBEATS.id });
		const first = trace.open('run', 1, { level: 0 });
		trace.open('round', 1, { level: 0, attemptId: a });
		trace.close(first, 5);
		const second = trace.open('run', 6, { level: 1 });
		trace.open('round', 6, { level: 1, attemptId: b });
		trace.close(second, 10);
		trace.set(series, { reason: 'time' });
		trace.closeAll(10, 'done');
		deps.memory.remember({
			sessionId: 'r1',
			trace: trace.tree(),
			takes: new Map([
				[first, { from: 1, to: 5, sounds: [] }],
				[second, { from: 6, to: 10, sounds: [] }]
			]),
			latencyS: 0.02
		});
		return { first, second };
	}

	it('the summary of a session in memory has its series and the runs still held', async () => {
		const { services, deps } = harness();
		await deps.sessions.put(rhythmSession());
		const a = await deps.attempts.add(rhythmCycle(0, true));
		const b = await deps.attempts.add(rhythmCycle(1, false));
		const { first } = rememberTwoRuns(deps, a, b);
		const takes = deps.takes as FakeTakeBuffer;
		takes.keepFrom(0);
		takes.hear(8);
		const summary = (await services.sessionSummary('r1')).exercise;
		expect(summary?.series?.runs.map((run) => run.level)).toEqual([0, 1]);
		expect(summary?.series?.ended).toBe('time');
		expect(summary?.replayable).toEqual([first]);
	});

	it('after a reload the summary keeps its counts', async () => {
		const { services, deps } = harness();
		await deps.sessions.put(rhythmSession());
		await deps.attempts.add(rhythmCycle(0, true));
		const summary = (await services.sessionSummary('r1')).exercise;
		expect(summary?.cycles).toBe(1);
		expect(summary?.series).toBeUndefined();
		expect(summary?.replayable).toBeUndefined();
	});

	it("replayRun plays the run's take, and refuses one not held", async () => {
		const { services, deps } = harness();
		const { first, second } = rememberTwoRuns(deps, 1, 2);
		const takes = deps.takes as FakeTakeBuffer;
		takes.keepFrom(0);
		takes.hear(8);
		await services.replayRun('r1', first);
		expect(takes.plays).toEqual([{ from: 1, to: 5, sounds: [], latencyS: 0.02, whole: true }]);
		await expect(services.replayRun('r1', second)).rejects.toThrow();
		await expect(services.replayRun('r1', 99)).rejects.toThrow();
		await expect(services.replayRun('other', first)).rejects.toThrow();
		services.stopReplay();
		expect(takes.stops).toBe(1);
	});

	it('contest stores its reason', async () => {
		const { services, deps } = harness();
		const id = await deps.attempts.add(rhythmCycle(0, false));
		await services.contest(id, 'regularity');
		expect((await deps.attempts.all())[0]).toMatchObject({
			contested: true,
			contestReason: 'regularity'
		});
	});

	it('resting lists the exercises whose resumeAfter is ahead', async () => {
		const { services, deps } = harness();
		const now = deps.now();
		await deps.levels.put({ ...heldLevel(0), resumeAfter: now + 1 });
		await deps.levels.put({
			...heldLevel(0),
			exerciseId: RHYTHM_TWO_FOUR.id,
			resumeAfter: now - 1
		});
		expect(
			await services.resting([RHYTHM_OFFBEATS.id, RHYTHM_TWO_FOUR.id, RHYTHM_SILENT_BARS.id])
		).toEqual([RHYTHM_OFFBEATS.id]);
	});

	it('an older session keeps its own level after a later one moved it', async () => {
		const { services, deps } = harness();
		await deps.sessions.put(rhythmSession({ id: 'older', levelReached: 1 }));
		await deps.sessions.put(rhythmSession({ id: 'later', startedAt: 10, levelReached: 3 }));
		// The stored level is the latest session's.
		await deps.levels.put(heldLevel(3));
		expect((await services.sessionSummary('older')).exercise?.levelReached).toEqual({
			shown: 2,
			of: 4,
			aid: false
		});
		expect((await services.sessionSummary('later')).exercise?.levelReached).toEqual({
			shown: 4,
			of: 4,
			aid: false
		});
	});

	it('falls back on the stored level for a session recorded without its own', async () => {
		const { services, deps } = harness();
		await deps.sessions.put(rhythmSession());
		await deps.levels.put(heldLevel(2));
		expect((await services.sessionSummary('r1')).exercise?.levelReached).toEqual({
			shown: 3,
			of: 4,
			aid: false
		});
	});

	it('gives a summary without rhythm for an exercise no longer in the catalog or not a rhythm one', async () => {
		const { services, deps } = harness();
		await deps.sessions.put(rhythmSession({ id: 'gone', exerciseId: 'rhythm-removed' }));
		await deps.sessions.put(rhythmSession({ id: 'neck', exerciseId: 'locate-neck' }));
		for (const id of ['gone', 'neck']) {
			const summary = await services.sessionSummary(id);
			expect(summary.kind).toBe('exercise');
			expect(summary.exercise).toBeUndefined();
		}
	});

	it('loads the neck data only for a neck session', async () => {
		const { services, deps } = harness();
		await deps.sessions.put(rhythmSession());
		const all = vi.spyOn(deps.attempts, 'all');
		const cards = vi.spyOn(deps.cards, 'all');
		await services.sessionSummary('r1');
		expect(all).not.toHaveBeenCalled();
		expect(cards).not.toHaveBeenCalled();
	});

	it('startExercise plays every exercise of an exercise session', async () => {
		expect(exerciseSessionExercises().length).toBeGreaterThan(0);
		for (const exercise of exerciseSessionExercises()) {
			const { services } = harness();
			const controller = await services.startExercise(exercise.id);
			await controller.ready?.();
			expect(controller.view.stage?.view, exercise.id).toBe(exercise.view);
			controller.quit();
		}
	});

	it('startExercise refuses an exercise it does not know, or one without levels', async () => {
		const { services } = harness();
		await expect(services.startExercise('nope')).rejects.toThrow();
		await expect(services.startExercise('locate-neck')).rejects.toThrow();
	});
});
