import { describe, expect, it } from 'vitest';
import { responseAttempt, type AttemptOverrides } from '$lib/testing/attempts';
import type { Attempt, CardState, PlannedItem } from '$lib/domain/types';
import {
	asNeckCard,
	neckCardKey,
	practiceCards,
	type LocateItem,
	type NeckCard
} from '$lib/domain/music';
import { beatTiming } from '$lib/domain/timing';
import { introduceCard, markLearned, probeCard } from './cards';
import {
	LEARN_COLD_CAP,
	LEARN_SESSION_MS,
	MAX_WORKING_SET,
	STRING_AID_FADE_SUCCESSES
} from './constants';
import { introductionOrder } from './introduction';
import { createLearnSelector } from './learnSelector';
import { keyed, neckExerciseId } from './neck';
import type { SessionSelector } from './selector';

const NOW = Date.parse('2026-10-02T10:00:00.000Z');
const TEMPO = 80;
const locate = (item: LocateItem): NeckCard => ({ mechanic: 'locate', item });
const ORDER = introductionOrder().map(locate);
const FAR = NOW + 30 * 24 * 60 * 60 * 1000;

/** Key of a card, or of the card a prompt serves. */
function keyOf(x: { mechanic: string; item: unknown }): string {
	return neckCardKey(asNeckCard(x));
}

function learning(target: NeckCard): CardState {
	return introduceCard(keyed(target), NOW - 2 * 60 * 60 * 1000, 's-old');
}

function learned(target: NeckCard, overrides: Partial<CardState> = {}): CardState {
	const card = markLearned(learning(target), NOW - 60 * 60 * 1000);
	return {
		...card,
		...overrides,
		scheduling: { ...card.scheduling, due: FAR, ...overrides.scheduling }
	};
}

function due(card: CardState): CardState {
	return { ...card, scheduling: { ...card.scheduling, due: NOW - 1000 } };
}

/** Sequences off: these tests pin the category order and the ladder on their own. */
function select(
	cards: CardState[],
	attempts: Attempt[] = [],
	random: () => number = () => 0,
	sequences = false
): SessionSelector {
	return createLearnSelector({
		cards,
		attempts,
		sessionId: 's-now',
		tempoBpm: TEMPO,
		random,
		sequences
	});
}

/** Replays the given draws, then 0. */
function draws(...values: number[]): () => number {
	const queue = [...values];
	return () => queue.shift() ?? 0;
}

function next(selector: SessionSelector, fatigued = false): PlannedItem | null {
	return selector.next({ now: NOW, elapsedMs: 0, fatigued });
}

type Prompt = Pick<
	PlannedItem,
	'mechanic' | 'item' | 'phase' | 'temperature' | 'aid' | 'leadBeats'
>;

/** A right answer to `item`, at TEMPO in locate. */
function answer(item: Prompt, overrides: AttemptOverrides = {}): Attempt {
	return responseAttempt({
		sessionId: 's-now',
		exerciseId: neckExerciseId(item.mechanic),
		mechanic: item.mechanic,
		cardKey: keyOf(item),
		phase: item.phase,
		temperature: item.temperature,
		aid: item.aid,
		promptedAt: NOW,
		tempoBpm: item.mechanic === 'locate' ? TEMPO : null,
		leadBeats: item.leadBeats,
		timingOffsetMs: 0,
		reactionMs: 1000,
		correct: true,
		verdict: 'perfect',
		data: { item: item.item, answer: null, confusion: null },
		observations: [],
		...overrides
	});
}

/** Plays `count` prompts, answering each correctly, and returns their keys. */
function play(
	selector: SessionSelector,
	count: number,
	overrides: AttemptOverrides = {}
): string[] {
	const keys: string[] = [];
	for (let i = 0; i < count; i++) {
		const item = next(selector);
		if (!item) break;
		keys.push(keyOf(item));
		selector.record(answer(item, overrides), NOW);
	}
	return keys;
}

/** Ten learned, not acquired, not due cards: no new note may enter. */
const FILLERS = ORDER.slice(1, 11).map((target) => learned(target));
const G = ORDER[0];
const GK = keyOf(G);

