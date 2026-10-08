import { describe, expect, it, vi } from 'vitest';
import type { Attempt, Execution, PlannedItem, RecordedObservation } from '$lib/domain/types';
import type { SessionSelector } from '$lib/domain/progress';
import type { RoundOutcome } from '$lib/domain/timing';
import { identifyRules, locateRules, mechanicRules } from '$lib/domain/mechanics';
import {
	FakeClock,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository
} from '$lib/testing/fakes';
import { AttemptRecorder } from './AttemptRecorder';

const F_ON_B = { string: 2, pitch: 'F' } as const;
const LOCATE_RUN: Execution = { exerciseId: 'locate-neck', tempoBpm: 80 };
const IDENTIFY_RUN: Execution = { exerciseId: 'identify-neck', tempoBpm: null };

function item(overrides: Partial<PlannedItem> = {}): PlannedItem {
	return {
		exerciseId: 'locate-neck',
		mechanic: 'locate',
		item: F_ON_B,
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: 2,
		...overrides
	};
}

function identifyItem(): PlannedItem {
	return item({
		exerciseId: 'identify-neck',
		mechanic: 'identify',
		item: { string: 6, fret: 3 },
		leadBeats: null
	});
}

function outcome(overrides: Partial<RoundOutcome> = {}): RoundOutcome {
	return {
		verdict: 'perfect',
		correct: true,
		answer: { midi: 65 },
		timingOffsetMs: 0,
		reactionMs: null,
		laneBeat: 8,
		...overrides
	};
}

function setup(selector?: Partial<SessionSelector>) {
	const clock = new FakeClock();
	const attempts = new InMemoryAttemptRepository();
	const cards = new InMemoryCardStateRepository();
	const recorded: unknown[] = [];
	const spy: SessionSelector = {
		next: () => null,
		record: (attempt) => {
			recorded.push(attempt);
			return null;
		},
		cardChanged: () => {},
		...selector
	};
	const recorder = new AttemptRecorder({
		attempts,
		cards,
		clock,
		now: () => clock.toEpochMs(clock.now()),
		selector: spy,
		sessionId: 'sess-1',
		rules: mechanicRules
	});
	return { recorder, attempts, cards, recorded };
}

