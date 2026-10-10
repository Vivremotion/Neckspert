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

/** At 80 bpm from 0.1 s: the first change on beat 8, the next ones every 2 beats. */
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

describe('the counted bar before a chord change', () => {
	/** The countdown and the target on each beat from `from` to `to`, read just after the beat. */
	function countsOn(ctx: ReturnType<typeof setup>, from: number, to: number) {
		const seen: [number, number | null, number | null][] = [];
		for (let beat = from; beat <= to; beat++) {
			ctx.runTo(ctx.metronome.beatTime(beat) + 0.01);
			seen.push([beat, ctx.controller.view.countdown, ctx.controller.view.targetBeatIndex]);
		}
		return seen;
	}

	it('counts 4 3 2 1 on the four beats before the first change, which falls on the next 1', async () => {
		const ctx = setup();
		await ctx.controller.start();
		expect(countsOn(ctx, 0, 5)).toEqual([
			[0, 4, null],
			[1, 3, null],
			[2, 2, null],
			// The round opens a beat before its change: an early attack counts.
			[3, 1, 4],
			[4, null, 4],
			[5, null, 4]
		]);
	});

	it('counts one bar only after a resume', async () => {
		const ctx = setup();
		await ctx.controller.start();
		ctx.runTo(ctx.metronome.beatTime(4) + 0.1);
		ctx.controller.pause();
		ctx.controller.resume();
		expect(countsOn(ctx, 0, 4).map(([, countdown]) => countdown)).toEqual([4, 3, 2, 1, null]);
		expect(ctx.controller.view.targetBeatIndex).toBe(4);
	});

	it('counts one bar between two passages, the next change on the downbeat after it', async () => {
		const a = change('A', 'grid-a', true);
		const items = [{ ...a, item: { chord: 'A', length: 4 } }, change('B', 'grid-a', true)];
		const ctx = setup(items);
		await ctx.controller.start();
		// A fills the bar from 4: the count runs over 8 to 11, B on 12.
		expect(countsOn(ctx, 8, 12)).toEqual([
			[8, 4, null],
			[9, 3, null],
			[10, 2, null],
			[11, 1, 12],
			[12, null, 12]
		]);
	});
});
