import { describe, expect, it } from 'vitest';
import type { ExerciseId, MechanicId } from '../exercise/types';
import type { LevelState } from '../time/levels';
import type { Attempt, CardState, PlannedItem } from '../types';
import { DEFAULT_ITEM_LEARNING, DEFAULT_SET_LEARNING } from './params';
import { createLearningProcedure, type LearningProcedure } from './procedure';
import type { LearningSubject } from './subject';
import { attemptOf, fakeCard, fakeSubject, rung } from './testing/fakeSubject';

const FAKE = 'fake' as MechanicId;
const OTHER = 'other' as MechanicId;
const EXERCISE = 'exercise-fake' as ExerciseId;
const SESSION = 'session';
/** The fake subject's ladder: leads 8 (aided), 4, 2 beats; at 80 bpm 2 beats is 1 500 ms, the threshold. */
const TOP = 2;
const at = (now: number, fatigued = false) => ({ now, elapsedMs: 0, fatigued });

/** A seeded draw, so a spec covers many draws and stays repeatable (the seed spread, so first draws differ). */
function seeded(seed: number): () => number {
	let state = Math.imul(seed, 2_654_435_761) >>> 0 || 1;
	return () => {
		state = (state * 1_664_525 + 1_013_904_223) >>> 0;
		return state / 2 ** 32;
	};
}

function procedure(
	input: {
		subject?: LearningSubject;
		cards?: readonly CardState[];
		attempts?: readonly Attempt[];
		levels?: readonly LevelState[];
		random?: () => number;
		set?: Parameters<typeof createLearningProcedure>[0]['set'];
	} = {}
): LearningProcedure {
	return createLearningProcedure({
		subject: input.subject ?? fakeSubject(),
		cards: input.cards ?? [],
		attempts: input.attempts ?? [],
		levels: input.levels ?? [],
		sessionId: SESSION,
		random: input.random ?? (() => 0),
		set: input.set
	});
}

const learning = (item: number) => fakeCard(item, { introducedInSession: 'past' });
const learned = (item: number, stability = 1, mechanic: MechanicId = FAKE) =>
	fakeCard(item, { mechanic, learnedAt: 0, scheduling: { due: 1e12, stability } });
const solid = (item: number, mechanic: MechanicId = FAKE) =>
	fakeCard(item, {
		mechanic,
		learnedAt: 0,
		acquiredAt: 0,
		scheduling: { due: 1e12, stability: 100 }
	});
const reviewable = (item: number) =>
	fakeCard(item, { learnedAt: 0, scheduling: { due: 0, stability: 100 } });

function levelAt(item: number, level: number, mechanic: MechanicId = FAKE): LevelState {
	return {
		exerciseId: `exercise-${mechanic}`,
		scope: '',
		item: String(item),
		level,
		successes: 0,
		failures: 0,
		resumeAfter: null
	};
}

/** An attempt of `item` played as `phase`, at the lead of `level` (8, 4, 2 beats). */
function played(
	item: number,
	phase: Attempt['phase'],
	overrides: Parameters<typeof attemptOf>[1] = {},
	mechanic: MechanicId = FAKE
): Attempt {
	return attemptOf(
		{
			exerciseId: `exercise-${mechanic}` as ExerciseId,
			mechanic,
			item,
			phase,
			temperature: phase === 'review' ? 'cold' : 'hot'
		},
		overrides
	);
}

/** The attempt of a served item, a success unless `success` is false. */
function answer(
	item: PlannedItem,
	success = true,
	overrides: Parameters<typeof attemptOf>[1] = {}
) {
	return attemptOf(item, { success, ...overrides });
}

const ref = (item: number, mechanic: MechanicId = FAKE) => ({ mechanic, item });

