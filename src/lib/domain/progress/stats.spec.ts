import { describe, expect, it } from 'vitest';
import {
	DEFAULT_SETTINGS,
	cardKey,
	type Attempt,
	type CardState,
	type Curriculum,
	type SessionRecord,
	type Target
} from '$lib/domain/types';
import type { PitchName, StringNumber } from '$lib/domain/music/types';
import {
	MIN_COLD_DELAY_MS,
	NEXT_SESSION_GAP_MS,
	TREND_WINDOW_MS
} from './constants';
import { introduceCard } from './cards';
import { buildNeckMap, computeHomeStats, summarizeSession } from './stats';

const NOW = Date.parse('2026-06-15T12:00:00.000Z');

const L1: Target = { direction: 'locate', string: 1, pitch: 'E' };
const L2: Target = { direction: 'locate', string: 1, pitch: 'F' };
const L3: Target = { direction: 'locate', string: 1, pitch: 'F#' };

const FIXTURE: Curriculum = [
	{ id: 'locate-s1-a', direction: 'locate', requires: null, targets: [L1, L2, L3] }
];

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
			curriculum: FIXTURE,
			now: NOW
		});
		expect(stats.nextAction).toBe('placement');
		expect(stats.nextReviewAt).toBeNull();
	});

	it('suggests a session when reviews are due or new targets exist', () => {
		const due: CardState = {
			...introduceCard(L1, NOW - MIN_COLD_DELAY_MS, 's0'),
			scheduling: {
				...introduceCard(L1, NOW - MIN_COLD_DELAY_MS, 's0').scheduling,
				due: NOW - 1
			}
		};
		expect(
			computeHomeStats({
				cards: [due],
				attempts: [],
				settings: { ...DEFAULT_SETTINGS, placementDoneAt: NOW - 1 },
				curriculum: FIXTURE,
				now: NOW
			}).nextAction
		).toBe('session');
	});

	it('waits with the next review time when nothing is due and nothing new', () => {
		const cards = [L1, L2, L3].map((target) => {
			const card = introduceCard(target, NOW - MIN_COLD_DELAY_MS, 's0');
			return {
				...card,
				acquiredAt: NOW - MIN_COLD_DELAY_MS,
				scheduling: { ...card.scheduling, due: NOW + 10_000 }
			};
		});
		const stats = computeHomeStats({
			cards,
			attempts: [],
			settings: { ...DEFAULT_SETTINGS, placementDoneAt: NOW - 1 },
			curriculum: FIXTURE,
			now: NOW
		});
		expect(stats.nextAction).toBe('wait');
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
			curriculum: FIXTURE,
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
			curriculum: FIXTURE,
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
			curriculum: FIXTURE,
			now: NOW
		});
		expect(stats.trend).toBeNull();
	});
});

describe('summarizeSession', () => {
	it('summarizes cold accuracy, learning and the suggested next time', () => {
		const record: SessionRecord = {
			id: 'sess',
			kind: 'daily',
			startedAt: NOW - 60_000,
			endedAt: NOW,
			fatigueDetected: true
		};
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
			introduceCard(L1, NOW - 30_000, 'sess'),
			{
				...introduceCard(L2, NOW - MIN_COLD_DELAY_MS * 2, 'older'),
				scheduling: {
					...introduceCard(L2, NOW - MIN_COLD_DELAY_MS * 2, 'older').scheduling,
					due: NOW + 1000
				}
			}
		];
		const summary = summarizeSession({ record, attempts, cards, now: NOW });
		expect(summary).toEqual({
			sessionId: 'sess',
			coldCount: 3,
			coldCorrect: 2,
			medianColdOffsetMs: 12,
			identifyMedianReactionMs: 640,
			learnedCount: 1,
			fatigueDetected: true,
			nextSuggestedAt: NOW + NEXT_SESSION_GAP_MS
		});
	});
});

describe('buildNeckMap', () => {
	it('builds 72 cells with injected pitches and per-sense status', () => {
		const locate = {
			...introduceCard({ direction: 'locate', string: 2, pitch: 'C' }, NOW, 's0'),
			acquiredAt: NOW,
			leadBeats: 2 as const
		};
		const identify = introduceCard(
			{ direction: 'identify', string: 2, fret: 1 },
			NOW,
			's0'
		);
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
		expect(cells).toHaveLength(72);
		expect(cells[0]).toMatchObject({ string: 1, fret: 0, pitch: 'E' });
		const identifyCell = cells.find((c) => c.string === 2 && c.fret === 1);
		expect(identifyCell?.pitch).toBe('F');
		expect(identifyCell?.locate).toBe('unseen');
		expect(identifyCell?.identify).toBe('learning');
		// Fake pitchAt: fret 8 on any string is C
		const locateCell = cells.find((c) => c.string === 2 && c.fret === 8);
		expect(locateCell?.pitch).toBe('C');
		expect(locateCell?.locate).toBe('acquired');
		expect(locateCell?.locateLeadBeats).toBe(2);
		expect(locateCell?.identifyMedianReactionMs).toBeNull();
		expect(locateCell?.coldAccuracy).toBe(1);
		expect(identifyCell?.locateLeadBeats).toBeNull();
		expect(identifyCell?.identifyMedianReactionMs).toBe(900);
	});
});
