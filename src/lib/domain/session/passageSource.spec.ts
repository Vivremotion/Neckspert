import { describe, expect, it, vi } from 'vitest';
import { compileRound } from '$lib/domain/exercise/round/compile';
import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { chordShapes } from '$lib/domain/families/guitar/chordShapes';
import { triadOf } from '$lib/domain/grid';
import { gridById, registerGrid } from '$lib/domain/grid/registry';
import { passageIndices, passageMembers } from '$lib/domain/exercise/passage/indices';
import { roundCheckCost } from '$lib/domain/exercise/checkCost';
import type { MemberContent } from '$lib/domain/judges';
import type { StringNumber } from '$lib/domain/music';
import type { ItemSource } from '$lib/domain/progress/selector';
import { METER_4_4 } from '$lib/domain/time/meter';
import type { SkillId } from '$lib/domain/skill/types';
import { cardKey, type Attempt, type CardState, type PlannedItem } from '$lib/domain/types';
import { responseAttempt } from '$lib/testing/attempts';
import {
	alternatingGrid,
	CLIMB_PASSAGES,
	JAM_PASSAGES,
	LINK_PASSAGES,
	PASSAGE_EXERCISES,
	ZONE_PASSAGES
} from '$lib/testing/changesPassages';
import { triadCards } from '$lib/testing/shapes';
import { createPassageSource, MAX_PASSAGE_TRIES, passageOf } from './passageSource';
import { SESSION_MS } from './policy';
import { wallClockMs } from '$lib/testing/wallClock';

const NOW = Date.parse('2026-11-19T10:00:00.000Z');
const G_B_E = [3, 2, 1] as const;
const D_G_B = [4, 3, 2] as const;

/** The triads of iohefy-a, in the order of its changes. */
const IOHEFY = [
	['D', 'min'],
	['G', 'maj'],
	['C', 'maj'],
	['F', 'maj'],
	['E', 'min'],
	['Eb', 'min'],
	['Ab', 'maj']
] as const;
/** Dm7 G7 Dm7 G7 Cmaj7 F7 Em7 Ebm7 Ab7: Cmaj7 twice in a row is one change. */
const IOHEFY_CHANGES = 9;

function iohefy(skill: SkillId, set: readonly StringNumber[]): CardState[] {
	return IOHEFY.flatMap(([root, quality]) => triadCards(skill, root, quality, set));
}

/** Every passage exercise open on iohefy-a, and the link on its triads. */
const ALL_OPEN: CardState[] = [G_B_E, D_G_B].flatMap((set) => [
	...iohefy('chord-anchor', set),
	...iohefy('chord-zone', set)
]);

function source(
	exercises: readonly ExerciseDefinition[],
	cards: readonly CardState[] = ALL_OPEN,
	attempts: readonly Attempt[] = [],
	durationMs = SESSION_MS
): ItemSource {
	return createPassageSource({ exercises, cards, attempts, sessionId: 's1', durationMs });
}

/** The attempt of a planned round, passed or not, with the shape heard. */
function attemptOf(
	planned: PlannedItem,
	promptedAt: number,
	success = true,
	decided: string | null = null
): Attempt {
	const passage = planned.passage!;
	return responseAttempt({
		sessionId: 's1',
		exerciseId: planned.exerciseId,
		skill: planned.skill,
		cardKey: cardKey(planned.skill, `round-${passage.rank}`),
		phase: 'free',
		temperature: 'hot',
		aid: planned.aid,
		promptedAt,
		tempoBpm: 80,
		leadBeats: null,
		timingOffsetMs: success ? 0 : null,
		reactionMs: success ? 100 : null,
		correct: success,
		verdict: success ? 'perfect' : 'wrong',
		data: {
			item: planned.item,
			answer: decided === null ? null : { decided },
			confusion: null,
			passage: { id: passage.id, index: passage.index, rank: passage.rank, each: passage.each }
		},
		observations: []
	});
}

const at = (now: number, elapsedMs = 0) => ({ now, elapsedMs, fatigued: false });

