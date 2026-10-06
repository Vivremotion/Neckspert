import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { Attempt, CardState, Execution, PlannedItem, SessionKind } from '$lib/domain/types';
import { beatTiming } from '$lib/domain/timing';
import { classifyNoteConfusion } from '$lib/domain/music';
import {
	createListSelector,
	introduceCard,
	LEARN_SESSION_MS,
	markLearned,
	type SessionSelector
} from '$lib/domain/progress';
import {
	FakeClock,
	FakeMetronome,
	FakeNoteDetector,
	FakeSoundCues,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository,
	InMemoryProgressionRepository,
	InMemorySessionRepository,
	InMemorySettingsRepository
} from '$lib/testing/fakes';
import type { SessionDeps } from './SessionDeps';
import { NECK_PRESENTERS } from '$lib/application/mechanics';
import { noteSensor, tapSensor } from './sensors';
import { SessionController } from './SessionController.svelte';

function locateItem(overrides: Partial<PlannedItem> = {}): PlannedItem {
	return {
		exerciseId: 'locate-neck',
		mechanic: 'locate',
		item: { string: 2, pitch: 'F' },
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: 4,
		...overrides
	};
}

/** The locate card of F on the B string, as `introduceCard` takes it. */
const F_ON_B = { key: 'locate:2:F', mechanic: 'locate', item: { string: 2, pitch: 'F' } } as const;

const EXECUTIONS: Execution[] = [
	{ exerciseId: 'locate-neck', tempoBpm: 80 },
	{ exerciseId: 'identify-neck', tempoBpm: null }
];

function progression(tempoBpm: number) {
	return { exerciseId: 'locate-neck', mechanic: 'locate', tempoBpm, updatedAt: 0 };
}

type Prepare = (
	sessionId: string
) => Promise<{ selector: SessionSelector; executions: Execution[] }>;

interface TestPlan {
	id: string;
	kind: SessionKind;
	prepare: Prepare;
}

function planWith(
	items: PlannedItem[],
	kind: SessionKind = 'learn',
	executions: Execution[] = EXECUTIONS
): TestPlan {
	return {
		id: 'sess-1',
		kind,
		prepare: async () => ({ selector: createListSelector(items), executions })
	};
}

/** A plan whose locate tempo comes from the stored progression, as `createAppServices` does. */
function planFromProgression(
	items: PlannedItem[],
	deps: SessionDeps,
	kind: SessionKind = 'learn'
): TestPlan {
	return {
		id: 'sess-1',
		kind,
		prepare: async () => ({
			selector: createListSelector(items),
			executions: [
				{
					exerciseId: 'locate-neck',
					tempoBpm: (await deps.progressions.get('locate-neck'))?.tempoBpm ?? 80
				},
				{ exerciseId: 'identify-neck', tempoBpm: null }
			]
		})
	};
}

function make(plan: TestPlan, deps: SessionDeps): SessionController {
	return new SessionController({ id: plan.id, kind: plan.kind }, plan.prepare, deps);
}

function createDeps(clock = new FakeClock()): SessionDeps & {
	clock: FakeClock;
	metronome: FakeMetronome;
	detector: FakeNoteDetector;
	cues: FakeSoundCues;
} {
	const metronome = new FakeMetronome(clock);
	const detector = new FakeNoteDetector();
	const cues = new FakeSoundCues();
	return {
		clock,
		metronome,
		detector,
		cues,
		attempts: new InMemoryAttemptRepository(),
		cards: new InMemoryCardStateRepository(),
		sessions: new InMemorySessionRepository(),
		progressions: new InMemoryProgressionRepository(),
		settings: new InMemorySettingsRepository(),
		now: () => clock.toEpochMs(clock.now()),
		random: () => 0,
		newId: () => 'id-1',
		mechanics: NECK_PRESENTERS,
		sensors: { note: noteSensor(detector), tap: tapSensor() }
	};
}

/** Advance audio time and flush metronome beats (lookahead 100 ms). */
function tick(deps: { clock: FakeClock; metronome: FakeMetronome }, seconds: number) {
	deps.clock.advance(seconds);
	deps.metronome.flush();
}

/** Advances to the moment beat `index` is announced (100 ms ahead of it) and flushes. */
function atBeat(deps: { clock: FakeClock; metronome: FakeMetronome }, index: number) {
	const announced = deps.metronome.beatTime(index) - 0.1;
	if (announced > deps.clock.now()) deps.clock.advance(announced - deps.clock.now());
	deps.metronome.flush();
}

