import { describe, expect, it, beforeEach } from 'vitest';
import type { Curriculum, PlannedItem, SessionPlan } from '$lib/domain/types';
import { classifyNoteConfusion } from '$lib/domain/music';
import { introduceCard } from '$lib/domain/progress';
import {
	FakeClock,
	FakeMetronome,
	FakeNoteDetector,
	FakeSoundCues,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository,
	InMemorySessionRepository,
	InMemorySettingsRepository
} from '$lib/testing/fakes';
import type { SessionDeps } from './SessionDeps';
import { SessionController } from './SessionController.svelte';

const emptyCurriculum: Curriculum = [];

function locateItem(overrides: Partial<PlannedItem> = {}): PlannedItem {
	return {
		target: { direction: 'locate', string: 2, pitch: 'F' },
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: 2,
		repeatUntilCorrect: false,
		...overrides
	};
}

function planWith(items: PlannedItem[], kind: SessionPlan['kind'] = 'daily'): SessionPlan {
	return { id: 'sess-1', kind, createdAt: 1_000_000, items };
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
		settings: new InMemorySettingsRepository(),
		curriculum: emptyCurriculum,
		now: () => clock.toEpochMs(clock.now()),
		random: () => 0,
		newId: () => 'id-1'
	};
}

/** Advance audio time and flush metronome beats (lookahead 100 ms). */
function tick(deps: { clock: FakeClock; metronome: FakeMetronome }, seconds: number) {
	deps.clock.advance(seconds);
	deps.metronome.flush();
}

