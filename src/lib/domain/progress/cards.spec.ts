import { describe, expect, it } from 'vitest';
import { responseAttempt, type AttemptOverrides } from '$lib/testing/attempts';
import type { Attempt, CardState } from '$lib/domain/types';
import { State } from 'ts-fsrs';
import { MIN_COLD_DELAY_MS } from './constants';
import { beatTiming, identifyTiming } from '$lib/domain/timing';
import {
	applyColdAttempt,
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
	it('creates a New locate card due after the cold delay with lead 8', () => {
		const card = introduceCard(LOCATE, NOW, 's-learn', beatTiming);
		expect(card.key).toBe('locate:6:G');
		expect(card.introducedAt).toBe(NOW);
		expect(card.introducedInSession).toBe('s-learn');
		expect(card.leadBeats).toBe(8);
		expect(card.scheduling.state).toBe(State.New);
		expect(card.scheduling.due).toBe(NOW + MIN_COLD_DELAY_MS);
		expect(card.acquiredAt).toBeNull();
		expect(card.masteredAt).toBeNull();
		expect(card.learnedAt).toBeNull();
	});

	it('creates identify cards on the shortest lead', () => {
		expect(introduceCard(IDENTIFY, NOW, 's-learn', identifyTiming).leadBeats).toBe(2);
	});
});

describe('markLearned', () => {
	it('gives a learned locate card the direct-recall lead and a first cold check after the delay', () => {
		const card = markLearned(
			introduceCard(LOCATE, NOW - 60_000, 's-learn', beatTiming),
			NOW,
			beatTiming,
			TEMPO
		);
		expect(card.learnedAt).toBe(NOW);
		expect(card.leadBeats).toBe(2);
		expect(card.scheduling.due).toBe(NOW + MIN_COLD_DELAY_MS);
		expect(card.scheduling.state).toBe(State.New);
	});

	it('keeps identify cards on the shortest lead', () => {
		const card = introduceCard(IDENTIFY, NOW, 's-learn', identifyTiming);
		expect(markLearned(card, NOW, identifyTiming, null).leadBeats).toBe(2);
	});
});

describe('probeCard', () => {
	it('returns null when the answer is wrong or not direct recall', () => {
		expect(
			probeCard(LOCATE, attempt({ correct: false, leadBeats: 2 }), NOW, 's-p', beatTiming)
		).toBeNull();
		expect(
			probeCard(LOCATE, attempt({ correct: true, leadBeats: 4 }), NOW, 's-p', beatTiming)
		).toBeNull();
	});

	it('creates an acquired Review card on direct-recall success', () => {
		const card = probeCard(
			LOCATE,
			attempt({ correct: true, leadBeats: 2, sessionId: 's-p' }),
			NOW,
			's-p',
			beatTiming
		);
		expect(card).not.toBeNull();
		expect(card!.scheduling.state).toBe(State.Review);
		expect(card!.acquiredAt).toBe(NOW);
		expect(card!.learnedAt).toBe(NOW);
		expect(card!.introducedInSession).toBe('s-p');
		expect(card!.leadBeats).toBe(2);
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
		const card = probeCard(IDENTIFY, tapped(3000), NOW, 's-p', identifyTiming);
		expect(card?.key).toBe('identify:6:3');
		expect(card?.leadBeats).toBe(2);
		expect(card?.acquiredAt).toBe(NOW);
		expect(probeCard(IDENTIFY, tapped(3001), NOW, 's-p', identifyTiming)).toBeNull();
	});
});

describe('probeTemperature', () => {
	it('records a passed probe cold and a missed probe hot', () => {
		expect(probeTemperature(attempt({ correct: true, leadBeats: 2 }), beatTiming)).toBe('cold');
		expect(probeTemperature(attempt({ correct: false, leadBeats: 2 }), beatTiming)).toBe('hot');
		const named = { success: true, leadBeats: null, tempoBpm: null } as const;
		expect(probeTemperature({ ...named, reactionMs: 3000 }, identifyTiming)).toBe('cold');
		expect(probeTemperature({ ...named, reactionMs: 3001 }, identifyTiming)).toBe('hot');
	});
});