describe('createLearningProcedure record', () => {
	it('writes the ladder level it serves an item at, its exercise level at 0', () => {
		const source = procedure();
		const probe = source.next(at(0))!;
		expect(probe).toMatchObject({ phase: 'probe', level: TOP, leadBeats: 2, exerciseLevel: 0 });
		source.record(answer(probe, false), 0);
		const presentation = source.next(at(0))!;
		expect(presentation).toMatchObject({ phase: 'learning', level: 0, leadBeats: 8 });
		expect(presentation.exerciseLevel).toBe(0);
	});

	it('sends a probe recalled directly to review, and presents a missed one aided next, before any other retest', () => {
		const passing = procedure();
		const probe = passing.next(at(0))!;
		expect(probe).toMatchObject({ item: 0, phase: 'probe', leadBeats: 2 });
		const passed = passing.record(answer(probe), 100);
		expect(passed?.card).toMatchObject({ item: 0, learnedAt: 100, acquiredAt: 100 });
		expect(passed?.card?.scheduling.state).toBe(2);
		expect(passed?.level).toMatchObject({ item: '0', level: TOP, successes: 0, failures: 0 });
		expect(passing.levelOf(ref(0))).toEqual(passed?.level);
		// A probe right but not direct (a lead past the threshold) is a miss.
		const slow = procedure();
		expect(
			slow.record(answer(slow.next(at(0))!, true, { leadMs: 3000 }), 0)?.card?.learnedAt
		).toBeNull();

		// Two items being learned (right so far), served first; then the probe; then a retest is due.
		const source = procedure({
			cards: [learning(5), learning(6)],
			attempts: [
				...[0, 1, 2, 3, 4].map((at) => played(5, 'learning', { at })),
				...[5, 6, 7, 8, 9].map((at) => played(6, 'learning', { at }))
			]
		});
		const resumed = [source.next(at(0))?.item, source.next(at(0))?.item];
		expect(new Set(resumed)).toEqual(new Set([5, 6]));
		const missedProbe = source.next(at(0))!;
		expect(missedProbe).toMatchObject({ item: 0, phase: 'probe' });
		const missed = source.record(answer(missedProbe, false), 0);
		expect(missed?.card).toMatchObject({ item: 0, learnedAt: null });
		expect(missed?.level).toMatchObject({ item: '0', level: 0 });
		// Item 5's retest is due now, the presentation still comes first, aided.
		const presentation = source.next(at(0))!;
		expect(presentation).toMatchObject({
			item: 0,
			phase: 'learning',
			temperature: 'hot',
			aid: 'show-position',
			leadBeats: 8
		});
		source.record(answer(presentation), 0);
		const due = source.next(at(0));
		expect(due?.phase).toBe('learning');
		expect([5, 6]).toContain(due?.item);
	});

	it('presents a missed probe at once, or after one other prompt when the subject says so', () => {
		/** Items 5 and 6 resumed, then item 0 probed and missed; the six prompts that follow. */
		const after = (presentsAtOnce: boolean) => {
			const source = procedure({
				subject: fakeSubject({ presentsAtOnce }),
				cards: [learning(5), learning(6)],
				attempts: [
					...[0, 1, 2, 3, 4].map((at) => played(5, 'learning', { at })),
					...[5, 6, 7, 8, 9].map((at) => played(6, 'learning', { at }))
				]
			});
			source.next(at(0));
			source.next(at(0));
			const probe = source.next(at(0))!;
			expect(probe).toMatchObject({ item: 0, phase: 'probe' });
			source.record(answer(probe, false), 0);
			return [source.next(at(0))!, source.next(at(0))!];
		};

		const [atOnce] = after(true);
		expect(atOnce).toMatchObject({ item: 0, phase: 'learning', aid: 'show-position' });

		// Not at once: another due retest between, then the presentation before the other one due.
		const [between, presentation] = after(false);
		expect(between.phase).toBe('learning');
		expect([5, 6]).toContain(between.item);
		expect(presentation).toMatchObject({ item: 0, phase: 'learning', aid: 'show-position' });
	});

	it('climbs a level on a success and falls one on a miss, hot or cold', () => {
		const source = procedure({ cards: [reviewable(0), learned(1)] });
		// The aided level's own aid does not count as aided: its success climbs.
		const aided = source.record(played(0, 'consolidation', { aids: ['show-position'] }), 0);
		expect(aided?.level).toMatchObject({ item: '0', level: 1 });
		expect(source.record(played(0, 'review', { success: false }), 0)?.level).toMatchObject({
			level: 0
		});
		expect(source.record(played(0, 'review'), 0)?.level).toMatchObject({ level: 1 });
		expect(source.record(played(0, 'consolidation', { success: false }), 0)?.level).toMatchObject({
			level: 0
		});
		expect(source.levelOf(ref(0)).level).toBe(0);
		// Below the top, a success need not be a direct recall.
		expect(source.record(played(0, 'consolidation', { leadMs: 6000 }), 0)?.level?.level).toBe(1);
		expect(source.levelOf(ref(1)).level).toBe(0);
		// A cold review is served at the level the attempts moved it to.
		const reviewed = procedure({ cards: [reviewable(0)] });
		reviewed.record(played(0, 'consolidation'), 0);
		reviewed.record(played(0, 'consolidation'), 0);
		// Long after those attempts: the review is due.
		expect(reviewed.next(at(1e12))).toMatchObject({ item: 0, phase: 'review', leadBeats: 2 });
	});

	it('counts a success at the top only when it is a direct recall', () => {
		const source = procedure({ cards: [learned(0)], levels: [levelAt(0, TOP)] });
		// Right, but from a lead past the threshold: a miss at the top.
		expect(source.record(played(0, 'consolidation', { leadMs: 3000 }), 0)?.level).toMatchObject({
			level: TOP - 1
		});
		const direct = procedure({ cards: [learned(0)], levels: [levelAt(0, TOP)] });
		expect(direct.record(played(0, 'consolidation', { leadMs: 1500 }), 0)?.level).toMatchObject({
			level: TOP,
			successes: 1,
			failures: 0
		});
	});

	it('counts only a direct recall as a success on a level that asks for it, wherever it stands', () => {
		// The middle level asks a direct recall; the top takes any success.
		const ladder = [
			rung(8, { aided: true }),
			rung(4, { success: 'direct-recall' }),
			rung(2, { pass: 2 })
		];
		const middle = () =>
			procedure({
				subject: fakeSubject({ ladder }),
				cards: [learned(0)],
				levels: [levelAt(0, 1)]
			});
		// Right, but from a lead past the threshold: a miss on the middle level.
		expect(middle().record(played(0, 'consolidation', { leadMs: 3000 }), 0)?.level).toMatchObject({
			level: 0
		});
		expect(middle().record(played(0, 'consolidation', { leadMs: 1500 }), 0)?.level).toMatchObject({
			level: 2
		});
		// At the top, a slow success counts.
		const top = procedure({
			subject: fakeSubject({ ladder }),
			cards: [learned(0)],
			levels: [levelAt(0, 2)]
		});
		expect(top.record(played(0, 'consolidation', { leadMs: 6000 }), 0)?.level).toMatchObject({
			level: 2,
			successes: 1
		});
	});

	it('learns an item at the top of a ladder whose top asks any success', () => {
		const source = procedure({
			subject: fakeSubject({ ladder: [rung(8, { aided: true }), rung(4, { pass: 2 })] }),
			cards: [learning(0)],
			levels: [levelAt(0, 1)]
		});
		// 4 beats at 80 bpm: 3 000 ms, past the threshold, still a success here.
		const slow = () => played(0, 'learning', { success: true, leadMs: 3000 });
		expect(source.record(slow(), 100)?.card).toBeUndefined();
		expect(source.record(slow(), 200)?.card).toMatchObject({ item: 0, learnedAt: 200 });
	});

	it('learns an item when the top level’s pass completes, retesting it at the short gap after the presentation or a miss and the long one otherwise', () => {
		const [shortGap, longGap] = DEFAULT_ITEM_LEARNING.retestGaps;
		const source = procedure({
			subject: fakeSubject({ items: 8 }),
			cards: [1, 2, 3, 4, 5, 6, 7].map((item) => learned(item))
		});
		/** Serves others, played right, until item 0 comes back as a retest; how many came between. */
		const othersUntilRetest = (): { between: number; retest: PlannedItem } => {
			for (let between = 0; between < 20; between++) {
				const item = source.next(at(0))!;
				if (item.item === 0 && item.phase === 'learning') return { between, retest: item };
				source.record(answer(item), 0);
			}
			throw new Error('item 0 never came back');
		};
		const probe = source.next(at(0))!;
		expect(probe).toMatchObject({ item: 0, phase: 'probe' });
		source.record(answer(probe, false), 0);
		const presentation = source.next(at(0))!;
		expect(presentation).toMatchObject({ item: 0, leadBeats: 8, aid: 'show-position' });

		// After the presentation: the short gap.
		expect(source.record(answer(presentation), 0)?.card).toBeUndefined();
		let next = othersUntilRetest();
		expect(next).toMatchObject({ between: shortGap, retest: { leadBeats: 4, aid: 'none' } });
		// After a miss: the short gap, one level down (the presentation again).
		source.record(answer(next.retest, false), 0);
		next = othersUntilRetest();
		expect(next).toMatchObject({ between: shortGap, retest: { leadBeats: 8 } });
		source.record(answer(next.retest), 0);
		next = othersUntilRetest();
		expect(next).toMatchObject({ between: shortGap, retest: { leadBeats: 4 } });
		// Otherwise: the long gap.
		source.record(answer(next.retest), 0);
		next = othersUntilRetest();
		expect(next).toMatchObject({ between: longGap, retest: { leadBeats: 2 } });
		const first = source.record(answer(next.retest), 0);
		expect(first?.card).toBeUndefined();
		expect(first?.level).toMatchObject({ level: TOP, successes: 1 });
		next = othersUntilRetest();
		expect(next).toMatchObject({ between: longGap, retest: { leadBeats: 2 } });
		// The top's pass completes: learned.
		const done = source.record(answer(next.retest), 500);
		expect(done?.card).toMatchObject({ item: 0, learnedAt: 500 });
		expect(done?.level).toMatchObject({ item: '0', level: TOP });
		for (let draw = 0; draw < 12; draw++) {
			const item = source.next(at(0))!;
			expect(item.item === 0 && item.phase === 'learning').toBe(false);
			source.record(answer(item), 0);
		}
	});

	it('never learns an item while its answer is shown, even on a ladder of one step', () => {
		// One lead written twice: aided, then the top, apart.
		const source = procedure({
			subject: fakeSubject({
				items: 8,
				ladder: [rung(2, { aided: true }), rung(2, { pass: 2, success: 'direct-recall' })]
			}),
			cards: [1, 2, 3, 4, 5, 6, 7].map((item) => learned(item))
		});
		source.record(answer(source.next(at(0))!, false), 0);
		let learnedUnaided = false;
		for (let draw = 0; draw < 40 && !learnedUnaided; draw++) {
			const item = source.next(at(0))!;
			const outcome = source.record(answer(item), 0);
			if (item.item !== 0 || outcome?.card?.learnedAt == null) continue;
			expect(item.aid).toBe('none');
			learnedUnaided = true;
		}
		expect(learnedUnaided).toBe(true);
	});

	it('calls a solid item after a miss, never after a missed recovery', () => {
		const subject = fakeSubject({ items: 10, mechanics: [FAKE, OTHER] });
		const cards = [
			// Solid: acquired, no recent miss, not waiting for its review.
			solid(0),
			solid(1),
			// Acquired, but missed lately, waiting for its review, or of another mechanic.
			solid(2),
			fakeCard(3, { learnedAt: 0, acquiredAt: 0, scheduling: { due: 0, stability: 100 } }),
			solid(3, OTHER),
			// Learned, weak: consolidation.
			learned(4),
			learned(5),
			learned(6),
			...[7, 8, 9].flatMap((item) => [learned(item, 1, FAKE), learned(item, 1, OTHER)]),
			...[0, 1, 2, 4, 5, 6].map((item) => learned(item, 1, OTHER))
		];
		const history = [played(2, 'consolidation', { success: false, at: -1, sessionId: 'past' })];
		for (let seed = 1; seed <= 50; seed++) {
			const source = procedure({ subject, cards, attempts: history, random: seeded(seed) });
			source.record(played(4, 'consolidation', { success: false }), 0);
			const recovery = source.next(at(0))!;
			expect(recovery).toMatchObject({
				mechanic: FAKE,
				phase: 'consolidation',
				temperature: 'hot'
			});
			expect([0, 1]).toContain(recovery.item);
			// A missed recovery calls for no other.
			source.record(answer(recovery, false), 0);
			const after = source.next(at(0))!;
			expect(after.mechanic === FAKE && [0, 1].includes(after.item as number)).toBe(false);
			// A success clears the call.
			const cleared = procedure({ subject, cards, attempts: history, random: seeded(seed) });
			cleared.record(played(4, 'consolidation', { success: false }), 0);
			cleared.record(played(5, 'consolidation'), 0);
			const plain = cleared.next(at(0))!;
			expect(plain.mechanic === FAKE && [0, 1].includes(plain.item as number)).toBe(false);
		}
		// Tired, no recovery.
		const tired = procedure({ subject, cards, attempts: history });
		tired.record(played(4, 'consolidation', { success: false }), 0);
		expect(tired.next(at(0, true))).toBeNull();
	});

	it('calls a solid item after as many misses in a row as the session sets', () => {
		const subject = fakeSubject({ items: 10 });
		const cards = [solid(0), solid(1), learned(4), learned(5), learned(6), learned(7)];
		const isRecovery = (item: PlannedItem | null) =>
			item !== null && item.phase === 'consolidation' && [0, 1].includes(item.item as number);
		for (let seed = 1; seed <= 20; seed++) {
			const source = procedure({
				subject,
				cards,
				random: seeded(seed),
				set: { recoveryAfterMisses: 2 }
			});
			source.record(played(4, 'consolidation', { success: false }), 0);
			// One miss: not yet.
			const first = source.next(at(0));
			expect(isRecovery(first)).toBe(false);
			source.record(answer(first!, false), 0);
			// The second in a row: a solid item.
			expect(isRecovery(source.next(at(0)))).toBe(true);
		}
	});

	it('draws the fading aid after the presentation and a miss, and drops it after its successes', () => {
		const source = procedure({
			subject: fakeSubject({ items: 4 }),
			cards: [learned(1), learned(2), learned(3)]
		});
		const probe = source.next(at(0))!;
		expect(probe.stringAid ?? false).toBe(false);
		source.record(answer(probe, false), 0);
		const presentation = source.next(at(0))!;
		expect(presentation).toMatchObject({ item: 0, phase: 'learning', stringAid: true });
		source.record(answer(presentation), 0);
		/** The next prompt of `item`, the others played right. */
		const nextOf = (item: number): PlannedItem => {
			for (let draw = 0; draw < 20; draw++) {
				const served = source.next(at(0))!;
				if (served.item === item) return served;
				source.record(answer(served), 0);
			}
			throw new Error(`item ${item} never came back`);
		};
		const retest = nextOf(0);
		expect(retest).toMatchObject({ leadBeats: 4 });
		expect(retest.stringAid ?? false).toBe(false);
		// A miss brings it back, on an unaided level too.
		source.record(played(1, 'consolidation', { success: false }), 0);
		const missed = nextOf(1);
		expect(missed).toMatchObject({ phase: 'consolidation', stringAid: true });
		source.record(answer(missed), 0);
		expect(nextOf(1).stringAid ?? false).toBe(false);

		// Never on a cold review.
		const reviewed = procedure({ cards: [reviewable(0)] });
		reviewed.record(played(0, 'consolidation', { success: false }), 0);
		const review = reviewed.next(at(1e12))!;
		expect(review).toMatchObject({ item: 0, phase: 'review' });
		expect(review.stringAid ?? false).toBe(false);
		// Never for a mechanic without it.
		const other = procedure({
			subject: fakeSubject({ items: 2, mechanics: [OTHER] }),
			cards: [learned(0, 1, OTHER), learned(1, 1, OTHER)]
		});
		other.record(played(0, 'consolidation', { success: false }, OTHER), 0);
		const items = [other.next(at(0)), other.next(at(0))];
		expect(items.map((item) => item?.item)).toContain(0);
		expect(items.every((item) => !(item?.stringAid ?? false))).toBe(true);
	});

	it('ignores an attempt of another exercise', () => {
		const source = procedure({ cards: [learned(0)] });
		const before = source.levelOf(ref(0));
		const misses = Array.from({ length: DEFAULT_SET_LEARNING.successWindow }, () => [
			played(0, 'consolidation', { success: false }, OTHER),
			played(0, 'consolidation', {
				success: false,
				exerciseId: 'another-exercise' as ExerciseId
			})
		]).flat();
		for (const attempt of misses) expect(source.record(attempt, 0)).toBeNull();
		expect(source.levelOf(ref(0))).toEqual(before);
		// The session's success is untouched: a new item still comes.
		expect(source.next(at(0))).toMatchObject({ item: 1, phase: 'probe' });
	});

	it('ignores a stored attempt of another exercise in the session’s success', () => {
		// Misses of this session stored before the procedure was built, in another exercise.
		const misses = Array.from({ length: DEFAULT_SET_LEARNING.successWindow }, () =>
			played(0, 'consolidation', {
				success: false,
				exerciseId: 'another-exercise' as ExerciseId
			})
		);
		const source = procedure({ cards: [learned(0)], attempts: misses });
		expect(source.next(at(0))).toMatchObject({ item: 1, phase: 'probe' });
	});

	it('counts every attempt of the procedure in the session’s success, probes left out', () => {
		const subject = fakeSubject({ items: 20, mechanics: [FAKE, OTHER] });
		const cards = [0, 1, 2, 3].flatMap((item) => [learned(item), learned(item, 1, OTHER)]);
		const source = procedure({ subject, cards });
		const probe = source.next(at(0))!;
		expect(probe).toMatchObject({ phase: 'probe' });
		// Four misses then six successes, on both mechanics: 0.6, under the threshold.
		const outcomes = [false, false, false, false, true, true, true, true, true, true];
		outcomes.forEach((success, index) =>
			source.record(
				played(index % 4, 'consolidation', { success }, index % 2 === 0 ? FAKE : OTHER),
				0
			)
		);
		// A passed probe would make it 0.7; left out, it does not.
		expect(source.record(answer(probe), 0)?.card?.learnedAt).toBe(0);
		expect(source.next(at(0))?.phase).toBe('consolidation');
		// One more success: 0.7.
		source.record(played(3, 'consolidation', {}, OTHER), 0);
		expect(source.next(at(0))?.phase).toBe('probe');
	});

	it('serves a retest early before a recent consolidation', () => {
		// No new item; item 0's retest after its success comes at the long gap.
		const source = procedure({
			subject: fakeSubject({ items: 3 }),
			cards: [learning(0), learned(1), learned(2)],
			levels: [levelAt(0, 1)]
		});
		const retest = source.next(at(0))!;
		expect(retest).toMatchObject({ item: 0, phase: 'learning', leadBeats: 4 });
		source.record(answer(retest), 0);
		const consolidations = [source.next(at(0)), source.next(at(0))];
		expect(new Set(consolidations.map((item) => item?.item))).toEqual(new Set([1, 2]));
		// Both learned items are recent, one is not the previous: the early retest still comes first.
		expect(source.next(at(0))).toMatchObject({ item: 0, phase: 'learning' });
	});
});

