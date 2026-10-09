import { describe, expect, it } from 'vitest';
import type { MechanicRules } from '$lib/domain/mechanics';
import { beatTiming, createAnchorTiming } from '$lib/domain/timing';
import { DEFAULT_PACING } from '$lib/domain/exercise';
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

/** Heard by two sensors: right when the value equals n, whichever sensor read it. */
const twoRules: MechanicRules<FakeItem, { value: number }, { value: number; by: string }, never> = {
	id: 'two',
	timing: beatTiming,
	learner: 'memory',
	itemKey: ({ n }) => String(n),
	parseItem: (key) => ({ n: Number(key) }),
	judge: (item, payload, sensor) => ({
		correct: payload.value === item.n,
		answer: { value: payload.value, by: sensor ?? '' },
		confusion: null
	})
};

const rounds: { n: number; previous: PlannedItem | null }[] = [];

const twoPresenter: MechanicPresenter<FakeItem, { value: number; by: string }> = {
	rules: twoRules,
	scene: 'guitar',
	sensors: ['a', 'b'],
	prompt: ({ n }) => ({ primary: String(n), secondary: '', aid: null, diagram: null }),
	answerLabel: ({ value }) => String(value),
	reveal: () => null,
	expectation: (item, { previous }) => {
		rounds.push({ n: item.n, previous });
		return { a: `a${item.n}`, b: `b${item.n}` };
	}
};

/** Another mechanic, so that a third sensor is open in the series. */
const otherPresenter: MechanicPresenter<FakeItem, { value: number; by: string }> = {
	...twoPresenter,
	rules: { ...twoRules, id: 'other' },
	sensors: ['c']
};

/** The same, with a second gesture in the rest of the target bar. */
const anchoredPresenter: MechanicPresenter<FakeItem, { value: number; by: string }> = {
	...twoPresenter,
	rules: { ...twoRules, id: 'anchored', timing: createAnchorTiming(DEFAULT_PACING) }
};

/** The anchor's two sensors: the root by the note sensor, then the chord by the chord sensor. */
const rootAndChordPresenter: MechanicPresenter<FakeItem, { value: number; by: string }> = {
	...anchoredPresenter,
	rules: { ...anchoredPresenter.rules, id: 'root-chord' },
	sensors: ['note', 'chord']
};

const HEARD = { notes: [{ string: 1 as const, fret: 3 }] };
const EXPECTED = { notes: [{ string: 1 as const, fret: 5 }] };

/** Draws what it heard after a miss. */
const drawnPresenter: MechanicPresenter<FakeItem, { value: number; by: string }> = {
	...twoPresenter,
	rules: { ...twoRules, id: 'drawn' },
	feedback: (_item, { verdict }) =>
		verdict === 'wrong' ? { heard: HEARD, expected: EXPECTED, gap: 'other' } : null
};

const EXECUTIONS: Execution[] = [{ exerciseId: 'two-ex', tempoBpm: 100 }];

function item(n: number, mechanic = 'two'): PlannedItem {
	return {
		exerciseId: 'two-ex',
		mechanic,
		item: { n },
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: 4
	};
}