describe('applyColdAttempt', () => {
	it('ignores hot attempts', () => {
		const state = introduceCard(LOCATE, NOW - MIN_COLD_DELAY_MS, 's0', beatTiming);
		const hot = attempt({ temperature: 'hot', leadBeats: 8 });
		expect(applyColdAttempt(state, hot, [hot], NOW, beatTiming)).toEqual(state);
	});

	it('shortens lead and grades Good on cold direct recall in a later session', () => {
		const introduced = NOW - MIN_COLD_DELAY_MS;
		const state = introduceCard(LOCATE, introduced, 's-learn', beatTiming);
		const due = { ...state, scheduling: { ...state.scheduling, due: NOW } };
		const cold = attempt({
			sessionId: 's-review',
			leadBeats: 8,
			correct: true,
			promptedAt: NOW
		});
		// lead 8 at 80 bpm is not direct recall → Hard, but still shortens lead
		const afterHard = applyColdAttempt(due, cold, [cold], NOW, beatTiming);
		expect(afterHard.leadBeats).toBe(4);
		expect(afterHard.acquiredAt).toBeNull();
		expect(afterHard.scheduling.reps).toBe(1);

		const direct = attempt({
			sessionId: 's-review-2',
			leadBeats: 2,
			correct: true,
			promptedAt: NOW + 60_000
		});
		const history = [cold, direct];
		const afterGood = applyColdAttempt(afterHard, direct, history, NOW + 60_000, beatTiming);
		expect(afterGood.leadBeats).toBe(2);
		expect(afterGood.acquiredAt).toBe(NOW + 60_000);
	});

	it('lengthens lead and grades Again on a miss', () => {
		const state: CardState = {
			...introduceCard(LOCATE, NOW - MIN_COLD_DELAY_MS, 's0', beatTiming),
			leadBeats: 2
		};
		const miss = attempt({ correct: false, leadBeats: 2, verdict: 'wrong' });
		const after = applyColdAttempt(state, miss, [miss], NOW, beatTiming);
		expect(after.leadBeats).toBe(4);
		expect(after.scheduling.reps).toBeGreaterThanOrEqual(1);
	});

	it('grades an off-beat answer Hard, lengthens the lead and never acquires', () => {
		const state: CardState = {
			...introduceCard(LOCATE, NOW - MIN_COLD_DELAY_MS, 's0', beatTiming),
			leadBeats: 2,
			learnedAt: NOW - MIN_COLD_DELAY_MS
		};
		const offbeat = attempt({ verdict: 'offbeat', correct: true, leadBeats: 2 });
		const after = applyColdAttempt(state, offbeat, [offbeat], NOW, beatTiming);
		const hard = applyColdAttempt(
			state,
			responseAttempt({ ...offbeat, verdict: 'late', leadBeats: 8 }),
			[],
			NOW,
			beatTiming
		);
		expect(after.leadBeats).toBe(4);
		expect(after.acquiredAt).toBeNull();
		expect(after.masteredAt).toBeNull();
		expect(after.scheduling).toEqual(hard.scheduling);
	});
});

describe('isAcquired / isMastered / cardStatus', () => {
	it('cardStatus walks unseen → learning → acquired → mastered', () => {
		expect(cardStatus(undefined)).toBe('unseen');
		const learning = introduceCard(LOCATE, NOW, 's0', beatTiming);
		expect(cardStatus(learning)).toBe('learning');
		expect(cardStatus({ ...learning, acquiredAt: NOW })).toBe('acquired');
		expect(cardStatus({ ...learning, acquiredAt: NOW, masteredAt: NOW })).toBe('mastered');
	});

	it('isAcquired is true once acquiredAt is set, or from a later-session direct recall', () => {
		const state = introduceCard(LOCATE, NOW, 's-learn', beatTiming);
		expect(isAcquired(state, [], beatTiming)).toBe(false);
		const later = attempt({
			sessionId: 's-later',
			leadBeats: 2,
			correct: true,
			temperature: 'cold',
			promptedAt: NOW + MIN_COLD_DELAY_MS
		});
		expect(isAcquired(state, [later], beatTiming)).toBe(true);
		expect(isAcquired({ ...state, acquiredAt: NOW }, [], beatTiming)).toBe(true);
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
		expect(isMastered(history, beatTiming)).toBe(true);

		// A missed probe is stored hot and never counts against mastery.
		const missedProbe = attempt({
			sessionId: 'probe',
			phase: 'probe',
			temperature: 'hot',
			correct: false,
			promptedAt: NOW - day
		});
		expect(isMastered([missedProbe, ...history], beatTiming)).toBe(true);

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
		expect(isMastered(withMiss, beatTiming)).toBe(false);
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
		expect(isMastered(history(160), beatTiming)).toBe(true);
		expect(isMastered(history(80), beatTiming)).toBe(false);
	});
});
