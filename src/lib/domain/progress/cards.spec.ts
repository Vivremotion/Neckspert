import { describe, expect, it } from 'vitest';
import { responseAttempt, type AttemptOverrides } from '$lib/testing/attempts';
import type { Attempt, CardState } from '$lib/domain/types';
import { State } from 'ts-fsrs';
import { MIN_COLD_DELAY_MS } from './constants';
import { beatTiming, identifyTiming } from '$lib/domain/timing';
import { IDENTIFY_RECALL_THRESHOLD_MS, RECALL_THRESHOLD_MS } from '$lib/domain/types';
import { directRecallOf } from '$lib/domain/learning/recall';
import {
	applyColdAttempt,
	cardLeadAfter,
	cardStatus,
	introduceCard,
	isAcquired,
	isMastered,
	markLearned,
	probeCard,
	probeTemperature
} from './cards';

const NOW = Date.parse('2026-04-01T10:00:00.000Z');
const TEMPO = 80;
const LOCATE = { key: 'locate:6:G', mechanic: 'locate', item: { string: 6, pitch: 'G' } };
const IDENTIFY = { key: 'identify:6:3', mechanic: 'identify', item: { string: 6, fret: 3 } };
const recall = directRecallOf(RECALL_THRESHOLD_MS);
const naming = directRecallOf(IDENTIFY_RECALL_THRESHOLD_MS);

/** A cold locate review, played at TEMPO. */
function attempt(overrides: AttemptOverrides): Attempt {
	return responseAttempt({
		sessionId: 's-review',
		exerciseId: 'locate-neck',
		mechanic: 'locate',
		cardKey: LOCATE.key,
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		promptedAt: NOW,
		tempoBpm: TEMPO,
		leadBeats: 2,
		timingOffsetMs: 0,
		reactionMs: 1600,
		correct: true,
		verdict: 'perfect',
		data: { item: LOCATE.item, answer: { midi: 43 }, confusion: null },
		observations: [],
		...overrides
	});
}

describe('introduceCard', () => {
	it('creates a New locate card due after the cold delay', () => {
		const card = introduceCard(LOCATE, NOW, 's-learn');
		expect(card.key).toBe('locate:6:G');
		expect(card.introducedAt).toBe(NOW);
		expect(card.introducedInSession).toBe('s-learn');
		expect(card.scheduling.state).toBe(State.New);
		expect(card.scheduling.due).toBe(NOW + MIN_COLD_DELAY_MS);
		expect(card.acquiredAt).toBeNull();
		expect(card.masteredAt).toBeNull();
		expect(card.learnedAt).toBeNull();
	});
});

describe('markLearned', () => {
	it('gives a learned card a first cold check after the delay', () => {
		const card = markLearned(introduceCard(LOCATE, NOW - 60_000, 's-learn'), NOW);
		expect(card.learnedAt).toBe(NOW);
		expect(card.scheduling.due).toBe(NOW + MIN_COLD_DELAY_MS);
		expect(card.scheduling.state).toBe(State.New);
	});
});

describe('probeCard', () => {
	it('returns null when the answer is wrong or not direct recall', () => {
		expect(
			probeCard(LOCATE, attempt({ correct: false, leadBeats: 2 }), NOW, 's-p', recall)
		).toBeNull();
		expect(
			probeCard(LOCATE, attempt({ correct: true, leadBeats: 4 }), NOW, 's-p', recall)
		).toBeNull();
	});

	it('creates an acquired Review card on direct-recall success', () => {
		const card = probeCard(
			LOCATE,
			attempt({ correct: true, leadBeats: 2, sessionId: 's-p' }),
			NOW,
			's-p',
			recall
		);
		expect(card).not.toBeNull();
		expect(card!.scheduling.state).toBe(State.Review);
		expect(card!.acquiredAt).toBe(NOW);
		expect(card!.learnedAt).toBe(NOW);
		expect(card!.introducedInSession).toBe('s-p');
	});

	it('creates an identify card on a name tapped within the naming threshold', () => {
		const tapped = (reactionMs: number) =>
			attempt({
				exerciseId: 'identify-neck',
				mechanic: 'identify',
				cardKey: IDENTIFY.key,
				tempoBpm: null,
				leadBeats: null,
				timingOffsetMs: null,
				data: { item: IDENTIFY.item, answer: { pitch: 'G' }, confusion: null },
				reactionMs
			});
		const card = probeCard(IDENTIFY, tapped(3000), NOW, 's-p', naming);
		expect(card?.key).toBe('identify:6:3');
		expect(card?.acquiredAt).toBe(NOW);
		expect(probeCard(IDENTIFY, tapped(3001), NOW, 's-p', naming)).toBeNull();
	});
});