/** Plays a whole passage, each round passed unless `success` says, the shape heard none. */
function playPassage(
	s: ItemSource,
	clock: { now: number },
	success: (rank: number) => boolean = () => true,
	elapsedMs = 0
): PlannedItem[] {
	const played: PlannedItem[] = [];
	for (;;) {
		const planned = s.next(at(clock.now, elapsedMs));
		if (!planned) throw new Error('no round');
		played.push(planned);
		clock.now += 1000;
		s.record(attemptOf(planned, clock.now, success(planned.passage!.rank)), clock.now);
		if (planned.passage!.rank === planned.passage!.length - 1) return played;
	}
}

/** The climb as the catalog writes it: a change lasts as long as its grid says. */
const CLIMB: ExerciseDefinition = CLIMB_PASSAGES;

/** The member content the round of `planned` judges. */
function contentOf(definition: ExerciseDefinition, planned: PlannedItem): MemberContent {
	const plan = compileRound(definition, planned, METER_4_4, {
		previewBeats: 0,
		fromRunStart: null
	});
	return plan.expectations[0].content!.value as MemberContent;
}

/** The shapes of a triad on a group of strings, lowest position first. */
function shapesOf(symbol: string, strings: readonly StringNumber[]) {
	return chordShapes.members({ chord: triadOf(symbol), strings: [...strings] });
}

