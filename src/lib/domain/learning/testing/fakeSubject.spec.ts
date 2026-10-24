import { describe, expect, it } from 'vitest';
import type { ExerciseId, MechanicId } from '../../exercise/types';
import { attemptOf, fakeCard, fakeSubject } from './fakeSubject';

const none = new Map();
const mechanic = 'fake' as MechanicId;

describe('fakeSubject', () => {
	it('introduces its items in order and keeps neighbours apart', () => {
		const subject = fakeSubject();
		expect(subject.nextNew([], none, () => false)).toEqual({ mechanic, item: 0 });
		expect(subject.nextNew([fakeCard(0)], none, () => false)).toEqual({ mechanic, item: 1 });
		expect(subject.nextNew([fakeCard(0)], none, (c) => c.item === 1)).toEqual({
			mechanic,
			item: 2
		});
		expect(subject.neighbours({ mechanic, item: 3 }, { mechanic, item: 3 })).toBe(true);
		expect(subject.neighbours({ mechanic, item: 3 }, { mechanic, item: 4 })).toBe(false);
	});

	it('builds a complete attempt that its recall rule reads', () => {
		const subject = fakeSubject();
		const planned = {
			exerciseId: 'e' as ExerciseId,
			mechanic,
			item: 4,
			phase: 'review' as const,
			temperature: 'cold' as const,
			leadBeats: 2 as const
		};
		const hit = attemptOf(planned, { success: true, at: 10 });
		expect(hit.promptedAt).toBe(10);
		expect(subject.recall(mechanic)(hit)).toBe(true);
		expect(subject.recall(mechanic)(attemptOf(planned, { success: false }))).toBe(false);
		expect(subject.confused(attemptOf(planned, { confused: true }))).toBe(true);
		expect(subject.ladder(mechanic, 80).length).toBe(3);
	});
});
