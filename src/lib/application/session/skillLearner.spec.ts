import { describe, expect, it } from 'vitest';
import type { MechanicRules } from '$lib/domain/mechanics';
import { beatTiming } from '$lib/domain/timing';
import { createListSelector } from '$lib/domain/progress';
import type { Execution, ItemPhase, PlannedItem } from '$lib/domain/types';
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

interface SkillItem {
	n: number;
}

/** A skill: measured by its attempts, never scheduled as a card. */
const skillRules: MechanicRules<SkillItem, { value: number }, { value: number }, never> = {
	id: 'skill',
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

const skillPresenter: MechanicPresenter<SkillItem, { value: number }> = {
	rules: skillRules,
	scene: 'guitar',
	sensors: ['fake'],
	prompt: ({ n }) => ({ primary: String(n), secondary: '', aid: null, diagram: null }),
	answerLabel: ({ value }) => String(value),
	reveal: () => null
};

const EXECUTIONS: Execution[] = [{ exerciseId: 'skill-ex', tempoBpm: 100 }];

function item(phase: ItemPhase): PlannedItem {
	return {
		exerciseId: 'skill-ex',
		mechanic: 'skill',
		item: { n: 3 },
		phase,
		temperature: 'hot',
		aid: 'none',
		leadBeats: 4
	};
}

function setup(phase: ItemPhase) {
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
		mechanics: { skill: skillPresenter },
		sensors: { fake: fakeSensor }
	};
	const controller = new SessionController(
		{ id: 'sess-1', kind: 'free' },
		async () => ({ selector: createListSelector([item(phase)]), executions: EXECUTIONS }),
		deps
	);
	const push = (payload: unknown) =>
		listener?.({ time: metronome.beatTime(8), payload, readable: true });
	return { deps, controller, metronome, clock, push };
}

async function drain() {
	for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe('a skill learner', () => {
	it.each<ItemPhase>(['learning', 'review', 'free'])(
		'stores its %s attempts with their observations, and no card',
		async (phase) => {
			const ctx = setup(phase);
			await ctx.controller.start();
			ctx.clock.advance(ctx.metronome.beatTime(4) - 0.1 - ctx.clock.now() + 0.2);
			ctx.metronome.flush();
			expect(ctx.controller.view.status).toBe('awaiting');

			ctx.push({ value: 3 });
			await drain();
			ctx.controller.quit();
			await drain();

			const [attempt] = await ctx.deps.attempts.all();
			expect(attempt).toMatchObject({ mechanic: 'skill', phase, correct: true });
			expect(attempt.observations).toHaveLength(1);
			expect(await ctx.deps.cards.all()).toEqual([]);
		}
	);
});
