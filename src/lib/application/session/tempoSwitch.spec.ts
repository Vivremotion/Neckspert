import { describe, expect, it, vi } from 'vitest';
import type { MechanicRules } from '$lib/domain/mechanics';
import { beatTiming } from '$lib/domain/timing';
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

interface FakeItem {
	n: number;
}

const rules: MechanicRules<FakeItem, { value: number }, { value: number }, never> = {
	id: 'beaty',
	timing: beatTiming,
	learner: 'memory',
	itemKey: ({ n }) => String(n),
	parseItem: (key) => ({ n: Number(key) }),
	judge: (item, payload) => ({
		correct: payload.value === item.n,
		answer: payload,
		confusion: null
	})
};

const presenter: MechanicPresenter<FakeItem, { value: number }> = {
	rules,
	scene: 'guitar',
	sensors: ['fake'],
	prompt: ({ n }) => ({ primary: String(n), secondary: '', aid: null, diagram: null }),
	answerLabel: ({ value }) => String(value),
	reveal: () => null
};

function item(exerciseId: string, n: number): PlannedItem {
	return {
		exerciseId,
		mechanic: 'beaty',
		item: { n },
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: 4
	};
}

function setup(executions: Execution[], items: PlannedItem[]) {
	const clock = new FakeClock();
	const metronome = new FakeMetronome(clock);
	let listener: ((observation: Observation) => void) | null = null;
	const sensor: SensorFactory = () => ({
		onObservation: (callback) => {
			listener = callback;
			return () => {
				listener = null;
			};
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
		mechanics: { beaty: presenter },
		sensors: { fake: sensor }
	};
	const controller = new SessionController(
		{ id: 'sess-1', kind: 'free' },
		async () => ({ selector: createListSelector(items), executions }),
		deps
	);
	const starts = vi.spyOn(metronome, 'start');
	/** Advances to the moment beat `index` of the running grid is announced, and flushes. */
	const atBeat = (index: number) => {
		const announced = metronome.beatTime(index) - 0.1;
		if (announced > clock.now()) clock.advance(announced - clock.now());
		metronome.flush();
	};
	const play = (value: number, at: number) =>
		listener?.({ time: at, payload: { value }, readable: true });
	return { controller, deps, metronome, clock, atBeat, play, starts };
}

async function drain() {
	for (let i = 0; i < 8; i++) await Promise.resolve();
}

const TWO_TEMPOS: Execution[] = [
	{ exerciseId: 'slow', tempoBpm: 80 },
	{ exerciseId: 'fast', tempoBpm: 100 }
];

describe('a change of tempo between two sequences', () => {
	it('restarts the metronome at the new tempo with a counted bar before the prompt', async () => {
		const ctx = setup(TWO_TEMPOS, [item('slow', 1), item('fast', 2)]);
		await ctx.controller.start();
		expect(ctx.metronome.getTempo()).toBe(80);
		ctx.atBeat(4);
		ctx.play(1, ctx.metronome.beatTime(8));
		await drain();
		// The breathing bar runs at 80 bpm; the new grid starts where beat 12 would have been.
		const restartAt = ctx.metronome.beatTime(12);
		for (let beat = 9; beat <= 11; beat++) ctx.atBeat(beat);
		expect(ctx.metronome.getTempo()).toBe(100);
		expect(ctx.controller.view.tempoBpm).toBe(100);
		expect(ctx.metronome.beatTime(0)).toBeCloseTo(restartAt, 9);
		const countdown: (number | null)[] = [];
		for (let beat = 0; beat <= 3; beat++) {
			ctx.atBeat(beat);
			countdown.push(ctx.controller.view.countdown);
		}
		expect(countdown).toEqual([4, 3, 2, 1]);
		expect(ctx.controller.view.prompt).toBeNull();
		ctx.atBeat(4);
		expect(ctx.controller.view.prompt?.primary).toBe('2');
		expect(ctx.controller.view.promptBeatIndex).toBe(4);
		ctx.play(2, ctx.metronome.beatTime(8));
		await drain();
		const attempts = await ctx.deps.attempts.all();
		expect(attempts.map((a) => [a.exerciseId, a.tempoBpm, a.verdict])).toEqual([
			['slow', 80, 'perfect'],
			['fast', 100, 'perfect']
		]);
	});

	it('settles an open late capture before the metronome stops', async () => {
		const ctx = setup(TWO_TEMPOS, [item('slow', 1), item('fast', 2)]);
		await ctx.controller.start();
		ctx.atBeat(4);
		ctx.atBeat(9);
		// Unanswered: the window closed, the capture listens.
		expect(ctx.controller.view.lastVerdict?.verdict).toBe('wrong');
		ctx.play(1, ctx.metronome.beatTime(9) + 0.1);
		await drain();
		expect(ctx.metronome.getTempo()).toBe(80);
		for (let beat = 10; beat <= 11; beat++) ctx.atBeat(beat);
		await drain();
		expect(ctx.metronome.getTempo()).toBe(100);
		const [attempt] = await ctx.deps.attempts.all();
		expect(attempt).toMatchObject({ exerciseId: 'slow', tempoBpm: 80, verdict: 'offbeat' });
	});

	it('restarts nothing between two sequences at the same tempo', async () => {
		const ctx = setup(
			[
				{ exerciseId: 'slow', tempoBpm: 80 },
				{ exerciseId: 'other', tempoBpm: 80 }
			],
			[item('slow', 1), item('other', 2)]
		);
		await ctx.controller.start();
		ctx.atBeat(4);
		ctx.play(1, ctx.metronome.beatTime(8));
		await drain();
		for (let beat = 9; beat <= 12; beat++) ctx.atBeat(beat);
		expect(ctx.controller.view.prompt?.primary).toBe('2');
		expect(ctx.controller.view.promptBeatIndex).toBe(12);
		expect(ctx.starts).toHaveBeenCalledTimes(1);
	});

	it('starts the series at the tempo of its first prompt', async () => {
		const ctx = setup(TWO_TEMPOS, [item('fast', 2)]);
		await ctx.controller.start();
		expect(ctx.metronome.getTempo()).toBe(100);
		expect(ctx.controller.view.tempoBpm).toBe(100);
	});
});