describe('SessionController skeleton', () => {
	let deps: ReturnType<typeof createDeps>;

	beforeEach(() => {
		deps = createDeps();
	});

	it('starts with a one-bar count-in then stays ready for the first prompt beat', async () => {
		const controller = make(planWith([locateItem()]), deps);
		await controller.start();

		expect(controller.view.status).toBe('count-in');
		expect(controller.view.tempoBpm).toBe(80);
		expect(deps.metronome.isRunning()).toBe(true);

		// beat 0 at t=0.1 ; at 80 bpm, spb=0.75. Advance through beats 0..3.
		tick(deps, 0.1);
		expect(controller.view.status).toBe('count-in');
		tick(deps, 0.75 * 3);
		// now ~ 0.1 + 2.25 = 2.35 ; beat 3 emitted (lookahead). Still count-in until beat 4 schedules a prompt.
		expect(controller.view.status).toBe('count-in');

		tick(deps, 0.75);
		// beat 4 → first locate prompt
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.promptBeatIndex).toBe(4);
		expect(controller.view.targetBeatIndex).toBe(8);
		expect(controller.view.prompt?.primary).toBe('F');
	});

	it('exposes fractional nowBeat from the clock and beatTime(0)', async () => {
		const controller = make(planWith([locateItem()]), deps);
		await controller.start();
		tick(deps, 0.1 + 0.75);
		// clock at 0.85, beat 0 at 0.1 → (0.85-0.1)/0.75 = 1
		expect(controller.timeline.nowBeat()).toBeCloseTo(1, 5);
	});

	it('pause discards the in-progress item without recording', async () => {
		const controller = make(
			planWith([locateItem(), locateItem({ item: { string: 3, pitch: 'C' } })]),
			deps
		);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.promptBeatIndex).toBe(4);

		controller.pause();
		expect(controller.view.status).toBe('paused');
		expect(deps.metronome.isRunning()).toBe(false);
		expect(await deps.attempts.all()).toHaveLength(0);

		controller.resume();
		expect(controller.view.status).toBe('count-in');
		tick(deps, 0.1 + 0.75 * 4);
		// discarded first item ; second item is now current
		expect(controller.view.prompt?.primary).toBe('C');
	});

	it('quit stops audio and marks finished', async () => {
		const controller = make(planWith([locateItem()]), deps);
		await controller.start();
		controller.quit();
		expect(controller.view.status).toBe('finished');
		expect(deps.metronome.isRunning()).toBe(false);
		expect(deps.detector.running).toBe(false);
	});

	it('stores the calibrated latency with the session', async () => {
		await deps.settings.update({ calibrationOffsetMs: 42 });
		const controller = make(planWith([locateItem()]), deps);
		await controller.start();
		expect((await deps.sessions.get('sess-1'))?.latencyMs).toBe(42);
		controller.quit();
		await vi.waitFor(async () =>
			expect((await deps.sessions.get('sess-1'))?.endedAt).not.toBeNull()
		);
		expect((await deps.sessions.get('sess-1'))?.latencyMs).toBe(42);
	});

	it('keeps its own latency when a new series starts before the session record is final', async () => {
		await deps.settings.update({ calibrationOffsetMs: 42 });
		const controller = make(planWith([locateItem()]), deps);
		await controller.start();
		// The final record is read late: the new series is up before it is written.
		let release!: () => void;
		const gate = new Promise<void>((resolve) => (release = resolve));
		const get = deps.sessions.get.bind(deps.sessions);
		deps.sessions.get = async (id: string) => {
			await gate;
			return get(id);
		};
		controller.quit();
		await deps.settings.update({ calibrationOffsetMs: 99 });
		await controller.start();
		release();
		await vi.waitFor(async () =>
			expect((await deps.sessions.get('sess-1'))?.endedAt).not.toBeNull()
		);
		expect((await deps.sessions.get('sess-1'))?.latencyMs).toBe(42);
	});

	it('stores a zero latency when the input is not calibrated', async () => {
		const controller = make(planWith([locateItem()]), deps);
		await controller.start();
		expect((await deps.sessions.get('sess-1'))?.latencyMs).toBe(0);
	});

	it('stores the executions at start and keeps them after the progression changes', async () => {
		const at100: Execution[] = [
			{ exerciseId: 'locate-neck', tempoBpm: 100 },
			{ exerciseId: 'identify-neck', tempoBpm: null }
		];
		await deps.progressions.put(progression(100));
		const controller = make(planFromProgression([locateItem()], deps), deps);
		await controller.start();
		expect((await deps.sessions.get('sess-1'))?.executions).toEqual(at100);

		await deps.progressions.put(progression(120));
		controller.quit();
		for (let i = 0; i < 8; i++) await Promise.resolve();

		const ended = await deps.sessions.get('sess-1');
		expect(ended?.executions).toEqual(at100);
		expect(ended?.endedAt).not.toBeNull();
	});

	it('keeps the closing session executions when restart begins before finish persists', async () => {
		await deps.progressions.put(progression(100));
		const controller = make(planFromProgression([locateItem()], deps), deps);
		await controller.start();
		expect((await deps.sessions.get('sess-1'))?.executions[0].tempoBpm).toBe(100);

		controller.quit();
		await deps.progressions.put(progression(120));
		await controller.start();
		for (let i = 0; i < 8; i++) await Promise.resolve();

		const ended = await deps.sessions.get('sess-1');
		expect(ended?.executions[0].tempoBpm).toBe(100);
		expect(ended?.endedAt).not.toBeNull();
		expect((await deps.sessions.get(controller.sessionId))?.executions[0].tempoBpm).toBe(120);
	});

	it('starts again from the first item after the series is finished', async () => {
		const controller = make(
			planWith([locateItem(), locateItem({ item: { string: 3, pitch: 'C' } })]),
			deps
		);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.prompt?.primary).toBe('F');
		controller.view.history = [{ beatIndex: 6, verdict: 'perfect' }];

		controller.quit();
		expect(controller.view.status).toBe('finished');

		await controller.start();
		for (let i = 0; i < 8; i++) await Promise.resolve();

		expect(controller.view.status).toBe('count-in');
		expect(controller.view.history).toEqual([]);
		expect(deps.metronome.isRunning()).toBe(true);
		expect(controller.sessionId).not.toBe('sess-1');
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.prompt?.primary).toBe('F');
		expect((await deps.sessions.get('sess-1'))?.endedAt).not.toBeNull();
		expect((await deps.sessions.get(controller.sessionId))?.endedAt).toBeNull();
	});
});

describe('SessionController locate judgement', () => {
	it('judges the first note inside the window and ignores later notes', async () => {
		const deps = createDeps();
		const controller = make(planWith([locateItem({ leadBeats: 4 })]), deps);
		await controller.start();
		// Reach prompt beat 4 ; target beat 6. spb=0.75, firstBeat=0.1
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.promptBeatIndex).toBe(4);
		expect(controller.view.targetBeatIndex).toBe(8);

		const targetTime = deps.metronome.beatTime(8);
		// Perfect F on B string = MIDI 65
		deps.detector.emitNote({
			time: targetTime,
			midi: 65,
			frequencyHz: 349.23,
			clarity: 0.95
		});
		expect(controller.view.status).toBe('verdict');
		expect(controller.view.lastVerdict?.verdict).toBe('perfect');
		expect(deps.cues.played.map((p) => p.verdict)).toEqual(['perfect']);

		deps.detector.emitNote({
			time: targetTime + 0.05,
			midi: 67,
			frequencyHz: 392,
			clarity: 0.95
		});
		expect(controller.view.lastVerdict?.verdict).toBe('perfect');
		expect(deps.cues.played).toHaveLength(1);
	});

	it('does not settle the round on an unreadable observation', async () => {
		const deps = createDeps();
		const controller = make(planWith([locateItem({ leadBeats: 4 })]), deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.status).toBe('awaiting');
		deps.detector.emitRejection({
			time: deps.metronome.beatTime(8),
			reason: 'no-pitch',
			attack: { frequencyHz: 0, clarity: 0.2 },
			sustain: { frequencyHz: 0, clarity: 0.1 }
		});
		expect(controller.view.status).toBe('awaiting');
		expect(deps.cues.played).toEqual([]);
		expect(await deps.attempts.listBySession(controller.sessionId)).toEqual([]);
	});

	it('judges a right note just past the window as off beat', async () => {
		const deps = createDeps();
		const controller = make(planWith([locateItem({ leadBeats: 4 })]), deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		const closesAt = deps.metronome.beatTime(8) + 0.4;
		deps.detector.emitNote({
			time: closesAt + 0.05,
			midi: 65,
			frequencyHz: 349.23,
			clarity: 0.95
		});
		expect(controller.view.lastVerdict?.verdict).toBe('offbeat');
		expect(controller.view.lastVerdict?.correction).toBeNull();
	});
});

describe('SessionController audio input', () => {
	function named(name: string): Error {
		const error = new Error('Constraints could not be satisfied.');
		error.name = name;
		return error;
	}

	it('starts on the default input when the remembered one is gone', async () => {
		const deps = createDeps();
		await deps.settings.update({ inputDeviceId: 'from-a-backup' });
		const start = deps.detector.start.bind(deps.detector);
		deps.detector.start = async (deviceId) => {
			if (deviceId !== null) throw named('OverconstrainedError');
			await start(deviceId);
		};
		const controller = make(planWith([locateItem()]), deps);
		await controller.start();
		expect(controller.view.status).toBe('count-in');
		expect(controller.view.audioError).toBeNull();
		expect((await deps.settings.get()).inputDeviceId).toBeNull();
	});

	it('shows a message instead of failing when no input opens, and starts again later', async () => {
		const deps = createDeps();
		const start = deps.detector.start.bind(deps.detector);
		deps.detector.start = async () => {
			throw named('NotAllowedError');
		};
		const controller = make(planWith([locateItem()]), deps);
		await expect(controller.start()).resolves.toBeUndefined();
		expect(controller.view).toMatchObject({ status: 'idle', audioError: 'input' });
		expect(deps.metronome.isRunning()).toBe(false);

		deps.detector.start = start;
		await controller.start();
		expect(controller.view).toMatchObject({ status: 'count-in', audioError: null });
	});
});

