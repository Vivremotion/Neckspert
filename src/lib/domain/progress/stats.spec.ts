import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	type Attempt,
	type CardState,
	type SessionRecord
} from '$lib/domain/types';
import { neckCardKey, type NeckCard } from '$lib/domain/music';
import type { PitchName, StringNumber } from '$lib/domain/music/types';
import { MIN_COLD_DELAY_MS, TREND_WINDOW_MS } from './constants';
import { introduceCard, markLearned } from './cards';
import { keyed, neckExerciseId, neckTiming } from './neck';
import { buildNeckMap, computeHomeStats, summarizeSession } from './stats';

const NOW = Date.parse('2026-06-15T12:00:00.000Z');

const L1: NeckCard = { mechanic: 'locate', item: { string: 1, pitch: 'E' } };
const L2: NeckCard = { mechanic: 'locate', item: { string: 1, pitch: 'F' } };
const L3: NeckCard = { mechanic: 'locate', item: { string: 1, pitch: 'F#' } };
const I0: NeckCard = { mechanic: 'identify', item: { string: 1, fret: 0 } };

function introduced(card: NeckCard, now: number, sessionId: string): CardState {
	return introduceCard(keyed(card), now, sessionId, neckTiming(card.mechanic));
}

function learnedAt(state: CardState, now: number): CardState {
	return markLearned(state, now, neckTiming(state.mechanic), 80);
}

/** The attempt fields of `card`: exercise, mechanic, key and data (no answer). */
function on(card: NeckCard): Partial<Attempt> {
	return {
		exerciseId: neckExerciseId(card.mechanic),
		mechanic: card.mechanic,
		cardKey: neckCardKey(card),
		tempoBpm: card.mechanic === 'locate' ? 80 : null,
		data: { item: card.item, answer: null, confusion: null }
	};
}

/** A cold locate review of L1 at 80 bpm, played right on the beat. */
function coldAttempt(overrides: Partial<Attempt>): Attempt {
	return {
		sessionId: 's1',
		exerciseId: 'locate-neck',
		mechanic: 'locate',
		cardKey: neckCardKey(L1),
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		promptedAt: NOW,
		tempoBpm: 80,
		leadBeats: 2,
		timingOffsetMs: 0,
		reactionMs: 1000,
		correct: true,
		verdict: 'perfect',
		data: { item: L1.item, answer: { midi: 64 }, confusion: null },
		...overrides
	};
}

const RECORD_EXECUTIONS: SessionRecord['executions'] = [
	{ exerciseId: 'locate-neck', tempoBpm: 80 },
	{ exerciseId: 'identify-neck', tempoBpm: null }
];

