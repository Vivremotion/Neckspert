import { describe, expect, it } from 'vitest';
import { responseAttempt, type AttemptOverrides } from '$lib/testing/attempts';
import { roundMemberContents } from '$lib/domain/exercise/passage/contents';
import { passageRound } from '$lib/domain/exercise/passage/round';
import { gridById, gridChanges } from '$lib/domain/grid';
import type { Attempt, ResponseVerdict } from '$lib/domain/types';
import { GESTURE_JAM, RHYTHM_OFFBEATS } from '$lib/testing/catalog';
import { shapeId } from '$lib/testing/shapes';
import { summaryMisses } from './misses';
import { summarizePlayed } from './played';

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

/** A cycle of a figure exercise, as the series stores it. */
function cycle(
	success: boolean,
	aids: Attempt['aids'] = [],
	extra: Partial<Attempt> = {}
): Attempt {
	return {
		sessionId: 's1',
		exerciseId: RHYTHM_OFFBEATS.id,
		skill: 'inner-pulse',
		aids,
		success,
		tempoBpm: 80,
		promptedAt: 0,
		data: { level: 0 },
		...extra
	} as unknown as Attempt;
}

/** Any aid but the aid level is beyond the level, as for an exercise whose levels give no cursor. */
const aided = (attempt: Attempt) => attempt.aids.some((aid) => aid !== 'aid-level');

describe('summarizePlayed of a session of changes', () => {
	it('counts the passages played and passed, and the changes right and in time, by exercise', () => {
		const ok = Array.from({ length: 10 }, (_, i) => change('grid-reading', 'p1', i % 9, 'perfect'));
		const failed = [
			change('grid-reading', 'p2', 0, 'perfect'),
			change('grid-reading', 'p2', 1, 'offbeat')
		];
		const exercises = summarizePlayed({
			executions: [
				{ exerciseId: 'inversion-run', tempoBpm: 90 },
				{ exerciseId: 'grid-reading', tempoBpm: 80 }
			],
			attempts: [...ok, ...failed],
			aided
		});
		// The link, met with no change played, has no line.
		expect(exercises).toEqual([
			{
				exerciseId: 'grid-reading',
				rounds: 12,
				passed: 11,
				aided: 0,
				level: null,
				tempo: { first: 80, last: 80 },
				inPassages: true,
				passages: { played: 2, passed: 1 },
				changedAir: false
			}
		]);
	});

	it('reads the changes by their passage, whatever their skill, and nothing else', () => {
		const ofAnySkill = change('grid-reading', 'p1', 0, 'perfect', null, { skill: 'another-skill' });
		const noPassage = change('grid-reading', 'p1', 1, 'wrong');
		const [line] = summarizePlayed({
			executions: [{ exerciseId: 'grid-reading', tempoBpm: 80 }],
			attempts: [ofAnySkill, { ...noPassage, data: { item: { grid: 'iohefy-a', index: 1 } } }],
			aided
		});
		expect(line).toMatchObject({
			exerciseId: 'grid-reading',
			rounds: 1,
			passed: 1,
			inPassages: true,
			passages: { played: 1, passed: 1 }
		});
	});

	it('tells the first and the last tempo played', () => {
		const at80 = [0, 1].map((i) => change('grid-reading', 'p1', i, 'perfect'));
		const at85 = [0, 1].map((i) =>
			change('grid-reading', 'p2', i, 'perfect', null, { tempoBpm: 85 })
		);
		const [line] = summarizePlayed({
			executions: [{ exerciseId: 'grid-reading', tempoBpm: 80 }],
			attempts: [...at80, ...at85],
			aided
		});
		expect(line.tempo).toEqual({ first: 80, last: 85 });
	});

	it('sums each grid of an exercise apart, at its own tempo', () => {
		const ballad = Array.from({ length: 10 }, (_, i) =>
			change('grid-reading', 'p1', i % 9, 'perfect', null, { scope: 'iohefy-a' })
		);
		const blues = [
			change('grid-reading', 'p2', 0, 'wrong', null, { scope: 'blues-f', tempoBpm: 100 })
		];
		const exercises = summarizePlayed({
			executions: [
				{ exerciseId: 'grid-reading', scope: 'iohefy-a', tempoBpm: 80 },
				{ exerciseId: 'grid-reading', scope: 'blues-f', tempoBpm: 100 }
			],
			attempts: [...ballad, ...blues],
			aided
		});
		expect(exercises).toEqual([
			{
				exerciseId: 'grid-reading',
				scope: 'iohefy-a',
				rounds: 10,
				passed: 10,
				aided: 0,
				level: null,
				tempo: { first: 80, last: 80 },
				inPassages: true,
				passages: { played: 1, passed: 1 },
				changedAir: false
			},
			{
				exerciseId: 'grid-reading',
				scope: 'blues-f',
				rounds: 1,
				passed: 0,
				aided: 0,
				level: null,
				tempo: { first: 100, last: 100 },
				inPassages: true,
				passages: { played: 1, passed: 0 },
				changedAir: false
			}
		]);
	});

	it('sums up a session played before the passages: grouped by the passage its changes kept', () => {
		const heard = shapeId('D', 'maj', [3, 2, 1], '7-7-5');
		const [line] = summarizePlayed({
			executions: [{ exerciseId: 'grid-reading', tempoBpm: 80 }],
			attempts: [
				before('old-1', 0, heard, 1),
				before('old-1', 1, null, 2),
				before('old-2', 0, null, 3)
			],
			aided
		});
		expect(line).toMatchObject({
			rounds: 3,
			passed: 0,
			tempo: { first: 80, last: 80 },
			inPassages: true,
			passages: { played: 2, passed: 0 }
		});
	});

	it('marks the exercises that changed air, by exercise and scope', () => {
		const exercises = summarizePlayed({
			executions: [
				{ exerciseId: 'inversion-run', tempoBpm: 80 },
				{ exerciseId: 'grid-reading', scope: 'iohefy-a', tempoBpm: 80 },
				{ exerciseId: 'grid-reading', scope: 'blues-f', tempoBpm: 80 }
			],
			attempts: [
				change('inversion-run', 'p1', 0, 'wrong'),
				change('grid-reading', 'p2', 0, 'wrong', null, { scope: 'iohefy-a' }),
				change('grid-reading', 'p3', 0, 'perfect', null, { scope: 'blues-f' })
			],
			aided,
			left: [{ exerciseId: 'inversion-run' }, { exerciseId: 'grid-reading', scope: 'iohefy-a' }]
		});
		expect(exercises.map((line) => [line.exerciseId, line.scope, line.changedAir])).toEqual([
			['inversion-run', undefined, true],
			['grid-reading', 'iohefy-a', true],
			['grid-reading', 'blues-f', false]
		]);
	});
});

