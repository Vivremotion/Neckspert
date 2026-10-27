import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CONTENT_DERIVATIONS, type ContentDerivation } from '$lib/domain/derivations';
import { validateExercise, type ExerciseDefinition } from '$lib/domain/exercise';
import { CONTENT_JUDGES } from '$lib/domain/judges';
import type { MechanicIdentity } from '$lib/domain/mechanics';
import type { ContentJudge, ResponseValue } from '$lib/domain/time';
import type { ItemPhase, PlannedItem } from '$lib/domain/types';
import type { MechanicPresenter } from '$lib/application/mechanics/types';
import {
	presentationProblem,
	screenProblem,
	type PromptStageModel
} from '$lib/application/presentation';
import { CONTENT_VIEWS, type ContentView } from '$lib/application/presentation/contentViews';
import { ITEM_FIELDS, type ItemFields } from '$lib/application/presentation/itemFields';
import { drain, gestureSeries } from '$lib/testing/gestureSeries';
import { seriesProblem } from './series/seriesProblem';
import type { Observation, SensorFactory } from './sensors';

/**
 * The promise of « Mechanics and exercises »: a mechanic the core has never heard of plays end to
 * end on the series once its vocabulary is registered (its fields, a derivation, a content judge
 * and its view) and an exercise written in data names it. Nothing in the core names it.
 */

interface FakeItem {
	n: number;
}
interface FakeAnswer {
	value: number;
}

const MECHANIC = 'fake';
const KIND = 'fake-number';

/** Its identity alone: the series reads no time relation and no judge of a mechanic. */
const identity: MechanicIdentity<FakeItem> = {
	id: MECHANIC,
	learner: 'skill',
	itemKey: ({ n }) => String(n),
	parseItem: (key) => ({ n: Number(key) })
};

/** Right when the value read equals n. */
const judge: ContentJudge = {
	judge: (value, payload) => {
		const answer = payload as FakeAnswer;
		return {
			correct: answer.value === (value as FakeItem).n,
			answer,
			confusion: answer.value === (value as FakeItem).n ? null : { got: answer.value }
		};
	}
};

/** The value answered, and after a miss the right one. */
const view: ContentView = {
	answerLabel: (_value, answer) => String((answer as FakeAnswer).value),
	miss: (value) => ({
		correction: `n = ${(value as FakeItem).n}`,
		heard: null,
		expected: null,
		gap: null
	})
};

const fields: ItemFields = {
	names: ['n'],
	fields: (item) => ({ n: String((item as FakeItem).n) })
};

const derivation: ContentDerivation = { kind: KIND, reads: [MECHANIC], derive: (item) => item };

const presenter: MechanicPresenter = {
	rules: identity as MechanicPresenter['rules'],
	scene: 'guitar',
	sensors: [MECHANIC],
	attemptData: (item, value: ResponseValue) => {
		const [result] = value.expectations;
		return { item, answer: result?.answer ?? null, confusion: result?.confusion ?? null };
	}
};

/**
 * Its exercise, data only: the number on the lane, answered on the beat four beats later; its
 * round, the target's bar and a breathing bar, listens until the middle of the breath.
 */
const EXERCISE: ExerciseDefinition = {
	id: 'fake-ex',
	version: 1,
	mechanic: MECHANIC,
	view: 'lane',
	tempo: 120,
	presentation: { primary: '{n}', secondary: { fr: 'le nombre', en: 'the number' } },
	round: {
		prompt: { lead: { param: 'leadBeats' } },
		expectations: [
			{ at: { beats: 0 }, sensor: MECHANIC, content: { from: 'fake-of-item' }, window: { ms: 80 } }
		],
		length: { bars: 1, breath: true },
		// Listening ends half a bar before the next prompt.
		listenBeforeEnd: { beats: 2 },
		policy: {
			unit: 'response',
			verdict: 'response',
			correction: false,
			pairing: {
				mode: 'first-answer',
				opens: { afterPromptMs: 300 },
				lateMs: 150,
				lateCapture: { ms: 400 }
			}
		}
	},
	params: { ladder: [{ params: { leadBeats: 4, aided: false }, pass: { successes: 1 } }] }
};