describe('computeHomeStats', () => {
	it('has nothing due and no next review on a fresh install', () => {
		const stats = computeHomeStats({
			cards: [],
			attempts: [],
			settings: DEFAULT_SETTINGS,
			now: NOW
		});
		expect(stats.dueCount).toBe(0);
		expect(stats.nextReviewAt).toBeNull();
	});

	it('counts due reviews but not a card played in free play ten minutes ago', () => {
		const learnedDue = (target: NeckCard, due: number): CardState => {
			const card = learnedAt(
				introduced(target, NOW - 3 * MIN_COLD_DELAY_MS, 's0'),
				NOW - 2 * MIN_COLD_DELAY_MS
			);
			return { ...card, scheduling: { ...card.scheduling, due } };
		};
		const recent = NOW - 10 * 60 * 1000;
		const stats = computeHomeStats({
			cards: [learnedDue(L1, NOW - 5), learnedDue(L2, NOW - 1)],
			attempts: [
				coldAttempt({
					...on(L2),
					phase: 'free',
					temperature: 'hot',
					promptedAt: recent
				})
			],
			settings: DEFAULT_SETTINGS,
			now: NOW
		});
		expect(stats.dueCount).toBe(1);
		expect(stats.nextReviewAt).toBe(NOW - 5);
	});

	it('tells when the next review comes when nothing is due', () => {
		const card = learnedAt(introduced(L1, NOW - 3 * MIN_COLD_DELAY_MS, 's0'), NOW);
		const stats = computeHomeStats({
			cards: [{ ...card, scheduling: { ...card.scheduling, due: NOW + 10_000 } }],
			attempts: [],
			settings: DEFAULT_SETTINGS,
			now: NOW
		});
		expect(stats.dueCount).toBe(0);
		expect(stats.nextReviewAt).toBe(NOW + 10_000);
	});

	it('scores cold correct locate notes by distance to the beat', () => {
		const stats = computeHomeStats({
			cards: [],
			attempts: [
				coldAttempt({ reactionMs: 6000, timingOffsetMs: 20 }),
				coldAttempt({ reactionMs: 6000, timingOffsetMs: -40 }),
				coldAttempt({
					correct: false,
					verdict: 'wrong',
					reactionMs: 100,
					timingOffsetMs: 500
				}),
				coldAttempt({
					...on(I0),
					leadBeats: null,
					timingOffsetMs: null,
					reactionMs: 400
				})
			],
			settings: DEFAULT_SETTINGS,
			now: NOW
		});
		expect(stats.medianColdOffsetMs).toBe(30);
	});

	it('leaves off-beat answers out of the distance to the beat', () => {
		const stats = computeHomeStats({
			cards: [],
			attempts: [
				coldAttempt({ timingOffsetMs: 20 }),
				coldAttempt({ verdict: 'offbeat', timingOffsetMs: 1500 })
			],
			settings: DEFAULT_SETTINGS,
			now: NOW
		});
		expect(stats.medianColdOffsetMs).toBe(20);
	});

	it('counts an off-beat cold review as a miss in the session accuracy', () => {
		const summary = summarizeSession({
			record: {
				id: 's1',
				kind: 'learn',
				startedAt: NOW - 60_000,
				endedAt: NOW,
				fatigueDetected: false,
				executions: RECORD_EXECUTIONS
			},
			attempts: [coldAttempt({}), coldAttempt({ verdict: 'offbeat', timingOffsetMs: 1500 })],
			allAttempts: [],
			cards: [],
			now: NOW
		});
		expect(summary).toMatchObject({ attemptCount: 2, correctCount: 1, medianOffsetMs: 0 });
	});

	it('trends toward a smaller distance to the beat over 7 days', () => {
		const recent = [
			coldAttempt({ promptedAt: NOW - 1000, timingOffsetMs: 10, reactionMs: 6000 }),
			coldAttempt({ promptedAt: NOW - 2000, timingOffsetMs: -30, reactionMs: 6000 })
		];
		const previous = [
			coldAttempt({
				promptedAt: NOW - TREND_WINDOW_MS - 1000,
				timingOffsetMs: 80,
				reactionMs: 1500
			}),
			coldAttempt({
				promptedAt: NOW - TREND_WINDOW_MS - 2000,
				timingOffsetMs: 120,
				reactionMs: 1500
			})
		];
		const stats = computeHomeStats({
			cards: [],
			attempts: [...previous, ...recent],
			settings: DEFAULT_SETTINGS,
			now: NOW
		});
		expect(stats.medianColdOffsetMs).toBe(55);
		expect(stats.trend).toBe('improving');
	});

	it('returns a null trend when either window is empty', () => {
		const stats = computeHomeStats({
			cards: [],
			attempts: [coldAttempt({ promptedAt: NOW - 1000, reactionMs: 900 })],
			settings: DEFAULT_SETTINGS,
			now: NOW
		});
		expect(stats.trend).toBeNull();
	});
});