describe('summarizePlayed of a figure exercise', () => {
	it('counts its cycles, those that passed, and the passed ones aided beyond their level', () => {
		const [line] = summarizePlayed({
			executions: [{ exerciseId: RHYTHM_OFFBEATS.id, tempoBpm: 80 }],
			attempts: [
				cycle(true, ['listen']),
				cycle(true, ['aid-level']),
				cycle(true),
				cycle(false, ['listen'])
			],
			aided,
			level: () => ({ shown: 3, of: 4, aid: false })
		});
		expect(line).toEqual({
			exerciseId: RHYTHM_OFFBEATS.id,
			rounds: 4,
			passed: 3,
			aided: 1,
			level: { shown: 3, of: 4, aid: false },
			tempo: { first: 80, last: 80 },
			inPassages: false,
			passages: null,
			changedAir: false
		});
	});

	it('leaves out the attempts of another exercise, and reads a tempo from its rounds without an execution', () => {
		const exercises = summarizePlayed({
			executions: [],
			attempts: [cycle(true, [], { tempoBpm: 90 }), cycle(true, [], { tempoBpm: 95 })],
			aided
		});
		expect(exercises).toHaveLength(1);
		expect(exercises[0]).toMatchObject({ rounds: 2, tempo: { first: 90, last: 95 } });
	});

	it('gives no line to an exercise played alone with nothing played and no level told', () => {
		expect(
			summarizePlayed({
				executions: [{ exerciseId: 'grid-in-direction', tempoBpm: 80 }],
				attempts: [],
				aided,
				alone: 'grid-in-direction',
				level: () => null
			})
		).toEqual([]);
	});

	it('keeps the line of the exercise played alone, its level told, even without a cycle', () => {
		const exercises = summarizePlayed({
			executions: [],
			attempts: [],
			aided,
			alone: RHYTHM_OFFBEATS.id,
			level: () => ({ shown: 1, of: 4, aid: false })
		});
		expect(exercises).toEqual([
			expect.objectContaining({
				exerciseId: RHYTHM_OFFBEATS.id,
				rounds: 0,
				passed: 0,
				level: { shown: 1, of: 4, aid: false },
				tempo: null
			})
		]);
	});
});

