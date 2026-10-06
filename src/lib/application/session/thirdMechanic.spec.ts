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
import type { Observation, SensorFactory } from './sensors';
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

const fakePresenter: MechanicPresenter<FakeItem, { value: number }> = {
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

function setup() {
	const clock = new FakeClock();
	const metronome = new FakeMetronome(clock);
	let listener: ((observation: Observation) => void) | null = null;
	const fakeSensor: SensorFactory = () => ({
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
		mechanics: { fake: fakePresenter },
		sensors: { fake: fakeSensor }
	};
	const controller = new SessionController(
		{ id: 'sess-1', kind: 'free' },
		async () => ({ selector: createListSelector([ITEM]), executions: EXECUTIONS }),
		deps
	);
	const push = (payload: unknown) =>
		listener?.({ time: metronome.beatTime(8), payload, readable: true });
	return { deps, controller, metronome, clock, push };
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

describe('a third mechanic, unknown to the core', () => {
	it('plays a mechanic the core has never seen, on the beat', async () => {
		const ctx = setup();
		await reachPrompt(ctx);
		expect(ctx.controller.view.prompt?.primary).toBe('3');

		ctx.push({ value: 3 });
		await drain();

		expect(ctx.controller.view.lastVerdict?.verdict).toBe('perfect');
		const [attempt] = await ctx.deps.attempts.all();
		expect(attempt).toMatchObject({
			mechanic: 'fake',
			exerciseId: 'fake-ex',
			tempoBpm: 100,
			data: { item: { n: 3 }, answer: { value: 3 }, confusion: null }
		});
	});

	it('keeps the answer among the observations of the attempt, as its sensor read it', async () => {
		const ctx = setup();
		await reachPrompt(ctx);

		ctx.push({ value: 3 });
		await drain();

		const [attempt] = await ctx.deps.attempts.all();
		const promptToTargetMs = (ctx.metronome.beatTime(8) - ctx.metronome.beatTime(4)) * 1000;
		expect(attempt.observations).toEqual([
			{
				atMs: expect.closeTo(promptToTargetMs, 6),
				sensor: 'fake',
				fate: 'answer',
				correct: true,
				payload: { value: 3 }
			}
		]);
	});

	it('shows what the mechanic reveals after a miss', async () => {
		const ctx = setup();
		await reachPrompt(ctx);

		ctx.push({ value: 4 });
		await drain();

		expect(ctx.controller.view.lastVerdict?.verdict).toBe('wrong');
		expect(ctx.controller.view.lastVerdict?.correction).toBe('n = 3');
	});
});
