import { describe, expect, it } from 'vitest';
import type { ExerciseId, MechanicId } from '../exercise/types';
import { LEARN_COLD_CAP, MAX_WORKING_SET } from '../progress/constants';
import type { LevelState } from '../time/levels';
import type { Attempt, CardState, PlannedItem } from '../types';
import { createLearningProcedure } from './procedure';
import type { LearningSubject } from './subject';
import { attemptOf, fakeCard, fakeSubject } from './testing/fakeSubject';

const FAKE = 'fake' as MechanicId;
const EXERCISE = 'exercise-fake' as ExerciseId;
const SESSION = 'session';
const at = (now: number, fatigued = false) => ({ now, elapsedMs: 0, fatigued });

/** A seeded draw, so a spec covers many draws and stays repeatable. */
function seeded(seed: number): () => number {
	let state = seed >>> 0 || 1;
	return () => {
		state = (state * 1_664_525 + 1_013_904_223) >>> 0;
		return state / 2 ** 32;
	};
}

function procedure(
	input: {
		subject?: LearningSubject;
		cards?: readonly CardState[];
		attempts?: readonly Attempt[];
		levels?: readonly LevelState[];
		tempo?: number;
		random?: () => number;
	} = {}
) {
	return createLearningProcedure({
		subject: input.subject ?? fakeSubject(),
		cards: input.cards ?? [],
		attempts: input.attempts ?? [],
		levels: input.levels ?? [],
		sessionId: SESSION,
		tempos: input.tempo === undefined ? {} : { [EXERCISE]: input.tempo },
		random: input.random ?? (() => 0)
	});
}

/** A card being learned, introduced in a past session. */
const learning = (item: number) => fakeCard(item, { introducedInSession: 'past' });
/** A learned card, due long after `now = 0` (consolidation only). */
const learned = (item: number, stability = 1) =>
	fakeCard(item, { learnedAt: 0, scheduling: { due: 1e12, stability } });
/** A learned card reviewable from `due`. */
const reviewable = (item: number, due = 0) =>
	fakeCard(item, { learnedAt: 0, scheduling: { due, stability: 100 } });

/** Attempts of this session on `item`, one per entry of `successes`, from `from` on. */
function played(item: number, successes: readonly boolean[], from = 0): Attempt[] {
	return successes.map((success, index) =>
		attemptOf(
			{ exerciseId: EXERCISE, mechanic: FAKE, item, phase: 'learning', temperature: 'hot' },
			{ success, at: from + index }
		)
	);
}

