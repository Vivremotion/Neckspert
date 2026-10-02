import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	cardKey,
	type Attempt,
	type CardState,
	type SessionRecord,
	type Target
} from '$lib/domain/types';
import type { PitchName, StringNumber } from '$lib/domain/music/types';
import { MIN_COLD_DELAY_MS, TREND_WINDOW_MS } from './constants';
import { introduceCard, markLearned } from './cards';
import { buildNeckMap, computeHomeStats, summarizeSession } from './stats';

const NOW = Date.parse('2026-06-15T12:00:00.000Z');

const L1: Target = { direction: 'locate', string: 1, pitch: 'E' };
const L2: Target = { direction: 'locate', string: 1, pitch: 'F' };
const L3: Target = { direction: 'locate', string: 1, pitch: 'F#' };

function coldAttempt(overrides: Partial<Attempt>): Attempt {
	return {
		sessionId: 's1',
		cardKey: cardKey(L1),
		target: L1,
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: 2,
		promptedAt: NOW,
		answer: { kind: 'note', midi: 64 },
		correct: true,
		verdict: 'perfect',
		timingOffsetMs: 0,
		reactionMs: 1000,
		confusion: null,
		...overrides
	};
}

describe('computeHomeStats', () => {
	it('asks for placement until placementDoneAt is set', () => {
		const stats = computeHomeStats({
			cards: [],
			attempts: [],
			settings: { ...DEFAULT_SETTINGS, placementDoneAt: null },
			now: NOW
		});
		expect(stats.nextAction).toBe('placement');
		expect(stats.nextReviewAt).toBeNull();
	});

	it('offers learning right after placement, with nothing due yet', () => {
		const stats = computeHomeStats({
			cards: [],
			attempts: [],
			settings: { ...DEFAULT_SETTINGS, placementDoneAt: NOW - 1 },
			now: NOW
		});
		expect(stats.nextAction).toBe('learn');
		expect(stats.dueCount).toBe(0);
		expect(stats.nextReviewAt).toBeNull();
	});

	it('counts due reviews but not a card played in free play ten minutes ago', () => {
		const learnedDue = (target: Target, due: number): CardState => {
			const card = markLearned(
				introduceCard(target, NOW - 3 * MIN_COLD_DELAY_MS, 's0'),
				NOW - 2 * MIN_COLD_DELAY_MS,
				80
			);
			return { ...card, scheduling: { ...card.scheduling, due } };
		};
		const recent = NOW - 10 * 60 * 1000;
		const stats = computeHomeStats({
			cards: [learnedDue(L1, NOW - 5), learnedDue(L2, NOW - 1)],
			attempts: [
				coldAttempt({
					cardKey: cardKey(L2),
					target: L2,
					phase: 'free',
					temperature: 'hot',
					promptedAt: recent
				})
			],
			settings: { ...DEFAULT_SETTINGS, placementDoneAt: NOW - 1 },
			now: NOW
		});
		expect(stats.nextAction).toBe('learn');
		expect(stats.dueCount).toBe(1);
		expect(stats.nextReviewAt).toBe(NOW - 5);
	});

	it('tells when the next review comes when nothing is due', () => {
		const card = markLearned(introduceCard(L1, NOW - 3 * MIN_COLD_DELAY_MS, 's0'), NOW, 80);
		const stats = computeHomeStats({
			cards: [{ ...card, scheduling: { ...card.scheduling, due: NOW + 10_000 } }],
			attempts: [],
			settings: { ...DEFAULT_SETTINGS, placementDoneAt: NOW - 1 },
			now: NOW
		});
		expect(stats.nextAction).toBe('learn');
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
					target: { direction: 'identify', string: 1, fret: 0 },
					leadBeats: null,
					timingOffsetMs: null,
					reactionMs: 400
				})
			],
			settings: { ...DEFAULT_SETTINGS, placementDoneAt: NOW },
			now: NOW
		});
		expect(stats.medianColdOffsetMs).toBe(30);
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
			settings: { ...DEFAULT_SETTINGS, placementDoneAt: NOW },
			now: NOW
		});
		expect(stats.medianColdOffsetMs).toBe(55);
		expect(stats.trend).toBe('improving');
	});

	it('returns a null trend when either window is empty', () => {
		const stats = computeHomeStats({
			cards: [],
			attempts: [coldAttempt({ promptedAt: NOW - 1000, reactionMs: 900 })],
			settings: { ...DEFAULT_SETTINGS, placementDoneAt: NOW },
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
			target: { direction: 'identify', string: 1, fret: 0 },
			cardKey: 'identify:1:0',
			leadBeats: null,
			timingOffsetMs: null,
			reactionMs: 640,
			promptedAt: NOW - 15_000
		})
	];
	const cards = [
		markLearned(introduceCard(L1, NOW - 50_000, 'sess'), NOW - 30_000, 80),
		{
			...markLearned(
				introduceCard(L2, NOW - MIN_COLD_DELAY_MS * 3, 'older'),
				NOW - MIN_COLD_DELAY_MS * 2,
				80
			),
			scheduling: {
				...introduceCard(L2, NOW - MIN_COLD_DELAY_MS * 2, 'older').scheduling,
				due: NOW + 1000
			}
		},
		introduceCard(L3, NOW - 40_000, 'sess')
	];
	const pending = coldAttempt({
		sessionId: 'sess',
		cardKey: cardKey(L3),
		target: L3,
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
		tempoBpm: 80
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
			fatigueDetected: true,
			nextReviewAt: NOW + 1000,
			grade: null
		});
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
	it('builds 72 cells with injected pitches and per-sense status', () => {
		const locate = {
			...introduceCard({ direction: 'locate', string: 2, pitch: 'C' }, NOW, 's0'),
			acquiredAt: NOW,
			leadBeats: 2 as const
		};
		const identify = introduceCard({ direction: 'identify', string: 2, fret: 1 }, NOW, 's0');
		const attempts = [
			coldAttempt({
				cardKey: locate.key,
				target: locate.target,
				reactionMs: 700,
				correct: true,
				promptedAt: NOW - 1
			}),
			coldAttempt({
				cardKey: identify.key,
				target: identify.target,
				leadBeats: null,
				reactionMs: 900,
				correct: false,
				promptedAt: NOW - 2
			})
		];
		const cells = buildNeckMap({
			cards: [locate, identify],
			attempts,
			sessions: [],
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
		expect(locateCell?.locateLeadBeats).toBe(2);
		expect(locateCell?.locateLeadMs).toBeNull();
		expect(locateCell?.identifyMedianReactionMs).toBeNull();
		expect(locateCell?.coldAccuracy).toBe(1);
		expect(identifyCell?.locateLeadBeats).toBeNull();
		expect(identifyCell?.identifyMedianReactionMs).toBe(900);
	});

	it('shows the current lead at the tempo of the session that last set it', () => {
		const intro = introduceCard({ direction: 'locate', string: 2, pitch: 'C' }, NOW, 'slow');
		const card = { ...intro, leadBeats: 1 as const };
		const cells = buildNeckMap({
			cards: [card],
			attempts: [
				coldAttempt({
					cardKey: card.key,
					target: card.target,
					phase: 'review',
					temperature: 'cold',
					sessionId: 'fast',
					promptedAt: NOW
				})
			],
			sessions: [
				{ id: 'slow', tempoBpm: 60 },
				{ id: 'fast', tempoBpm: 120 }
			],
			pitchAt: () => 'C'
		});
		const cell = cells.find((c) => c.string === 2 && c.fret === 8);
		expect(cell?.locateLeadMs).toBe(500);
	});

	it('takes the lead tempo from a cold free-play attempt too', () => {
		const intro = introduceCard({ direction: 'locate', string: 2, pitch: 'C' }, NOW, 'slow');
		const card = { ...intro, leadBeats: 1 as const };
		const cells = buildNeckMap({
			cards: [card],
			attempts: [
				coldAttempt({
					cardKey: card.key,
					target: card.target,
					phase: 'free',
					temperature: 'cold',
					sessionId: 'fast',
					promptedAt: NOW
				})
			],
			sessions: [
				{ id: 'slow', tempoBpm: 60 },
				{ id: 'fast', tempoBpm: 120 }
			],
			pitchAt: () => 'C'
		});
		expect(cells.find((c) => c.string === 2 && c.fret === 8)?.locateLeadMs).toBe(500);
	});

	it('omits the lead duration when that session has no tempo', () => {
		const card = introduceCard({ direction: 'locate', string: 2, pitch: 'C' }, NOW, 'old');
		const cells = buildNeckMap({
			cards: [{ ...card, leadBeats: 2 }],
			attempts: [],
			sessions: [{ id: 'old', tempoBpm: null }],
			pitchAt: () => 'C'
		});
		const cell = cells.find((c) => c.string === 2 && c.fret === 8);
		expect(cell?.locateLeadBeats).toBe(2);
		expect(cell?.locateLeadMs).toBeNull();
	});
});
