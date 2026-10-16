import { describe, expect, it } from 'vitest';
import type { MechanicRules } from '$lib/domain/mechanics';
import { createGridTiming } from '$lib/domain/timing';
import { createListSelector } from '$lib/domain/progress';
import type { Execution, PlannedItem } from '$lib/domain/types';
import type { MechanicPresenter } from '$lib/application/mechanics/types';
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
import type { Observation, SensorFactory } from './sensors';
import type { SessionDeps } from './SessionDeps';
import { SessionController } from './SessionController.svelte';

/** A change of a fake grid: the chord to play, for `length` beats. */
interface Change {
	chord: string;
	length: number;
}

interface Reading {
	decided: string | null;
}

/** Changes handing over without a gap: right when the chord decided is the one asked. */
const gridRules: MechanicRules<Change, Reading, Reading, never> = {
	id: 'fake-grid',
	timing: createGridTiming((item) => ({ lengthBeats: (item as Change).length })),
	learner: 'skill',
	itemKey: ({ chord }) => chord,
	parseItem: (chord) => ({ chord, length: 2 }),
	judge: (item, payload) => ({
		correct: payload.decided === item.chord,
		answer: payload,
		confusion: null
	})
};

const gridPresenter: MechanicPresenter<Change, Reading> = {
	rules: gridRules,
	scene: 'guitar',
	sensors: ['fake-chord'],
	prompt: ({ chord }) => ({ primary: chord, secondary: '', aid: null, diagram: null }),
	answerLabel: ({ decided }) => decided,
	reveal: () => null,
	expectation: (item) => ({ 'fake-chord': item.chord })
};

const EXECUTIONS: Execution[] = [
	{ exerciseId: 'grid-a', tempoBpm: 80 },
	{ exerciseId: 'grid-b', tempoBpm: 120 }
];

function change(chord: string, exerciseId = 'grid-a', countIn = false): PlannedItem {
	return {
		exerciseId,
		mechanic: 'fake-grid',
		item: { chord, length: 2 },
		phase: 'free',
		temperature: 'hot',
		aid: 'none',
		leadBeats: null,
		...(countIn && { countIn })
	};
}

/** Three changes of 2 beats at 80 bpm, then one of another exercise at 120 bpm. */
const PASSAGES = [
	change('A', 'grid-a', true),
	change('B'),
	change('C'),
	change('D', 'grid-b', true)
];

/** At 80 bpm from 0.1 s: the first change on beat 4 after one counted bar, then every 2 beats. */
const beat80 = (i: number) => 0.1 + i * 0.75;

function setup(items: PlannedItem[] = PASSAGES) {
	const clock = new FakeClock();
	const metronome = new FakeMetronome(clock);
	let listener: ((observation: Observation) => void) | null = null;
	/** Every expectation told to the sensor, in order, with the time it was told. */
	const expectations: { at: number; value: unknown }[] = [];
	/** Called when the expectation is withdrawn: a window cut short may report at once. */
	let onWithdraw: (() => void) | null = null;
	const sensor: SensorFactory = () => ({
		onObservation: (callback) => {
			listener = callback;
			return () => {
				listener = null;
			};
		},
		expect: (value) => {
			expectations.push({ at: clock.now(), value });
			if (value === null && onWithdraw) {
				const report = onWithdraw;
				onWithdraw = null;
				report();
			}
		}
	});
	const deps: SessionDeps = {
		clock,
		metronome,
		detector: new FakeNoteDetector(),
		cues: new FakeSoundCues(),
		attempts: new InMemoryAttemptRepository(),
		cards: new InMemoryCardStateRepository(),
		sessions: new InMemorySessionRepository(),
		progressions: new InMemoryProgressionRepository(),
		settings: new InMemorySettingsRepository(),
		now: () => clock.toEpochMs(clock.now()),
		random: () => 0,
		newId: () => 'id-1',
		mechanics: { 'fake-grid': gridPresenter },
		sensors: { 'fake-chord': sensor }
	};
	const controller = new SessionController(
		{ id: 'sess-1', kind: 'free' },
		async () => ({ selector: createListSelector(items), executions: EXECUTIONS }),
		deps
	);
	/** Moves the clock to `time` by 10 ms steps, the metronome waking at each. */
	const runTo = (time: number) => {
		while (clock.now() < time - 1e-9) {
			clock.advance(Math.min(0.01, time - clock.now()));
			metronome.flush();
		}
	};
	const play = (decided: string, time = clock.now()) =>
		listener?.({ time, payload: { decided }, readable: true });
	const withdraw = (report: () => void) => {
		onWithdraw = report;
	};
	return { controller, deps, metronome, clock, runTo, play, expectations, withdraw };
}