describe('createLearningProcedure next', () => {
	it('probes a new item first, unaided and cold, at the top of its ladder', () => {
		const item = procedure({ tempo: 160 }).next(at(0));
		expect(item).toMatchObject({
			exerciseId: EXERCISE,
			mechanic: FAKE,
			item: 0,
			phase: 'probe',
			temperature: 'cold',
			aid: 'none',
			// 160 bpm: 8 then 4 beats, 4 beats = 1 500 ms fits the threshold, the top.
			leadBeats: 4
		});
		expect(item?.stringAid ?? false).toBe(false);
	});

	it('serves the categories in their order', () => {
		// A due retest before a review.
		const withRetest = procedure({
			cards: [learning(0), learned(1), learned(2), learned(3), reviewable(4, 10_000)]
		});
		expect(withRetest.next(at(0))).toMatchObject({ item: 0, phase: 'learning' });
		expect(withRetest.next(at(0))?.phase).toBe('consolidation');
		expect(withRetest.next(at(0))?.phase).toBe('consolidation');
		expect(withRetest.next(at(10_000))).toMatchObject({ item: 0, phase: 'learning' });
		expect(withRetest.next(at(10_000))).toMatchObject({ item: 4, phase: 'review' });

		// A review before a resumed item.
		const withReview = procedure({ cards: [learning(0), reviewable(1)] });
		expect(withReview.next(at(0))).toMatchObject({
			item: 1,
			phase: 'review',
			temperature: 'cold'
		});

		// A resumed item before a new one (the new one is allowed: the item learned is right).
		const withResume = procedure({
			cards: [learning(0)],
			attempts: played(0, [true, true, true, true, true])
		});
		expect(withResume.next(at(0))).toMatchObject({
			item: 0,
			phase: 'learning',
			temperature: 'hot'
		});
		expect(withResume.next(at(0))).toMatchObject({ item: 1, phase: 'probe' });

		// A new item before a consolidation.
		const withNew = procedure({ cards: [learned(0), learned(1)] });
		expect(withNew.next(at(0))).toMatchObject({ item: 2, phase: 'probe' });
		const withNothingNew = procedure({
			subject: fakeSubject({ items: 2 }),
			cards: [learned(0), learned(1)]
		});
		expect(withNothingNew.next(at(0))).toMatchObject({
			phase: 'consolidation',
			temperature: 'hot'
		});
	});

	it('caps the cold reviews of a session', () => {
		const count = LEARN_COLD_CAP + 5;
		const cards = Array.from({ length: count }, (_, item) => reviewable(item));
		const source = procedure({ subject: fakeSubject({ items: count }), cards });
		const phases = Array.from({ length: count }, () => source.next(at(0))?.phase);
		expect(phases.filter((phase) => phase === 'review')).toHaveLength(LEARN_COLD_CAP);
		expect(phases.slice(0, LEARN_COLD_CAP).every((phase) => phase === 'review')).toBe(true);
	});

	it('never serves the previous item nor its neighbour, and prefers what the subject prefers', () => {
		const subject = fakeSubject({
			items: 6,
			neighbours: (a, b) => a === b || a + b === 5,
			prefers: (candidate, previous) => candidate % 2 !== previous % 2
		});
		const cards = Array.from({ length: 6 }, (_, item) => reviewable(item));
		for (let seed = 1; seed <= 200; seed++) {
			const source = procedure({ subject, cards, random: seeded(seed) });
			const first = source.next(at(0))?.item as number;
			const second = source.next(at(0))?.item as number;
			expect(second).not.toBe(first);
			expect(first + second).not.toBe(5);
			// Another parity remains after any first draw, so it is always preferred.
			expect(second % 2).not.toBe(first % 2);
		}

		const consolidating = procedure({
			subject: fakeSubject({ items: 6, neighbours: (a, b) => a === b || a + b === 5 }),
			cards: Array.from({ length: 6 }, (_, item) => learned(item)),
			random: seeded(7)
		});
		let previous: number | null = null;
		for (let draw = 0; draw < 200; draw++) {
			const item = consolidating.next(at(0))?.item as number;
			if (previous !== null) {
				expect(item).not.toBe(previous);
				expect(item + previous).not.toBe(5);
			}
			previous = item;
		}
	});

	it('keeps new items out while one being learned is weak or the session’s success is low', () => {
		/** Serves the item being learned, then says whether a new one comes next. */
		const newComesAfter = (attempts: Attempt[]) => {
			const source = procedure({ cards: [learning(0), learned(1)], attempts });
			expect(source.next(at(0))).toMatchObject({ item: 0, phase: 'learning' });
			return source.next(at(0))?.phase === 'probe';
		};
		// The item being learned at 0.6.
		expect(newComesAfter(played(0, [true, false, true, false, true]))).toBe(false);
		// The item at 1, the session at 0.6 over its last ten.
		expect(
			newComesAfter([
				...played(1, [true, false, false, false, false], 0),
				...played(0, [true, true, true, true, true], 10)
			])
		).toBe(false);
		// The item at 0.8, the session at 0.7.
		expect(
			newComesAfter([
				...played(1, [true, true, true, false, false], 0),
				...played(0, [true, true, true, true, false], 10)
			])
		).toBe(true);
	});

	it('never holds more than MAX_WORKING_SET items hot in a session', () => {
		const cards = Array.from({ length: 10 }, (_, item) => learned(item));
		const source = procedure({ subject: fakeSubject({ items: 10 }), cards, random: seeded(3) });
		const hot = new Set<number>();
		let served = 0;
		for (let draw = 0; draw < 60; draw++) {
			const item = source.next(at(0));
			if (item === null) continue;
			served++;
			if (item.temperature === 'hot') hot.add(item.item as number);
		}
		expect(served).toBeGreaterThan(MAX_WORKING_SET);
		expect(hot.size).toBe(MAX_WORKING_SET);
	});

	it('serves only retests when the player is tired', () => {
		const source = procedure({
			cards: [learning(0), learning(1), learned(2), reviewable(3)],
			attempts: [...played(0, [true, true]), ...played(1, [true, true], 5)]
		});
		// Rested: the review, then both items being learned.
		const rested = [source.next(at(0)), source.next(at(0)), source.next(at(0))];
		expect(rested.map((item) => item?.phase)).toEqual(['review', 'learning', 'learning']);
		const tired: (PlannedItem | null)[] = [];
		for (let draw = 0; draw < 10; draw++) tired.push(source.next(at(0, true)));
		expect(tired.every((item) => item?.phase === 'learning')).toBe(true);
		expect(new Set(tired.map((item) => item?.item))).toEqual(new Set([0, 1]));
	});

	it('forgets a probe abandoned by a pause', () => {
		const source = procedure();
		const probe = source.next(at(0));
		expect(probe).toMatchObject({ item: 0, phase: 'probe' });
		// Not recorded: the card is forgotten and the item is not the previous one.
		expect(source.next(at(1))).toMatchObject({ item: 0, phase: 'probe' });
	});

	it('serves an item at its stored level, brought into today’s ladder', () => {
		const level: LevelState = {
			exerciseId: EXERCISE,
			scope: '',
			item: '0',
			level: 2,
			successes: 1,
			failures: 0,
			resumeAfter: null
		};
		const source = procedure({ cards: [reviewable(0)], levels: [level], tempo: 160 });
		const card = { mechanic: FAKE, item: 0 };
		expect(source.levelOf(card)).toEqual(level);
		expect(source.next(at(0))).toMatchObject({ item: 0, phase: 'review', leadBeats: 4 });
		// An item with no stored level starts at level 0, the longest lead, aided while learning.
		expect(procedure().levelOf({ mechanic: FAKE, item: 3 })).toEqual({
			exerciseId: EXERCISE,
			scope: '',
			item: '3',
			level: 0,
			successes: 0,
			failures: 0,
			resumeAfter: null
		});
		expect(procedure({ cards: [learning(0)] }).next(at(0))).toMatchObject({
			phase: 'learning',
			leadBeats: 8,
			aid: 'show-position',
			stringAid: true
		});
	});

	it('serves nothing rather than the previous item again', () => {
		const source = procedure({ subject: fakeSubject({ items: 1 }), cards: [learned(0)] });
		expect(source.next(at(0))).toMatchObject({ item: 0, phase: 'consolidation' });
		expect(source.next(at(0))).toBeNull();
	});
});
