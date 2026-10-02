import { describe, expect, it } from 'vitest';
import {
	cardKey,
	type Attempt,
	type CardState,
	type PlannedItem,
	type Target
} from '$lib/domain/types';
import { practiceTargets } from '$lib/domain/music';
import { introduceCard, markLearned, probeCard } from './cards';
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

	it('serves_a_new_note_as_an_unaided_probe', () => {
		expect(next(select([]))).toEqual({
			target: G,
			phase: 'probe',
			temperature: 'cold',
			aid: 'none',
			leadBeats: 2
		});
	});

	it('passed_probe_goes_to_review_and_frees_its_slot', () => {
		const selector = select([]);
		const probe = next(selector)!;
		const outcome = selector.record(answer(probe), NOW);
		expect(outcome?.card).toMatchObject({ key: GK, learnedAt: NOW, acquiredAt: NOW });
		expect(outcome?.card.scheduling.state).toBe(2);
		for (let i = 0; i < 4; i++) {
			const item = next(selector)!;
			expect(item.phase).toBe('probe');
			selector.record(answer(item), NOW);
		}
	});

	it('missed_probe_brings_the_aid_on_the_next_prompt', () => {
		const selector = select([]);
		const probe = next(selector)!;
		const outcome = selector.record(answer(probe, { correct: false, verdict: 'wrong' }), NOW);
		expect(outcome?.card).toMatchObject({ key: GK, learnedAt: null, acquiredAt: null });
		expect(next(selector)).toEqual({
			target: G,
			phase: 'learning',
			temperature: 'hot',
			aid: 'show-position',
			leadBeats: 8
		});
	});

	it('no_answer_counts_as_a_missed_probe', () => {
		const selector = select([]);
		const probe = next(selector)!;
		const silent = { answer: null, correct: false, verdict: 'wrong', reactionMs: null } as const;
		expect(selector.record(answer(probe, silent), NOW)?.card.learnedAt).toBeNull();
		expect(next(selector)).toMatchObject({ target: G, phase: 'learning', aid: 'show-position' });
	});

	it('probes_identify_right_after_a_passed_locate_probe', () => {
		const selector = select([]);
		selector.record(answer(next(selector)!), NOW);
		expect(next(selector)).toEqual({
			target: { direction: 'identify', string: 6, fret: 3 },
			phase: 'probe',
			temperature: 'cold',
			aid: 'none',
			leadBeats: null
		});
	});

	it('slow_identify_probe_is_missed', () => {
		const selector = select([]);
		selector.record(answer(next(selector)!), NOW);
		const probe = next(selector)!;
		const slow = answer(probe, { leadBeats: null, reactionMs: 3001 });
		expect(selector.record(slow, NOW)?.card.learnedAt).toBeNull();
		expect(next(selector)).toMatchObject({
			target: probe.target,
			phase: 'learning',
			aid: 'show-position',
			leadBeats: null
		});
	});

	it('resumes_a_missed_probe_with_the_aid', () => {
		const first = select([]);
		const probe = next(first)!;
		const missed = first.record(answer(probe, { correct: false, verdict: 'wrong' }), NOW)!.card;
		expect(next(select([missed]))).toMatchObject({
			target: G,
			phase: 'learning',
			aid: 'show-position',
			leadBeats: 8
		});
	});

	it('passed_probes_do_not_count_as_unconsolidated', () => {
		const known = ORDER.slice(1, 11).map((target) =>
			probeCard(
				target,
				answer({ target, phase: 'probe', temperature: 'cold', aid: 'none', leadBeats: 2 }),
				NOW - 1000,
				's-old',
				TEMPO
			)!
		);
		expect(next(select(known))).toMatchObject({ phase: 'probe' });
	});

	it('probes an abandoned probe again instead of holding its slot', () => {
		const selector = select([]);
		expect(next(selector)).toMatchObject({ target: G, phase: 'probe' });
		// Paused before answering: nothing is recorded, the next prompt is asked for.
		expect(next(selector)).toMatchObject({ target: G, phase: 'probe' });
	});

	it('fatigue_serves_no_probe', () => {
		expect(next(select([]), true)).toBeNull();
	});

	it('brings the aid right after a missed probe even when another retest is due', () => {
		const selector = select([]);
		const keys = play(selector, 7, { correct: false, verdict: 'wrong' });
		expect(keys).toEqual([
			GK,
			GK,
			cardKey(ORDER[1]),
			cardKey(ORDER[1]),
			GK,
			cardKey(ORDER[2]),
			cardKey(ORDER[2])
		]);
	});

	it('halves the lead after each success, 8 to 4 to 2, and needs two successes at 2', () => {
		const selector = select([learning(G), ...FILLERS]);
		const presentation = next(selector)!;
		expect(presentation).toMatchObject({ target: G, aid: 'show-position', leadBeats: 8 });
		expect(selector.record(answer(presentation), NOW)).toBeNull();

		expect(play(selector, 2)).not.toContain(GK);
		const four = next(selector)!;
		expect(four).toMatchObject({ target: G, aid: 'none', leadBeats: 4, phase: 'learning' });
		expect(selector.record(answer(four), NOW)).toBeNull();

		expect(play(selector, 4)).not.toContain(GK);
		const two = next(selector)!;
		expect(two).toMatchObject({ target: G, aid: 'none', leadBeats: 2 });
		expect(selector.record(answer(two), NOW)).toBeNull();

		expect(play(selector, 4)).not.toContain(GK);
		const again = next(selector)!;
		expect(again).toMatchObject({ target: G, leadBeats: 2 });
		const outcome = selector.record(answer(again), NOW);
		expect(outcome?.card.learnedAt).toBe(NOW);
		expect(outcome?.card.leadBeats).toBe(2);
	});

	it('doubles the lead after a miss, up to 8, where the position shows again', () => {
		const selector = select([learning(G), ...FILLERS]);
		selector.record(answer(next(selector)!), NOW);
		play(selector, 2);
		const four = next(selector)!;
		selector.record(answer(four, { correct: false, verdict: 'wrong' }), NOW);
		play(selector, 2);
		expect(next(selector)).toMatchObject({ target: G, aid: 'show-position', leadBeats: 8 });
	});

	it('steps back from 2 to 4 after a miss and starts the successes at 2 over', () => {
		const selector = select([learning(G), ...FILLERS]);
		selector.record(answer(next(selector)!), NOW);
		play(selector, 2);
		selector.record(answer(next(selector)!), NOW);
		play(selector, 4);
		selector.record(answer(next(selector)!), NOW);
		play(selector, 4);
		const miss = next(selector)!;
		expect(miss.leadBeats).toBe(2);
		selector.record(answer(miss, { correct: false, verdict: 'wrong' }), NOW);
		play(selector, 2);
		const back = next(selector)!;
		expect(back).toMatchObject({ target: G, aid: 'none', leadBeats: 4 });
		selector.record(answer(back), NOW);
		play(selector, 4);
		const first = next(selector)!;
		expect(first.leadBeats).toBe(2);
		expect(selector.record(answer(first), NOW)).toBeNull();
	});

	it('teaches an identify note with its name shown, then two quick unaided answers', () => {
		const I = { direction: 'identify', string: 6, fret: 3 } as const;
		const selector = select([learning(I), ...FILLERS]);
		const shown = next(selector)!;
		expect(shown).toMatchObject({ target: I, aid: 'show-position', leadBeats: null });
		selector.record(answer(shown), NOW);
		play(selector, 2);
		const slow = next(selector)!;
		expect(slow).toMatchObject({ target: I, aid: 'none', leadBeats: null });
		selector.record(answer(slow, { reactionMs: 4000 }), NOW);
		play(selector, 2);
		expect(next(selector)).toMatchObject({ target: I, aid: 'show-position' });
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
		expect(next(select(FILLERS.slice(1)))).toMatchObject({ target: G, phase: 'probe' });
	});

	it('introduces the identify position once its locate card is acquired', () => {
		const acquired = learned(G, { acquiredAt: NOW - 1000 });
		expect(next(select([acquired]))).toMatchObject({
			target: { direction: 'identify', string: 6, fret: 3 },
			phase: 'probe',
			aid: 'none',
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
		expect(play(select(cards), 4)).toEqual([cardKey(q), cardKey(s), cardKey(p), cardKey(t)]);
	});

	it('rotates consolidation through the learned notes instead of looping on three', () => {
		const keys = play(select(FILLERS), 10);
		expect(new Set(keys).size).toBe(10);
	});

	it('lets a new note in once reviews acquire the waiting cards', () => {
		const selector = select(FILLERS.map(due));
		const reviewed = play(selector, 10);
		expect(new Set(reviewed).size).toBe(10);
		for (const card of FILLERS) selector.cardChanged({ ...card, acquiredAt: NOW });
		// Their identify positions are now candidates and come before the next locate note.
		expect(next(selector)).toMatchObject({
			target: { direction: 'identify', string: 5, fret: 3 },
			phase: 'probe',
			aid: 'none'
		});
	});

	it('keeps consolidating when the whole neck is known', () => {
		const cards = practiceTargets().map((target) => learned(target, { acquiredAt: NOW - 1000 }));
		expect(next(select(cards))).toMatchObject({ phase: 'consolidation', temperature: 'hot' });
	});
});