describe('summarizePlayed of a session of several exercises and scopes', () => {
	it('gives a line per exercise and scope, in the order first played, free time without a tempo', () => {
		const exercises = summarizePlayed({
			executions: [
				{ exerciseId: 'identify-note', tempoBpm: null },
				{ exerciseId: 'locate-note-string', tempoBpm: 80 }
			],
			attempts: [
				cycle(true, [], { exerciseId: 'locate-note-string', tempoBpm: 80 }),
				cycle(false, ['string-aid'], { exerciseId: 'identify-note', tempoBpm: null }),
				cycle(true, [], { exerciseId: 'locate-note-string', scope: 'x', tempoBpm: 80 })
			],
			aided
		});
		expect(exercises.map((line) => [line.exerciseId, line.scope, line.tempo])).toEqual([
			['identify-note', undefined, null],
			['locate-note-string', undefined, { first: 80, last: 80 }],
			['locate-note-string', 'x', { first: 80, last: 80 }]
		]);
	});
});

describe('summarizePlayed of an exercise no file defines (D2)', () => {
	it('keeps its line with what its attempts say: no level, its changes but not its passages', () => {
		const exercises = summarizePlayed({
			executions: [
				{ exerciseId: 'gesture-unknown', tempoBpm: 80 },
				{ exerciseId: 'grid-reading', tempoBpm: 80 }
			],
			attempts: [
				change('gesture-unknown', 'p1', 0, 'perfect'),
				change('gesture-unknown', 'p1', 1, 'wrong'),
				change('grid-reading', 'p2', 0, 'perfect')
			],
			aided
		});
		expect(exercises.map((line) => line.exerciseId)).toEqual(['gesture-unknown', 'grid-reading']);
		// Its threshold is unknown: its passages are not counted, its changes are.
		expect(exercises[0]).toMatchObject({
			rounds: 2,
			passed: 1,
			level: null,
			tempo: { first: 80, last: 80 },
			inPassages: true,
			passages: null
		});
	});
});

describe('summaryMisses', () => {
	it('lists the missed changes with the shape heard and the closest admitted, and their contest', () => {
		const heard = shapeId('D', 'maj', [3, 2, 1], '7-7-5');
		expect(
			summaryMisses([
				change('grid-reading', 'p1', 0, 'wrong', heard, { id: 7 }),
				change('grid-reading', 'p1', 1, 'wrong', null, { id: 8, contested: true }),
				change('grid-reading', 'p1', 2, 'perfect', null, { id: 9 })
			])
		).toEqual([
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

	it('leaves out the changes of an exercise no file defines as one that plays passages, and any round outside a passage', () => {
		expect(
			summaryMisses([
				change('gesture-unknown', 'p1', 0, 'wrong'),
				cycle(false, [], { id: 3, correct: false } as Partial<Attempt>)
			])
		).toEqual([]);
	});

	it('tells the misses of a session played before the passages, nothing drawn as due', () => {
		const heard = shapeId('D', 'maj', [3, 2, 1], '7-7-5');
		const misses = summaryMisses([
			before('old-1', 0, heard, 1),
			before('old-1', 1, null, 2),
			before('old-2', 0, null, 3)
		]);
		expect(misses.map((miss) => [miss.symbol, miss.heard, miss.expected])).toEqual([
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
		expect(summaryMisses([linked]).map((miss) => [miss.symbol, miss.expected])).toEqual([
			['Ebm', null]
		]);
	});
});
