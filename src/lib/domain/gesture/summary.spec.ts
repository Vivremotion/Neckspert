import { describe, expect, it } from 'vitest';
import { responseAttempt, type AttemptOverrides } from '$lib/testing/attempts';
import { gridById, gridChanges } from '$lib/domain/grid';
import type { ChordGridItem } from '$lib/domain/mechanics';
import type { Attempt, ResponseVerdict } from '$lib/domain/types';
import { shapeId } from '$lib/testing/shapes';
import { summarizeGesture } from './summary';

const IOHEFY = gridChanges(gridById('iohefy-a'));

function change(
	exerciseId: string,
	passageId: string,
	index: number,
	verdict: ResponseVerdict,
	decided: string | null = null,
	extra: AttemptOverrides = {}
): Attempt {
	const item: ChordGridItem = {
		rule: 'jam',
		element: 'jam:iohefy-a',
		passageId,
		index,
		changes: IOHEFY,
		symbol: IOHEFY[index].symbol,
		chord: index === 1 ? 'G|maj' : 'D|min',
		sets: [
			[3, 2, 1],
			[4, 3, 2]
		],
		previous: null
	};
	return responseAttempt({
		id: Number(`${passageId.length}${index}`),
		sessionId: 's1',
		exerciseId,
		mechanic: 'chord-grid',
		cardKey: `chord-grid:jam:iohefy-a#${index}`,
		phase: 'free',
		temperature: 'hot',
		aid: 'none',
		promptedAt: index,
		tempoBpm: 80,
		leadBeats: null,
		timingOffsetMs: null,
		reactionMs: null,
		correct: verdict !== 'wrong',
		verdict,
		data: { item, answer: decided === null ? null : { decided }, confusion: null },
		observations: [],
		...extra
	});
}

describe('summarizeGesture', () => {
	it('counts the passages played and succeeded, and the changes right and in time, by exercise', () => {
		const ok = Array.from({ length: 10 }, (_, i) => change('gesture-jam', 'p1', i % 9, 'perfect'));
		const failed = [
			change('gesture-jam', 'p2', 0, 'perfect'),
			change('gesture-jam', 'p2', 1, 'offbeat')
		];
		const summary = summarizeGesture(
			[
				{ exerciseId: 'gesture-link', tempoBpm: 90 },
				{ exerciseId: 'gesture-jam', tempoBpm: 80 }
			],
			[...ok, ...failed]
		);
		expect(summary.exercises).toEqual([
			{
				exerciseId: 'gesture-jam',
				passagesPlayed: 2,
				passagesSucceeded: 1,
				changeSuccessRate: 11 / 12,
				tempoBpm: 80,
				nextTempoBpm: 85
			}
		]);
		expect(summary.misses).toEqual([]);
	});

	it('refuses an exercise the gesture track does not list, naming it', () => {
		expect(() =>
			summarizeGesture(
				[{ exerciseId: 'gesture-unknown', tempoBpm: 80 }],
				[change('gesture-unknown', 'p1', 0, 'perfect')]
			)
		).toThrow(/gesture-unknown/);
	});

	it('lists the missed changes with the shape heard and the closest admitted, and their contest', () => {
		const heard = shapeId('D', 'maj', [3, 2, 1], '7-7-5');
		const summary = summarizeGesture(
			[{ exerciseId: 'gesture-jam', tempoBpm: 80 }],
			[
				change('gesture-jam', 'p1', 0, 'wrong', heard, { id: 7 }),
				change('gesture-jam', 'p1', 1, 'wrong', null, { id: 8, contested: true })
			]
		);
		expect(summary.misses).toEqual([
			{
				attemptId: 7,
				exerciseId: 'gesture-jam',
				symbol: 'Dm7',
				heard: '7-7-5',
				expected: '7-6-5',
				contested: false
			},
			{
				attemptId: 8,
				exerciseId: 'gesture-jam',
				symbol: 'G7',
				heard: null,
				expected: '0-0-0',
				contested: true
			}
		]);
	});

	it('sums each grid of an exercise apart, at its own tempo', () => {
		const ballad = Array.from({ length: 10 }, (_, i) =>
			change('gesture-jam', 'p1', i % 9, 'perfect', null, { tempoScope: 'iohefy-a' })
		);
		const blues = [
			change('gesture-jam', 'p2', 0, 'wrong', null, { tempoScope: 'blues-f', tempoBpm: 100 })
		];
		const summary = summarizeGesture(
			[
				{ exerciseId: 'gesture-jam', scope: 'iohefy-a', tempoBpm: 80 },
				{ exerciseId: 'gesture-jam', scope: 'blues-f', tempoBpm: 100 }
			],
			[...ballad, ...blues]
		);
		expect(summary.exercises).toEqual([
			{
				exerciseId: 'gesture-jam',
				scope: 'iohefy-a',
				passagesPlayed: 1,
				passagesSucceeded: 1,
				changeSuccessRate: 1,
				tempoBpm: 80,
				nextTempoBpm: 85
			},
			{
				exerciseId: 'gesture-jam',
				scope: 'blues-f',
				passagesPlayed: 1,
				passagesSucceeded: 0,
				changeSuccessRate: 0,
				tempoBpm: 100,
				nextTempoBpm: 100
			}
		]);
	});
});