describe('summarizeSession', () => {
	const attempts = [
		coldAttempt({
			sessionId: 'sess',
			correct: true,
			reactionMs: 6000,
			timingOffsetMs: 12,
			promptedAt: NOW - 30_000
		}),
		coldAttempt({
			sessionId: 'sess',
			correct: false,
			reactionMs: 1100,
			timingOffsetMs: 80,
			promptedAt: NOW - 20_000,
			verdict: 'wrong'
		}),
		coldAttempt({
			sessionId: 'sess',
			temperature: 'hot',
			reactionMs: 500,
			timingOffsetMs: 4,
			promptedAt: NOW - 10_000
		}),
		coldAttempt({
			sessionId: 'sess',
			...on(I0),
			leadBeats: null,
			timingOffsetMs: null,
			reactionMs: 640,
			promptedAt: NOW - 15_000
		})
	];
	const cards = [
		learnedAt(introduced(L1, NOW - 50_000, 'sess'), NOW - 30_000),
		{
			...learnedAt(
				introduced(L2, NOW - MIN_COLD_DELAY_MS * 3, 'older'),
				NOW - MIN_COLD_DELAY_MS * 2
			),
			scheduling: {
				...introduced(L2, NOW - MIN_COLD_DELAY_MS * 2, 'older').scheduling,
				due: NOW + 1000
			}
		},
		introduced(L3, NOW - 40_000, 'sess')
	];
	const pending = coldAttempt({
		sessionId: 'sess',
		...on(L3),
		phase: 'learning',
		temperature: 'hot',
		promptedAt: NOW - 40_000
	});
	const record = (kind: SessionRecord['kind']): SessionRecord => ({
		id: 'sess',
		kind,
		startedAt: NOW - 60_000,
		endedAt: NOW,
		fatigueDetected: true,
		executions: RECORD_EXECUTIONS
	});

	it('summarizes cold accuracy, notes learned, notes pending and the next review', () => {
		const sessionAttempts = [...attempts, pending];
		const summary = summarizeSession({
			record: record('learn'),
			attempts: sessionAttempts,
			allAttempts: sessionAttempts,
			cards,
			now: NOW
		});
		expect(summary).toEqual({
			sessionId: 'sess',
			pool: 'cold',
			attemptCount: 3,
			correctCount: 2,
			medianOffsetMs: 12,
			identifyMedianReactionMs: 640,
			learnedCount: 1,
			pendingCount: 1,
			knownCount: 0,
			fatigueDetected: true,
			nextReviewAt: NOW + 1000,
			grade: null,
			tempoBpm: 80
		});
	});

	it('gives the tempo the locate exercise was played at', () => {
		const summarize = (executions: SessionRecord['executions']) =>
			summarizeSession({
				record: { ...record('learn'), executions },
				attempts: [],
				allAttempts: [],
				cards: [],
				now: NOW
			}).tempoBpm;
		expect(
			summarize([
				{ exerciseId: 'identify-neck', tempoBpm: null },
				{ exerciseId: 'locate-neck', tempoBpm: 95 }
			])
		).toBe(95);
		expect(summarize([{ exerciseId: 'identify-neck', tempoBpm: null }])).toBeNull();
	});

	it('keeps probes out of cold accuracy and counts the ones passed as already known', () => {
		const probe = (overrides: Partial<Attempt>) =>
			coldAttempt({ sessionId: 'sess', phase: 'probe', promptedAt: NOW - 5_000, ...overrides });
		const sessionAttempts = [
			probe({ correct: true, timingOffsetMs: 3 }),
			probe({ temperature: 'hot', correct: false, verdict: 'wrong', timingOffsetMs: null }),
			coldAttempt({ sessionId: 'sess', correct: false, verdict: 'wrong', timingOffsetMs: 90 })
		];
		const summary = summarizeSession({
			record: record('learn'),
			attempts: sessionAttempts,
			allAttempts: sessionAttempts,
			cards,
			now: NOW
		});
		expect(summary.attemptCount).toBe(1);
		expect(summary.correctCount).toBe(0);
		expect(summary.knownCount).toBe(1);
		expect(summary.medianOffsetMs).toBeNull();
	});

	it('has no cold figures when the session only probed', () => {
		const only = [
			coldAttempt({ sessionId: 'sess', phase: 'probe', correct: true, timingOffsetMs: 3 })
		];
		const summary = summarizeSession({
			record: record('learn'),
			attempts: only,
			allAttempts: only,
			cards,
			now: NOW
		});
		expect(summary.attemptCount).toBe(0);
		expect(summary.medianOffsetMs).toBeNull();
		expect(summary.knownCount).toBe(1);
	});

	it('scores a free session across cold and hot attempts', () => {
		const summary = summarizeSession({
			record: record('free'),
			attempts,
			allAttempts: attempts,
			cards,
			now: NOW
		});
		expect(summary.pool).toBe('all');
		expect(summary.attemptCount).toBe(4);
		expect(summary.correctCount).toBe(3);
		expect(summary.medianOffsetMs).toBe(8);
		expect(summary.identifyMedianReactionMs).toBe(640);
		expect(summary.grade).toBe('B+');
	});

	it('leaves an empty free session ungraded', () => {
		const summary = summarizeSession({
			record: record('free'),
			attempts: [],
			allAttempts: [],
			cards: [],
			now: NOW
		});
		expect(summary.attemptCount).toBe(0);
		expect(summary.medianOffsetMs).toBeNull();
		expect(summary.identifyMedianReactionMs).toBeNull();
		expect(summary.grade).toBeNull();
	});
});

