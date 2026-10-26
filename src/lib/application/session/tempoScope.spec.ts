import { describe, expect, it } from 'vitest';
import type { MechanicRules } from '$lib/domain/mechanics';
import { beatTiming } from '$lib/domain/timing';
import { createListSource } from '$lib/domain/progress';
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

interface Item {
	n: number;
}

const rules: MechanicRules<Item, { value: number }, { value: number }, never> = {
	id: 'scoped',
	timing: beatTiming,
	learner: 'skill',
	itemKey: ({ n }) => String(n),
	parseItem: (key) => ({ n: Number(key) }),
	judge: (item, payload) => ({
		correct: payload.value === item.n,
		answer: payload,
		confusion: null
	})
};

const presenter: MechanicPresenter<Item, { value: number }> = {
	rules,
	scene: 'guitar',
	sensors: ['fake'],
	prompt: ({ n }) => ({ primary: String(n), secondary: '', aid: null, diagram: null }),
	answerLabel: ({ value }) => String(value),
	reveal: () => null
};

/** One exercise, two scopes: a ballad at 80 bpm, a blues at 100. */
const EXECUTIONS: Execution[] = [
	{ exerciseId: 'grid-ex', scope: 'ballad', tempoBpm: 80 },
	{ exerciseId: 'grid-ex', scope: 'blues', tempoBpm: 100 }
];

function item(n: number, tempoScope: string): PlannedItem {
	return {
		exerciseId: 'grid-ex',
		mechanic: 'scoped',
		item: { n },
		phase: 'free',
		temperature: 'hot',
		aid: 'none',
		leadBeats: 4,
		tempoScope
	};
}

function setup(items: PlannedItem[]) {
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
		mechanics: { scoped: presenter },
		exercise: (id) => ({ id, version: 1, mechanic: 'scoped', params: {} }),
		sensors: { fake: sensor }
	};
	const controller = new SessionController(
		{ id: 'sess-1', kind: 'learn' },
		async () => ({ selector: createListSource(items), executions: EXECUTIONS }),
		deps
	);
	return { controller, deps, clock, metronome, sensor: () => listener };
}

/** Plays every prompt right on its target, noting the tempo each was played at. */
async function playAll(ctx: ReturnType<typeof setup>) {
	await ctx.controller.start();
	const tempos: number[] = [];
	// A restart numbers the beats from 0 again: a prompt is told apart by itself, not its beat.
	let answered: unknown = null;
	for (let step = 0; step < 20_000 && ctx.controller.view.status !== 'finished'; step++) {
		ctx.clock.advance(0.01);
		ctx.metronome.flush();
		const { targetBeatIndex, prompt } = ctx.controller.view;
		if (targetBeatIndex === null || prompt === answered || !prompt) continue;
		if (ctx.clock.now() < ctx.metronome.beatTime(targetBeatIndex)) continue;
		answered = prompt;
		tempos.push(ctx.metronome.getTempo());
		ctx.sensor()?.({
			time: ctx.metronome.beatTime(targetBeatIndex),
			payload: { value: Number(prompt.primary) },
			readable: true
		});
		if (step % 20 === 0) await Promise.resolve();
	}
	for (let i = 0; i < 30; i++) await Promise.resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
	return tempos;
}

describe('a tempo per exercise and scope', () => {
	it('plays each prompt at the tempo of its scope, the metronome restarting between scopes', async () => {
		const ctx = setup([item(1, 'ballad'), item(2, 'blues'), item(3, 'ballad')]);
		expect(await playAll(ctx)).toEqual([80, 100, 80]);
		const attempts = await ctx.deps.attempts.all();
		expect(attempts.map((a) => [a.tempoBpm, a.tempoScope])).toEqual([
			[80, 'ballad'],
			[100, 'blues'],
			[80, 'ballad']
		]);
	});

	it('moves the tempo of a scope on its own attempts only', async () => {
		const ballad = Array.from({ length: 10 }, (_, i) => item(i + 1, 'ballad'));
		const ctx = setup([...ballad, item(20, 'blues')]);
		await playAll(ctx);
		expect(await ctx.deps.progressions.get('grid-ex', 'ballad')).toMatchObject({
			exerciseId: 'grid-ex',
			scope: 'ballad',
			mechanic: 'scoped',
			tempoBpm: 85
		});
		expect(await ctx.deps.progressions.get('grid-ex', 'blues')).toBeUndefined();
		expect(await ctx.deps.progressions.get('grid-ex')).toBeUndefined();
	});
});