describe('SessionController two-step prompt', () => {
	it('shows the string a beat before the note, spelled the same once the note appears', async () => {
		const deps = createDeps();
		const draws = [0.9, 0.1, 0.9, 0.1];
		deps.random = () => draws.shift() ?? 0;
		const controller = make(
			planWith([locateItem({ item: { string: 2, pitch: 'F#' }, leadBeats: 4 })]),
			deps
		);
		await controller.start();
		atBeat(deps, 2);
		expect(controller.view.preview).toBeNull();
		atBeat(deps, 3);
		expect(controller.view).toMatchObject({ status: 'count-in', prompt: null });
		expect(controller.view.preview).toMatchObject({ secondary: 'corde de B', primary: 'Gb' });
		atBeat(deps, 4);
		expect(controller.view.prompt?.primary).toBe('Gb');
		expect(controller.view.preview).toBeNull();
	});

	it('draws the string of a prompt that carries the aid', async () => {
		const deps = createDeps();
		const controller = make(planWith([locateItem({ leadBeats: 4, stringAid: true })]), deps);
		await controller.start();
		atBeat(deps, 3);
		expect(controller.view.preview?.diagram).toEqual({ string: 2, label: 'B' });
		atBeat(deps, 4);
		expect(controller.view.prompt?.diagram).toEqual({ string: 2, label: 'B' });
	});

	it('never previews a screen prompt', async () => {
		const deps = createDeps();
		const controller = make(planWith([identifyItem()]), deps);
		await controller.start();
		atBeat(deps, 3);
		expect(controller.view.preview).toBeNull();
	});
});

/** Right or wrong answers, in order: `hits` right ones, then `misses` wrong ones. */
function answers(hits: number, misses = 0): boolean[] {
	return [...Array<boolean>(hits).fill(true), ...Array<boolean>(misses).fill(false)];
}

/**
 * Starts the controller and answers each prompt in turn, right or wrong, until it finishes:
 * F on the B string on the guitar (MIDI 65, wrong 60), F (wrong C) on the screen.
 */
async function playThrough(
	controller: SessionController,
	deps: ReturnType<typeof createDeps>,
	rights: boolean[]
) {
	await controller.start();
	let n = 0;
	let guard = 0;
	while (controller.view.status !== 'finished' && guard++ < 2000) {
		if (controller.view.status === 'awaiting') {
			const right = rights[n++] ?? true;
			if (controller.view.scene === 'guitar') {
				deps.detector.emitNote({
					time: deps.metronome.beatTime(controller.view.targetBeatIndex!),
					midi: right ? 65 : 60,
					frequencyHz: 300,
					clarity: 0.95
				});
			} else {
				controller.answer(right ? 'F' : 'C');
			}
			await drain();
		}
		tick(deps, deps.metronome.secondsPerBeat());
	}
	await drain();
}

describe('SessionController tempo between sessions', () => {
	function locateItems(count: number): PlannedItem[] {
		return Array.from({ length: count }, () => locateItem({ leadBeats: 4 }));
	}

	function at(tempoBpm: number): Execution[] {
		return [
			{ exerciseId: 'locate-neck', tempoBpm },
			{ exerciseId: 'identify-neck', tempoBpm: null }
		];
	}

	it('speeds the next learn session up after more than 90 % right', async () => {
		const deps = createDeps();
		await playThrough(make(planWith(locateItems(10)), deps), deps, answers(10));
		expect(await deps.progressions.get('locate-neck')).toMatchObject({
			mechanic: 'locate',
			tempoBpm: 85
		});
		expect((await deps.sessions.get('sess-1'))?.executions).toEqual(EXECUTIONS);
	});

	it('slows the next learn session down under 70 %, never below 80 bpm', async () => {
		const faster = createDeps();
		await playThrough(
			make(planWith(locateItems(10), 'learn', at(100)), faster),
			faster,
			answers(6, 4)
		);
		expect((await faster.progressions.get('locate-neck'))?.tempoBpm).toBe(95);

		const slowest = createDeps();
		await playThrough(make(planWith(locateItems(10)), slowest), slowest, answers(6, 4));
		expect(await slowest.progressions.all()).toEqual([]);
	});

	it('leaves the tempo alone after free play', async () => {
		const deps = createDeps();
		await playThrough(make(planWith(locateItems(10), 'free'), deps), deps, answers(10));
		expect(await deps.progressions.all()).toEqual([]);
	});

	it('writes no progression after a learn session of fewer than ten locate prompts', async () => {
		const deps = createDeps();
		await playThrough(make(planWith(locateItems(9)), deps), deps, answers(9));
		expect(await deps.progressions.all()).toEqual([]);
	});

	it('moves the locate tempo on locate attempts only', async () => {
		// Counted together, 10 right notes and 10 wrong names (50 %) would slow down to 95.
		const deps = createDeps();
		const items = [...locateItems(10), ...Array.from({ length: 10 }, () => identifyItem())];
		await playThrough(make(planWith(items, 'learn', at(100)), deps), deps, answers(10, 10));
		expect(await deps.progressions.all()).toEqual([
			{
				exerciseId: 'locate-neck',
				mechanic: 'locate',
				tempoBpm: 105,
				updatedAt: expect.any(Number)
			}
		]);
	});

	it('starts a new series at the tempo the previous series reached', async () => {
		const deps = createDeps();
		const controller = make(planFromProgression(locateItems(10), deps), deps);
		await playThrough(controller, deps, answers(10));
		expect(controller.view.status).toBe('finished');

		await controller.start();
		expect(deps.metronome.getTempo()).toBe(85);
		expect(controller.view.tempoBpm).toBe(85);
		expect((await deps.sessions.get(controller.sessionId))?.executions[0].tempoBpm).toBe(85);
	});
});