describe('buildNeckMap', () => {
	it('leaves a missed probe out of cold accuracy', () => {
		const target: NeckCard = { mechanic: 'locate', item: { string: 2, pitch: 'C' } };
		const card = { ...introduced(target, NOW, 's0'), acquiredAt: NOW };
		const attempts = [
			coldAttempt({
				...on(target),
				phase: 'probe',
				temperature: 'hot',
				correct: false
			}),
			coldAttempt({ ...on(target), correct: true, promptedAt: NOW + 1 })
		];
		const cells = buildNeckMap({
			cards: [card],
			attempts,
			pitchAt: () => 'C'
		});
		expect(cells.find((cell) => cell.string === 2 && cell.fret === 1)?.coldAccuracy).toBe(1);
	});

	it('builds 72 cells with injected pitches and per-sense status', () => {
		const C_ON_B: NeckCard = { mechanic: 'locate', item: { string: 2, pitch: 'C' } };
		const FRET_1: NeckCard = { mechanic: 'identify', item: { string: 2, fret: 1 } };
		const locate = {
			...introduced(C_ON_B, NOW, 's0'),
			acquiredAt: NOW,
			leadBeats: 2 as const
		};
		const identify = introduced(FRET_1, NOW, 's0');
		const attempts = [
			coldAttempt({
				...on(C_ON_B),
				// Played at no known tempo.
				tempoBpm: null,
				reactionMs: 700,
				correct: true,
				promptedAt: NOW - 1
			}),
			coldAttempt({
				...on(FRET_1),
				leadBeats: null,
				reactionMs: 900,
				correct: false,
				promptedAt: NOW - 2
			})
		];
		const cells = buildNeckMap({
			cards: [locate, identify],
			attempts,
			pitchAt: (string: StringNumber, fret: number): PitchName => {
				void string;
				const names: PitchName[] = [
					'E',
					'F',
					'F#',
					'G',
					'G#',
					'A',
					'A#',
					'B',
					'C',
					'C#',
					'D',
					'D#'
				];
				return names[fret]!;
			}
		});
		expect(cells).toHaveLength(66);
		expect(cells[0]).toMatchObject({ string: 1, fret: 1, pitch: 'F' });
		expect(cells.some((cell) => cell.fret === 0)).toBe(false);
		const identifyCell = cells.find((c) => c.string === 2 && c.fret === 1);
		expect(identifyCell?.pitch).toBe('F');
		expect(identifyCell?.locate).toBe('unseen');
		expect(identifyCell?.identify).toBe('learning');
		// Fake pitchAt: fret 8 on any string is C
		const locateCell = cells.find((c) => c.string === 2 && c.fret === 8);
		expect(locateCell?.pitch).toBe('C');
		expect(locateCell?.locate).toBe('acquired');
		// Its cold success was played at no known tempo.
		expect(locateCell?.locateRecallMs).toBeNull();
		expect(locateCell?.identifyMedianReactionMs).toBeNull();
		expect(locateCell?.coldAccuracy).toBe(1);
		expect(identifyCell?.locateRecallMs).toBeNull();
		expect(identifyCell?.identifyMedianReactionMs).toBe(900);
	});

	describe('last cold recall of a locate card', () => {
		const C_ON_B: NeckCard = { mechanic: 'locate', item: { string: 2, pitch: 'C' } };
		const card = { ...introduced(C_ON_B, NOW, 'intro'), leadBeats: 4 as const };
		/** Each session's attempts carry its tempo; 'old' is from before tempos were recorded. */
		const tempos: Record<string, number | null> = { slow: 80, fast: 115, old: null };
		const cold = (overrides: Partial<Attempt> & { sessionId: string }) =>
			coldAttempt({
				...on(C_ON_B),
				leadBeats: 2,
				tempoBpm: tempos[overrides.sessionId],
				...overrides
			});
		const recallMs = (attempts: Attempt[]) =>
			buildNeckMap({ cards: [card], attempts, pitchAt: () => 'C' }).find(
				(c) => c.string === 2 && c.fret === 8
			)?.locateRecallMs;

		it('times the attempt lead at its own tempo', () => {
			expect(recallMs([cold({ sessionId: 'fast' })])).toBe(1043);
		});

		it('keeps the most recent success', () => {
			expect(
				recallMs([
					cold({ sessionId: 'slow', promptedAt: NOW - 2000 }),
					cold({ sessionId: 'fast', promptedAt: NOW - 1000 })
				])
			).toBe(1043);
		});

		it('keeps showing the last success after a missed review', () => {
			expect(
				recallMs([
					cold({ sessionId: 'fast', promptedAt: NOW - 2000 }),
					cold({
						sessionId: 'slow',
						promptedAt: NOW - 1000,
						leadBeats: 4,
						correct: false,
						verdict: 'wrong'
					})
				])
			).toBe(1043);
		});

		it('proves nothing with hot successes or an off-beat answer', () => {
			expect(
				recallMs([cold({ sessionId: 'fast', temperature: 'hot', phase: 'consolidation' })])
			).toBeNull();
			expect(
				recallMs([cold({ sessionId: 'fast', verdict: 'offbeat', timingOffsetMs: 1200 })])
			).toBeNull();
		});

		it('counts a passed probe', () => {
			expect(recallMs([cold({ sessionId: 'fast', phase: 'probe' })])).toBe(1043);
		});

		it('skips a success without tempo, back to the one before', () => {
			expect(
				recallMs([
					cold({ sessionId: 'slow', promptedAt: NOW - 2000 }),
					cold({ sessionId: 'old', promptedAt: NOW - 1000 })
				])
			).toBe(1500);
			expect(recallMs([cold({ sessionId: 'old' })])).toBeNull();
		});

		it('reads an old attempt at the dropped one-beat lead', () => {
			expect(recallMs([cold({ sessionId: 'slow', leadBeats: 1 })])).toBe(750);
		});
	});

	it('reads the tempo of the attempt, without a list of sessions', () => {
		const card = introduced({ mechanic: 'locate', item: { string: 2, pitch: 'C' } }, NOW, 's0');
		const cells = buildNeckMap({
			cards: [card],
			attempts: [coldAttempt({ cardKey: card.key, leadBeats: 4, tempoBpm: 120 })],
			pitchAt: () => 'C'
		});
		expect(cells.find((c) => c.string === 2 && c.fret === 8)?.locateRecallMs).toBe(2000);
	});
});
