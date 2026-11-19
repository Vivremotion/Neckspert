import { beforeAll, describe, expect, it } from 'vitest';
import { ladderOf } from '../exercise/ladder';
import type { ExerciseDefinition, ExerciseId } from '../exercise/types';
import { parseVoicingKey, voicingOccurrences } from '../music';
import { graduateToReview } from '../progress/scheduling';
import { occurrencePosition } from '../triads/position';
import { cardKey, type Attempt, type CardKey, type CardState, type SkillId } from '../types';
import { LOCATE_NECK, TRIADS_ZONE } from '$lib/testing/catalog';
import {
	registerTestSkills,
	TEST_NOTE_SKILL,
	TEST_OTHER_NOTE_SKILL,
	TEST_PLACED_VOICING_SKILL
} from '$lib/testing/testSkills';
import { exerciseSubject } from './exerciseSubject';
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
	options: { learning?: Record<string, unknown>; fading?: boolean } = {}
): ExerciseDefinition {
	const { fading: _fading, ...presentation } = LOCATE_NECK.presentation!;
	return {
		...LOCATE_NECK,
		id: id as ExerciseId,
		practices: skill,
		items,
		params: { ...LOCATE_NECK.params, learning: options.learning },
		presentation: options.fading ? LOCATE_NECK.presentation : presentation
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
		scheduling: { ...graduateToReview(0), due: fields.due ?? 1e15 }
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

	it('serves its reviews when its entry condition never opens, and introduces nothing', () => {
		const entering = exerciseOn('entering', B, ['5:C', '6:G'], {
			learning: { enter: { acquired: { skill: A, item: 'same' } } }
		});
		const procedure = createLearningProcedure({
			subject: exerciseSubject({ exercises: [entering], attempts: [] }),
			cards: [card(B, '6:G', { learnedAt: 0, acquiredAt: 0, due: 0 }), card(A, '5:C')],
			attempts: [],
			levels: [],
			sessionId: 'session',
			random: () => 0
		});
		expect(procedure.next(at(1000))).toMatchObject({
			skill: B,
			item: note('6:G'),
			phase: 'review'
		});
		for (let prompt = 0; prompt < 5; prompt++) {
			expect(procedure.next(at(1000))?.phase ?? null).not.toBe('probe');
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
				levels: [],
				sessionId: 'session',
				random: () => 0
			});
		// Removed from the list, its due card is not served; put back, it is reviewed first.
		expect(procedureOf(['5:C']).next(at(1000))).toMatchObject({
			item: note('5:C'),
			phase: 'probe'
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

	it('presents a missed probe at once unless one of its exercises says otherwise', () => {
		const first = exerciseOn('first', A, ['5:C']);
		const waiting = exerciseOn('waiting', B, ['5:C'], { learning: { presentAtOnce: false } });
		expect(exerciseSubject({ exercises: [first], attempts: [] }).presentsAtOnce).toBe(true);
		expect(exerciseSubject({ exercises: [first, waiting], attempts: [] }).presentsAtOnce).toBe(
			false
		);
	});

	it('tells a confusion recorded in an attempt, and the skills whose prompt fades an aid', () => {
		const subject = exerciseSubject({
			exercises: [exerciseOn('fading', A, ['5:C'], { fading: true }), exerciseOn('plain', B, [])],
			attempts: []
		});
		const planned = {
			exerciseId: 'fading' as ExerciseId,
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
		expect(subject.fadingAid(A)).toBe(true);
		expect(subject.fadingAid(B)).toBe(false);
	});

	it('draws what a prompt asks from the item last asked of its card', () => {
		const zone = TRIADS_ZONE.practices;
		const voicing = TRIADS_ZONE.items![0] as string;
		const positions = voicingOccurrences(parseVoicingKey(voicing)).map(occurrencePosition);
		expect(positions.length).toBeGreaterThan(1);
		const asked = (position: number | 'open', promptedAt: number): Attempt =>
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
					data: { item: { voicingKey: voicing, position } }
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
			const item = subject.promptItem!(ref, () => r) as { voicingKey: string; position: unknown };
			expect(item.voicingKey).toBe(voicing);
			expect(positions).toContain(item.position);
			// Then what it last drew in this session.
			expect(item.position).not.toBe(last);
			last = item.position as number | 'open';
		}
	});

	it('asks a card’s own item, drawing nothing, when its exercise writes no draw', () => {
		const subject = exerciseSubject({
			exercises: [exerciseOn('first', A, ['5:C'])],
			attempts: []
		});
		const random = () => {
			throw new Error('no draw');
		};
		const item = subject.promptItem?.({ skill: A, item: note('5:C') }, random);
		expect(item ?? note('5:C')).toEqual(note('5:C'));
	});
});
