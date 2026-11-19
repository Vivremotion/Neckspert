import { describe, expect, it } from 'vitest';
import { responseAttempt, type AttemptOverrides } from '$lib/testing/attempts';
import { roundMemberContents } from '$lib/domain/exercise/passage/contents';
import { passageRound } from '$lib/domain/exercise/passage/round';
import { gridById, gridChanges } from '$lib/domain/grid';
import type { Attempt, ResponseVerdict } from '$lib/domain/types';
import { GESTURE_JAM } from '$lib/testing/catalog';
import { shapeId } from '$lib/testing/shapes';
import { summarizeGesture } from './summary';

const IOHEFY = gridChanges(gridById('iohefy-a'));
const INDEX = { key: 'grid=iohefy-a', of: { grid: 'iohefy-a' } };

/** The plan a change of the jam kept, as the record writes its expectations: its member content. */
function planOf(index: number) {
	const item = { grid: 'iohefy-a', index };
	const round = passageRound(GESTURE_JAM, INDEX, {}, item, index, IOHEFY.length);
	const [{ content }] = roundMemberContents(GESTURE_JAM, round);
	return { expectations: [{ sensor: 'chord', content: { kind: 'member', value: content } }] };
}

function change(
	exerciseId: string,
	passageId: string,
	index: number,
	verdict: ResponseVerdict,
	decided: string | null = null,
	extra: AttemptOverrides = {}
): Attempt {
	const passage = { id: passageId, index: INDEX.key, rank: index, each: {} };
	return responseAttempt({
		id: Number(`${passageId.length}${index}`),
		sessionId: 's1',
		exerciseId,
		skill: 'grid-reading',
		cardKey: `grid-reading:iohefy-a#${index}`,
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
		data: {
			item: { grid: 'iohefy-a', index },
			passage,
			answer: decided === null ? null : { decided },
			confusion: null
		},
		observations: [],
		...extra,
		plan: planOf(index)
	});
}

/** A change as an attempt stored before the passages kept it: its whole change, no passage. */
function before(passageId: string, index: number, decided: string | null, id: number): Attempt {
	const attempt = change('grid-reading', passageId, index, 'wrong', decided, { id });
	return {
		...attempt,
		plan: null,
		data: {
			item: {
				rule: 'jam',
				element: 'jam:iohefy-a',
				passageId,
				index,
				changes: IOHEFY,
				symbol: IOHEFY[index].symbol,
				chord: 'D|min',
				sets: [[3, 2, 1]],
				previous: null
			},
			answer: decided === null ? null : { decided },
			confusion: { kind: 'none', part: 'chord' }
		}
	};
}