const registries = {
	fields: ITEM_FIELDS as Record<string, ItemFields>,
	derivations: CONTENT_DERIVATIONS as Record<string, ContentDerivation>,
	judges: CONTENT_JUDGES as Record<string, ContentJudge>,
	views: CONTENT_VIEWS as Record<string, ContentView>
};

beforeAll(() => {
	registries.fields[MECHANIC] = fields;
	registries.derivations['fake-of-item'] = derivation;
	registries.judges[KIND] = judge;
	registries.views[KIND] = view;
});

afterAll(() => {
	delete registries.fields[MECHANIC];
	delete registries.derivations['fake-of-item'];
	delete registries.judges[KIND];
	delete registries.views[KIND];
});

function item(n: number, phase: ItemPhase = 'free'): PlannedItem {
	return {
		exerciseId: EXERCISE.id,
		mechanic: MECHANIC,
		exerciseLevel: 0,
		item: { n },
		phase,
		temperature: 'hot',
		aid: 'none',
		leadBeats: 4
	};
}

/**
 * The series on fakes at ♩ = 120 from 0.1 s (a bar lasts 2 s): the counted bar is bar 0, the
 * prompt on bar 1, its target on bar 2, listening until bar 3.5; the next prompt on bar 4. `read`
 * sends what the fake sensor read of an attack.
 */
function setup(items: PlannedItem[] = [item(3), item(5)]) {
	let listener: ((observation: Observation) => void) | null = null;
	const sensor: SensorFactory = () => ({
		onObservation: (callback) => {
			listener = callback;
			return () => (listener = null);
		}
	});
	const ctx = gestureSeries(items, {
		mechanics: { [MECHANIC]: presenter },
		exercise: () => EXERCISE,
		sensors: { [MECHANIC]: sensor }
	});
	const target = ctx.bar(2);
	const read = (time: number, value: number, final = true) =>
		listener?.({ time, payload: { value }, readable: true, final });
	const lane = () => ctx.controller.view.stage?.model as PromptStageModel | undefined;
	return { ...ctx, target, read, lane };
}

/** To the prompt: the round opens. */
async function reachPrompt(ctx: ReturnType<typeof setup>) {
	await ctx.controller.start();
	ctx.runTo(ctx.bar(1));
	expect(ctx.controller.view.status).toBe('awaiting');
}

describe('a third mechanic, unknown to the core', () => {
	it('is an exercise the validator and the screen accept', () => {
		expect(validateExercise(EXERCISE, { sensors: [MECHANIC] })).toBeNull();
		expect(presentationProblem(EXERCISE)).toBeNull();
		expect(screenProblem(EXERCISE, { [MECHANIC]: presenter })).toBeNull();
		expect(seriesProblem(EXERCISE)).toBeNull();
	});

	it('plays a mechanic the core has never seen, on the beat', async () => {
		const ctx = setup();
		await reachPrompt(ctx);
		expect(ctx.lane()?.prompt).toMatchObject({ primary: '3', secondary: 'le nombre' });
		expect(ctx.lane()?.anchorBeat).toBe(8);

		ctx.runTo(ctx.target);
		ctx.read(ctx.target, 3);
		await drain();

		expect(ctx.controller.view.status).toBe('verdict');
		expect(ctx.lane()?.verdict).toMatchObject({ verdict: 'perfect', answerLabel: '3', misses: [] });
		const [attempt] = await ctx.stored();
		expect(attempt).toMatchObject({
			mechanic: MECHANIC,
			exerciseId: EXERCISE.id,
			cardKey: 'fake:3',
			tempoBpm: 120,
			success: true,
			data: { item: { n: 3 }, answer: { value: 3 }, confusion: null }
		});
	});

	it('keeps the answer among the observations of the attempt, as its sensor read it', async () => {
		const ctx = setup();
		await reachPrompt(ctx);
		ctx.runTo(ctx.target);
		ctx.read(ctx.target, 3);
		ctx.controller.quit();
		await drain();

		const [attempt] = await ctx.stored();
		const promptToTargetMs = (ctx.target - ctx.bar(1)) * 1000;
		expect(attempt.observations).toEqual([
			{
				atMs: expect.closeTo(promptToTargetMs, 6),
				sensor: MECHANIC,
				fate: 'answer',
				correct: true,
				payload: { value: 3 }
			}
		]);
	});

	it('shows what the mechanic tells after a miss', async () => {
		const ctx = setup();
		await reachPrompt(ctx);
		ctx.runTo(ctx.target);
		ctx.read(ctx.target, 4);
		await drain();

		expect(ctx.lane()?.verdict).toMatchObject({
			verdict: 'wrong',
			answerLabel: '4',
			misses: [{ correction: 'n = 3' }]
		});
		const [attempt] = await ctx.stored();
		expect(attempt.data).toEqual({ item: { n: 3 }, answer: { value: 4 }, confusion: { got: 4 } });
	});

	it.each<ItemPhase>(['learning', 'review', 'free'])(
		'stores its %s attempts with their observations, and no card, as a skill learner',
		async (phase) => {
			const ctx = setup([item(3, phase), item(5)]);
			await reachPrompt(ctx);
			ctx.runTo(ctx.target);
			ctx.read(ctx.target, 3);
			ctx.controller.quit();
			await drain();

			const [attempt] = await ctx.stored();
			expect(attempt).toMatchObject({ mechanic: MECHANIC, phase, correct: true });
			expect(attempt.observations).toHaveLength(1);
			expect(await ctx.cards.all()).toEqual([]);
		}
	);
});