describe('probeTemperature', () => {
	it('records a passed probe cold and a missed probe hot', () => {
		expect(probeTemperature(attempt({ correct: true, leadBeats: 2 }), recall)).toBe('cold');
		expect(probeTemperature(attempt({ correct: false, leadBeats: 2 }), recall)).toBe('hot');
		const named = {
			success: true,
			leadBeats: null,
			tempoBpm: null,
			verdict: { relation: 'free', version: 1, value: 'perfect' }
		} as const;
		expect(probeTemperature({ ...named, reactionMs: 3000 }, naming)).toBe('cold');
		expect(probeTemperature({ ...named, reactionMs: 3001 }, naming)).toBe('hot');
	});
});

describe('applyColdAttempt', () => {
	it('ignores hot attempts', () => {
		const state = introduceCard(LOCATE, NOW - MIN_COLD_DELAY_MS, 's0');
		const hot = attempt({ temperature: 'hot', leadBeats: 8 });
		expect(applyColdAttempt(state, hot, [hot], NOW, recall)).toEqual(state);
	});

	it('grades Hard, then Good on cold direct recall in a later session', () => {
		const introduced = NOW - MIN_COLD_DELAY_MS;
		const state = introduceCard(LOCATE, introduced, 's-learn');
		const due = { ...state, scheduling: { ...state.scheduling, due: NOW } };
		const cold = attempt({
			sessionId: 's-review',
			leadBeats: 8,
			correct: true,
			promptedAt: NOW
		});
		// lead 8 at 80 bpm is not direct recall → Hard
		const afterHard = applyColdAttempt(due, cold, [cold], NOW, recall);
		expect(afterHard.acquiredAt).toBeNull();
		expect(afterHard.scheduling.reps).toBe(1);

		const direct = attempt({
			sessionId: 's-review-2',
			leadBeats: 2,
			correct: true,
			promptedAt: NOW + 60_000
		});
		const history = [cold, direct];
		const afterGood = applyColdAttempt(afterHard, direct, history, NOW + 60_000, recall);
		expect(afterGood.acquiredAt).toBe(NOW + 60_000);
	});

	it('grades Again on a miss', () => {
		const state: CardState = {
			...introduceCard(LOCATE, NOW - MIN_COLD_DELAY_MS, 's0')
		};
		const miss = attempt({ correct: false, leadBeats: 2, verdict: 'wrong' });
		const after = applyColdAttempt(state, miss, [miss], NOW, recall);
		expect(after.scheduling.reps).toBeGreaterThanOrEqual(1);
	});

	it('grades an off-beat answer Hard and never acquires', () => {
		const state: CardState = {
			...introduceCard(LOCATE, NOW - MIN_COLD_DELAY_MS, 's0'),
			learnedAt: NOW - MIN_COLD_DELAY_MS
		};
		const offbeat = attempt({ verdict: 'offbeat', correct: true, leadBeats: 2 });
		const after = applyColdAttempt(state, offbeat, [offbeat], NOW, recall);
		const hard = applyColdAttempt(
			state,
			responseAttempt({ ...offbeat, verdict: 'late', leadBeats: 8 }),
			[],
			NOW,
			recall
		);
		expect(after.acquiredAt).toBeNull();
		expect(after.masteredAt).toBeNull();
		expect(after.scheduling).toEqual(hard.scheduling);
	});
});