async function drain() {
	for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe('rounds handing over without a gap', () => {
	it('opens each change at the handover of the one before, with no breathing between', async () => {
		const ctx = setup();
		await ctx.controller.start();
		const targets: (number | null)[] = [];
		for (let t = 0.2; t < 7.3; t += 0.05) {
			ctx.runTo(t);
			const target = ctx.controller.view.targetBeatIndex;
			if (target !== targets.at(-1)) targets.push(target);
		}
		expect(targets.filter((t) => t !== null)).toEqual([4, 6, 8]);
		// Never a moment without a change on screen between the first and the third.
		const first = targets.indexOf(4);
		expect(targets.slice(first, targets.indexOf(8) + 1)).toEqual([4, 6, 8]);
		await drain();
		const attempts = await ctx.deps.attempts.all();
		expect(attempts).toHaveLength(2);
		// The second change shows at the first one's handover: beat 6 minus 200 ms.
		expect(attempts[1].promptedAt).toBeCloseTo(ctx.clock.toEpochMs(beat80(6) - 0.2), 0);
	});

	it('takes an attack 100 ms before a change as its early answer', async () => {
		const ctx = setup();
		await ctx.controller.start();
		ctx.runTo(beat80(4));
		ctx.play('A');
		ctx.runTo(beat80(6) - 0.1);
		ctx.play('B');
		ctx.runTo(beat80(8) - 0.1);
		await drain();
		const [first, second] = await ctx.deps.attempts.all();
		expect(first).toMatchObject({ verdict: { value: 'perfect' }, correct: true });
		expect(second).toMatchObject({
			verdict: { value: 'early' },
			timingOffsetMs: -100,
			correct: true
		});
	});

	it('leaves an attack 300 ms before a change in the round before', async () => {
		const ctx = setup();
		await ctx.controller.start();
		ctx.runTo(beat80(6) - 0.3);
		ctx.play('B');
		ctx.runTo(beat80(8) - 0.1);
		await drain();
		const [first, second] = await ctx.deps.attempts.all();
		// The first change took it as its answer, the wrong chord, late.
		expect(first).toMatchObject({
			verdict: { value: 'wrong' },
			data: { answer: { decided: 'B' } }
		});
		expect(second).toMatchObject({ verdict: { value: 'wrong' }, data: { answer: null } });
		expect(second.observations).toEqual([]);
	});

	it('withdraws the expectation before settling: a window cut short reports into the round that ends', async () => {
		const ctx = setup();
		await ctx.controller.start();
		ctx.runTo(beat80(6) - 0.25);
		const handover = beat80(6) - 0.2;
		// The sensor's window, attacked at 5.5 beats, is cut by the handover: it reports then.
		ctx.withdraw(() => ctx.play('A', beat80(5.5)));
		ctx.runTo(handover + 0.03);
		await drain();
		const told = ctx.expectations.filter((e) => e.at >= handover - 1e-9);
		expect(told.map((e) => e.value)).toEqual([null, null, 'B']);
		const [first] = await ctx.deps.attempts.all();
		expect(first).toMatchObject({
			verdict: { value: 'offbeat' },
			success: false,
			data: { answer: { decided: 'A' } }
		});
		ctx.runTo(beat80(8));
		await drain();
		const [, second] = await ctx.deps.attempts.all();
		expect(second.observations).toEqual([]);
	});

	it('stores a change left unanswered as wrong at its handover', async () => {
		const ctx = setup();
		await ctx.controller.start();
		ctx.runTo(beat80(6) - 0.21);
		await drain();
		expect(await ctx.deps.attempts.all()).toHaveLength(0);
		ctx.runTo(beat80(6) - 0.17);
		await drain();
		const [first] = await ctx.deps.attempts.all();
		expect(first).toMatchObject({
			verdict: { value: 'wrong' },
			correct: false,
			data: { answer: null }
		});
	});

	it('cancels the handover on pause, and resumes on the next change after a counted bar', async () => {
		const ctx = setup();
		await ctx.controller.start();
		ctx.runTo(beat80(4));
		ctx.play('A');
		ctx.runTo(beat80(6) + 0.1);
		ctx.controller.pause();
		ctx.runTo(beat80(10));
		await drain();
		// The second change, paused in its window unanswered, is dropped.
		expect(await ctx.deps.attempts.all()).toHaveLength(1);

		ctx.controller.resume();
		ctx.runTo(ctx.clock.now() + 0.2);
		expect(ctx.controller.view.status).toBe('count-in');
		expect(ctx.controller.view.prompt).toBeNull();
		// A counted bar, then the third change on the 1 after its prompt beat.
		ctx.runTo(ctx.metronome.beatTime(3));
		expect(ctx.controller.view.prompt?.primary).toBe('C');
		expect(ctx.controller.view.targetBeatIndex).toBe(4);
	});

	it('restarts the metronome at the next passage tempo after a counted bar', async () => {
		const ctx = setup();
		await ctx.controller.start();
		ctx.runTo(beat80(10) - 0.15);
		expect(ctx.controller.view.status).toBe('count-in');
		expect(ctx.metronome.getTempo()).toBe(80);
		ctx.runTo(beat80(10) + 0.2);
		expect(ctx.metronome.getTempo()).toBe(120);
		// A counted bar at 120 bpm, then D on the 1.
		ctx.runTo(ctx.metronome.beatTime(1));
		expect(ctx.controller.view.countdown).not.toBeNull();
		ctx.runTo(ctx.metronome.beatTime(3));
		expect(ctx.controller.view.prompt?.primary).toBe('D');
		expect(ctx.controller.view.targetBeatIndex).toBe(4);
		ctx.runTo(ctx.metronome.beatTime(6));
		await drain();
		expect(ctx.controller.view.status).toBe('finished');
		expect(await ctx.deps.attempts.all()).toHaveLength(4);
	});
});