describe('createLearnSelector', () => {
	it('ends after five minutes', () => {
		const selector = select([]);
		expect(selector.next({ now: NOW, elapsedMs: LEARN_SESSION_MS, fatigued: false })).toBeNull();
	});

	it('serves_a_new_note_as_an_unaided_probe', () => {
		expect(next(select([]))).toEqual({
			exerciseId: 'locate-neck',
			...G,
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
		expect(outcome?.card?.scheduling.state).toBe(2);
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
			exerciseId: 'locate-neck',
			...G,
			phase: 'learning',
			temperature: 'hot',
			aid: 'show-position',
			leadBeats: 8,
			stringAid: true
		});
	});

	it('no_answer_counts_as_a_missed_probe', () => {
		const selector = select([]);
		const probe = next(selector)!;
		const silent = { correct: false, verdict: 'wrong', reactionMs: null } as const;
		expect(selector.record(answer(probe, silent), NOW)?.card?.learnedAt).toBeNull();
		expect(next(selector)).toMatchObject({ ...G, phase: 'learning', aid: 'show-position' });
	});

	it('probes_identify_right_after_a_passed_locate_probe', () => {
		const selector = select([]);
		selector.record(answer(next(selector)!), NOW);
		expect(next(selector)).toEqual({
			exerciseId: 'identify-neck',
			mechanic: 'identify',
			item: { string: 6, fret: 3 },
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
		expect(selector.record(slow, NOW)?.card?.learnedAt).toBeNull();
		expect(next(selector)).toMatchObject({
			mechanic: probe.mechanic,
			item: probe.item,
			phase: 'learning',
			aid: 'show-position',
			leadBeats: null
		});
	});

	it('resumes_a_missed_probe_with_the_aid', () => {
		const first = select([]);
		const probe = next(first)!;
		const missed = first.record(answer(probe, { correct: false, verdict: 'wrong' }), NOW)!.card!;
		expect(next(select([missed]))).toMatchObject({
			...G,
			phase: 'learning',
			aid: 'show-position',
			leadBeats: 8
		});
	});

	it('passed_probes_do_not_count_as_unconsolidated', () => {
		const known = ORDER.slice(1, 11).map((target) =>
			probeCard(
				keyed(target),
				answer({ ...target, phase: 'probe', temperature: 'cold', aid: 'none', leadBeats: 2 }),
				NOW - 1000,
				's-old',
				(a) => beatTiming.isDirectRecall(a)
			)!
		);
		expect(next(select(known))).toMatchObject({ phase: 'probe' });
	});

	it('probes an abandoned probe again instead of holding its slot', () => {
		const selector = select([]);
		expect(next(selector)).toMatchObject({ ...G, phase: 'probe' });
		// Paused before answering: nothing is recorded, the next prompt is asked for.
		expect(next(selector)).toMatchObject({ ...G, phase: 'probe' });
	});

	it('fatigue_serves_no_probe', () => {
		expect(next(select([]), true)).toBeNull();
	});

	it('brings the aid right after a missed probe even when another retest is due', () => {
		const selector = select([]);
		const missed = { correct: false, verdict: 'wrong' } as const;
		const answers = [missed, {}, {}, missed, {}, {}];
		const keys = answers.map((overrides) => {
			const item = next(selector)!;
			selector.record(answer(item, overrides), NOW);
			return keyOf(item);
		});
		// G's retest falls due on the fifth prompt, with the aid of the identify probe missed on
		// the fourth: the aid comes first.
		const I = keyOf({ mechanic: 'identify', item: { string: 5, fret: 3 } });
		expect(keys).toEqual([GK, GK, keyOf(ORDER[1]), I, I, GK]);
	});

	it('halves the lead after each success, 8 to 4 to 2, and needs two successes at 2', () => {
		const selector = select([learning(G), ...FILLERS]);
		const presentation = next(selector)!;
		expect(presentation).toMatchObject({ ...G, aid: 'show-position', leadBeats: 8 });
		expect(selector.record(answer(presentation), NOW)).toBeNull();

		expect(play(selector, 2)).not.toContain(GK);
		const four = next(selector)!;
		expect(four).toMatchObject({ ...G, aid: 'none', leadBeats: 4, phase: 'learning' });
		expect(selector.record(answer(four), NOW)).toBeNull();

		expect(play(selector, 4)).not.toContain(GK);
		const two = next(selector)!;
		expect(two).toMatchObject({ ...G, aid: 'none', leadBeats: 2 });
		expect(selector.record(answer(two), NOW)).toBeNull();

		expect(play(selector, 4)).not.toContain(GK);
		const again = next(selector)!;
		expect(again).toMatchObject({ ...G, leadBeats: 2 });
		const outcome = selector.record(answer(again), NOW);
		expect(outcome?.card?.learnedAt).toBe(NOW);
		expect(outcome?.card?.leadBeats).toBe(2);
	});

	it('doubles the lead after a miss, up to 8, where the position shows again', () => {
		const selector = select([learning(G), ...FILLERS]);
		selector.record(answer(next(selector)!), NOW);
		play(selector, 2);
		const four = next(selector)!;
		selector.record(answer(four, { correct: false, verdict: 'wrong' }), NOW);
		play(selector, 2);
		expect(next(selector)).toMatchObject({ ...G, aid: 'show-position', leadBeats: 8 });
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
		expect(back).toMatchObject({ ...G, aid: 'none', leadBeats: 4 });
		selector.record(answer(back), NOW);
		play(selector, 4);
		const first = next(selector)!;
		expect(first.leadBeats).toBe(2);
		expect(selector.record(answer(first), NOW)).toBeNull();
	});

	it('teaches an identify note with its name shown, then two quick unaided answers', () => {
		const I: NeckCard = { mechanic: 'identify', item: { string: 6, fret: 3 } };
		const selector = select([learning(I), ...FILLERS]);
		const shown = next(selector)!;
		expect(shown).toMatchObject({ ...I, aid: 'show-position', leadBeats: null });
		selector.record(answer(shown), NOW);
		play(selector, 2);
		const slow = next(selector)!;
		expect(slow).toMatchObject({ ...I, aid: 'none', leadBeats: null });
		selector.record(answer(slow, { reactionMs: 4000 }), NOW);
		play(selector, 2);
		expect(next(selector)).toMatchObject({ ...I, aid: 'show-position' });
	});

	it('puts a review before resuming a note', () => {
		const selector = select([learning(G), due(learned(ORDER[1]))]);
		expect(next(selector)).toMatchObject({ ...ORDER[1], phase: 'review' });
		expect(next(selector)).toMatchObject({ ...G, phase: 'learning', aid: 'show-position' });
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
		expect(retest).toMatchObject({ ...G, phase: 'learning' });
		selector.record(answer(retest), twoHoursLater.now);
		expect(selector.next(twoHoursLater)).toMatchObject({ ...ORDER[11], phase: 'review' });
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

	it('draws due reviews at random instead of by due date and key', () => {
		const cards = ORDER.slice(0, 3).map((target) => due(learned(target)));
		// Same due date: the old order (due, then key) always served 4:F first.
		expect(next(select(cards, [], draws(0)))).toMatchObject(ORDER[2]);
		expect(next(select(cards, [], draws(0.99)))).toMatchObject(ORDER[0]);
		expect(next(select(cards, [], draws(0.5)))).toMatchObject(ORDER[1]);
	});

	it('never serves the mirror of the previous note next', () => {
		const aOnLowE = locate({ string: 6, pitch: 'A' });
		const eOnA = locate({ string: 5, pitch: 'E' });
		const fOnD = locate({ string: 4, pitch: 'F' });
		const selector = select(
			[aOnLowE, eOnA, fOnD].map((target) => due(learned(target))),
			[],
			draws(0.99)
		);
		const keys = play(selector, 3);
		expect(keys[0]).toBe(keyOf(aOnLowE));
		expect(keys[1]).toBe(keyOf(fOnD));
		expect(keys[2]).toBe(keyOf(eOnA));
	});

	it('does not review a due card played in free play ten minutes ago', () => {
		const card = due(learned(ORDER[5]));
		const recent = answer(
			{ ...asNeckCard(card), phase: 'free', temperature: 'hot', aid: 'none', leadBeats: 2 },
			{ promptedAt: NOW - 10 * 60 * 1000 }
		);
		expect(next(select([card], [recent]))?.phase).not.toBe('review');
	});

	it('never reviews a card that is still being learned', () => {
		expect(next(select([due(learning(G))]))?.phase).toBe('learning');
	});

	it('resumes a note being learned before introducing a new one', () => {
		const selector = select([learning(ORDER[4])]);
		const resumed = next(selector)!;
		expect(resumed).toMatchObject(ORDER[4]);
		selector.record(answer(resumed), NOW);
		expect(next(selector)).toMatchObject(G);
	});

	it('stops introducing notes at ten learned but not acquired', () => {
		expect(next(select(FILLERS))?.phase).toBe('consolidation');
		expect(next(select(FILLERS.slice(1)))).toMatchObject({ ...G, phase: 'probe' });
	});

	it('introduces the identify position once its locate card is acquired', () => {
		const acquired = learned(G, { acquiredAt: NOW - 1000 });
		expect(next(select([acquired]))).toMatchObject({
			mechanic: 'identify',
			item: { string: 6, fret: 3 },
			phase: 'probe',
			aid: 'none',
			leadBeats: null
		});
	});

	it('only retests notes already presented once fatigue shows', () => {
		const selector = select([learning(G), learned(ORDER[1])]);
		expect(play(selector, 1)).toEqual([GK]);
		const reviewDue = { now: FAR + 1000, elapsedMs: 0, fatigued: true };
		expect(selector.next(reviewDue)).toMatchObject({ ...G, phase: 'learning' });
		expect(next(select([due(learned(ORDER[1]))]), true)).toBeNull();
	});

	it('serves a retest early when nothing else is available', () => {
		const selector = select([learning(G), learning(ORDER[1]), learning(ORDER[2])]);
		const [a, b, c] = [ORDER[2], ORDER[1], G].map(keyOf);
		expect(play(selector, 7)).toEqual([a, b, c, a, b, c, a]);
	});

	it('consolidates recently confused notes first and again, then the least stable', () => {
		const [t, q, s, p] = ORDER.slice(1, 5);
		const stable = (target: NeckCard, stability: number) =>
			learned(target, { scheduling: { ...learned(target).scheduling, stability } });
		const cards = [
			stable(t, 9),
			stable(q, 1),
			stable(s, 3),
			stable(p, 5),
			...ORDER.slice(5, 11).map((target) => stable(target, 100))
		];
		const confused = answer(
			{ ...t, phase: 'review', temperature: 'cold', aid: 'none', leadBeats: 2 },
			{
				promptedAt: NOW - 5 * 60 * 60 * 1000,
				correct: false,
				data: { item: t.item, answer: null, confusion: { kind: 'octave' } }
			}
		);
		const keys = play(select(cards, [confused]), 4);
		// t stays confused until three clean attempts push the confusion out of the lookback.
		expect(keys).toEqual([keyOf(t), keyOf(q), keyOf(s), keyOf(t)]);
		expect(play(select(cards), 4)).toEqual([keyOf(q), keyOf(s), keyOf(p), keyOf(t)]);
	});

	it('rotates consolidation through the working set instead of looping on three', () => {
		const keys = play(select(FILLERS), 10);
		expect(new Set(keys).size).toBe(MAX_WORKING_SET);
	});

	it('lets a new note in once reviews acquire the waiting cards', () => {
		const selector = select(FILLERS.map(due));
		const reviewed = play(selector, 10);
		expect(new Set(reviewed).size).toBe(10);
		for (const card of FILLERS) selector.cardChanged({ ...card, acquiredAt: NOW });
		// Their identify positions are now candidates and come before the next locate note.
		expect(next(selector)).toMatchObject({
			mechanic: 'identify',
			item: { string: 5, fret: 3 },
			phase: 'probe',
			aid: 'none'
		});
	});

	it('keeps consolidating when the whole neck is known', () => {
		const cards = practiceCards().map((target) => learned(target, { acquiredAt: NOW - 1000 }));
		expect(next(select(cards))).toMatchObject({ phase: 'consolidation', temperature: 'hot' });
	});
});

describe('learn sequences', () => {
	const inSequences = (cards: CardState[], random: () => number = () => 0) =>
		select(cards, [], random, true);

	it('serves a run at one lead and counts a bar in when the lead changes', () => {
		const selector = inSequences([learning(G), ...FILLERS]);
		const items: PlannedItem[] = [];
		for (let i = 0; i < 6; i++) {
			const item = next(selector)!;
			items.push(item);
			selector.record(answer(item), NOW);
		}
		// The aided presentation at 8 has no partner at 8: its sequence ends after one prompt.
		expect(items[0]).toMatchObject({ ...G, leadBeats: 8 });
		expect(items.slice(1, 5).map((item) => item.leadBeats)).toEqual([2, 2, 2, 2]);
		expect(items[1].countIn).toBe(true);
		expect(items.slice(2, 5).every((item) => !item.countIn)).toBe(true);
		// G came due at 4 beats in the middle of the run: it waits for the next sequence.
		expect(items[5]).toMatchObject({ ...G, leadBeats: 4, countIn: true });
	});

	it('ends the sequence at once for the aid after a missed probe', () => {
		const selector = inSequences([due(learned(ORDER[1])), due(learned(ORDER[2]))]);
		const keys = play(selector, 2);
		expect(keys).toHaveLength(2);
		const probe = next(selector)!;
		expect(probe).toMatchObject({ ...G, phase: 'probe', leadBeats: 2 });
		selector.record(answer(probe, { correct: false, verdict: 'wrong' }), NOW);
		expect(next(selector)).toMatchObject({ ...G, leadBeats: 8, countIn: true });
	});

	it('keeps each run to one lead and one scene, four prompts at most', () => {
		let seed = 7;
		const random = () => {
			seed = (seed * 16807) % 2147483647;
			return seed / 2147483647;
		};
		const cards = [
			learning(G),
			learning(ORDER[1]),
			...ORDER.slice(2, 8).map((target) => learned(target, { acquiredAt: NOW - 1000 })),
			due(learned(ORDER[8])),
			due(learned(ORDER[9]))
		];
		const selector = inSequences(cards, random);
		const runs: PlannedItem[][] = [];
		let previous: PlannedItem | null = null;
		for (let i = 0; i < 60; i++) {
			const item = next(selector);
			if (!item) break;
			const sameRun =
				previous !== null &&
				!item.countIn &&
				item.mechanic === previous.mechanic &&
				item.leadBeats === previous.leadBeats &&
				runs.at(-1)!.length < 4;
			if (sameRun) runs.at(-1)!.push(item);
			else runs.push([item]);
			previous = item;
			selector.record(answer(item, { correct: random() < 0.7 }), NOW);
		}
		for (const run of runs) {
			expect(run.length).toBeLessThanOrEqual(4);
			expect(new Set(run.map((item) => item.leadBeats)).size).toBe(1);
		}
		const leadChanges = runs.slice(1).filter((run, i) => {
			const before = runs[i].at(-1)!;
			return (
				before.mechanic === 'locate' &&
				run[0].mechanic === 'locate' &&
				before.leadBeats !== run[0].leadBeats
			);
		});
		expect(leadChanges.every((run) => run[0].countIn === true)).toBe(true);
	});

	it('serves nothing in sequences once switched off', () => {
		const selector = select([learning(G), ...FILLERS]);
		const items = Array.from({ length: 6 }, () => {
			const item = next(selector)!;
			selector.record(answer(item), NOW);
			return item;
		});
		expect(items.some((item) => item.countIn)).toBe(false);
	});
});

describe('learn pacing by success', () => {
	const missed = { correct: false, verdict: 'wrong' } as const;
	const solid = (target: NeckCard) => learned(target, { acquiredAt: NOW - 1000 });

	it('lets no new note in while a note being learned is below 80 %', () => {
		const failing = select([learning(G), learned(ORDER[5])]);
		failing.record(answer(next(failing)!, missed), NOW);
		expect(next(failing)).toMatchObject({ ...ORDER[5], phase: 'consolidation' });

		const passing = select([learning(G), learned(ORDER[5])]);
		passing.record(answer(next(passing)!), NOW);
		expect(next(passing)).toMatchObject({ ...ORDER[1], phase: 'probe' });
	});

	it('lets a new note past the gate rather than repeat the only note or end the session', () => {
		const selector = select([learning(G)]);
		selector.record(answer(next(selector)!, missed), NOW);
		expect(next(selector)).toMatchObject({ ...ORDER[1], phase: 'probe' });
	});

	it('lets no new note in while the rolling success is under 70 %', () => {
		const cards = ORDER.slice(1, 4).map(solid);
		const consolidation = (target: NeckCard): PlannedItem => ({
			exerciseId: 'locate-neck',
			...target,
			phase: 'consolidation',
			temperature: 'hot',
			aid: 'none',
			leadBeats: 2
		});
		const feed = (selector: SessionSelector, misses: number) => {
			for (let i = 0; i < 10; i++) {
				const item = consolidation(ORDER[1 + (i % 3)]);
				selector.record(answer(item, i < misses ? missed : {}), NOW);
			}
		};
		const low = select(cards);
		feed(low, 4);
		expect(next(low)?.phase).not.toBe('probe');
		const enough = select(cards);
		feed(enough, 3);
		expect(next(enough)?.phase).toBe('probe');
	});

	it('follows a miss with a solid card, hot, at its own lead with sequences off', () => {
		const selector = select([learning(G), solid(ORDER[1]), solid(ORDER[2])]);
		const aided = next(selector)!;
		expect(aided).toMatchObject({ ...G, leadBeats: 8 });
		selector.record(answer(aided, missed), NOW);
		const recovery = next(selector)!;
		expect(recovery).toMatchObject({ phase: 'consolidation', temperature: 'hot', leadBeats: 2 });
		expect([ORDER[1], ORDER[2]]).toContainEqual(asNeckCard(recovery));
	});

	it('serves the recovery at the lead of the sequence in progress', () => {
		const selector = select([learning(G), solid(ORDER[1])], [], () => 0, true);
		selector.record(answer(next(selector)!, missed), NOW);
		expect(next(selector)).toMatchObject({
			...ORDER[1],
			phase: 'consolidation',
			leadBeats: 8
		});
	});

	it('follows a missed probe with its aid, not with a recovery', () => {
		const selector = select([solid(ORDER[5])]);
		const probe = next(selector)!;
		expect(probe.phase).toBe('probe');
		selector.record(answer(probe, missed), NOW);
		expect(next(selector)).toMatchObject({
			mechanic: probe.mechanic,
			item: probe.item,
			phase: 'learning'
		});
	});

	it('never takes a card waiting for its cold review as a recovery', () => {
		const reviews = ORDER.slice(1, LEARN_COLD_CAP + 2).map((target) => due(solid(target)));
		const selector = select([learning(G), ...reviews]);
		const reviewed = play(selector, LEARN_COLD_CAP);
		const waiting = reviews.find((card) => !reviewed.includes(card.key))!;
		const aided = next(selector)!;
		expect(aided).toMatchObject({ ...G, phase: 'learning' });
		selector.record(answer(aided, missed), NOW);
		const recovery = next(selector)!;
		expect(recovery.phase).toBe('consolidation');
		expect(keyOf(recovery)).not.toBe(waiting.key);
	});

	it('keeps hot prompts to six cards in a session, cold reviews apart', () => {
		// Every position known: no probe left, only reviews and consolidation.
		const known = practiceCards().map(solid);
		const cards = known.map((card, i) => (i < 8 ? due(card) : card));
		const selector = select(cards);
		const items: PlannedItem[] = [];
		for (let i = 0; i < 40; i++) {
			const item = next(selector)!;
			items.push(item);
			selector.record(answer(item), NOW);
		}
		const hot = new Set(items.filter((item) => item.temperature === 'hot').map(keyOf));
		expect(hot.size).toBe(MAX_WORKING_SET);
		expect(items.filter((item) => item.phase === 'review')).toHaveLength(8);
	});

	it('lets no new note in once six cards are in the working set', () => {
		// Every probe missed, every other prompt right: each missed probe joins the set.
		const selector = select([]);
		const items: PlannedItem[] = [];
		for (let i = 0; i < 80; i++) {
			const item = next(selector);
			if (!item) break;
			items.push(item);
			selector.record(answer(item, item.phase === 'probe' ? missed : {}), NOW);
		}
		const firstFull = items.findIndex(
			(_, i) =>
				new Set(
					items
						.slice(0, i + 1)
						.filter((item) => item.temperature === 'hot')
						.map(keyOf)
				).size === MAX_WORKING_SET
		);
		expect(firstFull).toBeGreaterThan(-1);
		expect(items.slice(firstFull + 1).some((item) => item.phase === 'probe')).toBe(false);
	});
});

describe('drawn string aid', () => {
	const missed = { correct: false, verdict: 'wrong' } as const;

	it('fades after one success once a learned note is missed (the guitarist’s case)', () => {
		// Ten learned, not acquired notes: consolidation only, no new note.
		const selector = select(FILLERS);
		const first = next(selector)!;
		expect(first).toMatchObject({ phase: 'consolidation' });
		expect(first.stringAid).toBeFalsy();
		const key = keyOf(first);
		selector.record(answer(first, missed), NOW);
		const aids: boolean[] = [];
		for (let i = 0; i < 40 && aids.length < 4; i++) {
			const item = next(selector)!;
			if (keyOf(item) === key) aids.push(item.stringAid === true);
			selector.record(answer(item), NOW);
		}
		expect(aids).toEqual([true, false, false, false]);
	});

	it('draws the string on the aided presentation, then after each miss, until a success', () => {
		const selector = select([]);
		const probe = next(selector)!;
		expect(probe.stringAid).toBeFalsy();
		selector.record(answer(probe, missed), NOW);
		const outcomes = [{}, missed, {}, {}];
		const aids: boolean[] = [];
		for (let i = 0; i < 40 && aids.length < outcomes.length + 1; i++) {
			const item = next(selector)!;
			const mine = keyOf(item) === GK;
			if (mine) aids.push(item.stringAid === true);
			selector.record(answer(item, mine ? (outcomes[aids.length - 1] ?? {}) : {}), NOW);
		}
		// Aided presentation, then 4 beats (faded), missed → back, then faded again.
		expect(aids).toEqual([true, false, true, false, false]);
	});

	it('never draws the string on reviews or probes', () => {
		const selector = select([learning(G), due(learned(ORDER[1])), due(learned(ORDER[2]))]);
		const items: PlannedItem[] = [];
		for (let i = 0; i < 8; i++) {
			const item = next(selector)!;
			items.push(item);
			selector.record(answer(item, missed), NOW);
		}
		const unaided = items.filter((item) => item.phase === 'review' || item.phase === 'probe');
		expect(unaided.length).toBeGreaterThan(0);
		expect(unaided.every((item) => !item.stringAid)).toBe(true);
	});

	it('fades after STRING_AID_FADE_SUCCESSES success', () => {
		expect(STRING_AID_FADE_SUCCESSES).toBe(1);
	});
});

describe('learn session never stalls', () => {
	const missed = { correct: false, verdict: 'wrong' } as const;

	function run(sequences: boolean, missRate: number, seed: number, count = 60) {
		let state = seed;
		const random = () => {
			state = (state * 16807) % 2147483647;
			return state / 2147483647;
		};
		const selector = select([], [], random, sequences);
		const items: PlannedItem[] = [];
		for (let i = 0; i < count; i++) {
			const item = next(selector);
			if (!item) break;
			items.push(item);
			const miss = random() < missRate;
			selector.record(answer(item, miss ? missed : {}), NOW);
		}
		return items;
	}

	/** Back-to-back repeats, the aid right after a missed probe aside. */
	function repeats(items: PlannedItem[]): number {
		return items.filter((item, i) => {
			const before = items[i - 1];
			if (!before || keyOf(before) !== keyOf(item)) return false;
			return !(before.phase === 'probe' && item.phase === 'learning');
		}).length;
	}

	it('keeps a struggling new player busy without hammering one note', () => {
		for (const sequences of [false, true]) {
			for (let seed = 1; seed <= 40; seed++) {
				const items = run(sequences, 0.4, seed);
				expect(items).toHaveLength(60);
				expect(repeats(items)).toBeLessThanOrEqual(3);
			}
		}
	});

	it('serves no card twice in a row to fill an open sequence', () => {
		const solid = ORDER.slice(1, 4).map((target) => learned(target));
		const selector = select([learning(G), ...solid], [], () => 0, true);
		const items: PlannedItem[] = [];
		for (let i = 0; i < 8; i++) {
			const item = next(selector)!;
			items.push(item);
			selector.record(answer(item, keyOf(item) === GK ? missed : {}), NOW);
		}
		expect(repeats(items)).toBe(0);
	});
});

describe('createLearnSelector with the notes of the triads being learned', () => {
	it('probes them first', () => {
		const selector = createLearnSelector({
			cards: [],
			attempts: [],
			sessionId: 's-now',
			tempoBpm: TEMPO,
			random: () => 0,
			priority: [{ string: 1, pitch: 'C#' }]
		});
		expect(selector.next({ now: NOW, elapsedMs: 0, fatigued: false })).toMatchObject({
			mechanic: 'locate',
			item: { string: 1, pitch: 'C#' },
			phase: 'probe'
		});
	});
});
