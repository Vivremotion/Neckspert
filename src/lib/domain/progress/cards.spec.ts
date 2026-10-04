import { describe, expect, it } from 'vitest';
import {
	cardKey,
	type Attempt,
	type CardState,
	type IdentifyTarget,
	type LocateTarget
} from '$lib/domain/types';
import { State } from 'ts-fsrs';
import { MIN_COLD_DELAY_MS } from './constants';
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
const LOCATE: LocateTarget = { direction: 'locate', string: 6, pitch: 'G' };
const IDENTIFY: IdentifyTarget = { direction: 'identify', string: 6, fret: 3 };

function attempt(overrides: Partial<Attempt>): Attempt {
	return {
		sessionId: 's-review',
		cardKey: cardKey(LOCATE),
		target: LOCATE,
		phase: 'review',
		temperature: 'cold',
		aid: 'none',
		leadBeats: 2,
		promptedAt: NOW,
		answer: { kind: 'note', midi: 43 },
		correct: true,
		verdict: 'perfect',
		timingOffsetMs: 0,
		reactionMs: 1600,
		confusion: null,
		...overrides
	};
}

describe('introduceCard', () => {
	it('creates a New locate card due after the cold delay with lead 8', () => {
		const card = introduceCard(LOCATE, NOW, 's-learn');
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
		expect(introduceCard(IDENTIFY, NOW, 's-learn').leadBeats).toBe(2);
	});
});

describe('markLearned', () => {
	it('gives a learned locate card the direct-recall lead and a first cold check after the delay', () => {
		const card = markLearned(introduceCard(LOCATE, NOW - 60_000, 's-learn'), NOW, TEMPO);
		expect(card.learnedAt).toBe(NOW);
		expect(card.leadBeats).toBe(2);
		expect(card.scheduling.due).toBe(NOW + MIN_COLD_DELAY_MS);
		expect(card.scheduling.state).toBe(State.New);
	});

	it('keeps identify cards on the shortest lead', () => {
		expect(markLearned(introduceCard(IDENTIFY, NOW, 's-learn'), NOW, TEMPO).leadBeats).toBe(2);
	});
});

describe('probeCard', () => {
	it('returns null when the answer is wrong or not direct recall', () => {
		expect(probeCard(LOCATE, attempt({ correct: false, leadBeats: 2 }), NOW, 's-p', 80)).toBeNull();
		expect(probeCard(LOCATE, attempt({ correct: true, leadBeats: 4 }), NOW, 's-p', 80)).toBeNull();
	});

	it('creates an acquired Review card on direct-recall success', () => {
		const card = probeCard(
			LOCATE,
			attempt({ correct: true, leadBeats: 2, sessionId: 's-p' }),
			NOW,
			's-p',
			80
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
				cardKey: cardKey(IDENTIFY),
				target: IDENTIFY,
				leadBeats: null,
				answer: { kind: 'name', pitch: 'G' },
				reactionMs
			});
		const card = probeCard(IDENTIFY, tapped(3000), NOW, 's-p', 80);
		expect(card?.key).toBe('identify:6:3');
		expect(card?.leadBeats).toBe(2);
		expect(card?.acquiredAt).toBe(NOW);
		expect(probeCard(IDENTIFY, tapped(3001), NOW, 's-p', 80)).toBeNull();
	});
});

describe('probeTemperature', () => {
	it('records a passed probe cold and a missed probe hot', () => {
		expect(probeTemperature(attempt({ correct: true, leadBeats: 2 }), 80)).toBe('cold');
		expect(probeTemperature(attempt({ correct: false, leadBeats: 2 }), 80)).toBe('hot');
		expect(probeTemperature({ correct: true, leadBeats: null, reactionMs: 3000 }, 80)).toBe('cold');
		expect(probeTemperature({ correct: true, leadBeats: null, reactionMs: 3001 }, 80)).toBe('hot');
	});
});

describe('applyColdAttempt', () => {
	it('ignores hot attempts', () => {
		const state = introduceCard(LOCATE, NOW - MIN_COLD_DELAY_MS, 's0');
		const hot = attempt({ temperature: 'hot', leadBeats: 8 });
		expect(applyColdAttempt(state, hot, [hot], NOW, TEMPO)).toEqual(state);
	});

	it('shortens lead and grades Good on cold direct recall in a later session', () => {
		const introduced = NOW - MIN_COLD_DELAY_MS;
		const state = introduceCard(LOCATE, introduced, 's-learn');
		const due = { ...state, scheduling: { ...state.scheduling, due: NOW } };
		const cold = attempt({
			sessionId: 's-review',
			leadBeats: 8,
			correct: true,
			promptedAt: NOW
		});
		// lead 8 at 80 bpm is not direct recall → Hard, but still shortens lead
		const afterHard = applyColdAttempt(due, cold, [cold], NOW, TEMPO);
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
		const afterGood = applyColdAttempt(afterHard, direct, history, NOW + 60_000, TEMPO);
		expect(afterGood.leadBeats).toBe(2);
		expect(afterGood.acquiredAt).toBe(NOW + 60_000);
	});

	it('lengthens lead and grades Again on a miss', () => {
		const state: CardState = {
			...introduceCard(LOCATE, NOW - MIN_COLD_DELAY_MS, 's0'),
			leadBeats: 2
		};
		const miss = attempt({ correct: false, leadBeats: 2, verdict: 'wrong' });
		const after = applyColdAttempt(state, miss, [miss], NOW, TEMPO);
		expect(after.leadBeats).toBe(4);
		expect(after.scheduling.reps).toBeGreaterThanOrEqual(1);
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
		expect(isAcquired(state, [], TEMPO)).toBe(false);
		const later = attempt({
			sessionId: 's-later',
			leadBeats: 2,
			correct: true,
			temperature: 'cold',
			promptedAt: NOW + MIN_COLD_DELAY_MS
		});
		expect(isAcquired(state, [later], TEMPO)).toBe(true);
		expect(isAcquired({ ...state, acquiredAt: NOW }, [], TEMPO)).toBe(true);
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
		expect(isMastered(history, TEMPO)).toBe(true);

		// A missed probe is stored hot and never counts against mastery.
		const missedProbe = attempt({
			sessionId: 'probe',
			phase: 'probe',
			temperature: 'hot',
			correct: false,
			promptedAt: NOW - day
		});
		expect(isMastered([missedProbe, ...history], TEMPO)).toBe(true);

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
		expect(isMastered(withMiss, TEMPO)).toBe(false);
	});
});
