import { describe, expect, it } from 'vitest';
import type { ExerciseId } from '../../exercise/types';
import type { SkillId } from '../../types';
import { reviewableCards } from '../../progress/review';
import { attemptOf, fakeCard, fakeSubject } from './fakeSubject';

const none = new Map();
const skill = 'fake' as SkillId;

describe('fakeSubject', () => {
	it('introduces its items in order', () => {
		const subject = fakeSubject();
		expect(subject.nextNew([], none, () => false)).toEqual({ skill, item: 0 });
		expect(subject.nextNew([fakeCard(0)], none, () => false)).toEqual({ skill, item: 1 });
		expect(subject.nextNew([fakeCard(0)], none, (c) => c.item === 1)).toEqual({
			skill,
			item: 2
		});
	});

	it('builds a complete attempt that its recall rule reads', () => {
		const subject = fakeSubject();
		const planned = {
			exerciseId: 'e' as ExerciseId,
			skill,
			item: 4,
			phase: 'review' as const,
			temperature: 'cold' as const,
			leadBeats: 2 as const
		};
		const hit = attemptOf(planned, { success: true, at: 10 });
		expect(hit.promptedAt).toBe(10);
		expect(subject.recall(skill)(hit)).toBe(true);
		expect(subject.recall(skill)(attemptOf(planned, { success: false }))).toBe(false);
		expect(subject.confused(attemptOf(planned, { confused: true }))).toBe(true);
		expect(subject.ladder(skill).length).toBe(3);
	});

	it('skips an item whose prerequisite is not ready', () => {
		const gated = fakeSubject({ ready: (item) => item !== 0 });
		expect(gated.nextNew([], none, () => false)).toEqual({ skill, item: 1 });
	});

	it('builds learned cards that come due in order', () => {
		const late = fakeCard(1, { learnedAt: 1000, scheduling: { due: 5000 } });
		const early = fakeCard(2, { learnedAt: 1000, scheduling: { due: 3000 } });
		const still = fakeCard(3);
		const due = reviewableCards([late, early, still], new Map(), 10_000);
		expect(due.map((c) => c.item)).toEqual([2, 1]);
	});

	it('builds an offbeat attempt: right, not a success, not direct recall', () => {
		const planned = {
			exerciseId: 'e' as ExerciseId,
			skill,
			item: 1,
			phase: 'learning' as const,
			temperature: 'hot' as const,
			leadBeats: 2 as const
		};
		const attempt = attemptOf(planned, { responseVerdict: 'offbeat', aids: ['listen'] as never });
		expect(attempt.correct).toBe(true);
		expect(attempt.success).toBe(false);
		expect(fakeSubject().recall(skill)(attempt)).toBe(false);
		expect(attempt.aids).toEqual(['listen']);
		expect(attemptOf(planned, { phase: 'probe', temperature: 'cold' }).phase).toBe('probe');
	});
});
