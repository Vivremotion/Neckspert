import { describe, expect, it } from 'vitest';
import type { MechanicRules } from '$lib/domain/mechanics';
import { beatTiming, createBeatTiming } from '$lib/domain/timing';
import { createListSource } from '$lib/domain/progress';
import type { ExerciseDefinition, Ladder } from '$lib/domain/exercise';
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

/** A mechanic on the beat whose rhythm comes from the exercise it is played in. */
const pacedRules: MechanicRules<FakeItem, { value: number }, { value: number }, never> = {
	id: 'paced',
	timing: beatTiming,
	timingFor: (pacing) => createBeatTiming(pacing),
	learner: 'memory',
	itemKey: ({ n }) => String(n),
	parseItem: (key) => ({ n: Number(key) }),
	judge: (item, payload) => ({
		correct: payload.value === item.n,
		answer: payload,
		confusion: null
	})
};

const pacedPresenter: MechanicPresenter<FakeItem, { value: number }> = {
	rules: pacedRules,
	scene: 'guitar',
	sensors: ['fake'],
	prompt: ({ n }) => ({ primary: String(n), secondary: '', aid: null, diagram: null }),
	answerLabel: ({ value }) => String(value),
	reveal: () => null
};

/** Leads 8, 4, 2: the old relation reads the leads of the written ladder. */
const LADDER: Ladder = [8, 4, 2].map((leadBeats) => ({ params: { leadBeats, aided: false } }));

const SLOW: ExerciseDefinition = {
	id: 'slow-breath',
	version: 1,
	mechanic: 'paced',
	params: { pacing: { respirationBars: 2 }, ladder: LADDER }
};

const PLAIN: ExerciseDefinition = {
	id: 'plain',
	version: 1,
	mechanic: 'paced',
	params: { ladder: LADDER }
};

function item(exerciseId: string, n: number): PlannedItem {
	return {
		exerciseId,
		mechanic: 'paced',
		item: { n },
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: 4
	};
}

function setup(exercise: ExerciseDefinition) {
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
	const executions: Execution[] = [{ exerciseId: exercise.id, tempoBpm: 100 }];
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
		mechanics: { paced: pacedPresenter },
		sensors: { fake: fakeSensor },
		exercise: (id) => [SLOW, PLAIN].find((e) => e.id === id)!
	};
	const controller = new SessionController(
		{ id: 'sess-1', kind: 'free' },
		async () => ({
			selector: createListSource([item(exercise.id, 1), item(exercise.id, 2)]),
			executions
		}),
		deps
	);
	const atBeat = (index: number) => {
		const announced = metronome.beatTime(index) - 0.1;
		if (announced > clock.now()) clock.advance(announced - clock.now());
		metronome.flush();
	};
	const play = (value: number, beat: number) =>
		listener?.({ time: metronome.beatTime(beat), payload: { value }, readable: true });
	return { controller, atBeat, play };
}

async function drain() {
	for (let i = 0; i < 8; i++) await Promise.resolve();
}

/** Plays the first prompt (beat 4, target 8) right, then returns the beat of the second prompt. */
async function secondPromptBeat(exercise: ExerciseDefinition): Promise<number | null> {
	const ctx = setup(exercise);
	await ctx.controller.start();
	ctx.atBeat(4);
	expect(ctx.controller.view.prompt?.primary).toBe('1');
	ctx.play(1, 8);
	await drain();
	for (let beat = 9; beat <= 20; beat++) {
		ctx.atBeat(beat);
		if (ctx.controller.view.prompt?.primary === '2') return ctx.controller.view.promptBeatIndex;
	}
	return null;
}

describe('the pacing of an exercise', () => {
	it('waits the breathing bars of the exercise before the next prompt', async () => {
		expect(await secondPromptBeat(SLOW)).toBe(16);
	});

	it('keeps one breathing bar for an exercise without a pacing', async () => {
		expect(await secondPromptBeat(PLAIN)).toBe(12);
	});
});
