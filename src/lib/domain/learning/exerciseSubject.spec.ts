import { beforeAll, describe, expect, it } from 'vitest';
import { ladderOf } from '../exercise/ladder';
import type { ExerciseDefinition, ExerciseId } from '../exercise/types';
import { parseVoicingKey, voicingOccurrences } from '../music';
import { Rating, introScheduling, reviewScheduling } from '../progress/scheduling';
import { occurrencePosition } from '../triads/position';
import {
	cardKey,
	type Attempt,
	type CardKey,
	type CardState,
	type PlannedItem,
	type SkillId
} from '../types';
import type { LevelState } from '../time/levels';
import { LOCATE_NECK, TRIADS_ZONE } from '$lib/testing/catalog';
import {
	registerTestSkills,
	TEST_NOTE_SKILL,
	TEST_OTHER_NOTE_SKILL,
	TEST_PLACED_VOICING_SKILL
} from '$lib/testing/testSkills';
import { setOfSkill } from '../sets';
import { IDENTIFY_NECK } from '$lib/testing/catalog';
import { exerciseSubject, firstReady } from './exerciseSubject';
import { itemLearningOf } from './params';
import { createLearningProcedure } from './procedure';
import { attemptOf } from './testing/fakeSubject';

const A = TEST_NOTE_SKILL.id as SkillId;
const B = TEST_OTHER_NOTE_SKILL.id as SkillId;
const NO_HISTORY = new Map<CardKey, readonly Attempt[]>();
const NOTHING_BLOCKED = () => false;
const at = (now: number) => ({ now, elapsedMs: 0, fatigued: false });

beforeAll(registerTestSkills);

/** An exercise on the notes on a string, like locate, practising `skill` over `items`. */
function exerciseOn(
	id: string,
	skill: SkillId,
	items: readonly string[],
	options: { learning?: Record<string, unknown> } = {}
): ExerciseDefinition {
	return {
		...LOCATE_NECK,
		id: id as ExerciseId,
		practices: skill,
		items,
		params: { ...LOCATE_NECK.params, learning: options.learning }
	};
}

/** The top of the ladder locate writes, held by `item` in exercise `id`: where it reviews cold. */
function topOf(id: string, item: string): LevelState {
	return {
		exerciseId: id as ExerciseId,
		scope: '',
		item,
		level: ladderOf(LOCATE_NECK).length - 1,
		successes: 0,
		failures: 0
	};
}

const note = (key: string) => {
	const [string, pitch] = key.split(':');
	return { string: Number(string), pitch };
};

/** A card of `skill` on the note `key` (`6:G`); `learnedAt`/`acquiredAt`/`due` set as given. */
function card(
	skill: SkillId,
	key: string,
	fields: { learnedAt?: number; acquiredAt?: number; due?: number } = {}
): CardState {
	const learnedAt = fields.learnedAt ?? null;
	return {
		key: cardKey(skill, key),
		skill,
		item: note(key),
		introducedAt: 0,
		introducedInSession: 'past',
		learnedAt,
		acquiredAt: fields.acquiredAt ?? null,
		masteredAt: null,
		scheduling: {
			...reviewScheduling(introScheduling(0), Rating.Easy, 0),
			due: fields.due ?? 1e15
		}
	};
}

