import { describe, expect, it } from 'vitest';
import { responseAttempt, type AttemptOverrides } from '$lib/testing/attempts';
import {
	type Attempt,
	type CardState,
	type SessionOrigin,
	type SessionRecord
} from '$lib/domain/types';
import type { PitchName, StringNumber } from '$lib/domain/music/types';
import { MIN_COLD_DELAY_MS } from './constants';
import { introduceCard, markLearned } from './cards';
import { keyed, neckExerciseId, neckCardKey, type NeckCard } from '$lib/testing/neck';
import { buildNeckMap, summarizeSession } from './stats';

const NOW = Date.parse('2026-06-15T12:00:00.000Z');

const L1: NeckCard = { skill: 'locate-note-string', item: { string: 1, pitch: 'E' } };
const L2: NeckCard = { skill: 'locate-note-string', item: { string: 1, pitch: 'F' } };
const L3: NeckCard = { skill: 'locate-note-string', item: { string: 1, pitch: 'F#' } };
const I0: NeckCard = { skill: 'identify-note', item: { string: 1, fret: 0 } };

function introduced(card: NeckCard, now: number, sessionId: string): CardState {
	return introduceCard(keyed(card), now, sessionId);
}

function learnedAt(state: CardState, now: number): CardState {
	return markLearned(state, now);
}

/** The attempt fields of `card`: exercise, skill, key and data (no answer). */
function on(card: NeckCard): AttemptOverrides {
	return {
		exerciseId: neckExerciseId(card.skill),
		skill: card.skill,
		cardKey: neckCardKey(card),
		tempoBpm: card.skill === 'locate-note-string' ? 80 : null,
		data: { item: card.item, answer: null, confusion: null }
	};
}

/** A cold locate review of L1 at 80 bpm, played right on the beat. */
function coldAttempt(overrides: AttemptOverrides): Attempt {
	return responseAttempt({
		sessionId: 's1',
		exerciseId: 'locate-note-string',
		skill: 'locate-note-string',
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
		observations: [],
		...overrides
	});
}

const RECORD_EXECUTIONS: SessionRecord['executions'] = [
	{ exerciseId: 'locate-note-string', tempoBpm: 80 },
	{ exerciseId: 'identify-note', tempoBpm: null }
];