describe('SessionController late capture', () => {
	function note(deps: ReturnType<typeof createDeps>, time: number, midi = 65) {
		deps.detector.emitNote({ time, midi, frequencyHz: 349.23, clarity: 0.95 });
	}

	it('keeps listening after the window and turns a right note into off beat', async () => {
		const deps = createDeps();
		const controller = make(planWith([locateItem({ leadBeats: 4 })]), deps);
		await controller.start();
		atBeat(deps, 9);
		// Still listening: the right position stays hidden, or reading it would answer.
		expect(controller.view.lastVerdict).toMatchObject({ verdict: 'wrong', correction: null });
		await drain();
		expect(await deps.attempts.all()).toHaveLength(0);

		note(deps, deps.metronome.beatTime(8) + 1.2);
		await drain();
		expect(controller.view.lastVerdict).toMatchObject({ verdict: 'offbeat', offsetMs: 1200 });
		expect(controller.view.history.at(-1)).toEqual({ beatIndex: 8, verdict: 'offbeat' });
		expect(deps.cues.played.map((cue) => cue.verdict)).toEqual(['wrong', 'offbeat']);
		const attempts = await deps.attempts.all();
		expect(attempts).toHaveLength(1);
		expect(attempts[0]).toMatchObject({ correct: true, verdict: 'offbeat', timingOffsetMs: 1200 });

		note(deps, deps.metronome.beatTime(8) + 1.5, 60);
		await drain();
		expect(await deps.attempts.all()).toHaveLength(1);
	});

	it('keeps a wrong first note after the window wrong, with the note played', async () => {
		const deps = createDeps();
		const controller = make(planWith([locateItem({ leadBeats: 4 })]), deps);
		await controller.start();
		atBeat(deps, 9);
		note(deps, deps.metronome.beatTime(8) + 1, 60);
		note(deps, deps.metronome.beatTime(8) + 1.2, 65);
		await drain();
		expect(controller.view.lastVerdict?.verdict).toBe('wrong');
		const [attempt] = await deps.attempts.all();
		expect(attempt).toMatchObject({
			correct: false,
			verdict: 'wrong',
			data: { answer: { midi: 60 } }
		});
		expect(await deps.attempts.all()).toHaveLength(1);
	});

	it('records no answer once the capture ends, before the next prompt', async () => {
		const deps = createDeps();
		const controller = make(
			planWith([
				locateItem({ leadBeats: 4 }),
				locateItem({ item: { string: 3, pitch: 'C' }, leadBeats: 4 })
			]),
			deps
		);
		await controller.start();
		atBeat(deps, 10);
		await drain();
		expect(await deps.attempts.all()).toHaveLength(0);
		// Beat 11 shows the string of the next prompt: the capture is over by then.
		atBeat(deps, 11);
		await drain();
		const [attempt] = await deps.attempts.all();
		expect(attempt).toMatchObject({ data: { answer: null }, correct: false, verdict: 'wrong' });
		expect(controller.view.lastVerdict?.correction).toBe('corde de B, case 6');
		expect(deps.cues.played.map((cue) => cue.verdict)).toEqual(['wrong']);
		expect(controller.view.preview?.secondary).toBe('corde de G');
		atBeat(deps, 12);
		expect(controller.view).toMatchObject({ status: 'awaiting', promptBeatIndex: 12 });
	});

	it('keeps the miss when paused or quit while still listening', async () => {
		for (const stop of ['pause', 'quit'] as const) {
			const deps = createDeps();
			const controller = make(planWith([locateItem({ leadBeats: 4 })]), deps);
			await controller.start();
			atBeat(deps, 9);
			controller[stop]();
			await drain();
			const attempts = await deps.attempts.all();
			expect(attempts).toHaveLength(1);
			expect(attempts[0]).toMatchObject({ data: { answer: null }, verdict: 'wrong' });
		}
	});

	it('ignores a note before the prompt or in its first 300 ms', async () => {
		const deps = createDeps();
		const controller = make(planWith([locateItem({ leadBeats: 4 })]), deps);
		await controller.start();
		atBeat(deps, 4);
		const promptTime = deps.metronome.beatTime(4);
		note(deps, promptTime - 0.2);
		note(deps, promptTime + 0.2);
		expect(controller.view.status).toBe('awaiting');
		note(deps, deps.metronome.beatTime(8));
		expect(controller.view.lastVerdict?.verdict).toBe('perfect');
	});

	it('closes the capture at the next prompt at 160 bpm and never hands its note on', async () => {
		const deps = createDeps();
		const controller = make(
			planWith(
				[
					locateItem({ leadBeats: 4 }),
					locateItem({ item: { string: 3, pitch: 'C' }, leadBeats: 4 })
				],
				'learn',
				[
					{ exerciseId: 'locate-neck', tempoBpm: 160 },
					{ exerciseId: 'identify-neck', tempoBpm: null }
				]
			),
			deps
		);
		await controller.start();
		atBeat(deps, 12);
		await drain();
		expect(controller.view).toMatchObject({ status: 'awaiting', promptBeatIndex: 12 });
		const [first] = await deps.attempts.all();
		expect(first.data).toMatchObject({ answer: null });
		// Played as the next prompt appears: too late for the last one, too early for this one.
		note(deps, deps.metronome.beatTime(12) + 0.05, 60);
		expect(controller.view.status).toBe('awaiting');
		expect(await deps.attempts.all()).toHaveLength(1);
	});
});

describe('SessionController window close and sequencing', () => {
	it('closes the window on the first beat at or after closesAt', async () => {
		const deps = createDeps();
		const controller = make(planWith([locateItem({ leadBeats: 4 })]), deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.status).toBe('awaiting');
		// target beat 8 at 0.1+6=6.1 ; closesAt = 6.1+0.4 = 6.5 ; beat 9 at 6.85 >= 6.5 → close
		atBeat(deps, 8);
		expect(controller.view.status).toBe('awaiting');
		atBeat(deps, 9);
		expect(controller.view.status).toBe('verdict');
		expect(controller.view.lastVerdict?.verdict).toBe('wrong');
		expect(controller.view.lastVerdict?.reactionMs).toBeNull();
	});

	it('starts the next item at least one beat after the verdict', async () => {
		const deps = createDeps();
		const controller = make(
			planWith([
				locateItem({ leadBeats: 4 }),
				locateItem({
					item: { string: 3, pitch: 'C' },
					leadBeats: 4
				})
			]),
			deps
		);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.promptBeatIndex).toBe(4);
		const targetTime = deps.metronome.beatTime(8);
		deps.detector.emitNote({
			time: targetTime,
			midi: 65,
			frequencyHz: 349.23,
			clarity: 0.95
		});
		expect(controller.view.status).toBe('verdict');
		// Target on beat 8: the next prompt breathes until beat 12, the next bar.
		atBeat(deps, 11);
		expect(controller.view.status).toBe('count-in');
		expect(controller.view.lastVerdict?.verdict).toBe('perfect');
		atBeat(deps, 12);
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.promptBeatIndex).toBe(12);
		expect(controller.view.targetBeatIndex).toBe(16);
		expect(controller.view.prompt?.primary).toBe('C');
	});

	it('lands a two-beat target on the first beat of a bar, prompted on beat 3', async () => {
		const deps = createDeps();
		const controller = make(
			planWith([
				locateItem({ leadBeats: 2 }),
				locateItem({ item: { string: 3, pitch: 'C' }, leadBeats: 2 })
			]),
			deps
		);
		await controller.start();
		atBeat(deps, 5);
		expect(controller.view.status).toBe('count-in');
		atBeat(deps, 6);
		expect(controller.view).toMatchObject({
			status: 'awaiting',
			promptBeatIndex: 6,
			targetBeatIndex: 8
		});
		playRight(deps, controller);
		atBeat(deps, 13);
		expect(controller.view.status).toBe('count-in');
		atBeat(deps, 14);
		expect(controller.view).toMatchObject({ promptBeatIndex: 14, targetBeatIndex: 16 });
	});

	it('prompts an eight-beat target on beat 1, two bars ahead', async () => {
		const deps = createDeps();
		const controller = make(planWith([locateItem({ leadBeats: 8 })]), deps);
		await controller.start();
		atBeat(deps, 4);
		expect(controller.view).toMatchObject({ promptBeatIndex: 4, targetBeatIndex: 12 });
	});

	it('shows the right position after a wrong note, and nothing after a right one', async () => {
		const deps = createDeps();
		const controller = make(
			planWith([
				locateItem({ item: { string: 6, pitch: 'A' } }),
				locateItem({ item: { string: 6, pitch: 'A' } })
			]),
			deps
		);
		await controller.start();
		atBeat(deps, 4);
		deps.detector.emitNote({
			time: deps.metronome.beatTime(8),
			midi: 40,
			frequencyHz: 82.4,
			clarity: 0.95
		});
		expect(controller.view.lastVerdict?.correction).toBe('corde de E grave, case 5');
		atBeat(deps, 12);
		deps.detector.emitNote({
			time: deps.metronome.beatTime(16),
			midi: 45,
			frequencyHz: 110,
			clarity: 0.95
		});
		expect(controller.view.lastVerdict).toMatchObject({ verdict: 'perfect', correction: null });
	});
});