describe('isAcquired / isMastered / cardStatus', () => {
	it('cardStatus walks unseen → learning → acquired → mastered', () => {
		expect(cardStatus(undefined)).toBe('unseen');
		const learning = introduceCard(LOCATE, NOW, 's0');
		expect(cardStatus(learning)).toBe('learning');
		expect(cardStatus({ ...learning, acquiredAt: NOW })).toBe('acquired');
		expect(cardStatus({ ...learning, acquiredAt: NOW, masteredAt: NOW })).toBe('mastered');
	});

	it('isAcquired is true once acquiredAt is set, or from a later-session direct recall', () => {
		const state = introduceCard(LOCATE, NOW, 's-learn');
		expect(isAcquired(state, [], recall)).toBe(false);
		const later = attempt({
			sessionId: 's-later',
			leadBeats: 2,
			correct: true,
			temperature: 'cold',
			promptedAt: NOW + MIN_COLD_DELAY_MS
		});
		expect(isAcquired(state, [later], recall)).toBe(true);
		expect(isAcquired({ ...state, acquiredAt: NOW }, [], recall)).toBe(true);
	});

	it('isMastered requires accuracy, three successful sessions, and a 72h gap', () => {
		const day = 24 * 60 * 60 * 1000;
		const sessions = ['a', 'b', 'c'] as const;
		const times = [NOW, NOW + day, NOW + 4 * day];
		const history: Attempt[] = [];
		for (let i = 0; i < 3; i++) {
			history.push(
				attempt({
					sessionId: sessions[i],
					leadBeats: 2,
					correct: true,
					temperature: 'cold',
					promptedAt: times[i]
				})
			);
		}
		expect(isMastered(history, recall)).toBe(true);

		// A missed probe is stored hot and never counts against mastery.
		const missedProbe = attempt({
			sessionId: 'probe',
			phase: 'probe',
			temperature: 'hot',
			correct: false,
			promptedAt: NOW - day
		});
		expect(isMastered([missedProbe, ...history], recall)).toBe(true);

		// 10% miss breaks accuracy (need ≥ 90 %)
		const withMiss = [
			...history,
			attempt({
				sessionId: 'd',
				leadBeats: 2,
				correct: false,
				temperature: 'cold',
				promptedAt: NOW + 5 * day
			})
		];
		// 3/4 = 0.75 < 0.9
		expect(isMastered(withMiss, recall)).toBe(false);
	});

	it('judges every attempt at its own tempo', () => {
		const gap = 72 * 60 * 60 * 1000;
		const history = (tempoBpm: number) =>
			['a', 'b', 'c'].map((sessionId, i) =>
				attempt({
					sessionId,
					leadBeats: 4,
					temperature: 'cold',
					promptedAt: NOW + i * gap,
					tempoBpm
				})
			);
		expect(isMastered(history(160), recall)).toBe(true);
		expect(isMastered(history(80), recall)).toBe(false);
	});
});

describe('cardLeadAfter', () => {
	it('moves the stored lead apart, as before', () => {
		const locate = introduceCard(LOCATE, NOW, 's-learn');
		const identify = introduceCard(IDENTIFY, NOW, 's-learn');
		expect(cardLeadAfter(locate, beatTiming, 'introduced')).toBe(8);
		expect(cardLeadAfter(identify, identifyTiming, 'introduced')).toBe(2);

		expect(cardLeadAfter(locate, beatTiming, { learned: 80 })).toBe(2);
		expect(cardLeadAfter(locate, beatTiming, { learned: 160 })).toBe(4);
		expect(cardLeadAfter(identify, identifyTiming, { learned: null })).toBe(2);

		expect(cardLeadAfter(locate, beatTiming, { probe: attempt({ leadBeats: 4 }) })).toBe(4);
		expect(cardLeadAfter(locate, beatTiming, { probe: attempt({ leadBeats: 1 }) })).toBe(2);
		expect(cardLeadAfter(identify, identifyTiming, { probe: attempt({ leadBeats: null }) })).toBe(
			2
		);

		const at = (leadBeats: 8 | 4 | 2): CardState => ({ ...locate, leadBeats });
		const success = attempt({ correct: true, leadBeats: 8 });
		const miss = attempt({ correct: false, verdict: 'wrong' });
		const offbeat = attempt({ correct: true, verdict: 'offbeat' });
		const hot = attempt({ temperature: 'hot', correct: false, verdict: 'wrong' });
		expect(cardLeadAfter(at(8), beatTiming, { cold: success })).toBe(4);
		expect(cardLeadAfter(at(4), beatTiming, { cold: success })).toBe(2);
		expect(cardLeadAfter(at(2), beatTiming, { cold: miss })).toBe(4);
		expect(cardLeadAfter(at(2), beatTiming, { cold: offbeat })).toBe(4);
		expect(cardLeadAfter(at(2), beatTiming, { cold: hot })).toBe(2);
	});
});