describe('createPassageSource', () => {
	it('plays one passage of each exercise with something open, in the order written, round after round', () => {
		const s = source(PASSAGE_EXERCISES);
		const clock = { now: NOW };
		const exercises = Array.from({ length: 8 }, () => playPassage(s, clock)[0].exerciseId);
		const ids = PASSAGE_EXERCISES.map((exercise) => exercise.id);
		expect(exercises).toEqual([...ids, ...ids]);
	});

	it('serves a round per member of the passage, the first counted in, each the item its member is', () => {
		const s = source([CLIMB_PASSAGES], iohefy('chord-anchor', G_B_E));
		const played = playPassage(s, { now: NOW });
		expect(played.map((p) => p.item)).toEqual(
			Array.from({ length: IOHEFY_CHANGES }, (_, index) => ({ grid: 'iohefy-a', index }))
		);
		expect(played.map((p) => p.countIn ?? false)).toEqual(
			Array.from({ length: IOHEFY_CHANGES }, (_, i) => i === 0)
		);
		expect(played.every((p) => p.restBars === undefined)).toBe(true);
		const [first] = played;
		expect(first).toMatchObject({
			exerciseId: CLIMB_PASSAGES.id,
			skill: CLIMB_PASSAGES.practices,
			exerciseLevel: 0,
			phase: 'free',
			temperature: 'hot',
			aid: 'none',
			leadBeats: null,
			scope: 'iohefy-a'
		});
		expect(first.passage).toEqual({
			id: 's1:0',
			index: 'grid=iohefy-a;strings=3,2,1',
			of: { grid: 'iohefy-a', strings: [3, 2, 1] },
			rank: 0,
			length: IOHEFY_CHANGES,
			each: { direction: 'up' },
			previous: null,
			// Every round's item, so a view draws the whole passage.
			items: played.map((p) => p.item)
		});
		expect(played.map((p) => p.passage!.rank)).toEqual([...Array(IOHEFY_CHANGES).keys()]);
	});

	it('serves every round with the items of its whole passage, whatever the family of its members', () => {
		const s = source(PASSAGE_EXERCISES);
		const clock = { now: NOW };
		const families = new Set<string>();
		for (const definition of PASSAGE_EXERCISES) {
			const played = playPassage(s, clock);
			expect(played[0].exerciseId).toBe(definition.id);
			families.add(definition.passages!.members.family);
			const items = played.map((p) => p.item);
			for (const round of played) expect(round.passage!.items).toEqual(items);
			// One list for the passage: a view computes its line once.
			expect(new Set(played.map((round) => round.passage!.items)).size).toBe(1);
		}
		expect([...families].sort()).toEqual(['chord-shapes', 'grid-changes']);
	});

	it('writes no scope for an exercise whose passages name none; serves its members as the link does', () => {
		const s = source([LINK_PASSAGES], triadCards('chord-anchor', 'D', 'maj', G_B_E));
		const played = playPassage(s, { now: NOW });
		expect(played[0].scope).toBeUndefined();
		// Four shapes up, then back down: seven bars.
		expect(played).toHaveLength(7);
		const frets = played.map((p) => (p.item as { frets: number[] }).frets.join('-'));
		expect(frets.slice(0, 4)).toEqual(frets.slice(3).reverse());
	});

	it('plays the index played least recently, the order written on a tie, history first', () => {
		const cards = [...iohefy('chord-anchor', G_B_E), ...iohefy('chord-anchor', D_G_B)];
		const s = source([CLIMB_PASSAGES], cards);
		const clock = { now: NOW };
		const indices = Array.from({ length: 4 }, () => playPassage(s, clock)[0].passage!.index);
		expect(indices).toEqual([
			'grid=iohefy-a;strings=3,2,1',
			'grid=iohefy-a;strings=4,3,2',
			'grid=iohefy-a;strings=3,2,1',
			'grid=iohefy-a;strings=4,3,2'
		]);
		// Played before, in the store: the other one comes first.
		const first = source([CLIMB_PASSAGES], cards).next(at(NOW))!;
		const stored = attemptOf(first, NOW - 1000);
		expect(source([CLIMB_PASSAGES], cards, [stored]).next(at(NOW))!.passage!.index).toBe(
			'grid=iohefy-a;strings=4,3,2'
		);
	});

	it('gives each passage param the value after the one the last passage of the index started with', () => {
		const cards = iohefy('chord-anchor', G_B_E);
		const s = source([CLIMB_PASSAGES], cards);
		const clock = { now: NOW };
		const directions = Array.from(
			{ length: 3 },
			() => playPassage(s, clock)[0].passage!.each.direction
		);
		expect(directions).toEqual(['up', 'down', 'up']);

		// Read back in the store: the last passage started up, then turned down on the way.
		const first = source([CLIMB_PASSAGES], cards).next(at(NOW))!;
		const started = attemptOf(first, NOW - 5000);
		const turned = attemptOf(
			{ ...first, passage: { ...first.passage!, rank: 3, each: { direction: 'down' } } },
			NOW - 2000
		);
		const next = source([CLIMB_PASSAGES], cards, [turned, started]).next(at(NOW))!;
		expect(next.passage!.each).toEqual({ direction: 'down' });
	});

	it('moves the passage params of each index apart', () => {
		const cards = [...iohefy('chord-anchor', G_B_E), ...iohefy('chord-anchor', D_G_B)];
		const s = source([CLIMB_PASSAGES], cards);
		const clock = { now: NOW };
		const played = Array.from({ length: 4 }, () => playPassage(s, clock)[0].passage!);
		expect(played.map((p) => `${p.index} ${p.each.direction}`)).toEqual([
			'grid=iohefy-a;strings=3,2,1 up',
			'grid=iohefy-a;strings=4,3,2 up',
			'grid=iohefy-a;strings=3,2,1 down',
			'grid=iohefy-a;strings=4,3,2 down'
		]);
	});

	it('gives a passage left without an attempt its turn: its index and its values count as played', () => {
		const s = source([ZONE_PASSAGES]);
		const clock = { now: NOW };
		const first = s.next(at(clock.now))!;
		// The passage is cut short (the session paused, the player quit): a new one is asked.
		for (let rank = 1; rank < first.passage!.length; rank++) s.next(at(clock.now));
		const second = s.next(at(clock.now))!;
		expect(second.passage!.each.zone).not.toEqual(first.passage!.each.zone);
	});

	it('ignores the attempts of before the passages, and those of other exercises', () => {
		const cards = iohefy('chord-anchor', G_B_E);
		const old = responseAttempt({
			sessionId: 's0',
			exerciseId: CLIMB_PASSAGES.id,
			skill: CLIMB_PASSAGES.practices,
			cardKey: cardKey(CLIMB_PASSAGES.practices, 'iohefy-a#0'),
			phase: 'free',
			temperature: 'hot',
			aid: 'none',
			promptedAt: NOW - 1000,
			tempoBpm: 80,
			leadBeats: null,
			timingOffsetMs: 0,
			reactionMs: 100,
			correct: true,
			verdict: 'perfect',
			data: {
				item: { rule: 'climb', element: 'climb:iohefy-a:3,2,1', direction: 'up', index: 0 },
				answer: null,
				confusion: null
			},
			observations: []
		});
		expect(passageOf(old)).toBeNull();
		const planned = source([CLIMB_PASSAGES], cards).next(at(NOW))!;
		const elsewhere = { ...attemptOf(planned, NOW - 500), exerciseId: JAM_PASSAGES.id };
		const s = source([CLIMB_PASSAGES], cards, [old, elsewhere]);
		expect(s.next(at(NOW))!.passage).toMatchObject({ rank: 0, each: { direction: 'up' } });
	});

	describe('again: until passed', () => {
		const cards = [...triadCards('chord-anchor', 'D', 'maj', G_B_E), ...ALL_OPEN];

		it('plays a failed passage again, whole, on its index with its values, counted in, before the next exercise', () => {
			const s = source([LINK_PASSAGES, JAM_PASSAGES], cards);
			const clock = { now: NOW };
			const failed = playPassage(s, clock, (rank) => rank !== 2);
			const again = playPassage(s, clock);
			expect(again.map((p) => p.item)).toEqual(failed.map((p) => p.item));
			expect(again[0].passage).toMatchObject({
				index: failed[0].passage!.index,
				each: failed[0].passage!.each,
				rank: 0
			});
			expect(again[0].passage!.id).not.toBe(failed[0].passage!.id);
			expect(again[0].countIn).toBe(true);
			expect(again[0].restBars).toBeUndefined();
			expect(playPassage(s, clock)[0].exerciseId).toBe(JAM_PASSAGES.id);
		});

		it('counts a round that got no attempt as not passed', () => {
			const s = source([LINK_PASSAGES, JAM_PASSAGES], cards);
			const clock = { now: NOW };
			const first = s.next(at(clock.now))!;
			for (let rank = 1; rank < first.passage!.length; rank++) {
				const planned = s.next(at(clock.now))!;
				s.record(attemptOf(planned, ++clock.now), clock.now);
			}
			expect(s.next(at(clock.now))!.passage).toMatchObject({
				index: first.passage!.index,
				rank: 0
			});
		});

		it('moves on when the share of passed rounds reaches passes', () => {
			// One miss in seven: 6/7 passes at 0.8, not at 0.9.
			const lenient: ExerciseDefinition = {
				...LINK_PASSAGES,
				passages: { ...LINK_PASSAGES.passages!, passes: 0.8 }
			};
			const s = source([lenient, JAM_PASSAGES], cards);
			const clock = { now: NOW };
			playPassage(s, clock, (rank) => rank !== 0);
			expect(playPassage(s, clock)[0].exerciseId).toBe(JAM_PASSAGES.id);
		});

		it('stops at the end of the session before playing again', () => {
			const s = source([LINK_PASSAGES], cards);
			const clock = { now: NOW };
			playPassage(s, clock, () => false);
			expect(s.next(at(clock.now, SESSION_MS))).toBeNull();
		});
	});

	describe('rest bars', () => {
		it('rest before a passage whose index changes after a passage of the session, never before the first', () => {
			const cards = [
				...triadCards('chord-anchor', 'D', 'maj', G_B_E),
				...triadCards('chord-anchor', 'G', 'maj', G_B_E)
			];
			const s = source([LINK_PASSAGES], cards);
			const clock = { now: NOW };
			const first = playPassage(s, clock);
			const second = playPassage(s, clock);
			expect(first[0].restBars).toBeUndefined();
			expect(second[0]).toMatchObject({ countIn: true, restBars: 1 });
			expect(second[0].passage!.index).not.toBe(first[0].passage!.index);
			expect(second.slice(1).every((p) => p.restBars === undefined && !p.countIn)).toBe(true);
		});

		it('rest before the same index again after a passed passage, never before a passage played again', () => {
			const s = source([LINK_PASSAGES], triadCards('chord-anchor', 'D', 'maj', G_B_E));
			const clock = { now: NOW };
			const first = playPassage(s, clock);
			const second = playPassage(s, clock, () => false);
			const again = playPassage(s, clock);
			expect(first[0].restBars).toBeUndefined();
			expect(second[0].passage!.index).toBe(first[0].passage!.index);
			expect(second[0]).toMatchObject({ countIn: true, restBars: 1 });
			expect(again[0].passage!.each).toEqual(second[0].passage!.each);
			expect(again[0].countIn).toBe(true);
			expect(again[0].restBars).toBeUndefined();
		});

		it('rest after another exercise’s passage', () => {
			const cards = [...triadCards('chord-anchor', 'D', 'maj', G_B_E), ...ALL_OPEN];
			const s = source([JAM_PASSAGES, LINK_PASSAGES], cards);
			const clock = { now: NOW };
			playPassage(s, clock);
			expect(playPassage(s, clock)[0]).toMatchObject({ countIn: true, restBars: 1 });
		});
	});

	describe('unplayable passages', () => {
		const zones = (list: readonly (readonly [number, number])[]): ExerciseDefinition => ({
			...ZONE_PASSAGES,
			id: 'test-zones',
			passages: { ...ZONE_PASSAGES.passages!, each: { zone: list } }
		});

		it('skips a passage where a round admits no member, to the next values of its index', () => {
			const s = source([
				zones([
					[30, 34],
					[1, 5]
				])
			]);
			const clock = { now: NOW };
			expect(playPassage(s, clock)[0].passage!.each.zone).toEqual([1, 5]);
			expect(playPassage(s, clock)[0].passage!.each.zone).toEqual([1, 5]);
		});

		it('leaves out an index with nothing playable, then the exercise, and ends when nothing is left', () => {
			const none = zones([
				[30, 34],
				[40, 44]
			]);
			const s = source([none, JAM_PASSAGES]);
			const clock = { now: NOW };
			expect(playPassage(s, clock)[0].exerciseId).toBe(JAM_PASSAGES.id);
			expect(playPassage(s, clock)[0].exerciseId).toBe(JAM_PASSAGES.id);
			expect(source([none]).next(at(NOW))).toBeNull();
		});

		it('takes a content that cannot be compiled for unplayable', () => {
			const unreadable = zones([['nope', 5] as unknown as [number, number]]);
			expect(source([unreadable]).next(at(NOW))).toBeNull();
		});

		it('skips a passage whose round cannot compile with its values, without a throw', () => {
			// A window read from a passage param: its second value is no number.
			const [expectation] = ZONE_PASSAGES.round!.expectations;
			const definition = {
				...zones([[1, 5]]),
				passages: { ...ZONE_PASSAGES.passages!, each: { zone: [[1, 5]], w: [80, 'x'] } },
				round: {
					...ZONE_PASSAGES.round!,
					expectations: [{ ...expectation, window: { ms: { param: 'w' } } }]
				}
			} as ExerciseDefinition;
			const s = source([definition]);
			const clock = { now: NOW };
			const served = [...playPassage(s, clock), ...playPassage(s, clock)];
			expect(served.map((planned) => planned.passage!.each.w)).toEqual(
				Array(served.length).fill(80)
			);
			for (const planned of served) {
				expect(() => contentOf(definition, planned)).not.toThrow();
			}
		});

		it('lets a programming error through', () => {
			const spy = vi.spyOn(chordShapes, 'members').mockImplementation(() => {
				throw new TypeError('a bug');
			});
			try {
				expect(() => source([JAM_PASSAGES]).next(at(NOW))).toThrow(TypeError);
				const free = { ...JAM_PASSAGES, passages: { ...JAM_PASSAGES.passages!, opens: undefined } };
				expect(() => source([free]).next(at(NOW))).toThrow(TypeError);
			} finally {
				spy.mockRestore();
			}
		});

		it('skips a passage with no member, and an index the family cannot read, without throwing', () => {
			const empty: ExerciseDefinition = {
				...LINK_PASSAGES,
				id: 'test-empty',
				passages: {
					...LINK_PASSAGES.passages!,
					members: { family: 'chord-shapes', where: [{ in: { frets: [30, 34] } }] },
					opens: undefined
				}
			};
			const broken: ExerciseDefinition = {
				...JAM_PASSAGES,
				id: 'test-broken',
				passages: { ...JAM_PASSAGES.passages!, of: { grid: ['no-such-grid'] }, opens: undefined }
			};
			expect(source([empty]).next(at(NOW))).toBeNull();
			expect(source([broken]).next(at(NOW))).toBeNull();
			expect(source([empty, broken, CLIMB_PASSAGES]).next(at(NOW))!.exerciseId).toBe(
				CLIMB_PASSAGES.id
			);
		});
	});

	describe('the previous member', () => {
		const cards = iohefy('chord-anchor', G_B_E);

		it('gives the member heard to the next round of the passage, whatever the verdict and its chord, and none to a new passage', () => {
			const s = source([CLIMB_PASSAGES], cards);
			const clock = { now: NOW };
			const first = s.next(at(clock.now))!;
			const [dm] = shapesOf('Dm', G_B_E);
			s.record(attemptOf(first, ++clock.now, false, dm.id), clock.now);
			const second = s.next(at(clock.now))!;
			expect(second.passage!.previous).toBe(dm.id);
			// Nothing readable heard: the previous member stays.
			s.record(attemptOf(second, ++clock.now, false, null), clock.now);
			const third = s.next(at(clock.now))!;
			expect(third.passage!.previous).toBe(dm.id);
			// A shape of another chord than the round's is heard too: it still rings.
			const ab = shapesOf('Ab', D_G_B)[0];
			s.record(attemptOf(third, ++clock.now, false, ab.id), clock.now);
			const fourth = s.next(at(clock.now))!;
			expect(fourth.passage!.previous).toBe(ab.id);
			for (let rank = 4; rank < IOHEFY_CHANGES; rank++) s.next(at(clock.now));
			expect(s.next(at(clock.now))!.passage!.previous).toBeNull();
		});

		it('makes it the previous member of the round’s content, by its identity', () => {
			const s = source([CLIMB_PASSAGES], cards);
			const first = s.next(at(NOW))!;
			const [dm] = shapesOf('Dm', G_B_E);
			s.record(attemptOf(first, NOW + 1, true, dm.id), NOW + 1);
			const second = s.next(at(NOW + 2))!;
			expect(contentOf(CLIMB, second)).toEqual({
				family: 'chord-shapes',
				index: { chord: triadOf('G'), strings: [3, 2, 1] },
				selection: {
					family: 'chord-shapes',
					where: [{ position: { beyond: 'previous', toward: 'up', turns: true } }]
				},
				previous: dm.id
			});
		});
	});

	it('turns the direction where the neck runs out, for the rest of the passage; the next passage reads the one it started with', () => {
		const cards = iohefy('chord-anchor', G_B_E);
		const s = source([CLIMB_PASSAGES], cards);
		const clock = { now: NOW };
		const position = (id: string) => {
			const found = chordShapes.member(id)!;
			return Math.min(...[chordShapes.attributes.position(found)].flat());
		};
		const g = shapesOf('G', G_B_E);
		const highest = g.reduce((a, b) => (position(a.id) >= position(b.id) ? a : b));
		// No shape of Dm (the third change) lies beyond the highest G (the second).
		expect(shapesOf('Dm', G_B_E).every((shape) => position(shape.id) <= position(highest.id))).toBe(
			true
		);

		const first = s.next(at(clock.now))!;
		s.record(attemptOf(first, ++clock.now), clock.now);
		const second = s.next(at(clock.now))!;
		expect(second.passage!.each).toEqual({ direction: 'up' });
		s.record(attemptOf(second, ++clock.now, true, highest.id), clock.now);
		const third = s.next(at(clock.now))!;
		expect(third.passage!.each).toEqual({ direction: 'down' });
		expect((contentOf(CLIMB, third).selection.where ?? [])[0]).toEqual({
			position: { beyond: 'previous', toward: 'down', turns: true }
		});
		s.record(attemptOf(third, ++clock.now), clock.now);
		const fourth = s.next(at(clock.now))!;
		expect(fourth.passage!.each).toEqual({ direction: 'down' });
		for (let rank = 4; rank < IOHEFY_CHANGES; rank++) s.next(at(clock.now));
		// Started up: the next passage starts down, as without the turn.
		expect(s.next(at(clock.now))!.passage!.each).toEqual({ direction: 'down' });
	});

	it('writes no scope when the index has no value under the name passages.scope gives', () => {
		const scoped: ExerciseDefinition = {
			...CLIMB_PASSAGES,
			passages: { ...CLIMB_PASSAGES.passages!, scope: 'nope' }
		};
		const planned = source([scoped], iohefy('chord-anchor', G_B_E)).next(at(NOW))!;
		expect(planned.scope).toBeUndefined();
	});

	it('turns a passage param once in a round, however many of its contents turn', () => {
		const round = CLIMB_PASSAGES.round!;
		const twice: ExerciseDefinition = {
			...CLIMB_PASSAGES,
			round: { ...round, expectations: [round.expectations[0], round.expectations[0]] }
		};
		const s = source([twice], iohefy('chord-anchor', G_B_E));
		const clock = { now: NOW };
		const highest = shapesOf('G', G_B_E).at(-1)!;
		const first = s.next(at(clock.now))!;
		s.record(attemptOf(first, ++clock.now), clock.now);
		const second = s.next(at(clock.now))!;
		s.record(attemptOf(second, ++clock.now, true, highest.id), clock.now);
		expect(s.next(at(clock.now))!.passage!.each).toEqual({ direction: 'down' });
	});

	describe('leave: an exercise that changed air leaves the session', () => {
		/** The triads of blues-f (F7, Bb7, C7) acquired on G-B-E. */
		const BLUES = (['F', 'Bb', 'C'] as const).flatMap((root) =>
			triadCards('chord-anchor', root, 'maj', G_B_E)
		);

		it('leaves out every index of an exercise without a scope, its passage under way dropped; the others go on in turn', () => {
			const s = source(PASSAGE_EXERCISES);
			const clock = { now: NOW };
			const first = s.next(at(clock.now))!;
			expect(first.exerciseId).toBe(LINK_PASSAGES.id);
			expect(s.leave!(LINK_PASSAGES.id)).toBe(true);
			// The link's passage under way is not served on: the next exercise in turn, counted in.
			const next = s.next(at(clock.now))!;
			expect(next).toMatchObject({ exerciseId: CLIMB_PASSAGES.id, countIn: true });
			expect(next.passage!.rank).toBe(0);
			for (let rank = 1; rank < next.passage!.length; rank++) s.next(at(clock.now));
			const exercises = Array.from({ length: 6 }, () => playPassage(s, clock)[0].exerciseId);
			expect(exercises).not.toContain(LINK_PASSAGES.id);
			expect(new Set(exercises)).toEqual(
				new Set([CLIMB_PASSAGES.id, ZONE_PASSAGES.id, JAM_PASSAGES.id])
			);
		});

		it('leaves out only the scope named: the other grid of the exercise goes on', () => {
			const s = source([CLIMB_PASSAGES], [...iohefy('chord-anchor', G_B_E), ...BLUES]);
			const clock = { now: NOW };
			const first = playPassage(s, clock)[0];
			expect(first.scope).toBe('iohefy-a');
			expect(s.leave!(CLIMB_PASSAGES.id, 'iohefy-a')).toBe(true);
			const scopes = Array.from({ length: 4 }, () => playPassage(s, clock)[0].scope);
			expect(scopes).toEqual(Array(4).fill('blues-f'));
		});

		it('answers false once nothing is left to serve, and serves nothing more', () => {
			const s = source([CLIMB_PASSAGES], [...iohefy('chord-anchor', G_B_E), ...BLUES]);
			s.next(at(NOW));
			expect(s.leave!(CLIMB_PASSAGES.id, 'iohefy-a')).toBe(true);
			expect(s.leave!(CLIMB_PASSAGES.id, 'blues-f')).toBe(false);
			expect(s.next(at(NOW))).toBeNull();
		});

		it('answers false when the exercise left was the only one open', () => {
			const s = source(PASSAGE_EXERCISES, triadCards('chord-anchor', 'D', 'maj', G_B_E));
			expect(s.next(at(NOW))!.exerciseId).toBe(LINK_PASSAGES.id);
			expect(s.leave!(LINK_PASSAGES.id)).toBe(false);
			expect(s.next(at(NOW))).toBeNull();
		});
	});

	describe('the work of finding a passage', () => {
		/**
		 * A grid of the most changes, C and F in turn, and the same grid ending on an A, a chord the
		 * catalog's grids do not play.
		 */
		const LONG = 'test-long-grid';
		const ENDS_ON_A = 'test-long-grid-a';
		const grid = alternatingGrid(LONG, 256);
		registerGrid({ ...grid, beatsPerBar: 4 }, 'test');
		registerGrid(
			{
				...grid,
				id: ENDS_ON_A,
				beatsPerBar: 4,
				chords: [...grid.chords.slice(0, -1), { ...grid.chords.at(-1)!, symbol: 'A' }]
			},
			'test'
		);
		/** The zone on `gridId`, open without cards, with the most values of its zone. */
		const zoneOn = (id: string, gridId: string): ExerciseDefinition => ({
			...ZONE_PASSAGES,
			id,
			passages: {
				...ZONE_PASSAGES.passages!,
				of: { grid: [gridId] },
				each: { zone: Array.from({ length: 64 }, () => [0, 24]) },
				opens: undefined
			}
		});
		/** Each of its passages fails at its last round, where no shape of A is admitted. */
		const failing = (id: string) => zoneOn(id, ENDS_ON_A);
		const A = JSON.stringify(triadOf('A'));
		/** Counts the shapes asked of the family (once a round here), A's none. */
		function withoutA(): { rounds: () => number; restore: () => void } {
			const members = chordShapes.members.bind(chordShapes);
			let rounds = 0;
			const spy = vi.spyOn(chordShapes, 'members').mockImplementation((index) => {
				rounds++;
				return JSON.stringify(index.chord) === A ? [] : members(index);
			});
			return { rounds: () => rounds, restore: () => spy.mockRestore() };
		}

		it('leaves out the indices whose passages fail at their last round for every value, within their tries, and serves the next exercise in the same call', () => {
			const counted = withoutA();
			try {
				const s = source([failing('test-failing-1'), failing('test-failing-2'), JAM_PASSAGES]);
				const start = performance.now();
				const served = s.next(at(NOW))!;
				const ms = performance.now() - start;
				expect(served.exerciseId).toBe(JAM_PASSAGES.id);
				// Each failing index stops once its failed tries pass its bound: at most one passage more.
				const cost = roundCheckCost(failing('x'));
				const passage = 256 * cost;
				expect(counted.rounds() * cost).toBeLessThanOrEqual(2 * (MAX_PASSAGE_TRIES + passage));
				// Measured 28 to 47 ms here (Apple M3 Pro): a tripwire at about three times that.
				expect(ms).toBeLessThan(wallClockMs(150));
				const clock = { now: NOW };
				for (let rank = 1; rank < served.passage!.length; rank++) s.next(at(clock.now));
				const exercises = Array.from({ length: 3 }, () => playPassage(s, clock)[0].exerciseId);
				expect(exercises).toEqual(Array(3).fill(JAM_PASSAGES.id));
			} finally {
				counted.restore();
			}
		});

		it('serves a playable passage, however much more than its tries it weighs', () => {
			const heavy = zoneOn('test-heavy', LONG);
			expect(256 * roundCheckCost(heavy)).toBeGreaterThan(MAX_PASSAGE_TRIES);
			const served = source([heavy]).next(at(NOW))!;
			expect(served.exerciseId).toBe('test-heavy');
			expect(served.passage!.length).toBe(256);
		});

		it('finds a passage of every index of the catalog, with each value of its passage params, far within its tries', () => {
			for (const definition of PASSAGE_EXERCISES) {
				const cost = roundCheckCost(definition);
				const lists = Object.entries(definition.passages!.each ?? {});
				const tries = Math.max(1, ...lists.map(([, values]) => values.length));
				for (const index of passageIndices(definition)) {
					for (let k = 0; k < tries; k++) {
						const each = Object.fromEntries(
							lists.map(([name, values]) => [name, values[k % values.length]])
						);
						const members = passageMembers(definition, index, each);
						expect(members.length * cost, `${definition.id} ${index.key} ${k}`).toBeLessThan(
							MAX_PASSAGE_TRIES / 20
						);
					}
				}
			}
			expect(gridById(LONG).chords).toHaveLength(256);
		});
	});

	describe('the end of the session', () => {
		it('starts no passage once the session’s length has passed, and ends none under way', () => {
			const s = source([CLIMB_PASSAGES], iohefy('chord-anchor', G_B_E), [], 60_000);
			const first = s.next(at(NOW, 0))!;
			expect(s.next(at(NOW, 60_000))!.passage!.rank).toBe(1);
			for (let rank = 2; rank < first.passage!.length; rank++) s.next(at(NOW, 60_000));
			expect(s.next(at(NOW, 60_000))).toBeNull();
		});

		it('starts no passage once fatigued', () => {
			const s = source([CLIMB_PASSAGES], iohefy('chord-anchor', G_B_E));
			const first = s.next(at(NOW))!;
			for (let rank = 1; rank < first.passage!.length; rank++) s.next(at(NOW));
			expect(s.next({ now: NOW, elapsedMs: 0, fatigued: true })).toBeNull();
		});

		it('serves nothing when nothing is open', () => {
			expect(source(PASSAGE_EXERCISES, []).next(at(NOW))).toBeNull();
		});
	});
});
