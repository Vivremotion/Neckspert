import { describe, expect, it } from 'vitest';
import {
	cardKey,
	type Attempt,
	type CardState,
	type PlannedItem,
	type Target
} from '$lib/domain/types';
import { practiceTargets } from '$lib/domain/music';
import { introduceCard, markLearned } from './cards';
import { LEARN_COLD_CAP, LEARN_SESSION_MS } from './constants';
import { introductionOrder } from './introduction';
import { createLearnSelector } from './learnSelector';
import type { SessionSelector } from './selector';

const NOW = Date.parse('2026-10-02T10:00:00.000Z');
const TEMPO = 80;
const ORDER = introductionOrder();
const FAR = NOW + 30 * 24 * 60 * 60 * 1000;

function learning(target: Target): CardState {
	return introduceCard(target, NOW - 2 * 60 * 60 * 1000, 's-old');
}

function learned(target: Target, overrides: Partial<CardState> = {}): CardState {
	const card = markLearned(learning(target), NOW - 60 * 60 * 1000, TEMPO);
	return {
		...card,
		...overrides,
		scheduling: { ...card.scheduling, due: FAR, ...overrides.scheduling }
	};
}

function due(card: CardState): CardState {
	return { ...card, scheduling: { ...card.scheduling, due: NOW - 1000 } };
}

function select(cards: CardState[], attempts: Attempt[] = []): SessionSelector {
	return createLearnSelector({ cards, attempts, sessionId: 's-now', tempoBpm: TEMPO });
}

function next(selector: SessionSelector, fatigued = false): PlannedItem | null {
	return selector.next({ now: NOW, elapsedMs: 0, fatigued });
}

function answer(item: PlannedItem, overrides: Partial<Attempt> = {}): Attempt {
	return {
		sessionId: 's-now',
		cardKey: cardKey(item.target),
		target: item.target,
		phase: item.phase,
		temperature: item.temperature,
		aid: item.aid,
		leadBeats: item.leadBeats,
		promptedAt: NOW,
		answer: null,
		correct: true,
		verdict: 'perfect',
		timingOffsetMs: 0,
		reactionMs: 1000,
		confusion: null,
		...overrides
	};
}

/** Plays `count` prompts, answering each correctly, and returns their keys. */
function play(
	selector: SessionSelector,
	count: number,
	overrides: Partial<Attempt> = {}
): string[] {
	const keys: string[] = [];
	for (let i = 0; i < count; i++) {
		const item = next(selector);
		if (!item) break;
		keys.push(cardKey(item.target));
		selector.record(answer(item, overrides), NOW);
	}
	return keys;
}

/** Ten learned, not acquired, not due cards: no new note may enter. */
const FILLERS = ORDER.slice(1, 11).map((target) => learned(target));
const G = ORDER[0];
const GK = cardKey(G);