function identifyItem(overrides: Partial<PlannedItem> = {}): PlannedItem {
	return {
		exerciseId: 'identify-neck',
		mechanic: 'identify',
		item: { string: 5, fret: 8 },
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: null,
		...overrides
	};
}

describe('SessionController identify', () => {
	it('keeps locate items before identify items and answers via answer()', async () => {
		const deps = createDeps();
		const controller = make(planWith([locateItem({ leadBeats: 4 }), identifyItem()]), deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.scene).toBe('guitar');
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.prompt).not.toBeNull();

		const targetTime = deps.metronome.beatTime(8);
		deps.detector.emitNote({
			time: targetTime,
			midi: 65,
			frequencyHz: 349.23,
			clarity: 0.95
		});
		// Decided on beat 9; switching to the screen counts a bar: prompt on beat 13.
		atBeat(deps, 12);
		expect(controller.view.status).toBe('count-in');
		atBeat(deps, 13);
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.scene).toBe('screen');
		expect(controller.view.promptBeatIndex).toBeNull();
		expect(controller.view.targetBeatIndex).toBeNull();
		expect(controller.view.answerChoices).toHaveLength(12);

		controller.answer('F');
		expect(controller.view.status).toBe('verdict');
		expect(controller.view.lastVerdict?.verdict).toBe('perfect');
		expect(deps.cues.played.at(-1)?.verdict).toBe('perfect');

		// Hold until next beat — no setTimeout
		expect(controller.view.status).toBe('verdict');
		tick(deps, 0.75);
		expect(controller.view.status).toBe('finished');
	});

	it('silences the click while a note name is being chosen', async () => {
		const deps = createDeps();
		const controller = make(planWith([identifyItem(), locateItem({ leadBeats: 4 })]), deps);
		await controller.start();
		expect(deps.metronome.audible).toBe(false);

		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.scene).toBe('screen');
		expect(deps.metronome.isRunning()).toBe(true);
		expect(deps.metronome.audible).toBe(false);

		controller.answer('C');
		expect(controller.view.status).toBe('verdict');
		expect(deps.metronome.audible).toBe(false);

		tick(deps, 0.75);
		expect(controller.view.status).toBe('count-in');
		expect(deps.metronome.audible).toBe(true);
		atBeat(deps, 12);
		expect(controller.view.scene).toBe('guitar');
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.prompt).not.toBeNull();
		expect(deps.metronome.audible).toBe(true);
	});

	it('counts the bar down to a prompt pushed to beat 3 by a two-beat lead', async () => {
		const deps = createDeps();
		const controller = make(planWith([locateItem({ leadBeats: 2 })]), deps);
		await controller.start();
		const counts: (number | null)[] = [];
		for (let beat = 0; beat < 6; beat++) {
			atBeat(deps, beat);
			counts.push(controller.view.countdown);
		}
		expect(counts).toEqual([null, null, 4, 3, 2, 1]);
		atBeat(deps, 6);
		expect(controller.view.status).toBe('awaiting');
	});

	it('counts the first bar down, 4 to 1, then shows the prompt', async () => {
		const deps = createDeps();
		const controller = make(planWith([locateItem()]), deps);
		await controller.start();
		const counts: (number | null)[] = [];
		tick(deps, 0.1);
		counts.push(controller.view.countdown);
		for (let i = 0; i < 3; i++) {
			tick(deps, 0.75);
			counts.push(controller.view.countdown);
		}
		expect(counts).toEqual([4, 3, 2, 1]);
		tick(deps, 0.75);
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.countdown).toBeNull();
	});

	it('counts a clicked bar down before a guitar prompt that follows a screen prompt', async () => {
		const deps = createDeps();
		const controller = make(planWith([identifyItem(), locateItem({ leadBeats: 4 })]), deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.scene).toBe('screen');
		controller.answer('C');
		// Answered on beat 4, decided on beat 5: the bar counts down to the aligned beat 12.
		atBeat(deps, 5);
		expect(controller.view).toMatchObject({
			status: 'count-in',
			scene: 'guitar',
			countdown: null,
			prompt: null,
			answerChoices: null
		});
		expect(controller.view.lastVerdict?.correction).toBe('F');
		expect(deps.metronome.audible).toBe(true);
		atBeat(deps, 8);
		expect(controller.view).toMatchObject({ countdown: 4, lastVerdict: null });
		atBeat(deps, 11);
		expect(controller.view.countdown).toBe(1);
		atBeat(deps, 12);
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.scene).toBe('guitar');
	});

	it('brings the answer pad in during a silent bar before a screen prompt', async () => {
		const deps = createDeps();
		const controller = make(planWith([locateItem({ leadBeats: 4 }), identifyItem()]), deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.scene).toBe('guitar');
		deps.detector.emitNote({
			time: deps.metronome.beatTime(8),
			midi: 65,
			frequencyHz: 349.23,
			clarity: 0.95
		});
		atBeat(deps, 9);
		expect(controller.view).toMatchObject({
			status: 'count-in',
			scene: 'screen',
			countdown: 4,
			lastVerdict: null
		});
		expect(controller.view.answerChoices).toHaveLength(12);
		expect(deps.metronome.audible).toBe(false);
		atBeat(deps, 13);
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.scene).toBe('screen');
	});

	it('counts a bar down before a sequence at another lead', async () => {
		const deps = createDeps();
		const controller = make(
			planWith([
				locateItem({ leadBeats: 4 }),
				locateItem({
					item: { string: 3, pitch: 'C' },
					leadBeats: 8,
					countIn: true
				})
			]),
			deps
		);
		await controller.start();
		atBeat(deps, 4);
		playRight(deps, controller);
		// Decided on beat 9: the count needs a bar, the 8-beat prompt waits for beat 16.
		atBeat(deps, 11);
		expect(controller.view).toMatchObject({ status: 'count-in', countdown: null });
		expect(controller.view.lastVerdict?.verdict).toBe('perfect');
		atBeat(deps, 12);
		expect(controller.view).toMatchObject({ countdown: 4, lastVerdict: null });
		atBeat(deps, 16);
		expect(controller.view).toMatchObject({
			status: 'awaiting',
			promptBeatIndex: 16,
			targetBeatIndex: 24
		});
	});

	it('opens a screen-first session on the answer pad, counted in silence', async () => {
		const deps = createDeps();
		const controller = make(planWith([identifyItem()]), deps);
		await controller.start();
		expect(controller.view.scene).toBe('screen');
		expect(deps.metronome.audible).toBe(false);
		tick(deps, 0.1);
		expect(controller.view.countdown).toBe(4);
	});

	it('sets the stage for the first prompt as soon as start is clicked', async () => {
		const deps = createDeps();
		deps.detector.start = () => new Promise<void>(() => {});
		const controller = make(planWith([identifyItem()]), deps);
		void controller.start();
		await drain();
		expect(controller.view.scene).toBe('screen');
		expect(controller.view.answerChoices).toHaveLength(12);
	});

	it('counts back in on the stage of the next prompt after a pause', async () => {
		const deps = createDeps();
		const controller = make(planWith([locateItem({ leadBeats: 4 }), identifyItem()]), deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.status).toBe('awaiting');
		controller.pause();
		controller.resume();
		expect(controller.view).toMatchObject({
			status: 'count-in',
			scene: 'screen',
			lastVerdict: null
		});
		expect(deps.metronome.audible).toBe(false);
		tick(deps, 0.1);
		expect(controller.view.countdown).toBe(4);
		tick(deps, 0.75 * 4);
		expect(controller.view.scene).toBe('screen');
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.prompt).not.toBeNull();
	});

	it('adds no bar between two prompts in the same direction', async () => {
		const deps = createDeps();
		const controller = make(planWith([identifyItem(), identifyItem()]), deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		controller.answer('F');
		tick(deps, 0.75);
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.countdown).toBeNull();
	});

	it('ignores answer() outside awaiting and ignores guitar notes in identify', async () => {
		const deps = createDeps();
		const controller = make(planWith([identifyItem()]), deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		deps.detector.emitNote({
			time: deps.clock.now(),
			midi: 65,
			frequencyHz: 349.23,
			clarity: 0.95
		});
		expect(controller.view.status).toBe('awaiting');
		controller.answer('C');
		expect(controller.view.lastVerdict?.verdict).toBe('wrong');
		controller.answer('F');
		expect(controller.view.lastVerdict?.verdict).toBe('wrong');
	});

	it('stores nothing when paused or quit before a name is tapped', async () => {
		for (const stop of ['pause', 'quit'] as const) {
			const deps = createDeps();
			const controller = make(planWith([identifyItem()]), deps);
			await controller.start();
			tick(deps, 0.1 + 0.75 * 4);
			expect(controller.view.status).toBe('awaiting');
			controller[stop]();
			await drain();
			expect(await deps.attempts.all()).toEqual([]);
		}
	});
});