describe('AttemptRecorder', () => {
	it('tells the selector before the attempt is stored', async () => {
		const { recorder, attempts, recorded } = setup();
		const { attempt, stored } = recorder.record(
			item(),
			outcome(),
			1,
			locateRules.judge(F_ON_B, { midi: 65 }),
			LOCATE_RUN,
			[]
		);
		expect(recorder.sessionAttempts).toEqual([attempt]);
		expect(recorded).toEqual([attempt]);
		expect(await attempts.all()).toEqual([]);
		await stored;
		expect(await attempts.all()).toHaveLength(1);
	});

	it('stores a missed probe hot and a passed probe cold', async () => {
		const probe = item({ phase: 'probe', temperature: 'cold' });
		const passed = setup();
		const a = passed.recorder.record(
			probe,
			outcome(),
			1,
			locateRules.judge(F_ON_B, { midi: 65 }),
			LOCATE_RUN,
			[]
		);
		await a.stored;
		expect(a.attempt.temperature).toBe('cold');
		const missed = setup();
		const b = missed.recorder.record(
			probe,
			outcome({ verdict: 'wrong', correct: false, answer: { midi: 60 } }),
			1,
			locateRules.judge(F_ON_B, { midi: 60 }),
			LOCATE_RUN,
			[]
		);
		await b.stored;
		expect(b.attempt.temperature).toBe('hot');
	});

	it('creates the card of a learning prompt the selector does not report', async () => {
		const { recorder, cards } = setup();
		const planned = item({ phase: 'learning', temperature: 'hot' });
		await recorder.record(
			planned,
			outcome(),
			1,
			locateRules.judge(F_ON_B, { midi: 65 }),
			LOCATE_RUN,
			[]
		).stored;
		const card = await cards.get('locate:2:F');
		expect(card).toMatchObject({ mechanic: 'locate', item: F_ON_B, learnedAt: null });
	});

	it('records the confusion of a wrong note', () => {
		const { recorder } = setup();
		const { attempt } = recorder.record(
			item(),
			outcome({ verdict: 'wrong', correct: false, answer: { midi: 66 } }),
			1,
			locateRules.judge(F_ON_B, { midi: 66 }),
			LOCATE_RUN,
			[]
		);
		expect(attempt.data).toEqual({
			item: F_ON_B,
			answer: { midi: 66 },
			confusion: { kind: 'semitone', delta: 1 }
		});
	});

	it('stores a tapped name and its confusion', () => {
		const { recorder } = setup();
		const { attempt } = recorder.record(
			identifyItem(),
			outcome({ verdict: 'wrong', correct: false, answer: { pitch: 'G#' }, laneBeat: null }),
			1,
			identifyRules.judge({ string: 6, fret: 3 }, 'G#'),
			IDENTIFY_RUN,
			[]
		);
		expect(attempt.data).toEqual({
			item: { string: 6, fret: 3 },
			answer: { pitch: 'G#' },
			confusion: { kind: 'semitone', delta: 1 }
		});
	});

	it('stores no answer and no confusion when nothing was answered', () => {
		const { recorder } = setup();
		const { attempt } = recorder.record(
			item(),
			outcome({ verdict: 'wrong', correct: false, answer: null, timingOffsetMs: null }),
			1,
			null,
			LOCATE_RUN,
			[]
		);
		expect(attempt.data).toEqual({ item: F_ON_B, answer: null, confusion: null });
	});

	it('stamps each attempt with its exercise, mechanic and execution tempo', () => {
		const { recorder } = setup();
		const locate = recorder.record(
			item(),
			outcome(),
			1,
			locateRules.judge(F_ON_B, { midi: 65 }),
			{
				exerciseId: 'locate-neck',
				tempoBpm: 120
			},
			[]
		).attempt;
		const identify = recorder.record(
			identifyItem(),
			outcome({ answer: { pitch: 'G' }, laneBeat: null }),
			1,
			identifyRules.judge({ string: 6, fret: 3 }, 'G'),
			IDENTIFY_RUN,
			[]
		).attempt;
		expect(locate).toMatchObject({
			exerciseId: 'locate-neck',
			mechanic: 'locate',
			cardKey: 'locate:2:F',
			tempoBpm: 120
		});
		expect(identify).toMatchObject({
			exerciseId: 'identify-neck',
			mechanic: 'identify',
			cardKey: 'identify:6:3',
			tempoBpm: null
		});
	});

	it('judges direct recall at the execution tempo', async () => {
		// A 2-beat lead at 80 bpm (1 500 ms) is direct recall; at 60 bpm (2 000 ms) it is not.
		const probe = item({ phase: 'probe', temperature: 'cold', leadBeats: 2 });
		const judged = locateRules.judge(F_ON_B, { midi: 65 });
		const atEighty = setup();
		const fast = atEighty.recorder.record(probe, outcome(), 1, judged, LOCATE_RUN, []);
		await fast.stored;
		const atSixty = setup();
		const slow = atSixty.recorder.record(
			probe,
			outcome(),
			1,
			judged,
			{
				exerciseId: 'locate-neck',
				tempoBpm: 60
			},
			[]
		);
		await slow.stored;
		expect([fast.attempt.temperature, slow.attempt.temperature]).toEqual(['cold', 'hot']);
	});

	describe('observations', () => {
		const snapshot: RecordedObservation[] = [
			{ atMs: 1, sensor: 'note', fate: 'answer', correct: null, payload: { midi: 65 } }
		];
		const full: RecordedObservation[] = [
			...snapshot,
			{ atMs: 2, sensor: 'note', fate: 'answer', correct: null, payload: { midi: 60 } }
		];
		const judged = locateRules.judge(F_ON_B, { midi: 65 });

		it('stores the snapshot given to record, then the full list after completion', async () => {
			const { recorder, attempts } = setup();
			const { attempt, stored } = recorder.record(
				item(),
				outcome(),
				1,
				judged,
				LOCATE_RUN,
				snapshot
			);
			await stored;
			expect((await attempts.all())[0].observations).toEqual(snapshot);
			await recorder.completeObservations(attempt, full);
			expect(attempt.observations).toEqual(full);
			expect((await attempts.all())[0].observations).toEqual(full);
		});

		it('completes after the write when called before it resolves', async () => {
			const { recorder, attempts } = setup();
			let release!: () => void;
			const gate = new Promise<void>((resolve) => (release = resolve));
			let copied!: () => void;
			const added = new Promise<void>((resolve) => (copied = resolve));
			const add = attempts.add.bind(attempts);
			// The row is copied first, then the write stays pending until released.
			attempts.add = async (a: Attempt) => {
				const id = await add(a);
				copied();
				await gate;
				return id;
			};
			const { attempt, stored } = recorder.record(
				item(),
				outcome(),
				1,
				judged,
				LOCATE_RUN,
				snapshot
			);
			await added;
			const completed = recorder.completeObservations(attempt, full);
			expect(attempt.observations).toEqual(full);
			expect((await attempts.all())[0].observations).toEqual(snapshot);
			release();
			await Promise.all([stored, completed]);
			expect((await attempts.all())[0].observations).toEqual(full);
		});

		it('settled waits for completions', async () => {
			const { recorder, attempts } = setup();
			const { attempt, stored } = recorder.record(
				item(),
				outcome(),
				1,
				judged,
				LOCATE_RUN,
				snapshot
			);
			await stored;
			let release!: () => void;
			const gate = new Promise<void>((resolve) => (release = resolve));
			const set = attempts.setObservations.bind(attempts);
			attempts.setObservations = async (id, observations) => {
				await gate;
				return set(id, observations);
			};
			void recorder.completeObservations(attempt, full);
			let settled = false;
			const waiting = recorder.settled().then(() => (settled = true));
			await new Promise((resolve) => setTimeout(resolve, 0));
			expect(settled).toBe(false);
			release();
			await waiting;
			expect((await attempts.all())[0].observations).toEqual(full);
		});

		it('does not write for an attempt it did not record', async () => {
			const { recorder, attempts } = setup();
			const { attempt, stored } = recorder.record(
				item(),
				outcome(),
				1,
				judged,
				LOCATE_RUN,
				snapshot
			);
			await stored;
			await recorder.completeObservations({ ...attempt }, full);
			expect((await attempts.all())[0].observations).toEqual(snapshot);
		});

		it('reports a failed write and still settles', async () => {
			const { recorder, attempts } = setup();
			const failure = new Error('quota');
			attempts.add = async () => {
				throw failure;
			};
			const log = vi.spyOn(console, 'error').mockImplementation(() => {});
			const { attempt, stored } = recorder.record(
				item(),
				outcome(),
				1,
				judged,
				LOCATE_RUN,
				snapshot
			);
			await expect(stored).rejects.toBe(failure);
			await recorder.completeObservations(attempt, full).catch(() => {});
			await recorder.settled();
			expect(log).toHaveBeenCalledWith(expect.stringContaining('[neckspert]'), failure);
			log.mockRestore();
		});
	});
});

describe('AttemptRecorder with a prompt that adds to its card', () => {
	it('keeps on a new card only the part of the item its mechanic keeps', async () => {
		const { recorder, cards } = setup();
		const key = 'D|maj|3:5,2:1,1:3';
		const { stored } = recorder.record(
			item({
				exerciseId: 'triads-zone',
				mechanic: 'triad-zone',
				item: { voicingKey: key, position: 2 },
				phase: 'learning',
				temperature: 'hot',
				leadBeats: 8
			}),
			outcome({ answer: { decided: null } }),
			1,
			null,
			{ exerciseId: 'triads-zone', tempoBpm: 80 },
			[]
		);
		await stored;
		expect((await cards.get(`triad-zone:${key}`))?.item).toEqual({ voicingKey: key });
	});
});