describe('createLearningProcedure level above the ladder', () => {
	// A ladder of two levels, 0 and 1, whose top asks a direct recall.
	const SHORT = [rung(8, { aided: true }), rung(4, { pass: 2, success: 'direct-recall' })];
	const shortLadder = () =>
		procedure({
			subject: fakeSubject({ ladder: SHORT }),
			cards: [solid(0)],
			levels: [levelAt(0, 2)]
		});

	it('writes a level above the ladder at the top it was played at', () => {
		const source = shortLadder();
		const outcome = source.record(played(0, 'review', { success: true, leadMs: 500 }), 100);
		expect(outcome?.level).toMatchObject({ level: 1, successes: 1 });
		expect(source.levelOf(ref(0))).toMatchObject({ level: 1, successes: 1 });
	});

	it('drops a level above the ladder from the top it is brought to', () => {
		const source = shortLadder();
		const outcome = source.record(played(0, 'review', { success: false }), 100);
		expect(outcome?.level?.level).toBe(0);
		expect(source.levelOf(ref(0)).level).toBe(0);
	});

	it('learns a learning item held above the ladder after its successes in a row', () => {
		const source = procedure({
			subject: fakeSubject({ ladder: SHORT }),
			cards: [learning(0)],
			levels: [levelAt(0, 2)]
		});
		const direct = () => played(0, 'learning', { success: true, leadMs: 500 });
		expect(source.record(direct(), 100)?.card).toBeUndefined();
		expect(source.levelOf(ref(0))).toMatchObject({ level: 1, successes: 1 });
		expect(source.record(direct(), 200)?.card).toMatchObject({ item: 0, learnedAt: 200 });
	});
});