describe('SessionController skeleton', () => {
	let deps: ReturnType<typeof createDeps>;

	beforeEach(() => {
		deps = createDeps();
	});

	it('starts with a one-bar count-in then stays ready for the first prompt beat', async () => {
		const controller = new SessionController(planWith([locateItem()]), deps);
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
		expect(controller.view.targetBeatIndex).toBe(6);
		expect(controller.view.prompt?.primary).toBe('F');
	});

	it('exposes fractional nowBeat from the clock and beatTime(0)', async () => {
		const controller = new SessionController(planWith([locateItem()]), deps);
		await controller.start();
		tick(deps, 0.1 + 0.75);
		// clock at 0.85, beat 0 at 0.1 → (0.85-0.1)/0.75 = 1
		expect(controller.timeline.nowBeat()).toBeCloseTo(1, 5);
	});

	it('pause discards the in-progress item without recording', async () => {
		const controller = new SessionController(
			planWith([
				locateItem(),
				locateItem({ target: { direction: 'locate', string: 3, pitch: 'C' } })
			]),
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
		const controller = new SessionController(planWith([locateItem()]), deps);
		await controller.start();
		controller.quit();
		expect(controller.view.status).toBe('finished');
		expect(deps.metronome.isRunning()).toBe(false);
		expect(deps.detector.running).toBe(false);
	});

	it('stores the tempo from settings at start and keeps it after the tempo setting changes', async () => {
		await deps.settings.update({ tempoBpm: 60 });
		const controller = new SessionController(planWith([locateItem()]), deps);
		await controller.start();
		expect((await deps.sessions.get('sess-1'))?.tempoBpm).toBe(60);

		await deps.settings.update({ tempoBpm: 120 });
		controller.quit();
		for (let i = 0; i < 8; i++) await Promise.resolve();

		const ended = await deps.sessions.get('sess-1');
		expect(ended?.tempoBpm).toBe(60);
		expect(ended?.endedAt).not.toBeNull();
	});

	it('starts again from the first item after the series is finished', async () => {
		const controller = new SessionController(
			planWith([
				locateItem(),
				locateItem({ target: { direction: 'locate', string: 3, pitch: 'C' } })
			]),
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
		const controller = new SessionController(planWith([locateItem({ leadBeats: 2 })]), deps);
		await controller.start();
		// Reach prompt beat 4 ; target beat 6. spb=0.75, firstBeat=0.1
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.promptBeatIndex).toBe(4);
		expect(controller.view.targetBeatIndex).toBe(6);

		const targetTime = deps.metronome.beatTime(6);
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

	it('treats a first note outside the window as no answer', async () => {
		const deps = createDeps();
		const controller = new SessionController(planWith([locateItem({ leadBeats: 2 })]), deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		const closesAt = deps.metronome.beatTime(6) + 0.4;
		deps.detector.emitNote({
			time: closesAt + 0.05,
			midi: 65,
			frequencyHz: 349.23,
			clarity: 0.95
		});
		expect(controller.view.lastVerdict?.verdict).toBe('wrong');
		expect(controller.view.lastVerdict?.answerLabel).toBeNull();
	});
});

describe('SessionController window close and sequencing', () => {
	it('closes the window on the first beat at or after closesAt', async () => {
		const deps = createDeps();
		const controller = new SessionController(planWith([locateItem({ leadBeats: 2 })]), deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.status).toBe('awaiting');
		// target beat 6 at 0.1+4.5=4.6 ; closesAt = 4.6+0.4 = 5.0
		// beat 7 at 0.1+5.25=5.35 >= 5.0 → close
		tick(deps, 0.75 * 3);
		expect(controller.view.status).toBe('verdict');
		expect(controller.view.lastVerdict?.verdict).toBe('wrong');
		expect(controller.view.lastVerdict?.reactionMs).toBeNull();
	});

	it('starts the next item at least one beat after the verdict', async () => {
		const deps = createDeps();
		const controller = new SessionController(
			planWith([
				locateItem({ leadBeats: 1 }),
				locateItem({
					target: { direction: 'locate', string: 3, pitch: 'C' },
					leadBeats: 1
				})
			]),
			deps
		);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.promptBeatIndex).toBe(4);
		const targetTime = deps.metronome.beatTime(5);
		deps.detector.emitNote({
			time: targetTime,
			midi: 65,
			frequencyHz: 349.23,
			clarity: 0.95
		});
		expect(controller.view.status).toBe('verdict');
		// earliestPromptBeat = 5+1 = 6 ; beat 5 (target era) keeps verdict; beat 6 advances.
		// From clock ~3.1 after prompt, need ~1.5s to emit beat 6 (4.6) with 100ms lookahead.
		tick(deps, 0.75 * 2);
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.promptBeatIndex).toBeGreaterThanOrEqual(6);
		expect(controller.view.prompt?.primary).toBe('C');
	});
});

function identifyItem(overrides: Partial<PlannedItem> = {}): PlannedItem {
	return {
		target: { direction: 'identify', string: 5, fret: 8 },
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: null,
		repeatUntilCorrect: false,
		...overrides
	};
}

describe('SessionController identify', () => {
	it('keeps locate items before identify items and answers via answer()', async () => {
		const deps = createDeps();
		const controller = new SessionController(
			planWith([locateItem({ leadBeats: 1 }), identifyItem()]),
			deps
		);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.prompt?.direction).toBe('locate');

		const targetTime = deps.metronome.beatTime(5);
		deps.detector.emitNote({
			time: targetTime,
			midi: 65,
			frequencyHz: 349.23,
			clarity: 0.95
		});
		tick(deps, 0.75 * 2);
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.prompt?.direction).toBe('identify');
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
		const controller = new SessionController(
			planWith([identifyItem(), locateItem({ leadBeats: 1 })]),
			deps
		);
		await controller.start();
		expect(deps.metronome.audible).toBe(true);

		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.prompt?.direction).toBe('identify');
		expect(deps.metronome.isRunning()).toBe(true);
		expect(deps.metronome.audible).toBe(false);

		controller.answer('C');
		expect(controller.view.status).toBe('verdict');
		expect(deps.metronome.audible).toBe(false);

		tick(deps, 0.75);
		expect(controller.view.prompt?.direction).toBe('locate');
		expect(deps.metronome.audible).toBe(true);
	});

	it('ignores answer() outside awaiting and ignores guitar notes in identify', async () => {
		const deps = createDeps();
		const controller = new SessionController(planWith([identifyItem()]), deps);
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
});

describe('SessionController persistence', () => {
	it('records a cold locate attempt with confusion on a wrong pitch', async () => {
		const deps = createDeps();
		await deps.cards.put(
			introduceCard({ direction: 'locate', string: 2, pitch: 'F' }, deps.now(), 'sess-1')
		);
		const controller = new SessionController(planWith([locateItem({ leadBeats: 1 })]), deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		const targetTime = deps.metronome.beatTime(5);
		// F# = MIDI 66 on B string near F
		deps.detector.emitNote({
			time: targetTime,
			midi: 66,
			frequencyHz: 370,
			clarity: 0.95
		});
		await Promise.resolve();
		const attempts = await deps.attempts.listBySession('sess-1');
		expect(attempts).toHaveLength(1);
		expect(attempts[0].correct).toBe(false);
		expect(attempts[0].confusion).toEqual(
			classifyNoteConfusion({ direction: 'locate', string: 2, pitch: 'F' }, 66)
		);
		expect(attempts[0].verdict).toBe('wrong');
	});

	it('requeues learning items until correct and skips remaining learning on fatigue', async () => {
		const deps = createDeps();
		const learning = (pitch: 'F' | 'G' | 'A', repeat = true): PlannedItem =>
			locateItem({
				target: { direction: 'locate', string: 2, pitch },
				phase: 'learning',
				temperature: 'hot',
				aid: 'show-position',
				leadBeats: 1,
				repeatUntilCorrect: repeat
			});
		const controller = new SessionController(planWith([learning('F'), learning('G')]), deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		const t = deps.metronome.beatTime(5);
		deps.detector.emitNote({ time: t, midi: 60, frequencyHz: 247, clarity: 0.9 });
		tick(deps, 0.75 * 2);
		expect(controller.view.status === 'awaiting' || controller.view.status === 'verdict').toBe(
			true
		);
		const remainingPrompts: string[] = [];
		for (let i = 0; i < 8 && controller.view.status !== 'finished'; i++) {
			if (controller.view.status === 'awaiting' && controller.view.prompt) {
				remainingPrompts.push(controller.view.prompt.primary);
				const due =
					controller.view.targetBeatIndex !== null
						? deps.metronome.beatTime(controller.view.targetBeatIndex)
						: deps.clock.now();
				deps.detector.emitNote({
					time: due,
					midi: 65,
					frequencyHz: 349,
					clarity: 0.95
				});
			}
			tick(deps, 0.75 * 2);
		}
		expect(remainingPrompts).toContain('F');
	});

	it('sets placementDoneAt when a placement session finishes', async () => {
		const deps = createDeps();
		const controller = new SessionController(
			planWith([locateItem({ phase: 'placement', leadBeats: 1 })], 'placement'),
			deps
		);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		deps.detector.emitNote({
			time: deps.metronome.beatTime(5),
			midi: 65,
			frequencyHz: 349,
			clarity: 0.95
		});
		tick(deps, 0.75 * 2);
		expect(controller.view.status).toBe('finished');
		// finish() yields before settings.update; drain microtasks
		for (let i = 0; i < 10; i++) await Promise.resolve();
		expect((await deps.settings.get()).placementDoneAt).not.toBeNull();
	});
});

describe('SessionController fatigue skip', () => {
	it('marks fatigue and drops remaining learning items', async () => {
		const deps = createDeps();
		const items: PlannedItem[] = Array.from({ length: 12 }, () =>
			locateItem({
				target: { direction: 'locate', string: 2, pitch: 'F' },
				phase: 'review',
				leadBeats: 1,
				aid: 'none'
			})
		);
		items.push(
			locateItem({
				target: { direction: 'locate', string: 3, pitch: 'C' },
				phase: 'learning',
				temperature: 'hot',
				leadBeats: 1,
				aid: 'show-position',
				repeatUntilCorrect: true
			})
		);
		const controller = new SessionController(planWith(items), deps);
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
			tick(deps, 0.75 * 2);
		}
		expect(controller.view.fatigueDetected).toBe(true);
		while (controller.view.status !== 'finished') {
			tick(deps, 0.75);
			await Promise.resolve();
		}
		const learned = (await deps.attempts.all()).filter((a) => a.phase === 'learning');
		expect(learned).toHaveLength(0);
	});
});

export { createDeps, locateItem, planWith, tick, identifyItem };