describe('summarizeGesture', () => {
	it('counts the passages played and succeeded, and the changes right and in time, by exercise', () => {
		const ok = Array.from({ length: 10 }, (_, i) => change('grid-reading', 'p1', i % 9, 'perfect'));
		const failed = [
			change('grid-reading', 'p2', 0, 'perfect'),
			change('grid-reading', 'p2', 1, 'offbeat')
		];
		const summary = summarizeGesture(
			[
				{ exerciseId: 'inversion-run', tempoBpm: 90 },
				{ exerciseId: 'grid-reading', tempoBpm: 80 }
			],
			[...ok, ...failed]
		);
		expect(summary.exercises).toEqual([
			{
				exerciseId: 'grid-reading',
				passagesPlayed: 2,
				passagesSucceeded: 1,
				changeSuccessRate: 11 / 12,
				tempoBpm: 80,
				lastTempoBpm: 80
			}
		]);
		expect(summary.misses).toEqual([]);
	});

	it('reads the changes by their passage, whatever their skill, and nothing else', () => {
		const ofAnySkill = change('grid-reading', 'p1', 0, 'perfect', null, { skill: 'another-skill' });
		const noPassage = change('grid-reading', 'p1', 1, 'wrong');
		const summary = summarizeGesture(
			[{ exerciseId: 'grid-reading', tempoBpm: 80 }],
			[ofAnySkill, { ...noPassage, data: { item: { grid: 'iohefy-a', index: 1 } } }]
		);
		expect(summary.exercises).toEqual([
			expect.objectContaining({
				exerciseId: 'grid-reading',
				passagesPlayed: 1,
				changeSuccessRate: 1
			})
		]);
		expect(summary.misses).toEqual([]);
	});

	it('tells the first and the last tempo played', () => {
		const at80 = [0, 1].map((i) => change('grid-reading', 'p1', i, 'perfect'));
		const at85 = [0, 1].map((i) =>
			change('grid-reading', 'p2', i, 'perfect', null, { tempoBpm: 85 })
		);
		const summary = summarizeGesture(
			[{ exerciseId: 'grid-reading', tempoBpm: 80 }],
			[...at80, ...at85]
		);
		expect(summary.exercises[0]).toMatchObject({ tempoBpm: 80, lastTempoBpm: 85 });
	});

	it('leaves out the changes of an exercise no file defines as one that plays passages', () => {
		const summary = summarizeGesture(
			[
				{ exerciseId: 'gesture-unknown', tempoBpm: 80 },
				{ exerciseId: 'grid-reading', tempoBpm: 80 }
			],
			[change('gesture-unknown', 'p1', 0, 'wrong'), change('grid-reading', 'p2', 0, 'perfect')]
		);
		expect(summary.exercises.map((exercise) => exercise.exerciseId)).toEqual(['grid-reading']);
		expect(summary.misses).toEqual([]);
	});

	it('lists the missed changes with the shape heard and the closest admitted, and their contest', () => {
		const heard = shapeId('D', 'maj', [3, 2, 1], '7-7-5');
		const summary = summarizeGesture(
			[{ exerciseId: 'grid-reading', tempoBpm: 80 }],
			[
				change('grid-reading', 'p1', 0, 'wrong', heard, { id: 7 }),
				change('grid-reading', 'p1', 1, 'wrong', null, { id: 8, contested: true })
			]
		);
		expect(summary.misses).toEqual([
			{
				attemptId: 7,
				exerciseId: 'grid-reading',
				symbol: 'Dm7',
				heard: '7-7-5',
				expected: '7-6-5',
				contested: false
			},
			{
				attemptId: 8,
				exerciseId: 'grid-reading',
				symbol: 'G7',
				heard: null,
				expected: '0-0-0',
				contested: true
			}
		]);
	});

	it('sums each grid of an exercise apart, at its own tempo', () => {
		const ballad = Array.from({ length: 10 }, (_, i) =>
			change('grid-reading', 'p1', i % 9, 'perfect', null, { scope: 'iohefy-a' })
		);
		const blues = [
			change('grid-reading', 'p2', 0, 'wrong', null, { scope: 'blues-f', tempoBpm: 100 })
		];
		const summary = summarizeGesture(
			[
				{ exerciseId: 'grid-reading', scope: 'iohefy-a', tempoBpm: 80 },
				{ exerciseId: 'grid-reading', scope: 'blues-f', tempoBpm: 100 }
			],
			[...ballad, ...blues]
		);
		expect(summary.exercises).toEqual([
			{
				exerciseId: 'grid-reading',
				scope: 'iohefy-a',
				passagesPlayed: 1,
				passagesSucceeded: 1,
				changeSuccessRate: 1,
				tempoBpm: 80,
				lastTempoBpm: 80
			},
			{
				exerciseId: 'grid-reading',
				scope: 'blues-f',
				passagesPlayed: 1,
				passagesSucceeded: 0,
				changeSuccessRate: 0,
				tempoBpm: 100,
				lastTempoBpm: 100
			}
		]);
	});

	it('sums up a session played before the passages: grouped by the passage its changes kept, nothing drawn as due', () => {
		const heard = shapeId('D', 'maj', [3, 2, 1], '7-7-5');
		const summary = summarizeGesture(
			[{ exerciseId: 'grid-reading', tempoBpm: 80 }],
			[before('old-1', 0, heard, 1), before('old-1', 1, null, 2), before('old-2', 0, null, 3)]
		);
		expect(summary.exercises).toEqual([
			{
				exerciseId: 'grid-reading',
				passagesPlayed: 2,
				passagesSucceeded: 0,
				changeSuccessRate: 0,
				tempoBpm: 80,
				lastTempoBpm: 80
			}
		]);
		expect(summary.misses.map((miss) => [miss.symbol, miss.heard, miss.expected])).toEqual([
			['Dm7', '7-7-5', null],
			['G7', null, null],
			['Dm7', null, null]
		]);
	});

	it('names a link’s miss by its chord', () => {
		const attempt = change('inversion-run', 'p1', 0, 'wrong', null, { id: 4 });
		const linked = {
			...attempt,
			plan: null,
			data: {
				item: { voicing: 'D#|min|3:5,2:1,1:b3', frets: [3, 4, 2] },
				passage: { id: 'p1', index: 'chord=Ebm;strings=3,2,1', rank: 0, each: {} },
				answer: null,
				confusion: null
			}
		};
		const summary = summarizeGesture([{ exerciseId: 'inversion-run', tempoBpm: 80 }], [linked]);
		expect(summary.misses.map((miss) => [miss.symbol, miss.expected])).toEqual([['Ebm', null]]);
	});
});
