import { describe, expect, it, vi } from 'vitest';
import type { Attempt, LevelState, PlannedItem, RecordedObservation } from '$lib/domain/types';
import { introduceCard, markLearned, type ItemSource } from '$lib/domain/progress';
import { directRecallOf } from '$lib/domain/learning';
import { cardKeyOf, locateRules, mechanicRules } from '$lib/domain/mechanics';
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

describe('AttemptRecorder', () => {
	const THRESHOLD_MS = 1500;
	const LOCATE_KEY = cardKeyOf(locateRules, F_ON_B);

	/** A note's response attempt as `responseAttempt` writes it: hot, at the item's lead. */
	function noteAttempt(
		planned: PlannedItem,
		{ success = true, reactionMs = 500 }: { success?: boolean; reactionMs?: number } = {}
	): Omit<Attempt, 'id'> {
		return {
			sessionId: 'sess-1',
			exerciseId: planned.exerciseId,
			mechanic: planned.mechanic,
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

	function setupResponse(
		selector?: Partial<ItemSource>,
		learner: 'memory' | 'skill' = 'memory',
		withRecall = true
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
			rules: (mechanic) => ({ ...mechanicRules(mechanic), learner }),
			recall: withRecall ? () => directRecallOf(THRESHOLD_MS) : undefined,
			levels
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

	it('stores a missed probe hot and a recalled probe cold, by the given recall rule', async () => {
		const probe = item({ phase: 'probe', temperature: 'cold' });
		const passed = setupResponse();
		const recalled = noteAttempt(probe);
		await passed.recorder.recordResponse(recalled, span(probe), probe);
		expect(recalled.temperature).toBe('cold');

		const slow = setupResponse();
		const late = noteAttempt(probe, { reactionMs: THRESHOLD_MS + 500 });
		(late.verdict.value as { leadMs: number }).leadMs = THRESHOLD_MS + 500;
		await slow.recorder.recordResponse(late, span(probe), probe);
		expect(late.temperature).toBe('hot');

		const missed = setupResponse();
		const wrong = noteAttempt(probe, { success: false });
		await missed.recorder.recordResponse(wrong, span(probe), probe);
		expect(wrong.temperature).toBe('hot');
		expect((await missed.attempts.all())[0].temperature).toBe('hot');
	});

	it('refuses a probe without a recall rule', () => {
		const { recorder } = setupResponse(undefined, 'memory', false);
		const probe = item({ phase: 'probe', temperature: 'cold' });
		expect(() => recorder.recordResponse(noteAttempt(probe), span(probe), probe)).toThrow(/recall/);
	});

	it('grades a cold review through FSRS and stores its card', async () => {
		const { recorder, cards } = setupResponse();
		const card = markLearned(
			introduceCard({ key: LOCATE_KEY, mechanic: 'locate', item: F_ON_B }, 0, 'old'),
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
			exerciseId: 'locate-neck',
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
			introduceCard({ key: LOCATE_KEY, mechanic: 'locate', item: F_ON_B }, -10_000_000, 'old'),
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

	it('keeps free play hot on a note without a learned card, its card untouched', async () => {
		const { recorder, cards } = setupResponse();
		const being = introduceCard(
			{ key: LOCATE_KEY, mechanic: 'locate', item: F_ON_B },
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

	it('stores the card the source reports for a probe and for a learning prompt', async () => {
		const known = {
			...introduceCard({ key: LOCATE_KEY, mechanic: 'locate', item: F_ON_B }, 0, 'sess-1'),
			acquiredAt: 456
		};
		const probed = setupResponse({ record: () => ({ card: known }) });
		const probe = item({ phase: 'probe', temperature: 'cold' });
		await probed.recorder.recordResponse(noteAttempt(probe), span(probe), probe);
		await probed.recorder.settled();
		expect((await probed.cards.get(LOCATE_KEY))?.acquiredAt).toBe(456);

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

	it('touches no card for a skill learner', async () => {
		const { recorder, cards, attempts } = setupResponse(undefined, 'skill');
		const learning = item({ phase: 'learning', temperature: 'hot' });
		await recorder.recordResponse(noteAttempt(learning), span(learning), learning);
		await recorder.settled();
		expect(await cards.all()).toEqual([]);
		expect(await attempts.all()).toHaveLength(1);
	});
	it('keeps on a new card only the part of the item its mechanic keeps', async () => {
		const { recorder, cards } = setupResponse();
		const key = 'D|maj|3:5,2:1,1:3';
		const planned = item({
			exerciseId: 'triads-zone',
			mechanic: 'triad-zone',
			item: { voicingKey: key, position: 2 },
			phase: 'learning',
			temperature: 'hot',
			leadBeats: 8
		});
		const attempt = {
			...noteAttempt(planned),
			cardKey: `triad-zone:${key}`,
			data: { item: planned.item, answer: null, confusion: null }
		};
		await recorder.recordResponse(attempt, span(planned), planned);
		await recorder.settled();
		expect((await cards.get(`triad-zone:${key}`))?.item).toEqual({ voicingKey: key });
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
