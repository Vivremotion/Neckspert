import { describe, expect, it, vi } from 'vitest';
import type { MechanicRules } from '$lib/domain/mechanics';
import { createGridTiming } from '$lib/domain/timing';
import { createListSource } from '$lib/domain/progress';
import type { ExerciseDefinition } from '$lib/domain/exercise';
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
	{ exerciseId: 'grid-b', tempoBpm: 120 },
	{ exerciseId: 'grid-c', tempoBpm: 80 }
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

/** Two exercises with an instruction, one without. */
const DEFINITIONS: Record<string, ExerciseDefinition> = {
	'grid-a': {
		id: 'grid-a',
		version: 1,
		mechanic: 'fake-grid',
		params: {},
		howTo: { fr: 'Joue A puis B.', en: 'Play A then B.' }
	},
	'grid-b': {
		id: 'grid-b',
		version: 1,
		mechanic: 'fake-grid',
		params: {},
		howTo: { fr: 'Joue D.', en: 'Play D.' }
	},
	'grid-c': { id: 'grid-c', version: 1, mechanic: 'fake-grid', params: {} }
};

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
		sensors: { 'fake-chord': sensor },
		exercise: (id) => DEFINITIONS[id]
	};
	const controller = new SessionController(
		{ id: 'sess-1', kind: 'free' },
		async () => ({ selector: createListSource(items), executions: EXECUTIONS }),
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

describe('the instruction of an exercise met for the first time', () => {
	it('shows the first exercise instruction on the start screen, without a second stop', async () => {
		const ctx = setup();
		await ctx.controller.ready?.();
		expect(ctx.controller.view).toMatchObject({
			status: 'idle',
			briefing: { text: 'Joue A puis B.' }
		});
		await ctx.controller.start();
		expect(ctx.controller.view.briefing).toBeNull();
		ctx.runTo(beat80(4) + 0.05);
		expect(ctx.controller.view.status).toBe('awaiting');
		expect(ctx.controller.view.prompt?.primary).toBe('A');
	});

	it('stops before the first passage of another exercise, then counts one bar at its tempo', async () => {
		const ctx = setup();
		const starts = vi.spyOn(ctx.metronome, 'start');
		await ctx.controller.start();
		// A, B and C at 80 bpm from beat 4, the handover at beat 10.
		ctx.runTo(beat80(10) + 0.05);
		expect(ctx.controller.view).toMatchObject({
			status: 'paused',
			briefing: { text: 'Joue D.' }
		});
		expect(ctx.metronome.isRunning()).toBe(false);
		ctx.runTo(ctx.clock.now() + 3);
		expect(ctx.controller.view.status).toBe('paused');

		ctx.controller.resume();
		expect(ctx.controller.view.briefing).toBeNull();
		expect(ctx.metronome.getTempo()).toBe(120);
		const counts: (number | null)[] = [];
		for (let beat = 0; beat <= 4; beat++) {
			ctx.runTo(ctx.metronome.beatTime(beat) + 0.01);
			counts.push(ctx.controller.view.countdown);
		}
		expect(counts).toEqual([4, 3, 2, 1, null]);
		expect(ctx.controller.view.prompt?.primary).toBe('D');
		// Started for the series, then once after the instruction: no restart for the tempo.
		expect(starts).toHaveBeenCalledTimes(2);
	});

	it('does not stop again for an exercise already met, nor for one without an instruction', async () => {
		const a = change('A', 'grid-a', true);
		const c = change('C', 'grid-c', true);
		const ctx = setup([a, c, { ...a, item: { chord: 'B', length: 2 } }]);
		await ctx.controller.start();
		ctx.runTo(ctx.metronome.beatTime(26));
		await drain();
		expect(ctx.controller.view.briefing ?? null).toBeNull();
		expect((await ctx.deps.attempts.all()).map((x) => x.exerciseId)).toEqual([
			'grid-a',
			'grid-c',
			'grid-a'
		]);
	});
});