describe('SessionController wiring', () => {
	it('names a mechanic without a presenter', async () => {
		const deps = { ...createDeps(), mechanics: {} };
		const controller = make(planWith([locateItem()]), deps);
		await expect(controller.start()).rejects.toThrow('No presenter for mechanic: locate');
	});

	it('names a sensor without a factory', async () => {
		const deps = { ...createDeps(), sensors: {} };
		const controller = make(planWith([locateItem()]), deps);
		await expect(controller.start()).rejects.toThrow('No factory for sensor: note');
	});

	it('refuses a session whose executions run at two tempos', async () => {
		const deps = createDeps();
		const executions: Execution[] = [
			{ exerciseId: 'locate-neck', tempoBpm: 100 },
			{ exerciseId: 'locate-g', tempoBpm: 120 }
		];
		const controller = make(planWith([locateItem()], 'learn', executions), deps);
		await expect(controller.start()).rejects.toThrow(/decision 4/);
	});
});

describe('SessionController persistence', () => {
	it('records each attempt with its exercise and tempo', async () => {
		const deps = createDeps();
		const controller = make(planWith([locateItem(), identifyItem()]), deps);
		await playThrough(controller, deps, answers(2));
		const attempts = await deps.attempts.all();
		expect(attempts).toHaveLength(2);
		expect(attempts[0]).toMatchObject({
			exerciseId: 'locate-neck',
			mechanic: 'locate',
			tempoBpm: 80
		});
		expect(attempts[1]).toMatchObject({
			exerciseId: 'identify-neck',
			mechanic: 'identify',
			tempoBpm: null
		});
	});

	it('records a cold locate attempt with confusion on a wrong pitch', async () => {
		const deps = createDeps();
		await deps.cards.put(introduceCard(F_ON_B, deps.now(), 'sess-1', beatTiming));
		const controller = make(planWith([locateItem({ leadBeats: 4 })]), deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		const targetTime = deps.metronome.beatTime(8);
		// F# = MIDI 66 on B string near F
		deps.detector.emitNote({
			time: targetTime,
			midi: 66,
			frequencyHz: 370,
			clarity: 0.95
		});
		await drain();
		const attempts = await deps.attempts.listBySession('sess-1');
		expect(attempts).toHaveLength(1);
		expect(attempts[0].correct).toBe(false);
		expect(attempts[0].data).toMatchObject({
			confusion: classifyNoteConfusion(F_ON_B.item, 66)
		});
		expect(attempts[0].verdict).toBe('wrong');
	});
});

/** List selector that records what the controller passes it. */
function spySelector(items: PlannedItem[]) {
	const list = createListSelector(items);
	const contexts: { now: number; elapsedMs: number; fatigued: boolean }[] = [];
	const recorded: Attempt[] = [];
	const changed: CardState[] = [];
	let outcome: ReturnType<SessionSelector['record']> = null;
	const selector: SessionSelector = {
		next(context) {
			contexts.push(context);
			return list.next(context);
		},
		record(attempt) {
			recorded.push(attempt);
			return outcome;
		},
		cardChanged(card) {
			changed.push(card);
		}
	};
	return {
		selector,
		contexts,
		recorded,
		changed,
		learnOnRecord(value: ReturnType<SessionSelector['record']>) {
			outcome = value;
		}
	};
}

function withSelector(selector: SessionSelector, deps: SessionDeps, kind: SessionKind = 'learn') {
	return new SessionController(
		{ id: 'sess-1', kind },
		async () => ({ selector, executions: EXECUTIONS }),
		deps
	);
}

async function drain() {
	for (let i = 0; i < 20; i++) await Promise.resolve();
}

/** Plays the right note on the current locate prompt (F on string 2 = MIDI 65). */
function playRight(deps: ReturnType<typeof createDeps>, controller: SessionController) {
	deps.detector.emitNote({
		time: deps.metronome.beatTime(controller.view.targetBeatIndex!),
		midi: 65,
		frequencyHz: 349,
		clarity: 0.95
	});
}

describe('SessionController fatigue', () => {
	it('marks fatigue and tells the selector', async () => {
		const deps = createDeps();
		const items: PlannedItem[] = Array.from({ length: 14 }, () =>
			locateItem({ phase: 'review', leadBeats: 4 })
		);
		const spy = spySelector(items);
		const controller = withSelector(spy.selector, deps);
		await controller.start();
		for (let n = 0; n < 12; n++) {
			while (controller.view.status !== 'awaiting' && controller.view.status !== 'finished') {
				tick(deps, 0.75);
			}
			if (controller.view.status === 'finished') break;
			const due = deps.metronome.beatTime(controller.view.targetBeatIndex!);
			const midi = n < 6 ? 65 : 60;
			deps.detector.emitNote({ time: due, midi, frequencyHz: 300, clarity: 0.9 });
			await Promise.resolve();
			tick(deps, 0.75 * 3);
		}
		tick(deps, 0.75 * 2);
		expect(controller.view.fatigueDetected).toBe(true);
		expect(spy.contexts.at(-1)?.fatigued).toBe(true);
	});
});

describe('SessionController with a selector', () => {
	it('asks the selector before each prompt and finishes when it has nothing left', async () => {
		const deps = createDeps();
		const spy = spySelector([locateItem({ leadBeats: 4 }), locateItem({ leadBeats: 4 })]);
		const controller = withSelector(spy.selector, deps);
		await controller.start();
		for (let i = 0; i < 2; i++) {
			while (controller.view.status !== 'awaiting') tick(deps, 0.75);
			playRight(deps, controller);
			await drain();
			tick(deps, 0.75 * 5);
		}
		await drain();
		expect(controller.view.status).toBe('finished');
		expect(spy.contexts).toHaveLength(3);
		expect(spy.contexts[0].elapsedMs).toBeGreaterThanOrEqual(0);
		expect(spy.contexts[1].elapsedMs).toBeGreaterThan(spy.contexts[0].elapsedMs);
		expect(spy.recorded).toHaveLength(2);
	});

	it('stops after the current verdict once five minutes have passed', async () => {
		const deps = createDeps();
		const selector: SessionSelector = {
			next: (context) => (context.elapsedMs >= LEARN_SESSION_MS ? null : locateItem()),
			record: () => null,
			cardChanged: () => {}
		};
		const controller = withSelector(selector, deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.status).toBe('awaiting');
		deps.clock.advance(LEARN_SESSION_MS / 1000);
		playRight(deps, controller);
		await drain();
		expect(controller.view.status).toBe('verdict');
		tick(deps, 0.75 * 2);
		await drain();
		expect(controller.view.status).toBe('finished');
		expect(await deps.attempts.all()).toHaveLength(1);
	});

	it('feeds the attempt to the selector before the attempt is stored', async () => {
		const deps = createDeps();
		deps.attempts.add = () => new Promise<number>(() => {});
		const spy = spySelector([locateItem()]);
		const controller = withSelector(spy.selector, deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		playRight(deps, controller);
		expect(spy.recorded).toHaveLength(1);
		expect(await deps.attempts.all()).toHaveLength(0);
	});

	it('creates the card at the presentation, even after a wrong note', async () => {
		const deps = createDeps();
		const presentation = locateItem({
			phase: 'learning',
			temperature: 'hot',
			aid: 'show-position',
			leadBeats: 4
		});
		const controller = withSelector(spySelector([presentation]).selector, deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		deps.detector.emitNote({
			time: deps.metronome.beatTime(8),
			midi: 60,
			frequencyHz: 262,
			clarity: 0.95
		});
		await drain();
		const card = await deps.cards.get('locate:2:F');
		expect(card?.learnedAt).toBeNull();
		expect(card?.introducedInSession).toBe('sess-1');
	});

	it('stores the card the selector reports as learned', async () => {
		const deps = createDeps();
		await deps.cards.put(introduceCard(F_ON_B, deps.now(), 'old', beatTiming));
		const spy = spySelector([
			locateItem({ phase: 'learning', temperature: 'hot', aid: 'none', leadBeats: 4 })
		]);
		const learned = markLearned(
			introduceCard(F_ON_B, deps.now(), 'old', beatTiming),
			123,
			beatTiming,
			80
		);
		spy.learnOnRecord({ card: learned });
		const controller = withSelector(spy.selector, deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		playRight(deps, controller);
		await drain();
		expect((await deps.cards.get('locate:2:F'))?.learnedAt).toBe(123);
	});

	it('records a missed probe hot and a passed probe cold', async () => {
		const probe = locateItem({ phase: 'probe', temperature: 'cold', aid: 'none', leadBeats: 2 });
		const passed = createDeps();
		const right = withSelector(spySelector([probe]).selector, passed);
		await right.start();
		atBeat(passed, 6);
		playRight(passed, right);
		await drain();
		expect((await passed.attempts.all()).map((a) => a.temperature)).toEqual(['cold']);

		const missed = createDeps();
		const wrong = withSelector(spySelector([probe]).selector, missed);
		await wrong.start();
		atBeat(missed, 6);
		missed.detector.emitNote({
			time: missed.metronome.beatTime(8),
			midi: 60,
			frequencyHz: 262,
			clarity: 0.95
		});
		await drain();
		expect((await missed.attempts.all()).map((a) => a.temperature)).toEqual(['hot']);
	});

	it('stores the card the selector reports for a probe', async () => {
		const deps = createDeps();
		const probe = locateItem({ phase: 'probe', temperature: 'cold', aid: 'none', leadBeats: 4 });
		const spy = spySelector([probe]);
		const known = { ...introduceCard(F_ON_B, deps.now(), 'sess-1', beatTiming), acquiredAt: 456 };
		spy.learnOnRecord({ card: known });
		const controller = withSelector(spy.selector, deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		playRight(deps, controller);
		await drain();
		expect((await deps.cards.get('locate:2:F'))?.acquiredAt).toBe(456);
	});

	it('stores nothing when quitting before a probe is answered', async () => {
		const deps = createDeps();
		const probe = locateItem({ phase: 'probe', temperature: 'cold', aid: 'none', leadBeats: 4 });
		const controller = withSelector(spySelector([probe]).selector, deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.status).toBe('awaiting');
		controller.quit();
		await drain();
		expect(await deps.attempts.all()).toEqual([]);
		expect(await deps.cards.all()).toEqual([]);
	});

	it('counts a cold free-play attempt on a learned card', async () => {
		const deps = createDeps();
		const card = markLearned(
			introduceCard(F_ON_B, -10_000_000, 'old', beatTiming),
			-9_000_000,
			beatTiming,
			80
		);
		await deps.cards.put(card);
		const free = locateItem({ phase: 'free', temperature: 'hot', leadBeats: 4 });
		const spy = spySelector([free]);
		const controller = withSelector(spy.selector, deps, 'free');
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		playRight(deps, controller);
		await drain();
		const [attempt] = await deps.attempts.all();
		expect(attempt.temperature).toBe('cold');
		expect(spy.changed.map((changed) => changed.scheduling.reps)).toEqual([
			card.scheduling.reps + 1
		]);
		expect((await deps.cards.get('locate:2:F'))?.scheduling.reps).toBe(card.scheduling.reps + 1);
	});

	it('keeps free play hot on positions without a learned card', async () => {
		const deps = createDeps();
		const being = introduceCard(
			{ key: 'locate:3:C', mechanic: 'locate', item: { string: 3, pitch: 'C' } },
			-10_000_000,
			'old',
			beatTiming
		);
		await deps.cards.put(being);
		const items = [
			locateItem({ phase: 'free', temperature: 'hot', leadBeats: 4 }),
			locateItem({
				item: { string: 3, pitch: 'C' },
				phase: 'free',
				temperature: 'hot',
				leadBeats: 4
			})
		];
		const controller = withSelector(spySelector(items).selector, deps, 'free');
		await controller.start();
		for (let i = 0; i < 2; i++) {
			while (controller.view.status !== 'awaiting') tick(deps, 0.75);
			deps.detector.emitNote({
				time: deps.metronome.beatTime(controller.view.targetBeatIndex!),
				midi: i === 0 ? 65 : 60,
				frequencyHz: 300,
				clarity: 0.95
			});
			await drain();
			tick(deps, 0.75 * 2);
		}
		await drain();
		const attempts = await deps.attempts.all();
		expect(attempts.map((attempt) => attempt.temperature)).toEqual(['hot', 'hot']);
		expect(await deps.cards.get('locate:2:F')).toBeUndefined();
		expect(await deps.cards.get('locate:3:C')).toEqual(being);
	});

	it('keeps consolidation hot and leaves the card alone', async () => {
		const deps = createDeps();
		const card = markLearned(
			introduceCard(F_ON_B, -10_000_000, 'old', beatTiming),
			-9_000_000,
			beatTiming,
			80
		);
		await deps.cards.put(card);
		const item = locateItem({ phase: 'consolidation', temperature: 'hot', leadBeats: 4 });
		const controller = withSelector(spySelector([item]).selector, deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		playRight(deps, controller);
		await drain();
		expect((await deps.attempts.all())[0].temperature).toBe('hot');
		expect(await deps.cards.get('locate:2:F')).toEqual(card);
	});
});

describe('SessionController observations', () => {
	function note(deps: ReturnType<typeof createDeps>, time: number, midi: number) {
		deps.detector.emitNote({ time, midi, frequencyHz: 349.23, clarity: 0.95 });
	}

	function rejection(deps: ReturnType<typeof createDeps>, time: number) {
		deps.detector.emitRejection({
			time,
			reason: 'no-pitch',
			attack: { frequencyHz: 0, clarity: 0.2 },
			sustain: { frequencyHz: 0, clarity: 0.1 }
		});
	}

	const F_THEN_C = [
		locateItem({ leadBeats: 4 }),
		locateItem({ item: { string: 3, pitch: 'C' }, leadBeats: 4 })
	];

	it('keeps every observation of a prompt with its attempt, completed at the next prompt', async () => {
		const deps = createDeps();
		const controller = make(planWith(F_THEN_C), deps);
		await controller.start();
		atBeat(deps, 4);
		const promptTime = deps.metronome.beatTime(4);
		const targetTime = deps.metronome.beatTime(8);
		note(deps, promptTime + 0.2, 60);
		note(deps, targetTime, 65);
		note(deps, targetTime + 0.05, 67);
		await drain();
		const [written] = await deps.attempts.all();
		expect(written.observations).toEqual([
			{
				atMs: expect.closeTo(200, 6),
				sensor: 'note',
				fate: 'before-window',
				correct: false,
				payload: { midi: 60, frequencyHz: 349.23, clarity: 0.95 }
			},
			{
				atMs: expect.closeTo((targetTime - promptTime) * 1000, 6),
				sensor: 'note',
				fate: 'answer',
				correct: true,
				payload: { midi: 65, frequencyHz: 349.23, clarity: 0.95 }
			}
		]);

		// The breathing bar: the round is over, the next prompt not shown yet.
		atBeat(deps, 11);
		expect(controller.view.status).toBe('count-in');
		note(deps, deps.metronome.beatTime(11), 65);
		rejection(deps, deps.metronome.beatTime(11) + 0.1);
		await drain();
		expect((await deps.attempts.all())[0].observations).toHaveLength(2);

		atBeat(deps, 12);
		await drain();
		const [completed] = await deps.attempts.all();
		expect(completed.observations?.map((o) => [o.fate, o.correct])).toEqual([
			['before-window', false],
			['answer', true],
			['settled', false],
			['settled', true],
			['unreadable', null]
		]);
		expect(completed.observations?.[4]).toMatchObject({
			sensor: 'note',
			payload: { reason: 'no-pitch' }
		});
	});

	it('keeps a note of the first count-in out of every attempt', async () => {
		const deps = createDeps();
		const controller = make(planWith(F_THEN_C), deps);
		await controller.start();
		atBeat(deps, 2);
		note(deps, deps.metronome.beatTime(2), 65);
		atBeat(deps, 4);
		playRight(deps, controller);
		atBeat(deps, 12);
		await drain();
		const [attempt] = await deps.attempts.all();
		expect(attempt.observations?.map((o) => o.fate)).toEqual(['answer']);
	});

	it('gives a note of the counted bar before a change of scene to the previous attempt', async () => {
		const deps = createDeps();
		const controller = make(planWith([locateItem({ leadBeats: 4 }), identifyItem()]), deps);
		await controller.start();
		atBeat(deps, 4);
		playRight(deps, controller);
		atBeat(deps, 11);
		expect(controller.view).toMatchObject({ status: 'count-in', scene: 'screen' });
		note(deps, deps.metronome.beatTime(11), 60);
		atBeat(deps, 13);
		expect(controller.view.status).toBe('awaiting');
		await drain();
		const [attempt] = await deps.attempts.all();
		expect(attempt.observations?.map((o) => [o.sensor, o.fate, o.correct])).toEqual([
			['note', 'answer', true],
			['note', 'settled', false]
		]);
	});

	it('keeps a guitar note played on a screen prompt as another sensor’s, still awaiting the tap', async () => {
		const deps = createDeps();
		const controller = make(planWith([identifyItem()]), deps);
		await controller.start();
		atBeat(deps, 4);
		expect(controller.view.status).toBe('awaiting');
		note(deps, deps.clock.now(), 65);
		expect(controller.view.status).toBe('awaiting');
		controller.answer('F');
		expect(controller.view.lastVerdict?.verdict).toBe('perfect');
		await drain();
		const [attempt] = await deps.attempts.all();
		expect(attempt.observations).toEqual([
			{
				atMs: expect.any(Number),
				sensor: 'note',
				fate: 'other-sensor',
				correct: null,
				payload: { midi: 65, frequencyHz: 349.23, clarity: 0.95 }
			},
			{ atMs: expect.any(Number), sensor: 'tap', fate: 'answer', correct: true, payload: 'F' }
		]);
	});

	it('keeps what came before a pause in the late capture, nothing after the resume', async () => {
		const deps = createDeps();
		const controller = make(planWith(F_THEN_C), deps);
		await controller.start();
		atBeat(deps, 4);
		note(deps, deps.metronome.beatTime(4) + 0.2, 65);
		atBeat(deps, 9);
		expect(controller.view.lastVerdict?.verdict).toBe('wrong');
		rejection(deps, deps.clock.now());
		controller.pause();
		controller.resume();
		atBeat(deps, 1);
		note(deps, deps.metronome.beatTime(1), 65);
		atBeat(deps, 4);
		expect(controller.view.prompt?.primary).toBe('C');
		note(deps, deps.metronome.beatTime(8), 60);
		await drain();
		const [paused, next] = await deps.attempts.all();
		expect(paused.observations?.map((o) => o.fate)).toEqual(['before-window', 'unreadable']);
		expect(next.observations?.map((o) => o.fate)).toEqual(['answer']);
	});

	it('writes the completed observations before the end of the session on quit', async () => {
		const deps = createDeps();
		const write = deps.attempts.setObservations.bind(deps.attempts);
		deps.attempts.setObservations = async (id, observations) => {
			await new Promise((resolve) => setTimeout(resolve, 0));
			return write(id, observations);
		};
		let atEnd: Promise<Attempt[]> | null = null;
		const put = deps.sessions.put.bind(deps.sessions);
		deps.sessions.put = (record) => {
			if (record.endedAt !== null) atEnd = deps.attempts.all();
			return put(record);
		};
		const controller = make(planWith(F_THEN_C), deps);
		await controller.start();
		atBeat(deps, 4);
		playRight(deps, controller);
		atBeat(deps, 10);
		note(deps, deps.metronome.beatTime(10), 60);
		await drain();

		controller.quit();
		// A note heard after quitting answers nothing and is kept nowhere.
		deps.detector.running = true;
		expect(() => note(deps, deps.clock.now(), 65)).not.toThrow();
		await vi.waitFor(async () =>
			expect((await deps.sessions.get('sess-1'))?.endedAt).not.toBeNull()
		);

		const [whenEnded] = await atEnd!;
		expect(whenEnded.observations?.map((o) => o.fate)).toEqual(['answer', 'settled']);
		await drain();
		const attempts = await deps.attempts.all();
		expect(attempts).toHaveLength(1);
		expect(attempts[0].observations).toHaveLength(2);
	});
});

export { createDeps, locateItem, planWith, tick, identifyItem };
