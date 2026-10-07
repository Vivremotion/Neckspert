import { describe, expect, it } from 'vitest';
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
import type { SensorFactory } from './sensors';
import type { SessionDeps } from './SessionDeps';
import { SessionController } from './SessionController.svelte';

interface FakeItem {
	n: number;
}

/** A mechanic the core has never heard of: right when the value equals n. */
const fakeRules: MechanicRules<FakeItem, { value: number }, { value: number }, never> = {
	id: 'fake',
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

const basePresenter: MechanicPresenter<FakeItem, { value: number }> = {
	rules: fakeRules,
	scene: 'guitar',
	sensor: 'fake',
	prompt: ({ n }) => ({ primary: String(n), secondary: '', aid: null, diagram: null }),
	answerLabel: ({ value }) => String(value),
	reveal: ({ n }, { verdict }) => (verdict === 'wrong' ? `n = ${n}` : null)
};

const EXECUTIONS: Execution[] = [{ exerciseId: 'fake-ex', tempoBpm: 100 }];

const ITEM: PlannedItem = {
	exerciseId: 'fake-ex',
	mechanic: 'fake',
	item: { n: 3 },
	phase: 'review',
	temperature: 'cold',
	aid: 'none',
	leadBeats: 4
};

const expectingPresenter: MechanicPresenter<FakeItem, { value: number }> = {
	...basePresenter,
	expectation: (item, { opensAt }) => ({ n: item.n, opensAt })
};

function setup(presenter: MechanicPresenter<FakeItem, { value: number }>) {
	const clock = new FakeClock();
	const metronome = new FakeMetronome(clock);
	const expected: unknown[] = [];
	const fakeSensor: SensorFactory = () => ({
		onObservation: () => () => {},
		expect: (expectation) => expected.push(expectation)
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
		mechanics: { fake: presenter },
		sensors: { fake: fakeSensor }
	};
	const controller = new SessionController(
		{ id: 'sess-1', kind: 'free' },
		async () => ({ selector: createListSelector([ITEM, ITEM]), executions: EXECUTIONS }),
		deps
	);
	return { controller, metronome, clock, expected };
}

async function reachPrompt(ctx: ReturnType<typeof setup>) {
	await ctx.controller.start();
	// Beat 4 carries the prompt (count-in bar first); announced 100 ms ahead.
	ctx.clock.advance(ctx.metronome.beatTime(4) - 0.1 - ctx.clock.now() + 0.2);
	ctx.metronome.flush();
	expect(ctx.controller.view.status).toBe('awaiting');
}

async function drain() {
	for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe('the expectation of a round', () => {
	it('reaches the sensor of the mechanic when the round opens', async () => {
		const ctx = setup(expectingPresenter);
		await reachPrompt(ctx);
		const opened = ctx.expected.filter((e) => e !== null);
		expect(opened[0]).toEqual({ n: 3, opensAt: ctx.metronome.beatTime(4) });
	});

	it('is withdrawn on pause', async () => {
		const ctx = setup(expectingPresenter);
		await reachPrompt(ctx);
		ctx.controller.pause();
		expect(ctx.expected.at(-1)).toBeNull();
	});

	it('is withdrawn when the session ends', async () => {
		const ctx = setup(expectingPresenter);
		await reachPrompt(ctx);
		ctx.controller.quit();
		await drain();
		expect(ctx.expected.at(-1)).toBeNull();
	});

	it('is null for a mechanic that prepares none', async () => {
		const ctx = setup(basePresenter);
		await reachPrompt(ctx);
		expect(ctx.expected.length).toBeGreaterThan(0);
		expect(ctx.expected.every((e) => e === null)).toBe(true);
	});
});