describe('createLearnSelector', () => {
	it('ends after five minutes', () => {
		const selector = select([]);
		expect(selector.next({ now: NOW, elapsedMs: LEARN_SESSION_MS, fatigued: false })).toBeNull();
	});

	it('presents the first new note with its position and a long lead', () => {
		expect(next(select([]))).toEqual({
			target: G,
			phase: 'learning',
			temperature: 'hot',
			aid: 'show-position',
			leadBeats: 8
		});
	});

	it('fills three learning slots, then brings the first note back instead of a fourth', () => {
		const selector = select([]);
		const keys = [next(selector), next(selector), next(selector), next(selector)].map((item) =>
			cardKey(item!.target)
		);
		expect(keys).toEqual([GK, cardKey(ORDER[1]), cardKey(ORDER[2]), GK]);
	});

	it('retests a note unaided after 2 prompts, then after 4, and marks it learned', () => {
		const selector = select([learning(G), ...FILLERS]);
		const presentation = next(selector)!;
		expect(cardKey(presentation.target)).toBe(GK);
		expect(selector.record(answer(presentation), NOW)).toBeNull();

		expect(play(selector, 2)).not.toContain(GK);
		const first = next(selector)!;
		expect(first).toMatchObject({ target: G, aid: 'none', leadBeats: 2, phase: 'learning' });
		expect(selector.record(answer(first), NOW)).toBeNull();

		expect(play(selector, 4)).not.toContain(GK);
		const second = next(selector)!;
		expect(cardKey(second.target)).toBe(GK);
		const outcome = selector.record(answer(second), NOW);
		expect(outcome?.learned.learnedAt).toBe(NOW);
		expect(outcome?.learned.leadBeats).toBe(2);
	});

	it('treats a right but slow answer as an error and shows the position again', () => {
		const selector = select([learning(G), ...FILLERS]);
		selector.record(answer(next(selector)!), NOW);
		play(selector, 2);
		const retest = next(selector)!;
		selector.record(answer(retest, { leadBeats: 4 }), NOW);
		play(selector, 2);
		expect(next(selector)).toMatchObject({ target: G, aid: 'show-position', leadBeats: 8 });
	});

	it('does not count an aided success toward learning', () => {
		const selector = select([learning(G), ...FILLERS]);
		selector.record(answer(next(selector)!), NOW);
		play(selector, 2);
		selector.record(answer(next(selector)!, { correct: false, verdict: 'wrong' }), NOW);
		play(selector, 2);
		const aided = next(selector)!;
		expect(aided.aid).toBe('show-position');
		expect(selector.record(answer(aided), NOW)).toBeNull();
		play(selector, 2);
		expect(selector.record(answer(next(selector)!), NOW)).toBeNull();
		play(selector, 4);
		expect(selector.record(answer(next(selector)!), NOW)?.learned.key).toBe(GK);
	});

	it('puts a review before resuming a note', () => {
		const selector = select([learning(G), due(learned(ORDER[1]))]);
		expect(next(selector)).toMatchObject({ target: ORDER[1], phase: 'review' });
		expect(next(selector)).toMatchObject({ target: G, phase: 'learning', aid: 'show-position' });
	});

	it('puts a due retest before a review that became due', () => {
		// High stability keeps it out of consolidation, which would make it hot for the session.
		const later = learned(ORDER[11], {
			scheduling: {
				...learned(ORDER[11]).scheduling,
				due: NOW + 60 * 60 * 1000,
				stability: 1000
			}
		});
		const selector = select([learning(G), later, ...FILLERS]);
		selector.record(answer(next(selector)!), NOW);
		play(selector, 2);
		const twoHoursLater = { now: NOW + 2 * 60 * 60 * 1000, elapsedMs: 0, fatigued: false };
		const retest = selector.next(twoHoursLater)!;
		expect(retest).toMatchObject({ target: G, phase: 'learning' });
		selector.record(answer(retest), twoHoursLater.now);
		expect(selector.next(twoHoursLater)).toMatchObject({ target: ORDER[11], phase: 'review' });
	});

	it('serves reviews cold, at the card lead, at most twenty per session', () => {
		const cards = ORDER.slice(0, 25).map((target) => due(learned(target)));
		const selector = select(cards);
		const first = next(selector)!;
		expect(first).toMatchObject({
			phase: 'review',
			temperature: 'cold',
			aid: 'none',
			leadBeats: 2
		});
		const phases = [first.phase];
		for (let i = 1; i < LEARN_COLD_CAP + 1; i++) phases.push(next(selector)!.phase);
		expect(phases.filter((phase) => phase === 'review')).toHaveLength(LEARN_COLD_CAP);
		expect(phases[LEARN_COLD_CAP]).not.toBe('review');
	});

	it('does not review a due card played in free play ten minutes ago', () => {
		const card = due(learned(ORDER[5]));
		const recent = answer(
			{ target: card.target, phase: 'free', temperature: 'hot', aid: 'none', leadBeats: 2 },
			{ promptedAt: NOW - 10 * 60 * 1000 }
		);
		expect(next(select([card], [recent]))?.phase).not.toBe('review');
	});

	it('never reviews a card that is still being learned', () => {
		expect(next(select([due(learning(G))]))?.phase).toBe('learning');
	});

	it('resumes a note being learned before introducing a new one', () => {
		const selector = select([learning(ORDER[4])]);
		expect(next(selector)?.target).toEqual(ORDER[4]);
		expect(next(selector)?.target).toEqual(G);
	});

	it('stops introducing notes at ten learned but not acquired', () => {
		expect(next(select(FILLERS))?.phase).toBe('consolidation');
		expect(next(select(FILLERS.slice(1)))).toMatchObject({ target: G, phase: 'learning' });
	});

	it('introduces the identify position once its locate card is acquired', () => {
		const acquired = learned(G, { acquiredAt: NOW - 1000 });
		expect(next(select([acquired]))).toMatchObject({
			target: { direction: 'identify', string: 6, fret: 3 },
			phase: 'learning',
			aid: 'show-position',
			leadBeats: null
		});
	});

	it('only retests notes already presented once fatigue shows', () => {
		const selector = select([learning(G), learned(ORDER[1])]);
		expect(play(selector, 1)).toEqual([GK]);
		const reviewDue = { now: FAR + 1000, elapsedMs: 0, fatigued: true };
		expect(selector.next(reviewDue)).toMatchObject({ target: G, phase: 'learning' });
		expect(next(select([due(learned(ORDER[1]))]), true)).toBeNull();
	});

	it('serves a retest early when nothing else is available', () => {
		const selector = select([learning(G), learning(ORDER[1]), learning(ORDER[2])]);
		const [a, b, c] = [ORDER[2], ORDER[1], G].map((target) => cardKey(target));
		expect(play(selector, 7)).toEqual([a, b, c, a, b, c, a]);
	});

	it('consolidates recently confused notes first and again, then the least stable', () => {
		const [t, q, s, p] = ORDER.slice(1, 5);
		const stable = (target: Target, stability: number) =>
			learned(target, { scheduling: { ...learned(target).scheduling, stability } });
		const cards = [
			stable(t, 9),
			stable(q, 1),
			stable(s, 3),
			stable(p, 5),
			...ORDER.slice(5, 11).map((target) => stable(target, 100))
		];
		const confused = answer(
			{ target: t, phase: 'review', temperature: 'cold', aid: 'none', leadBeats: 2 },
			{ promptedAt: NOW - 5 * 60 * 60 * 1000, correct: false, confusion: { kind: 'octave' } }
		);
		const keys = play(select(cards, [confused]), 4);
		// t stays confused until three clean attempts push the confusion out of the lookback.
		expect(keys).toEqual([cardKey(t), cardKey(q), cardKey(s), cardKey(t)]);
		expect(play(select(cards), 4)).toEqual([cardKey(q), cardKey(s), cardKey(p), cardKey(q)]);
	});

	it('keeps consolidating when the whole neck is known', () => {
		const cards = practiceTargets().map((target) => learned(target, { acquiredAt: NOW - 1000 }));
		expect(next(select(cards))).toMatchObject({ phase: 'consolidation', temperature: 'hot' });
	});
});