describe('exerciseSubject', () => {
	it('reads what each skill learns from the exercise that practises it', () => {
		const first = exerciseOn('first', A, ['5:C'], { learning: { retestGaps: [1, 3] } });
		const subject = exerciseSubject({ exercises: [first], attempts: [] });
		expect(subject.exerciseOf(A)).toBe('first');
		expect(subject.ladder(A)).toEqual(ladderOf(first));
		expect(subject.itemLearning(A)).toEqual(itemLearningOf(first));
		expect(subject.itemLearning(A).retestGaps).toEqual([1, 3]);
		expect(subject.itemKey({ skill: A, item: note('5:C') })).toBe('5:C');
		expect(() => subject.exerciseOf(B)).toThrow();
	});

	it('introduces an exercise’s items in the order of its list', () => {
		const subject = exerciseSubject({
			exercises: [exerciseOn('first', A, ['5:C', '6:G', '4:F'])],
			attempts: []
		});
		expect(subject.nextNew([], NO_HISTORY, NOTHING_BLOCKED)).toEqual({
			skill: A,
			item: note('5:C')
		});
		expect(subject.nextNew([card(A, '5:C')], NO_HISTORY, NOTHING_BLOCKED)).toEqual({
			skill: A,
			item: note('6:G')
		});
		// A card of the same item under another skill is not this one's.
		expect(subject.nextNew([card(B, '5:C')], NO_HISTORY, NOTHING_BLOCKED)).toEqual({
			skill: A,
			item: note('5:C')
		});
		const all = ['5:C', '6:G', '4:F'].map((key) => card(A, key));
		expect(subject.nextNew(all, NO_HISTORY, NOTHING_BLOCKED)).toBeNull();
	});

	it('lets the next item pass a blocked one, and the next exercise pass an exercise with none', () => {
		const subject = exerciseSubject({
			exercises: [exerciseOn('first', A, ['5:C', '6:G']), exerciseOn('second', B, ['4:F'])],
			attempts: []
		});
		const blocked = (ref: { item: unknown }) => subject.itemKey({ skill: A, item: ref.item });
		expect(
			subject.nextNew([], NO_HISTORY, (ref) => ref.skill === A && blocked(ref) === '5:C')
		).toEqual({ skill: A, item: note('6:G') });
		expect(subject.nextNew([], NO_HISTORY, (ref) => ref.skill === A)).toEqual({
			skill: B,
			item: note('4:F')
		});
		expect(subject.nextNew([], NO_HISTORY, () => true)).toBeNull();
	});

	it('lets an item enter once the item it names is acquired, in the whole store', () => {
		const entering = exerciseOn('entering', B, ['5:C', '6:G'], {
			learning: { enter: { acquired: { skill: A, item: 'same' } } }
		});
		// The skill named is not one of the subject's: its cards are only read.
		const subject = exerciseSubject({ exercises: [entering], attempts: [] });
		expect(subject.nextNew([], NO_HISTORY, NOTHING_BLOCKED)).toBeNull();
		const learnedOnly = [card(A, '5:C', { learnedAt: 0 }), card(A, '6:G', { learnedAt: 0 })];
		expect(subject.nextNew(learnedOnly, NO_HISTORY, NOTHING_BLOCKED)).toBeNull();
		const acquired = [
			card(A, '5:C', { learnedAt: 0 }),
			card(A, '6:G', { learnedAt: 0, acquiredAt: 0 })
		];
		expect(subject.nextNew(acquired, NO_HISTORY, NOTHING_BLOCKED)).toEqual({
			skill: B,
			item: note('6:G')
		});
	});

	it('keys a listed item as its set writes it', () => {
		// The set of placed notes reads « 6:05 » and writes « 6:5 ».
		const skill = IDENTIFY_NECK.practices;
		const { learning: _learning, ...params } = IDENTIFY_NECK.params;
		const listing = { ...IDENTIFY_NECK, params, items: ['6:05', '5:3'] };
		const subject = exerciseSubject({ exercises: [listing], attempts: [] });
		expect(subject.owns({ skill, key: cardKey(skill, '6:5') })).toBe(true);
		const introduced = subject.nextNew([], NO_HISTORY, NOTHING_BLOCKED)!;
		expect(subject.owns({ skill, key: cardKey(skill, subject.itemKey(introduced)) })).toBe(true);
		const existing: CardState = { ...card(A, '5:C'), key: cardKey(skill, '6:5'), skill };
		expect(subject.nextNew([existing], NO_HISTORY, NOTHING_BLOCKED)).toEqual({
			skill,
			item: { string: 5, fret: 3 }
		});
	});

	it('never lets in an item its correspondence names nothing for, and lets the next one', () => {
		// No registered correspondence names nothing: one written here, without registering it.
		const set = setOfSkill(A);
		const items = ['5:C', '6:G'].map((key) => ({ key: cardKey(B, key), item: note(key) }));
		const entry = {
			skill: A,
			set,
			correspondence: {
				of: (item: unknown) => ((item as { string: number }).string === 5 ? null : item)
			},
			recall: () => false
		};
		const acquired = [card(A, '5:C', { acquiredAt: 0 }), card(A, '6:G', { acquiredAt: 0 })];
		const byKey = new Map(acquired.map((stored) => [stored.key, stored]));
		expect(firstReady(B, items, entry, byKey, NO_HISTORY, NOTHING_BLOCKED)).toEqual({
			skill: B,
			item: note('6:G')
		});
		expect(firstReady(B, items.slice(0, 1), entry, byKey, NO_HISTORY, NOTHING_BLOCKED)).toBeNull();
	});

	it('lets a note follow its mirror: the same card alone is never served twice in a row', () => {
		// A on the low E string and E on the A string mirror each other; both learned, nothing new.
		const exercise = exerciseOn('mirrors', A, ['6:A', '5:E']);
		for (let seed = 1; seed <= 20; seed++) {
			let state = seed;
			const random = () => (state = (state * 1_664_525 + 1_013_904_223) >>> 0) / 2 ** 32;
			const procedure = createLearningProcedure({
				subject: exerciseSubject({ exercises: [exercise], attempts: [] }),
				cards: [card(A, '6:A', { learnedAt: 0 }), card(A, '5:E', { learnedAt: 0 })],
				attempts: [],
				levels: [],
				sessionId: 'session',
				random
			});
			const served = Array.from({ length: 6 }, () => procedure.next(at(1000))?.item);
			expect(served.every((item) => item !== undefined)).toBe(true);
			for (let i = 1; i < served.length; i++) expect(served[i]).not.toEqual(served[i - 1]);
		}
	});

	it('serves its reviews when its entry condition never opens, and introduces nothing', () => {
		const entering = exerciseOn('entering', B, ['5:C', '6:G'], {
			learning: { enter: { acquired: { skill: A, item: 'same' } } }
		});
		const procedure = createLearningProcedure({
			subject: exerciseSubject({ exercises: [entering], attempts: [] }),
			cards: [card(B, '6:G', { learnedAt: 0, acquiredAt: 0, due: 0 }), card(A, '5:C')],
			attempts: [],
			levels: [topOf('entering', '6:G')],
			sessionId: 'session',
			random: () => 0
		});
		expect(procedure.next(at(1000))).toMatchObject({
			skill: B,
			item: note('6:G'),
			phase: 'review'
		});
		for (let prompt = 0; prompt < 5; prompt++) {
			expect(procedure.next(at(1000))?.item ?? null).not.toEqual(note('5:C'));
		}
	});

	it('owns only the cards of the items its exercises list', () => {
		const due = card(A, '6:G', { learnedAt: 0, acquiredAt: 0, due: 0 });
		const without = exerciseSubject({
			exercises: [exerciseOn('first', A, ['5:C'])],
			attempts: []
		});
		expect(without.owns(due)).toBe(false);
		expect(without.owns({ skill: A, key: cardKey(A, '5:C') })).toBe(true);
		expect(without.owns({ skill: B, key: cardKey(B, '5:C') })).toBe(false);
		const procedureOf = (items: readonly string[]) =>
			createLearningProcedure({
				subject: exerciseSubject({ exercises: [exerciseOn('first', A, items)], attempts: [] }),
				cards: [due],
				attempts: [],
				levels: [topOf('first', '6:G')],
				sessionId: 'session',
				random: () => 0
			});
		// Removed from the list, its due card is not served; put back, it is reviewed first.
		expect(procedureOf(['5:C']).next(at(1000))).toMatchObject({
			item: note('5:C'),
			phase: 'learning',
			level: 0
		});
		expect(procedureOf(['5:C', '6:G']).next(at(1000))).toMatchObject({
			item: note('6:G'),
			phase: 'review'
		});
	});

	it('refuses two exercises on one skill, and an exercise whose skill has no cards', () => {
		expect(() =>
			exerciseSubject({
				exercises: [exerciseOn('first', A, ['5:C']), exerciseOn('second', A, ['6:G'])],
				attempts: []
			})
		).toThrow(`two exercises practise skill "${A}"`);
		expect(() =>
			exerciseSubject({
				exercises: [exerciseOn('cardless', TEST_PLACED_VOICING_SKILL.id as SkillId, [])],
				attempts: []
			})
		).toThrow('"cardless" practises a skill without cards');
	});

	it('retests a new item on the ladder locate writes after the long gap once right and the short one once missed, at any level', () => {
		const [shortGap, longGap] = itemLearningOf(LOCATE_NECK).retestGaps;
		expect(shortGap).toBeLessThan(longGap);
		const keys = ['5:C', '6:G', '4:F', '3:A', '2:D', '1:G', '5:D', '6:A'];
		const exercise = exerciseOn('first', A, keys);
		const others = keys.slice(1).map((key) => card(A, key, { learnedAt: 0, acquiredAt: 0 }));
		const subject = exerciseSubject({ exercises: [exercise], attempts: [] });
		const source = createLearningProcedure({
			subject,
			cards: others,
			attempts: [],
			levels: [],
			sessionId: 'session',
			random: () => 0
		});
		const isNew = (item: PlannedItem) => subject.itemKey(item) === '5:C';
		const attempt = (item: PlannedItem, success: boolean) =>
			attemptOf(item, { success, cardKey: cardKey(A, subject.itemKey(item)) });
		/** Serves the others, played right, until the new item comes back; how many came between. */
		const othersUntilBack = () => {
			for (let between = 0; between < 20; between++) {
				const item = source.next(at(0))!;
				if (isNew(item)) return { between, leadBeats: item.leadBeats };
				source.record(attempt(item, true), 0);
			}
			throw new Error('the new item never came back');
		};
		const first = source.next(at(0))!;
		expect(isNew(first)).toBe(true);
		expect(first).toMatchObject({ level: 0, leadBeats: 8 });
		let served = first;
		const play = (success: boolean) => {
			source.record(attempt(served, success), 0);
			const back = othersUntilBack();
			served = { ...served, leadBeats: back.leadBeats };
			return back;
		};
		// Right at level 1: the long gap, at level 2.
		expect(play(true)).toEqual({ between: longGap, leadBeats: 4 });
		// Missed at level 2: the short gap, back at level 1.
		expect(play(false)).toEqual({ between: shortGap, leadBeats: 8 });
		expect(play(true)).toEqual({ between: longGap, leadBeats: 4 });
		expect(play(true)).toEqual({ between: longGap, leadBeats: 2 });
		// Missed at the top: the short gap.
		expect(play(false)).toEqual({ between: shortGap, leadBeats: 4 });
	});

	it('tells a confusion recorded in an attempt', () => {
		const subject = exerciseSubject({
			exercises: [exerciseOn('confusing', A, ['5:C']), exerciseOn('plain', B, [])],
			attempts: []
		});
		const planned = {
			exerciseId: 'confusing' as ExerciseId,
			skill: A,
			item: note('5:C'),
			phase: 'review' as const,
			temperature: 'cold' as const
		};
		expect(subject.confused(attemptOf(planned, { data: { confusion: { kind: 'octave' } } }))).toBe(
			true
		);
		expect(subject.confused(attemptOf(planned, { data: { confusion: null } }))).toBe(false);
		expect(subject.confused(attemptOf(planned, { data: null }))).toBe(false);
	});

	it('draws what a prompt asks from the item last asked of its card', () => {
		const zone = TRIADS_ZONE.practices;
		const voicing = TRIADS_ZONE.items![0] as string;
		const positions = voicingOccurrences(parseVoicingKey(voicing)).map(occurrencePosition);
		expect(positions.length).toBeGreaterThan(1);
		const asked = (
			position: number | 'open',
			promptedAt: number,
			data: unknown = { item: { voicingKey: voicing, position } }
		): Attempt =>
			attemptOf(
				{
					exerciseId: TRIADS_ZONE.id,
					skill: zone,
					item: voicing,
					phase: 'review',
					temperature: 'cold'
				},
				{
					at: promptedAt,
					cardKey: cardKey(zone, voicing),
					data
				}
			);
		// The latest attempt asked positions[0]; an older one positions[1].
		const subject = exerciseSubject({
			exercises: [TRIADS_ZONE],
			attempts: [asked(positions[0], 2), asked(positions[1], 1)]
		});
		const ref = { skill: zone, item: { voicingKey: voicing } };
		let last: number | 'open' = positions[0];
		for (const r of [0, 0.5, 0.99, 0]) {
			const item = subject.promptItem!(ref, () => r, 0) as {
				voicingKey: string;
				position: unknown;
			};
			expect(item.voicingKey).toBe(voicing);
			expect(positions).toContain(item.position);
			// Then what it last drew in this session.
			expect(item.position).not.toBe(last);
			last = item.position as number | 'open';
		}

		// Later attempts that hold no item leave the item last asked as it was.
		for (const r of [0, 0.5, 0.99]) {
			const itemless = exerciseSubject({
				exercises: [TRIADS_ZONE],
				attempts: [asked(positions[0], 1), asked(positions[1], 2, null), asked(positions[1], 3, {})]
			});
			const item = itemless.promptItem!(ref, () => r, 0) as { position: unknown };
			expect(item.position).not.toBe(positions[0]);
		}
	});

	describe('a member asked among those a selection admits', () => {
		const zone = TRIADS_ZONE.practices;
		const withAsks = (asks: unknown): ExerciseDefinition => ({
			...TRIADS_ZONE,
			params: {
				...TRIADS_ZONE.params,
				learning: { ...(TRIADS_ZONE.params.learning as object), asks }
			}
		});
		const OTHER = withAsks({ family: 'chord-shapes', where: [{ other: 'previous' }] });
		const shapesOf = (voicing: string) => voicingOccurrences(parseVoicingKey(voicing));
		const seeded = (seed: number) => () => {
			seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
			return seed / 2 ** 32;
		};
		type Asked = { voicingKey: string; position: number | 'open'; fret?: number };

		it('never asks the shape last asked when another exists, and a fret that shape covers', () => {
			const voicing = TRIADS_ZONE.items![0] as string;
			const shapes = shapesOf(voicing);
			expect(shapes.length).toBeGreaterThan(1);
			const subject = exerciseSubject({ exercises: [OTHER], attempts: [] });
			let last: Asked | null = null;
			for (let seed = 0; seed < 12; seed += 1) {
				const item = subject.promptItem!(
					{ skill: zone, item: { voicingKey: voicing } },
					seeded(seed),
					0
				) as Asked;
				expect(item.voicingKey).toBe(voicing);
				const shape = shapes.find((s) => occurrencePosition(s) === item.position);
				expect(shape).toBeDefined();
				if (last) expect(item.position).not.toBe(last.position);
				expect(shape!.notes.some((note) => note.fret === item.fret)).toBe(item.fret !== undefined);
				last = item;
			}
		});

		it('asks any shape without a previous one', () => {
			const voicing = TRIADS_ZONE.items![0] as string;
			const seen = new Set<unknown>();
			for (let r = 0; r < 40; r += 1) {
				const subject = exerciseSubject({ exercises: [OTHER], attempts: [] });
				const item = subject.promptItem!(
					{ skill: zone, item: { voicingKey: voicing } },
					() => r / 40,
					0
				) as Asked;
				seen.add(item.position);
			}
			expect(seen.size).toBe(shapesOf(voicing).length);
		});

		it('asks the only shape again when there is one', () => {
			const single = (TRIADS_ZONE.items as string[]).find(
				(voicing) => shapesOf(voicing).length === 1
			);
			expect(single).toBeDefined();
			const only = occurrencePosition(shapesOf(single!)[0]);
			const subject = exerciseSubject({ exercises: [OTHER], attempts: [] });
			for (let seed = 0; seed < 3; seed += 1) {
				const item = subject.promptItem!(
					{ skill: zone, item: { voicingKey: single! } },
					seeded(seed),
					0
				) as Asked;
				expect(item.position).toBe(only);
			}
		});

		it('asks the shapes of a voicing listed in another spelling', () => {
			const voicing = TRIADS_ZONE.items![0] as string;
			const written = voicing.replace(/(\d):/g, '0$1:');
			expect(written).not.toBe(voicing);
			const subject = exerciseSubject({
				exercises: [{ ...OTHER, items: [written] }],
				attempts: []
			});
			const card = { skill: zone, item: setOfSkill(zone).parseItem(written) };
			const item = subject.promptItem!(card, seeded(3), 0) as Asked;
			expect(item.voicingKey).toBe(voicing);
			expect(shapesOf(voicing).map(occurrencePosition)).toContain(item.position);
		});

		it('takes a stored item it cannot read for no previous one', () => {
			const voicing = TRIADS_ZONE.items![0] as string;
			const garbage = attemptOf(
				{
					exerciseId: TRIADS_ZONE.id,
					skill: zone,
					item: voicing,
					phase: 'review',
					temperature: 'cold'
				},
				{ at: 1, cardKey: cardKey(zone, voicing), data: { item: { voicingKey: '?', position: 1 } } }
			);
			const read = exerciseSubject({ exercises: [OTHER], attempts: [garbage] });
			const fresh = exerciseSubject({ exercises: [OTHER], attempts: [] });
			const card = { skill: zone, item: { voicingKey: voicing } };
			expect(read.promptItem!(card, seeded(5), 0)).toEqual(fresh.promptItem!(card, seeded(5), 0));
		});

		it('asks the card’s own item, drawing nothing, when the selection admits no member', () => {
			const none = withAsks({ family: 'chord-shapes', where: [{ in: { frets: [40, 41] } }] });
			const subject = exerciseSubject({ exercises: [none], attempts: [] });
			const random = () => {
				throw new Error('nothing to draw');
			};
			const item = { voicingKey: TRIADS_ZONE.items![0] as string };
			expect(subject.promptItem!({ skill: zone, item }, random, 0)).toBe(item);
		});
	});

	it('asks a card’s own item, drawing nothing, when its exercise asks no member', () => {
		const subject = exerciseSubject({
			exercises: [exerciseOn('first', A, ['5:C'])],
			attempts: []
		});
		const random = () => {
			throw new Error('no draw');
		};
		expect(subject.promptItem).toBeDefined();
		const item = subject.promptItem!({ skill: A, item: note('5:C') }, random, 0);
		expect(item).toEqual(note('5:C'));
	});
});