function setup(mechanic = 'two', imposed?: 'strings' | 'grid') {
	rounds.length = 0;
	const clock = new FakeClock();
	const metronome = new FakeMetronome(clock);
	const listeners = new Map<string, (observation: Observation) => void>();
	const expected = new Map<string, unknown[]>();
	const sensor =
		(kind: string): SensorFactory =>
		() => ({
			onObservation: (callback) => {
				listeners.set(kind, callback);
				return () => listeners.delete(kind);
			},
			expect: (expectation) => {
				expected.set(kind, [...(expected.get(kind) ?? []), expectation]);
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
		mechanics: {
			two: twoPresenter,
			other: otherPresenter,
			anchored: anchoredPresenter,
			'root-chord': rootAndChordPresenter,
			drawn: drawnPresenter
		},
		exercise: (id) => ({
			id,
			version: 1,
			mechanic,
			params: {},
			...(imposed && { chordDiagram: imposed })
		}),
		sensors: {
			a: sensor('a'),
			b: sensor('b'),
			c: sensor('c'),
			note: sensor('note'),
			chord: sensor('chord')
		}
	};
	const controller = new SessionController(
		{ id: 'sess-1', kind: 'free' },
		async () => ({
			selector: createListSelector([item(3, mechanic), item(5, mechanic)]),
			executions: EXECUTIONS
		}),
		deps
	);
	const atBeat = (index: number) => {
		const announced = metronome.beatTime(index) - 0.1;
		if (announced > clock.now()) clock.advance(announced - clock.now());
		metronome.flush();
	};
	const emit = (kind: string, value: number, beat: number) =>
		listeners.get(kind)?.({ time: metronome.beatTime(beat), payload: { value }, readable: true });
	return { controller, deps, atBeat, emit, expected };
}

async function drain() {
	for (let i = 0; i < 8; i++) await Promise.resolve();
}

describe('a mechanic heard by two sensors', () => {
	it('gives each sensor its own expectation, and nothing to a sensor it does not listen to', async () => {
		const ctx = setup();
		await ctx.controller.start();
		ctx.atBeat(4);
		expect(ctx.expected.get('a')?.at(-1)).toBe('a3');
		expect(ctx.expected.get('b')?.at(-1)).toBe('b3');
		expect(ctx.expected.get('c')?.at(-1)).toBeNull();
	});

	it('takes an answer from either of its sensors, judged with the sensor that read it', async () => {
		const ctx = setup();
		await ctx.controller.start();
		ctx.atBeat(4);
		ctx.emit('b', 3, 8);
		await drain();
		expect(ctx.controller.view.lastVerdict?.verdict).toBe('perfect');
		const [attempt] = await ctx.deps.attempts.all();
		expect(attempt.data).toMatchObject({ answer: { value: 3, by: 'b' } });
	});

	it('files an observation of a sensor it does not listen to as another sensor', async () => {
		const ctx = setup();
		await ctx.controller.start();
		ctx.atBeat(4);
		ctx.emit('c', 3, 7);
		ctx.emit('a', 3, 8);
		await drain();
		const [attempt] = await ctx.deps.attempts.all();
		expect(attempt.observations?.map((o) => [o.sensor, o.fate, o.correct])).toEqual([
			['c', 'other-sensor', null],
			['a', 'answer', true]
		]);
	});

	it('tells the expectation the prompt before it', async () => {
		const ctx = setup();
		await ctx.controller.start();
		ctx.atBeat(4);
		ctx.emit('a', 3, 8);
		await drain();
		for (let beat = 9; beat <= 16; beat++) ctx.atBeat(beat);
		expect(rounds.map((r) => [r.n, (r.previous?.item as FakeItem | undefined)?.n ?? null])).toEqual(
			[
				[3, null],
				[5, 3]
			]
		);
	});

	it('tells no prompt before the first one after a pause: nothing rings any more', async () => {
		const ctx = setup();
		await ctx.controller.start();
		ctx.atBeat(4);
		ctx.controller.pause();
		ctx.controller.resume();
		for (let beat = 0; beat <= 4; beat++) ctx.atBeat(beat);
		expect(rounds.map((r) => [r.n, (r.previous?.item as FakeItem | undefined)?.n ?? null])).toEqual(
			[
				[3, null],
				[5, null]
			]
		);
	});

	it('shows the beats of a second gesture after the target, and only for its prompt', async () => {
		const ctx = setup('anchored');
		await ctx.controller.start();
		ctx.atBeat(4);
		expect(ctx.controller.view.targetBeatIndex).toBe(8);
		expect(ctx.controller.view.followUp).toEqual({ fromBeat: 9, untilBeat: 12 });
		ctx.controller.pause();
		expect(ctx.controller.view.followUp).toBeNull();
	});

	it('shows no second gesture for a prompt played on the beat alone', async () => {
		const ctx = setup();
		await ctx.controller.start();
		ctx.atBeat(4);
		expect(ctx.controller.view.followUp).toBeNull();
	});

	it('shows a miss read from an observation at once, then the verdict that settles it', async () => {
		const ctx = setup('root-chord');
		await ctx.controller.start();
		ctx.atBeat(4);
		ctx.emit('note', 3, 8);
		ctx.emit('chord', 4, 10);
		await drain();
		expect(ctx.controller.view.lastVerdict?.verdict).toBe('wrong');
		expect(ctx.controller.view.history).toEqual([{ beatIndex: 8, verdict: 'wrong' }]);
		expect(await ctx.deps.attempts.all()).toHaveLength(0);

		ctx.emit('chord', 3, 11);
		await drain();
		expect(ctx.controller.view.lastVerdict?.verdict).toBe('corrected');
		expect(ctx.controller.view.history).toEqual([{ beatIndex: 8, verdict: 'corrected' }]);
		const attempts = await ctx.deps.attempts.all();
		expect(attempts.map((a) => [a.verdict, a.correct])).toEqual([['corrected', false]]);
		expect(attempts[0].data).toMatchObject({
			answer: { root: { value: 3 }, chord: { value: 4 }, correction: { value: 3 } }
		});
	});

	it('draws in the verdict what the mechanic heard and expected after a miss', async () => {
		const ctx = setup('drawn');
		await ctx.controller.start();
		ctx.atBeat(4);
		ctx.emit('a', 4, 8);
		await drain();
		expect(ctx.controller.view.lastVerdict).toMatchObject({
			verdict: 'wrong',
			heard: HEARD,
			expected: EXPECTED,
			gap: 'other'
		});
	});

	it('draws nothing in the verdict for a mechanic without shapes', async () => {
		const ctx = setup();
		await ctx.controller.start();
		ctx.atBeat(4);
		ctx.emit('a', 4, 8);
		await drain();
		expect(ctx.controller.view.lastVerdict?.heard ?? null).toBeNull();
	});

	it('draws chords as the player chose, unless the exercise says', async () => {
		const chosen = setup();
		await chosen.deps.settings.update({ chordDiagram: 'grid' });
		await chosen.controller.start();
		chosen.atBeat(4);
		expect(chosen.controller.view.chordDiagram).toBe('grid');

		const imposed = setup('drawn', 'strings');
		await imposed.deps.settings.update({ chordDiagram: 'grid' });
		await imposed.controller.start();
		imposed.atBeat(4);
		expect(imposed.controller.view.chordDiagram).toBe('strings');
	});
});
