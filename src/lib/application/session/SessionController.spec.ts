import { describe, expect, it, beforeEach } from 'vitest';
import type { Attempt, CardState, PlannedItem, SessionKind } from '$lib/domain/types';
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
	InMemorySessionRepository,
	InMemorySettingsRepository
} from '$lib/testing/fakes';
import type { SessionDeps } from './SessionDeps';
import { SessionController } from './SessionController.svelte';

function locateItem(overrides: Partial<PlannedItem> = {}): PlannedItem {
	return {
		target: { direction: 'locate', string: 2, pitch: 'F' },
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: 2,
		...overrides
	};
}

interface TestPlan {
	id: string;
	kind: SessionKind;
	selector: () => Promise<SessionSelector>;
}

function planWith(items: PlannedItem[], kind: SessionKind = 'learn'): TestPlan {
	return { id: 'sess-1', kind, selector: async () => createListSelector(items) };
}

function make(plan: TestPlan, deps: SessionDeps): SessionController {
	return new SessionController({ id: plan.id, kind: plan.kind }, plan.selector, deps);
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
		expect(controller.view.targetBeatIndex).toBe(6);
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
		const controller = make(planWith([locateItem()]), deps);
		await controller.start();
		controller.quit();
		expect(controller.view.status).toBe('finished');
		expect(deps.metronome.isRunning()).toBe(false);
		expect(deps.detector.running).toBe(false);
	});

	it('stores the tempo from settings at start and keeps it after the tempo setting changes', async () => {
		await deps.settings.update({ tempoBpm: 60 });
		const controller = make(planWith([locateItem()]), deps);
		await controller.start();
		expect((await deps.sessions.get('sess-1'))?.tempoBpm).toBe(60);

		await deps.settings.update({ tempoBpm: 120 });
		controller.quit();
		for (let i = 0; i < 8; i++) await Promise.resolve();

		const ended = await deps.sessions.get('sess-1');
		expect(ended?.tempoBpm).toBe(60);
		expect(ended?.endedAt).not.toBeNull();
	});

	it('keeps the closing session tempo when restart begins before finish persists', async () => {
		await deps.settings.update({ tempoBpm: 60 });
		const controller = make(planWith([locateItem()]), deps);
		await controller.start();
		expect((await deps.sessions.get('sess-1'))?.tempoBpm).toBe(60);

		controller.quit();
		await deps.settings.update({ tempoBpm: 120 });
		await controller.start();
		for (let i = 0; i < 8; i++) await Promise.resolve();

		const ended = await deps.sessions.get('sess-1');
		expect(ended?.tempoBpm).toBe(60);
		expect(ended?.endedAt).not.toBeNull();
	});

	it('starts again from the first item after the series is finished', async () => {
		const controller = make(
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
		const controller = make(planWith([locateItem({ leadBeats: 2 })]), deps);
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
		const controller = make(planWith([locateItem({ leadBeats: 2 })]), deps);
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
		const controller = make(planWith([locateItem({ leadBeats: 2 })]), deps);
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
		const controller = make(
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
		...overrides
	};
}

describe('SessionController identify', () => {
	it('keeps locate items before identify items and answers via answer()', async () => {
		const deps = createDeps();
		const controller = make(planWith([locateItem({ leadBeats: 1 }), identifyItem()]), deps);
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
		expect(controller.view.status).toBe('count-in');
		tick(deps, 0.75 * 4);
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
		const controller = make(planWith([identifyItem(), locateItem({ leadBeats: 1 })]), deps);
		await controller.start();
		expect(deps.metronome.audible).toBe(false);

		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.prompt?.direction).toBe('identify');
		expect(deps.metronome.isRunning()).toBe(true);
		expect(deps.metronome.audible).toBe(false);

		controller.answer('C');
		expect(controller.view.status).toBe('verdict');
		expect(deps.metronome.audible).toBe(false);

		tick(deps, 0.75);
		expect(controller.view.status).toBe('count-in');
		expect(deps.metronome.audible).toBe(true);
		tick(deps, 0.75 * 4);
		expect(controller.view.prompt?.direction).toBe('locate');
		expect(deps.metronome.audible).toBe(true);
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
		const controller = make(planWith([identifyItem(), locateItem({ leadBeats: 1 })]), deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.scene).toBe('identify');
		controller.answer('C');
		tick(deps, 0.75);
		expect(controller.view).toMatchObject({
			status: 'count-in',
			scene: 'locate',
			countdown: 4,
			prompt: null,
			answerChoices: null,
			lastVerdict: null
		});
		expect(deps.metronome.audible).toBe(true);
		tick(deps, 0.75 * 3);
		expect(controller.view.countdown).toBe(1);
		tick(deps, 0.75);
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.prompt?.direction).toBe('locate');
	});

	it('brings the answer pad in during a silent bar before a screen prompt', async () => {
		const deps = createDeps();
		const controller = make(planWith([locateItem({ leadBeats: 1 }), identifyItem()]), deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.scene).toBe('locate');
		deps.detector.emitNote({
			time: deps.metronome.beatTime(5),
			midi: 65,
			frequencyHz: 349.23,
			clarity: 0.95
		});
		tick(deps, 0.75 * 2);
		expect(controller.view).toMatchObject({
			status: 'count-in',
			scene: 'identify',
			countdown: 4,
			lastVerdict: null
		});
		expect(controller.view.answerChoices).toHaveLength(12);
		expect(deps.metronome.audible).toBe(false);
		tick(deps, 0.75 * 4);
		expect(controller.view.status).toBe('awaiting');
		expect(controller.view.prompt?.direction).toBe('identify');
	});

	it('opens a screen-first session on the answer pad, counted in silence', async () => {
		const deps = createDeps();
		const controller = make(planWith([identifyItem()]), deps);
		await controller.start();
		expect(controller.view.scene).toBe('identify');
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
		expect(controller.view.scene).toBe('identify');
		expect(controller.view.answerChoices).toHaveLength(12);
	});

	it('counts back in on the stage of the next prompt after a pause', async () => {
		const deps = createDeps();
		const controller = make(planWith([locateItem({ leadBeats: 2 }), identifyItem()]), deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		expect(controller.view.status).toBe('awaiting');
		controller.pause();
		controller.resume();
		expect(controller.view).toMatchObject({
			status: 'count-in',
			scene: 'identify',
			lastVerdict: null
		});
		expect(deps.metronome.audible).toBe(false);
		tick(deps, 0.1);
		expect(controller.view.countdown).toBe(4);
		tick(deps, 0.75 * 4);
		expect(controller.view.prompt?.direction).toBe('identify');
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
});

describe('SessionController persistence', () => {
	it('records a cold locate attempt with confusion on a wrong pitch', async () => {
		const deps = createDeps();
		await deps.cards.put(
			introduceCard({ direction: 'locate', string: 2, pitch: 'F' }, deps.now(), 'sess-1')
		);
		const controller = make(planWith([locateItem({ leadBeats: 1 })]), deps);
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
		await drain();
		const attempts = await deps.attempts.listBySession('sess-1');
		expect(attempts).toHaveLength(1);
		expect(attempts[0].correct).toBe(false);
		expect(attempts[0].confusion).toEqual(
			classifyNoteConfusion({ direction: 'locate', string: 2, pitch: 'F' }, 66)
		);
		expect(attempts[0].verdict).toBe('wrong');
	});

	it('sets placementDoneAt when a placement session finishes', async () => {
		const deps = createDeps();
		const controller = make(
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
	return new SessionController({ id: 'sess-1', kind }, async () => selector, deps);
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
			locateItem({ phase: 'review', leadBeats: 1 })
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
			tick(deps, 0.75 * 2);
		}
		expect(controller.view.fatigueDetected).toBe(true);
		expect(spy.contexts.at(-1)?.fatigued).toBe(true);
	});
});

describe('SessionController with a selector', () => {
	it('asks the selector before each prompt and finishes when it has nothing left', async () => {
		const deps = createDeps();
		const spy = spySelector([locateItem({ leadBeats: 1 }), locateItem({ leadBeats: 1 })]);
		const controller = withSelector(spy.selector, deps);
		await controller.start();
		for (let i = 0; i < 2; i++) {
			while (controller.view.status !== 'awaiting') tick(deps, 0.75);
			playRight(deps, controller);
			await drain();
			tick(deps, 0.75 * 2);
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
			leadBeats: 2
		});
		const controller = withSelector(spySelector([presentation]).selector, deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		deps.detector.emitNote({
			time: deps.metronome.beatTime(6),
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
		const target = { direction: 'locate', string: 2, pitch: 'F' } as const;
		await deps.cards.put(introduceCard(target, deps.now(), 'old'));
		const spy = spySelector([
			locateItem({ phase: 'learning', temperature: 'hot', aid: 'none', leadBeats: 2 })
		]);
		const learned = markLearned(introduceCard(target, deps.now(), 'old'), 123, 80);
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
		tick(passed, 0.1 + 0.75 * 4);
		playRight(passed, right);
		await drain();
		expect((await passed.attempts.all()).map((a) => a.temperature)).toEqual(['cold']);

		const missed = createDeps();
		const wrong = withSelector(spySelector([probe]).selector, missed);
		await wrong.start();
		tick(missed, 0.1 + 0.75 * 4);
		missed.detector.emitNote({
			time: missed.metronome.beatTime(6),
			midi: 60,
			frequencyHz: 262,
			clarity: 0.95
		});
		await drain();
		expect((await missed.attempts.all()).map((a) => a.temperature)).toEqual(['hot']);
	});

	it('stores the card the selector reports for a probe', async () => {
		const deps = createDeps();
		const probe = locateItem({ phase: 'probe', temperature: 'cold', aid: 'none', leadBeats: 2 });
		const spy = spySelector([probe]);
		const known = { ...introduceCard(probe.target, deps.now(), 'sess-1'), acquiredAt: 456 };
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
		const probe = locateItem({ phase: 'probe', temperature: 'cold', aid: 'none', leadBeats: 2 });
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
		const target = { direction: 'locate', string: 2, pitch: 'F' } as const;
		const card = markLearned(introduceCard(target, -10_000_000, 'old'), -9_000_000, 80);
		await deps.cards.put(card);
		const free = locateItem({ phase: 'free', temperature: 'hot', leadBeats: 2 });
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
		const being = introduceCard({ direction: 'locate', string: 3, pitch: 'C' }, -10_000_000, 'old');
		await deps.cards.put(being);
		const items = [
			locateItem({ phase: 'free', temperature: 'hot', leadBeats: 2 }),
			locateItem({
				target: { direction: 'locate', string: 3, pitch: 'C' },
				phase: 'free',
				temperature: 'hot',
				leadBeats: 2
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
		const target = { direction: 'locate', string: 2, pitch: 'F' } as const;
		const card = markLearned(introduceCard(target, -10_000_000, 'old'), -9_000_000, 80);
		await deps.cards.put(card);
		const item = locateItem({ phase: 'consolidation', temperature: 'hot', leadBeats: 2 });
		const controller = withSelector(spySelector([item]).selector, deps);
		await controller.start();
		tick(deps, 0.1 + 0.75 * 4);
		playRight(deps, controller);
		await drain();
		expect((await deps.attempts.all())[0].temperature).toBe('hot');
		expect(await deps.cards.get('locate:2:F')).toEqual(card);
	});
});

export { createDeps, locateItem, planWith, tick, identifyItem };
