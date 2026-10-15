import { describe, expect, it } from 'vitest';
import type { MechanicRules } from '$lib/domain/mechanics';
import { beatTiming } from '$lib/domain/timing';
import { createListSelector } from '$lib/domain/progress';
import { responseVerdictOf, type Execution, type PlannedItem } from '$lib/domain/types';
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

/** Right when the value equals n; a wrong value is confused with itself. */
const rules: MechanicRules<FakeItem, { value: number }, { value: number }, { got: number }> = {
	id: 'refined',
	timing: beatTiming,
	learner: 'memory',
	itemKey: ({ n }) => String(n),
	parseItem: (key) => ({ n: Number(key) }),
	judge: (item, payload) => ({
		correct: payload.value === item.n,
		answer: payload,
		confusion: payload.value === item.n ? null : { got: payload.value }
	})
};

const presenter: MechanicPresenter<FakeItem, { value: number }> = {
	rules,
	scene: 'guitar',
	sensors: ['slow'],
	prompt: ({ n }) => ({ primary: String(n), secondary: '', aid: null, diagram: null }),
	answerLabel: ({ value }) => String(value),
	reveal: ({ n }, { verdict }) => (verdict === 'wrong' ? `n = ${n}` : null)
};

const EXECUTIONS: Execution[] = [{ exerciseId: 'refined-ex', tempoBpm: 80 }];

const ITEM: PlannedItem = {
	exerciseId: 'refined-ex',
	mechanic: 'refined',
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
		mechanics: { refined: presenter },
		sensors: { slow: sensor }
	};
	const controller = new SessionController(
		{ id: 'sess-1', kind: 'free' },
		async () => ({ selector: createListSelector([ITEM, ITEM]), executions: EXECUTIONS }),
		deps
	);
	const atBeat = (index: number) => {
		const announced = metronome.beatTime(index) - 0.1;
		if (announced > clock.now()) clock.advance(announced - clock.now());
		metronome.flush();
	};
	/** A reading of the attack on `beat`, heard `afterS` seconds later. */
	const read = (beat: number, value: number, final: boolean) =>
		listener?.({
			time: metronome.beatTime(beat),
			payload: { value },
			readable: true,
			final
		});
	return { controller, deps, atBeat, read };
}

async function drain() {
	for (let i = 0; i < 8; i++) await Promise.resolve();
}

async function reachPrompt(ctx: ReturnType<typeof setup>) {
	await ctx.controller.start();
	ctx.atBeat(4);
	expect(ctx.controller.view.status).toBe('awaiting');
}

describe('an answer that refines itself', () => {
	it('waits for the final reading of the attack and judges on it', async () => {
		const ctx = setup();
		await reachPrompt(ctx);
		ctx.read(8, 7, false);
		await drain();
		expect(ctx.controller.view.lastVerdict).toBeNull();
		ctx.read(8, 3, true);
		await drain();
		expect(ctx.controller.view.lastVerdict).toMatchObject({ verdict: 'perfect', offsetMs: 0 });
		const [attempt] = await ctx.deps.attempts.all();
		expect(attempt.data).toEqual({ item: { n: 3 }, answer: { value: 3 }, confusion: null });
		expect(attempt.observations?.map((o) => [o.fate, o.correct])).toEqual([
			['answer', false],
			['answer', true]
		]);
	});

	it('judges on the last reading when no final one comes before the capture ends', async () => {
		const ctx = setup();
		await reachPrompt(ctx);
		ctx.read(8, 7, false);
		ctx.read(8, 6, false);
		ctx.atBeat(9);
		// No provisional miss while a reading waits.
		expect(ctx.controller.view.lastVerdict).toBeNull();
		ctx.read(8, 5, false);
		ctx.atBeat(11);
		await drain();
		expect(ctx.controller.view.lastVerdict).toMatchObject({
			verdict: 'wrong',
			correction: 'n = 3'
		});
		const [attempt] = await ctx.deps.attempts.all();
		expect(attempt.data).toEqual({ item: { n: 3 }, answer: { value: 5 }, confusion: { got: 5 } });
		expect(attempt.timingOffsetMs).toBe(0);
	});

	it('files another attack heard while a reading waits as settled', async () => {
		const ctx = setup();
		await reachPrompt(ctx);
		ctx.read(8, 7, false);
		ctx.read(9, 3, true);
		ctx.atBeat(11);
		await drain();
		ctx.controller.quit();
		await drain();
		const [attempt] = await ctx.deps.attempts.all();
		expect(attempt.observations?.map((o) => o.fate)).toEqual(['answer', 'settled']);
		expect(responseVerdictOf(attempt)).toBe('wrong');
	});
});
