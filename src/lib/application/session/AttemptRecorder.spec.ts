import { cardKey } from '$lib/domain/types';
import { describe, expect, it, vi } from 'vitest';
import type { Attempt, LevelState, PlannedItem, RecordedObservation } from '$lib/domain/types';
import { introduceCard, markLearned, type ItemSource } from '$lib/domain/progress';
import { directRecallWithin } from '$lib/domain/learning';
import { noteOnStringSet } from '$lib/domain/sets';
import {
	FakeClock,
	InMemoryAttemptRepository,
	InMemoryCardStateRepository,
	InMemoryLevelStateRepository
} from '$lib/testing/fakes';
import { AttemptRecorder } from './AttemptRecorder';
import { ObservationSpan } from './observationSpan';

const F_ON_B = { string: 2, pitch: 'F' } as const;

function item(overrides: Partial<PlannedItem> = {}): PlannedItem {
	return {
		exerciseId: 'locate-note-string',
		skill: 'locate-note-string',
		exerciseLevel: 0,
		item: F_ON_B,
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: 2,
		level: 2,
		...overrides
	};
}

describe('AttemptRecorder', () => {
	const THRESHOLD_MS = 1500;
	const LOCATE_KEY = cardKey('locate-note-string', noteOnStringSet.itemKey(F_ON_B));

	/** A note's response attempt as `recordedAttempt` writes it: hot, at the item's lead. */
	function noteAttempt(
		planned: PlannedItem,
		{ success = true, reactionMs = 500 }: { success?: boolean; reactionMs?: number } = {}
	): Omit<Attempt, 'id'> {
		return {
			sessionId: 'sess-1',
			exerciseId: planned.exerciseId,
			skill: planned.skill,
			cardKey: LOCATE_KEY,
			phase: planned.phase,
			temperature: 'hot',
			aids: [],
			promptedAt: 1_000,
			tempoBpm: 80,
			leadBeats: planned.leadBeats,
			timingOffsetMs: 0,
			reactionMs,
			correct: success,
			success,
			verdict: {
				relation: 'response',
				version: 1,
				value: {
					verdict: success ? 'perfect' : 'wrong',
					timingOffsetMs: 0,
					reactionMs,
					leadMs: 1500,
					expectations: []
				}
			},
			measures: {},
			plan: null,
			data: { item: planned.item, answer: null, confusion: null },
			observations: []
		};
	}

	/**
	 * `countsCold`: whether an item's level asks a direct recall; by default every level does,
	 * null gives the recorder none.
	 */
	function setupResponse(
		selector?: Partial<ItemSource>,
		withRecall = true,
		countsCold: ((planned: PlannedItem) => boolean) | null = () => true
	) {
		const clock = new FakeClock();
		const attempts = new InMemoryAttemptRepository();
		const cards = new InMemoryCardStateRepository();
		const levels = new InMemoryLevelStateRepository();
		const told: { attempt: Attempt; temperature: string; stored: number }[] = [];
		let writes = 0;
		const add = attempts.add.bind(attempts);
		attempts.add = (attempt) => {
			writes += 1;
			return add(attempt);
		};
		const source: ItemSource = {
			next: () => null,
			record: (attempt) => {
				told.push({ attempt, temperature: attempt.temperature, stored: writes });
				return null;
			},
			cardChanged: () => {},
			...selector
		};
		const recorder = new AttemptRecorder({
			attempts,
			cards,
			clock,
			now: () => 5_000,
			selector: source,
			sessionId: 'sess-1',
			recall: withRecall ? () => directRecallWithin(THRESHOLD_MS) : undefined,
			levels,
			...(countsCold && { countsCold })
		});
		return { recorder, attempts, cards, levels, told };
	}

	const span = (planned: PlannedItem) => new ObservationSpan(1, planned);

	it('tells the source before any write, with a provisional temperature', async () => {
		const { recorder, attempts, told } = setupResponse();
		const review = item({ phase: 'review', temperature: 'cold' });
		const first = noteAttempt(review);
		const written = recorder.recordResponse(first, span(review), review);
		expect(told).toEqual([{ attempt: first, temperature: 'cold', stored: 0 }]);
		await written;
		const again = noteAttempt(review);
		void recorder.recordResponse(again, span(review), review);
		expect(told[1]).toMatchObject({ temperature: 'hot' });
		await recorder.settled();
		expect(await attempts.all()).toHaveLength(2);
	});

	it('refuses an attempt of a memory skill without a recall rule', () => {
		const { recorder } = setupResponse(undefined, false);
		const review = item({ phase: 'review', temperature: 'cold' });
		expect(() => recorder.recordResponse(noteAttempt(review), span(review), review)).toThrow(
			'No direct-recall rule for skill locate-note-string'
		);
	});

	it('grades a cold review through FSRS and stores its card', async () => {
		const { recorder, cards } = setupResponse();
		const card = markLearned(
			introduceCard({ key: LOCATE_KEY, skill: 'locate-note-string', item: F_ON_B }, 0, 'old'),
			0
		);
		await cards.put(card);
		const review = item({ phase: 'review', temperature: 'cold' });
		await recorder.recordResponse(noteAttempt(review), span(review), review);
		await recorder.settled();
		const stored = await cards.get(LOCATE_KEY);
		expect(stored?.scheduling.reps).toBeGreaterThan(card.scheduling.reps);
		expect(stored?.acquiredAt).toBe(5_000);
	});

	it('introduces the card of a first learning prompt', async () => {
		const { recorder, cards } = setupResponse();
		const learning = item({ phase: 'learning', temperature: 'hot' });
		await recorder.recordResponse(noteAttempt(learning), span(learning), learning);
		await recorder.settled();
		expect(await cards.get(LOCATE_KEY)).toMatchObject({
			key: LOCATE_KEY,
			item: F_ON_B,
			introducedAt: 5_000,
			introducedInSession: 'sess-1',
			learnedAt: null
		});
	});

	it('writes the level the source moved, and none when it moved none', async () => {
		const level: LevelState = {
			exerciseId: 'locate-note-string',
			scope: '',
			item: 'F@2',
			level: 2,
			successes: 0,
			failures: 0,
			resumeAfter: null
		};
		const moved = setupResponse({ record: () => ({ level }) });
		const learning = item({ phase: 'learning', temperature: 'hot' });
		await moved.recorder.recordResponse(noteAttempt(learning), span(learning), learning);
		await moved.recorder.settled();
		expect(await moved.levels.all()).toEqual([level]);

		const still = setupResponse();
		await still.recorder.recordResponse(noteAttempt(learning), span(learning), learning);
		await still.recorder.settled();
		expect(await still.levels.all()).toEqual([]);
	});

	/** F on B learned long ago, untouched since. */
	const learnedLongAgo = () =>
		markLearned(
			introduceCard(
				{ key: LOCATE_KEY, skill: 'locate-note-string', item: F_ON_B },
				-10_000_000,
				'old'
			),
			-9_000_000
		);

	it('counts a free-play attempt on a learned card cold, through FSRS, and tells the source the card', async () => {
		const changed: number[] = [];
		const { recorder, cards } = setupResponse({
			cardChanged: (card) => changed.push(card.scheduling.reps)
		});
		const card = learnedLongAgo();
		await cards.put(card);
		const free = item({ phase: 'free', temperature: 'hot' });
		const attempt = noteAttempt(free);
		await recorder.recordResponse(attempt, span(free), free);
		await recorder.settled();
		expect(attempt.temperature).toBe('cold');
		expect(changed).toEqual([card.scheduling.reps + 1]);
		expect((await cards.get(LOCATE_KEY))?.scheduling.reps).toBe(card.scheduling.reps + 1);
	});

	describe('only at a level that asks a direct recall', () => {
		/** A learned card, its last attempt two hours before the prompt (`promptedAt` 1 000). */
		async function learnedAndRested(setup: ReturnType<typeof setupResponse>) {
			const card = { ...learnedLongAgo(), acquiredAt: -8_000_000, masteredAt: -7_000_000 };
			await setup.cards.put(card);
			const before = noteAttempt(item({ phase: 'review' }));
			await setup.attempts.add({ ...before, sessionId: 'old', promptedAt: 1_000 - 7_200_000 });
			return card;
		}

		for (const phase of ['review', 'free'] as const) {
			it(`counts a ${phase} attempt cold at such a level, and keeps it hot elsewhere, its card untouched`, async () => {
				const atTop = (planned: PlannedItem) => planned.level === 2;
				const cold = setupResponse(undefined, true, atTop);
				const coldCard = await learnedAndRested(cold);
				const top = item({ phase, temperature: phase === 'review' ? 'cold' : 'hot', level: 2 });
				const recalled = noteAttempt(top);
				await cold.recorder.recordResponse(recalled, span(top), top);
				await cold.recorder.settled();
				expect(recalled.temperature).toBe('cold');
				const graded = await cold.cards.get(LOCATE_KEY);
				expect(graded?.scheduling.reps).toBe(coldCard.scheduling.reps + 1);

				const hot = setupResponse(undefined, true, atTop);
				const hotCard = await learnedAndRested(hot);
				const below = item({ phase, temperature: phase === 'review' ? 'cold' : 'hot', level: 1 });
				const shown = noteAttempt(below);
				await hot.recorder.recordResponse(shown, span(below), below);
				await hot.recorder.settled();
				expect(shown.temperature).toBe('hot');
				expect((await hot.attempts.listByCard(LOCATE_KEY)).at(-1)?.temperature).toBe('hot');
				// Neither its schedule, nor `acquiredAt`, nor `masteredAt` rewritten.
				expect(await hot.cards.get(LOCATE_KEY)).toEqual(hotCard);
			});
		}

		it('never counts cold without the rule, or on an item without a level', async () => {
			const without = setupResponse(undefined, true, null);
			const card = await learnedAndRested(without);
			const review = item({ phase: 'review', temperature: 'cold' });
			const attempt = noteAttempt(review);
			await without.recorder.recordResponse(attempt, span(review), review);
			await without.recorder.settled();
			expect(attempt.temperature).toBe('hot');
			expect(await without.cards.get(LOCATE_KEY)).toEqual(card);

			const unleveled = setupResponse();
			await learnedAndRested(unleveled);
			const { level: _level, ...noLevel } = item({ phase: 'free', temperature: 'hot' });
			const free = noteAttempt(noLevel);
			await unleveled.recorder.recordResponse(free, span(noLevel), noLevel);
			await unleveled.recorder.settled();
			expect(free.temperature).toBe('hot');
		});

		it('tells the source a hot provisional temperature for a review at another level', () => {
			const { recorder, told } = setupResponse(undefined, true, () => false);
			const review = item({ phase: 'review', temperature: 'cold', level: 1 });
			void recorder.recordResponse(noteAttempt(review), span(review), review);
			expect(told).toEqual([expect.objectContaining({ temperature: 'hot' })]);
		});
	});

	it('keeps free play hot on a note without a learned card, its card untouched', async () => {
		const { recorder, cards } = setupResponse();
		const being = introduceCard(
			{ key: LOCATE_KEY, skill: 'locate-note-string', item: F_ON_B },
			-10_000_000,
			'old'
		);
		await cards.put(being);
		const free = item({ phase: 'free', temperature: 'hot' });
		const attempt = noteAttempt(free);
		await recorder.recordResponse(attempt, span(free), free);
		await recorder.settled();
		expect(attempt.temperature).toBe('hot');
		expect(await cards.get(LOCATE_KEY)).toEqual(being);

		const none = setupResponse();
		const unknown = noteAttempt(free, { success: false });
		await none.recorder.recordResponse(unknown, span(free), free);
		await none.recorder.settled();
		expect(unknown.temperature).toBe('hot');
		expect(await none.cards.all()).toEqual([]);
	});

	it('keeps consolidation hot and leaves the card alone', async () => {
		const { recorder, cards } = setupResponse();
		const card = learnedLongAgo();
		await cards.put(card);
		const consolidation = item({ phase: 'consolidation', temperature: 'hot' });
		const attempt = noteAttempt(consolidation);
		await recorder.recordResponse(attempt, span(consolidation), consolidation);
		await recorder.settled();
		expect(attempt.temperature).toBe('hot');
		expect(await cards.get(LOCATE_KEY)).toEqual(card);
	});

	it('stores the card the source reports for a learning prompt', async () => {
		const known = introduceCard(
			{ key: LOCATE_KEY, skill: 'locate-note-string', item: F_ON_B },
			0,
			'sess-1'
		);
		const learned = markLearned(known, 123);
		const taught = setupResponse({ record: () => ({ card: learned }) });
		const learning = item({ phase: 'learning', temperature: 'hot' });
		await taught.recorder.recordResponse(noteAttempt(learning), span(learning), learning);
		await taught.recorder.settled();
		expect((await taught.cards.get(LOCATE_KEY))?.learnedAt).toBe(123);
	});

	it('introduces the card of a first learning prompt even after a wrong note', async () => {
		const { recorder, cards } = setupResponse();
		const learning = item({ phase: 'learning', temperature: 'hot', aid: 'show-position' });
		await recorder.recordResponse(
			noteAttempt(learning, { success: false }),
			span(learning),
			learning
		);
		await recorder.settled();
		expect(await cards.get(LOCATE_KEY)).toMatchObject({
			introducedInSession: 'sess-1',
			learnedAt: null
		});
	});

	it('touches no card for a skill without memory', async () => {
		const { recorder, cards, attempts } = setupResponse();
		const learning = item({
			exerciseId: 'rhythm-silent-bars',
			skill: 'inner-pulse',
			item: { figureId: 'quarters', level: 0 },
			phase: 'learning',
			temperature: 'hot'
		});
		await recorder.recordResponse(noteAttempt(learning), span(learning), learning);
		await recorder.settled();
		expect(await cards.all()).toEqual([]);
		expect(await attempts.all()).toHaveLength(1);
	});
	it('keeps on a new card only the part of the item its set keeps', async () => {
		const { recorder, cards } = setupResponse();
		const key = 'D|maj|3:5,2:1,1:3';
		const planned = item({
			exerciseId: 'chord-zone',
			skill: 'chord-zone',
			item: { voicingKey: key, position: 2 },
			phase: 'learning',
			temperature: 'hot',
			leadBeats: 8
		});
		const attempt = {
			...noteAttempt(planned),
			cardKey: `chord-zone:${key}`,
			data: { item: planned.item, answer: null, confusion: null }
		};
		await recorder.recordResponse(attempt, span(planned), planned);
		await recorder.settled();
		expect((await cards.get(`chord-zone:${key}`))?.item).toEqual({ voicingKey: key });
	});

	describe('observations', () => {
		const snapshot: RecordedObservation[] = [
			{ atMs: 500, sensor: 'note', fate: 'answer', correct: null, payload: { midi: 65 } }
		];
		const full: RecordedObservation[] = [
			...snapshot,
			{ atMs: 1000, sensor: 'note', fate: 'answer', correct: null, payload: { midi: 60 } }
		];

		/** A span that has already heard the first observation. */
		const heard = (planned: PlannedItem) => {
			const heardSpan = span(planned);
			heardSpan.add('note', { time: 1.5, readable: true, payload: { midi: 65 } }, 'answer', null);
			return heardSpan;
		};

		it('stores the snapshot given to record, then the full list after completion', async () => {
			const { recorder, attempts } = setupResponse();
			const planned = item();
			const attempt = noteAttempt(planned);
			await recorder.recordResponse(attempt, heard(planned), planned);
			expect((await attempts.all())[0].observations).toEqual(snapshot);
			await recorder.completeObservations(attempt, full);
			expect(attempt.observations).toEqual(full);
			expect((await attempts.all())[0].observations).toEqual(full);
		});

		it('completes after the write when called before it resolves', async () => {
			const { recorder, attempts } = setupResponse();
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
			const planned = item();
			const attempt = noteAttempt(planned);
			const written = recorder.recordResponse(attempt, heard(planned), planned);
			await added;
			const completed = recorder.completeObservations(attempt, full);
			expect(attempt.observations).toEqual(full);
			expect((await attempts.all())[0].observations).toEqual(snapshot);
			release();
			await Promise.all([written, completed]);
			expect((await attempts.all())[0].observations).toEqual(full);
		});

		it('completes by itself when the span closes', async () => {
			const { recorder, attempts } = setupResponse();
			const planned = item();
			const attempt = noteAttempt(planned);
			const open = heard(planned);
			await recorder.recordResponse(attempt, open, planned);
			open.add('note', { time: 2, readable: true, payload: { midi: 60 } }, 'answer', null);
			open.close();
			await recorder.settled();
			expect((await attempts.all())[0].observations).toEqual(full);
		});

		it('settled waits for completions', async () => {
			const { recorder, attempts } = setupResponse();
			const planned = item();
			const attempt = noteAttempt(planned);
			await recorder.recordResponse(attempt, heard(planned), planned);
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
			const { recorder, attempts } = setupResponse();
			const planned = item();
			const attempt = noteAttempt(planned);
			await recorder.recordResponse(attempt, heard(planned), planned);
			await recorder.completeObservations({ ...attempt }, full);
			expect((await attempts.all())[0].observations).toEqual(snapshot);
		});

		it('reports a failed write and still settles', async () => {
			const { recorder, attempts } = setupResponse();
			const failure = new Error('quota');
			attempts.add = async () => {
				throw failure;
			};
			const log = vi.spyOn(console, 'error').mockImplementation(() => {});
			const planned = item();
			const attempt = noteAttempt(planned);
			await expect(recorder.recordResponse(attempt, heard(planned), planned)).rejects.toBe(failure);
			await recorder.completeObservations(attempt, full).catch(() => {});
			await recorder.settled();
			expect(log).toHaveBeenCalledWith(expect.stringContaining('[neckspert]'), failure);
			log.mockRestore();
		});
	});
});