describe('an answer that refines itself', () => {
	it('waits for the final reading of the attack and judges on it', async () => {
		const ctx = setup();
		await reachPrompt(ctx);
		ctx.runTo(ctx.target);
		ctx.read(ctx.target, 7, false);
		await drain();
		expect(ctx.controller.view.status).toBe('awaiting');
		expect(ctx.lane()?.verdict).toBeNull();
		ctx.read(ctx.target, 3);
		await drain();
		expect(ctx.lane()?.verdict).toMatchObject({ verdict: 'perfect', offsetMs: 0 });
		ctx.controller.quit();
		await drain();
		const [attempt] = await ctx.stored();
		expect(attempt.data).toEqual({ item: { n: 3 }, answer: { value: 3 }, confusion: null });
		expect(attempt.observations?.map((o) => [o.fate, o.correct])).toEqual([
			['answer', false],
			['answer', true]
		]);
	});

	it('judges on the last reading when no final one comes before listening ends', async () => {
		const ctx = setup();
		await reachPrompt(ctx);
		ctx.runTo(ctx.target);
		ctx.read(ctx.target, 7, false);
		ctx.read(ctx.target, 6, false);
		// Past the in-time zone: no provisional miss while a reading waits.
		ctx.runTo(ctx.target + 1);
		expect(ctx.lane()?.verdict).toBeNull();
		ctx.read(ctx.target, 5, false);
		ctx.runTo(ctx.bar(3.5));
		await drain();
		expect(ctx.lane()?.verdict).toMatchObject({
			verdict: 'wrong',
			misses: [{ correction: 'n = 3' }]
		});
		const [attempt] = await ctx.stored();
		expect(attempt.data).toEqual({ item: { n: 3 }, answer: { value: 5 }, confusion: { got: 5 } });
		expect(attempt.timingOffsetMs).toBe(0);
	});

	it('files another attack heard while a reading waits as settled', async () => {
		const ctx = setup();
		await reachPrompt(ctx);
		ctx.runTo(ctx.target);
		ctx.read(ctx.target, 7, false);
		ctx.read(ctx.target + 0.1, 3);
		ctx.runTo(ctx.bar(3.5));
		await drain();
		ctx.controller.quit();
		await drain();
		const [attempt] = await ctx.stored();
		expect(attempt.observations?.map((o) => o.fate)).toEqual(['answer', 'settled']);
		expect(attempt.success).toBe(false);
		expect(attempt.data).toMatchObject({ answer: { value: 7 } });
	});
});
