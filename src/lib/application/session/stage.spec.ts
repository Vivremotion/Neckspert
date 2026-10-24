import { describe, expect, it } from 'vitest';
import type { ExerciseDefinition } from '$lib/domain/exercise';
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
import { DEFAULT_PLAY_VIEW } from './contract';
import type { Observation, SensorFactory } from './sensors';
import type { SessionDeps } from './SessionDeps';
import { SessionController } from './SessionController.svelte';

interface StagedItem {
	n: number;
}

const rules: MechanicRules<StagedItem, { value: number }, { value: number }, never> = {
	id: 'staged',
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

const plain: MechanicPresenter<StagedItem, { value: number }> = {
	rules,
	scene: 'guitar',
	sensors: ['fake'],
	prompt: ({ n }) => ({ primary: String(n), secondary: '', aid: null, diagram: null }),
	answerLabel: ({ value }) => String(value),
	reveal: () => null
};

/** The same mechanic giving the screen a model: its item, and the verdict once settled. */
const staged: MechanicPresenter<StagedItem, { value: number }> = {
	...plain,
	stage: (item, settled, locale) => ({
		model: { n: item.n, verdict: settled?.verdict ?? null, answer: settled?.answer ?? null, locale }
	})
};

const WITH_VIEW: ExerciseDefinition = {
	id: 'with-view',
	version: 1,
	mechanic: 'staged',
	params: {},
	view: 'fake-view'
};
const WITHOUT_VIEW: ExerciseDefinition = { ...WITH_VIEW, id: 'without-view', view: undefined };

function setup(presenter: MechanicPresenter, exercise: ExerciseDefinition) {
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
	const executions: Execution[] = [{ exerciseId: exercise.id, tempoBpm: 100 }];
	const item: PlannedItem = {
		exerciseId: exercise.id,
		mechanic: 'staged',
		item: { n: 3 },
		phase: 'free',
		temperature: 'hot',
		aid: 'none',
		leadBeats: 4
	};
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
		mechanics: { staged: presenter },
		sensors: { fake: sensor },
		exercise: () => exercise
	};
	const controller = new SessionController(
		{ id: 'sess-1', kind: 'free' },
		async () => ({ selector: createListSource([item]), executions }),
		deps
	);
	const atBeat = (index: number) => {
		const announced = metronome.beatTime(index) - 0.1;
		if (announced > clock.now()) clock.advance(announced - clock.now());
		metronome.flush();
	};
	const play = (value: number) =>
		listener?.({ time: metronome.beatTime(8), payload: { value }, readable: true });
	return { controller, atBeat, play };
}

describe('the screen model of a mechanic', () => {
	it('shows during the counted bar in the view its exercise names, then changes when settled', async () => {
		const ctx = setup(staged, WITH_VIEW);
		await ctx.controller.start();
		ctx.atBeat(1);
		expect(ctx.controller.view.status).toBe('count-in');
		expect(ctx.controller.view.stage).toEqual({
			view: 'fake-view',
			model: { n: 3, verdict: null, answer: null, locale: 'fr' }
		});
		ctx.atBeat(4);
		expect(ctx.controller.view.stage?.model).toEqual({
			n: 3,
			verdict: null,
			answer: null,
			locale: 'fr'
		});
		ctx.play(3);
		expect(ctx.controller.view.stage).toEqual({
			view: 'fake-view',
			model: { n: 3, verdict: 'perfect', answer: { value: 3 }, locale: 'fr' }
		});
	});

	it('names the default view when the exercise names none', async () => {
		const ctx = setup(staged, WITHOUT_VIEW);
		await ctx.controller.start();
		expect(DEFAULT_PLAY_VIEW).toBe('grid-scroll');
		expect(ctx.controller.view.stage?.view).toBe('grid-scroll');
	});

	it('stays null for a mechanic without a screen model', async () => {
		const ctx = setup(plain, WITH_VIEW);
		await ctx.controller.start();
		ctx.atBeat(4);
		expect(ctx.controller.view.status).toBe('awaiting');
		expect(ctx.controller.view.stage).toBeNull();
	});
});