describe('summarizeSession of off-beat answers', () => {
	it('counts an off-beat cold review as a miss in the session accuracy', () => {
		const summary = summarizeSession({
			record: {
				id: 's1',
				routine: 'notes',
				startedAt: NOW - 60_000,
				endedAt: NOW,
				fatigueDetected: false,
				executions: RECORD_EXECUTIONS,
				latencyMs: 0
			},
			attempts: [coldAttempt({}), coldAttempt({ verdict: 'offbeat', timingOffsetMs: 1500 })],
			allAttempts: [],
			cards: [],
			now: NOW
		});
		expect(summary).toMatchObject({ attemptCount: 2, correctCount: 1, medianOffsetMs: 0 });
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
	const record = (origin: SessionOrigin): SessionRecord => ({
		id: 'sess',
		...origin,
		startedAt: NOW - 60_000,
		endedAt: NOW,
		fatigueDetected: true,
		executions: RECORD_EXECUTIONS,
		latencyMs: 0
	});

	it('summarizes cold accuracy, notes learned, notes pending and the next review', () => {
		const sessionAttempts = [...attempts, pending];
		const summary = summarizeSession({
			record: record({ routine: 'notes' }),
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
			tempoBpm: 80,
			chords: false,
			memory: true,
			exercises: [
				expect.objectContaining({ exerciseId: 'locate-note-string', rounds: 4, passed: 3 }),
				expect.objectContaining({ exerciseId: 'identify-note', rounds: 1, tempo: null })
			],
			misses: []
		});
	});

	it('gives the tempo the locate exercise was played at', () => {
		const summarize = (executions: SessionRecord['executions']) =>
			summarizeSession({
				record: { ...record({ routine: 'notes' }), executions },
				attempts: [],
				allAttempts: [],
				cards: [],
				now: NOW
			}).tempoBpm;
		expect(
			summarize([
				{ exerciseId: 'identify-note', tempoBpm: null },
				{ exerciseId: 'locate-note-string', tempoBpm: 95 }
			])
		).toBe(95);
		expect(summarize([{ exerciseId: 'identify-note', tempoBpm: null }])).toBeNull();
	});

	it('keeps probes out of cold accuracy and counts the ones passed as already known', () => {
		const probe = (overrides: AttemptOverrides) =>
			coldAttempt({ sessionId: 'sess', phase: 'probe', promptedAt: NOW - 5_000, ...overrides });
		const sessionAttempts = [
			probe({ correct: true, timingOffsetMs: 3 }),
			probe({ temperature: 'hot', correct: false, verdict: 'wrong', timingOffsetMs: null }),
			coldAttempt({ sessionId: 'sess', correct: false, verdict: 'wrong', timingOffsetMs: 90 })
		];
		const summary = summarizeSession({
			record: record({ routine: 'notes' }),
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
			record: record({ routine: 'notes' }),
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
			record: record({ routine: 'notes', free: true }),
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
			record: record({ routine: 'notes', free: true }),
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
		const target: NeckCard = { skill: 'locate-note-string', item: { string: 2, pitch: 'C' } };
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
		const C_ON_B: NeckCard = { skill: 'locate-note-string', item: { string: 2, pitch: 'C' } };
		const FRET_1: NeckCard = { skill: 'identify-note', item: { string: 2, fret: 1 } };
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
		const C_ON_B: NeckCard = { skill: 'locate-note-string', item: { string: 2, pitch: 'C' } };
		const card = { ...introduced(C_ON_B, NOW, 'intro'), leadBeats: 4 as const };
		/** Each session's attempts carry its tempo; 'old' is from before tempos were recorded. */
		const tempos: Record<string, number | null> = { slow: 80, fast: 115, old: null };
		const cold = (overrides: AttemptOverrides & { sessionId: string }) =>
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
		const card = introduced(
			{ skill: 'locate-note-string', item: { string: 2, pitch: 'C' } },
			NOW,
			's0'
		);
		const cells = buildNeckMap({
			cards: [card],
			attempts: [coldAttempt({ cardKey: card.key, leadBeats: 4, tempoBpm: 120 })],
			pitchAt: () => 'C'
		});
		expect(cells.find((c) => c.string === 2 && c.fret === 8)?.locateRecallMs).toBe(2000);
	});
});

describe('summarizeSession of a triads session', () => {
	const KEY = 'D|maj|3:5,2:1,1:3';
	const triad = (overrides: AttemptOverrides): Attempt =>
		coldAttempt({
			id: 1,
			sessionId: 'tri',
			exerciseId: 'chord-anchor',
			skill: 'chord-anchor',
			cardKey: `chord-anchor:${KEY}`,
			data: { item: { voicingKey: KEY }, answer: null, confusion: null },
			...overrides
		});
	const record: SessionRecord = {
		id: 'tri',
		routine: 'chords',
		startedAt: NOW - 60_000,
		endedAt: NOW,
		fatigueDetected: false,
		executions: [
			{ exerciseId: 'chord-anchor', tempoBpm: 90 },
			{ exerciseId: 'chord-zone', tempoBpm: 85 }
		],
		latencyMs: 0
	};
	const attempts = [
		triad({ id: 1, timingOffsetMs: 20 }),
		triad({
			id: 2,
			correct: false,
			verdict: 'wrong',
			data: {
				item: { voicingKey: KEY },
				answer: { root: { midi: 62 }, chord: { decided: `${KEY}@14-15-14` } },
				confusion: { kind: 'other-inversion', part: 'chord' }
			},
			contested: true
		}),
		triad({
			id: 3,
			correct: false,
			verdict: 'wrong',
			data: {
				item: { voicingKey: KEY },
				answer: { root: { midi: 63 }, chord: null },
				confusion: { kind: 'semitone', delta: 1, part: 'root' }
			}
		}),
		triad({
			id: 4,
			exerciseId: 'chord-zone',
			skill: 'chord-zone',
			cardKey: `chord-zone:${KEY}`,
			correct: false,
			verdict: 'wrong',
			data: {
				item: { voicingKey: KEY, position: 2 },
				answer: { decided: null },
				confusion: { kind: 'none', part: 'chord' }
			}
		})
	];
	const summary = summarizeSession({
		record,
		attempts,
		allAttempts: attempts,
		cards: [],
		now: NOW
	});

	it('measures the cold triads on the beat, at the anchor tempo', () => {
		expect(summary).toMatchObject({
			pool: 'cold',
			attemptCount: 4,
			correctCount: 1,
			medianOffsetMs: 20,
			identifyMedianReactionMs: null,
			tempoBpm: 90
		});
	});

	it('says it was a triads session, and lists no refused chords: they are contested in play', () => {
		expect(summary.chords).toBe(true);
		expect('triads' in summary).toBe(false);
	});

	it('gives a zone session the tempo of the zone exercise', () => {
		const zone = summarizeSession({
			record: {
				...record,
				routine: 'chords-zone',
				executions: [{ exerciseId: 'chord-zone', tempoBpm: 85 }]
			},
			attempts: [],
			allAttempts: [],
			cards: [],
			now: NOW
		});
		expect(zone).toMatchObject({ chords: true, tempoBpm: 85 });
	});

	it('says a notes session is one', () => {
		expect(
			summarizeSession({
				record: { ...record, routine: 'notes' },
				attempts: [],
				allAttempts: [],
				cards: [],
				now: NOW
			}).chords
		).toBe(false);
	});
});

describe('summarizeSession of a gesture session', () => {
	const record = (origin: SessionOrigin): SessionRecord => ({
		id: 's1',
		...origin,
		startedAt: NOW - 60_000,
		endedAt: NOW,
		fatigueDetected: false,
		executions: [{ exerciseId: 'grid-reading', tempoBpm: 80 }],
		latencyMs: 0
	});

	it('sums the passages up by exercise, a session of changes not one of memory', () => {
		const attempts = [0, 1].map((index) =>
			coldAttempt({
				exerciseId: 'grid-reading',
				skill: 'grid-reading',
				cardKey: `grid-reading:jam:blues-f#${index}`,
				temperature: 'hot',
				phase: 'free',
				data: {
					item: {
						rule: 'jam',
						element: 'jam:blues-f',
						passageId: 's1:0',
						index,
						changes: [
							{ at: 0, length: 4, symbol: 'F7' },
							{ at: 4, length: 4, symbol: 'Bb7' }
						],
						symbol: index === 0 ? 'F7' : 'Bb7',
						chord: index === 0 ? 'F|maj' : 'Bb|maj',
						sets: [[3, 2, 1]],
						previous: null
					},
					answer: null,
					confusion: null
				}
			})
		);
		const input = { attempts, allAttempts: [], cards: [], now: NOW };
		const changes = summarizeSession({ ...input, record: record({ routine: 'changes' }) });
		expect(changes.memory).toBe(false);
		expect(changes.exercises).toEqual([
			{
				exerciseId: 'grid-reading',
				rounds: 2,
				passed: 2,
				aided: 0,
				level: null,
				tempo: { first: 80, last: 80 },
				inPassages: true,
				passages: { played: 1, passed: 1 },
				changedAir: false
			}
		]);
		expect(changes.misses).toEqual([]);
		// A session of the notes is one of memory: its lines are data the screen does not show.
		expect(summarizeSession({ ...input, record: record({ routine: 'notes' }) }).memory).toBe(true);
	});
});
