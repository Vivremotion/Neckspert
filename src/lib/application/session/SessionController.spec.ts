import { describe, expect, it, beforeEach } from 'vitest';
import type { Curriculum, PlannedItem, SessionPlan } from '$lib/domain/types';
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

export { createDeps, locateItem, planWith, tick };
