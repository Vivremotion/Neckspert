import { describe, expect, it } from 'vitest';
import { IDENTIFY_NECK, LOCATE_NECK } from '$lib/domain/exercise/catalog';
import type { ExerciseDefinition, MechanicId } from '$lib/domain/exercise/types';
import { DEFAULT_TEMPO } from '$lib/domain/exercise/tempo';
import { ladderOf } from '$lib/domain/exercise/ladder';
import { createLearningProcedure } from '$lib/domain/learning/procedure';
import type { CardRef } from '$lib/domain/learning/subject';
import { attemptOf } from '$lib/domain/learning/testing/fakeSubject';
import {
	asNeckCard,
	isMirrorPair,
	neckCardKey,
	type LocateItem,
	type NeckCard
} from '$lib/domain/music';
import {
	LEAD_STEPS,
	type Attempt,
	type CardKey,
	type CardState,
	type PlannedItem
} from '$lib/domain/types';
import { LEARN_COLD_CAP, LEARN_SUCCESSES, MAX_WORKING_SET } from './constants';
import { introductionOrder } from './introduction';
import { neckSubject } from './neckSubject';
import { graduateToReview } from './scheduling';
import type { LevelState } from '$lib/domain/time/levels';

const LOCATE = 'locate' as MechanicId;
const IDENTIFY = 'identify' as MechanicId;
const DEFINITIONS = { locate: LOCATE_NECK, identify: IDENTIFY_NECK };
/** 80 bpm: a beat is 750 ms; leads 8, 4, 2 beats are 6 000, 3 000, 1 500 ms. */
const TEMPO = 80;
const NO_HISTORY = new Map<CardKey, readonly Attempt[]>();
const NOTHING_BLOCKED = () => false;
const PROMPTS = 40;

const locate = (item: LocateItem): CardRef => ({ mechanic: LOCATE, item });
const identify = (string: 1 | 2 | 3 | 4 | 5 | 6, fret: number): CardRef => ({
	mechanic: IDENTIFY,
	item: { string, fret }
});

/** A neck card in the store; `learnedAt`/`acquiredAt` set give it a review scheduling. */
function neckCard(
	card: NeckCard,
	fields: Partial<Pick<CardState, 'learnedAt' | 'acquiredAt'>> & { due?: number } = {}
): CardState {
	const learnedAt = fields.learnedAt ?? null;
	return {
		key: neckCardKey(card),
		mechanic: card.mechanic,
		item: card.item,
		introducedAt: 0,
		introducedInSession: 'past',
		// The card's stored lead, unread by the procedure (its level gives the lead).
		leadBeats: 2,
		learnedAt,
		acquiredAt: fields.acquiredAt ?? null,
		masteredAt: null,
		scheduling: { ...graduateToReview(0), due: fields.due ?? 1e15 }
	};
}

/** The attempt of a planned neck item, a success unless `success` is false. */
function answerOf(
	planned: PlannedItem,
	success: boolean,
	overrides: Parameters<typeof attemptOf>[1] = {}
): Attempt {
	return attemptOf(planned, {
		success,
		tempoBpm: TEMPO,
		cardKey: neckCardKey(asNeckCard(planned)),
		data: { item: planned.item, answer: null, confusion: success ? null : { kind: 'octave' } },
		...overrides
	});
}

function withThreshold(definition: ExerciseDefinition, recallThresholdMs: number) {
	return { ...definition, params: { ...definition.params, recallThresholdMs } };
}

describe('neckSubject', () => {
	it('owns the neck’s cards and plays each mechanic in its exercise', () => {
		const subject = neckSubject({ definitions: DEFINITIONS });
		expect(subject.owns({ mechanic: LOCATE })).toBe(true);
		expect(subject.owns({ mechanic: IDENTIFY })).toBe(true);
		expect(subject.owns({ mechanic: 'triad-anchor' as MechanicId })).toBe(false);
		expect(subject.exerciseOf(LOCATE)).toBe(LOCATE_NECK.id);
		expect(subject.exerciseOf(IDENTIFY)).toBe(IDENTIFY_NECK.id);
		const g = locate({ string: 6, pitch: 'G' });
		expect(`locate:${subject.itemKey(g)}`).toBe(neckCardKey(asNeckCard(g)));
		expect(subject.itemKey(identify(5, 3))).toBe('5:3');
	});

	it('refuses a locate or identify exercise that declares no recall threshold', () => {
		const silent = { ...LOCATE_NECK, params: {} };
		expect(() => neckSubject({ definitions: { locate: silent, identify: IDENTIFY_NECK } })).toThrow(
			/recall threshold/
		);
		const mute = { ...IDENTIFY_NECK, params: {} };
		expect(() => neckSubject({ definitions: { locate: LOCATE_NECK, identify: mute } })).toThrow(
			/recall threshold/
		);
	});

	it('reads its ladders from the exercises', () => {
		const ladder = [
			{ params: { leadBeats: 6, aided: true }, pass: { successes: 1 } },
			{ params: { leadBeats: 3, aided: false }, pass: { successes: 3 } }
		];
		const named = [{ params: { leadBeats: null, aided: false }, pass: { successes: 4 } }];
		const subject = neckSubject({
			definitions: {
				locate: { ...LOCATE_NECK, params: { ...LOCATE_NECK.params, ladder } },
				identify: { ...IDENTIFY_NECK, params: { ...IDENTIFY_NECK.params, ladder: named } }
			}
		});
		expect(subject.ladder(LOCATE)).toEqual(ladder);
		expect(subject.ladder(IDENTIFY)).toEqual(named);
	});

	it('serves the ladder the catalog writes, the same at every tempo', () => {
		const subject = neckSubject({ definitions: DEFINITIONS });
		expect(subject.ladder(LOCATE)).toEqual(ladderOf(LOCATE_NECK));
		// A locate exercise whose tempo moves serves the same ladder: the tempo fits nothing.
		const moving = neckSubject({
			definitions: {
				locate: { ...LOCATE_NECK, tempo: { ...DEFAULT_TEMPO, start: 160 } },
				identify: IDENTIFY_NECK
			}
		});
		expect(moving.ladder(LOCATE)).toEqual(ladderOf(LOCATE_NECK));
	});

	it('introduces the notes in the order of the neck, the triads’ notes first', () => {
		const order = introductionOrder();
		const subject = neckSubject({ definitions: DEFINITIONS });
		expect(subject.nextNew([], NO_HISTORY, NOTHING_BLOCKED)).toEqual(locate(order[0]));
		const first = neckCard(asNeckCard(locate(order[0])));
		expect(subject.nextNew([first], NO_HISTORY, NOTHING_BLOCKED)).toEqual(locate(order[1]));

		const triadNote: LocateItem = { string: 2, pitch: 'D' };
		const prioritized = neckSubject({ definitions: DEFINITIONS, priority: [triadNote] });
		expect(prioritized.nextNew([], NO_HISTORY, NOTHING_BLOCKED)).toEqual(locate(triadNote));

		// An acquired note brings its name to identify first.
		const acquired = neckCard(asNeckCard(locate(order[0])), { learnedAt: 0, acquiredAt: 0 });
		expect(subject.nextNew([acquired], NO_HISTORY, NOTHING_BLOCKED)).toEqual(identify(6, 3));
		// A card of another track does not count among the neck's.
		const foreign: CardState = { ...first, mechanic: 'triad-anchor' as MechanicId };
		expect(subject.nextNew([foreign], NO_HISTORY, NOTHING_BLOCKED)).toEqual(locate(order[0]));
		// Blocked: nothing now.
		expect(subject.nextNew([], NO_HISTORY, () => true)).toBeNull();
	});

	it('keeps a note and its mirror apart, and prefers another string', () => {
		const subject = neckSubject({ definitions: DEFINITIONS });
		const aOnLowE = locate({ string: 6, pitch: 'A' });
		const eOnA = locate({ string: 5, pitch: 'E' });
		expect(isMirrorPair(asNeckCard(aOnLowE), asNeckCard(eOnA))).toBe(true);
		expect(subject.neighbours(aOnLowE, eOnA)).toBe(true);
		expect(subject.neighbours(aOnLowE, aOnLowE)).toBe(true);
		expect(subject.neighbours(aOnLowE, locate({ string: 5, pitch: 'C' }))).toBe(false);
		expect(subject.neighbours(identify(6, 5), identify(5, 7))).toBe(false);

		expect(subject.prefers?.(eOnA, aOnLowE)).toBe(true);
		expect(subject.prefers?.(locate({ string: 6, pitch: 'G' }), aOnLowE)).toBe(false);
		expect(subject.prefers?.(identify(6, 3), aOnLowE)).toBe(false);
		expect(subject.prefers?.(identify(4, 3), aOnLowE)).toBe(true);
	});

	it('learns locate over its leads and identify over the name shown', () => {
		const subject = neckSubject({ definitions: DEFINITIONS });
		const leads = subject.ladder(LOCATE);
		expect(leads.map((level) => level.params)).toEqual([
			{ leadBeats: 8, aided: true },
			{ leadBeats: 4, aided: false },
			{ leadBeats: 2, aided: false }
		]);
		expect(leads[leads.length - 1]).toMatchObject({
			pass: { successes: LEARN_SUCCESSES },
			success: 'direct-recall'
		});
		expect(subject.ladder(IDENTIFY).map((level) => level.params)).toEqual([
			{ leadBeats: null, aided: true },
			{ leadBeats: null, aided: false }
		]);
		expect(subject.ladder(IDENTIFY)[1]).toMatchObject({
			pass: { successes: LEARN_SUCCESSES },
			success: 'direct-recall'
		});

		// The drawn string fades on locate only.
		expect(subject.fadingAid(LOCATE)).toBe(true);
		expect(subject.fadingAid(IDENTIFY)).toBe(false);

		const planned: PlannedItem = {
			exerciseId: LOCATE_NECK.id,
			mechanic: LOCATE,
			item: { string: 6, pitch: 'G' },
			phase: 'consolidation',
			temperature: 'hot',
			aid: 'none',
			leadBeats: 2
		};
		expect(subject.confused(answerOf(planned, false))).toBe(true);
		expect(subject.confused(answerOf(planned, true))).toBe(false);
	});

	it('judges direct recall by the threshold the exercise declares', () => {
		const planned = (leadBeats: 2 | 4): PlannedItem => ({
			exerciseId: LOCATE_NECK.id,
			mechanic: LOCATE,
			item: { string: 6, pitch: 'G' },
			phase: 'review',
			temperature: 'cold',
			aid: 'none',
			leadBeats
		});
		const declared = neckSubject({
			definitions: { locate: withThreshold(LOCATE_NECK, 3000), identify: IDENTIFY_NECK }
		});
		// The threshold judges recall; the ladder stays as written.
		expect(declared.ladder(LOCATE)).toEqual(ladderOf(LOCATE_NECK));
		expect(declared.recall(LOCATE)(answerOf(planned(4), true))).toBe(true);

		const catalog = neckSubject({ definitions: DEFINITIONS });
		const top = catalog.ladder(LOCATE);
		expect(top[top.length - 1].params.leadBeats).toBe(2);
		expect(catalog.recall(LOCATE)(answerOf(planned(4), true))).toBe(false);
		expect(catalog.recall(LOCATE)(answerOf(planned(2), true))).toBe(true);

		// Identify, in free time: its reaction against its exercise's threshold.
		const named: PlannedItem = {
			exerciseId: IDENTIFY_NECK.id,
			mechanic: IDENTIFY,
			item: { string: 6, fret: 3 },
			phase: 'review',
			temperature: 'cold',
			aid: 'none',
			leadBeats: null
		};
		const slow = answerOf(named, true, { reactionMs: 2500 });
		expect(catalog.recall(IDENTIFY)(slow)).toBe(true);
		const strict = neckSubject({
			definitions: { locate: LOCATE_NECK, identify: withThreshold(IDENTIFY_NECK, 2000) }
		});
		expect(strict.recall(IDENTIFY)(slow)).toBe(false);
	});

	it('plays a learn session end to end on the procedure', () => {
		const subject = neckSubject({ definitions: DEFINITIONS });
		const order = introductionOrder();
		// Already in the store, at the top of their ladder: an acquired note (solid, not due), a
		// learned one and one due for its review.
		const stored = [
			neckCard(asNeckCard(locate(order[order.length - 1])), { learnedAt: 0, acquiredAt: 0 }),
			neckCard(asNeckCard(locate(order[order.length - 2])), { learnedAt: 0 }),
			neckCard(asNeckCard(locate(order[order.length - 3])), { learnedAt: 0, due: 0 })
		];
		const levels: LevelState[] = stored.map((card) => ({
			exerciseId: LOCATE_NECK.id,
			scope: '',
			item: subject.itemKey(card),
			level: subject.ladder(LOCATE).length - 1,
			successes: 0,
			failures: 0,
			resumeAfter: null
		}));
		let seed = 7;
		const random = () => {
			seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
			return seed / 2 ** 32;
		};
		const procedure = createLearningProcedure({
			subject,
			cards: stored,
			attempts: [],
			levels,
			sessionId: 'session',
			random
		});

		// The player: right at every prompt but the probes of the first locate note and the first
		// identify one probed, so each of them is learned through its ladder (locate 8, 4, 2, 2;
		// identify the name shown, then twice unaided).
		const unknown = new Map<MechanicId, CardKey>();
		const succeeds = (planned: PlannedItem, key: CardKey): boolean => {
			if (planned.phase === 'probe' && !unknown.has(planned.mechanic)) {
				unknown.set(planned.mechanic, key);
			}
			return !(planned.phase === 'probe' && unknown.get(planned.mechanic) === key);
		};

		const hot = new Set<CardKey>();
		let previous: { planned: PlannedItem; key: CardKey; success: boolean } | null = null;
		let missedProbes = 0;
		const learnedByLadder = new Set<MechanicId>();
		let reviews = 0;
		let now = 1_000_000;
		for (let prompt = 0; prompt < PROMPTS; prompt += 1) {
			const planned = procedure.next({ now, elapsedMs: 0, fatigued: false });
			expect(planned, `prompt ${prompt}`).not.toBeNull();
			if (!planned) return;
			const card = asNeckCard(planned);
			const key = neckCardKey(card);

			// Each mechanic in its exercise, at a lead of its own.
			expect(planned.exerciseId).toBe(subject.exerciseOf(planned.mechanic));
			if (planned.mechanic === LOCATE) expect(LEAD_STEPS).toContain(planned.leadBeats);
			else expect(planned.leadBeats).toBeNull();
			// Categories: probes and reviews cold and unaided, learning and consolidation hot.
			const cold = planned.phase === 'probe' || planned.phase === 'review';
			expect(planned.temperature).toBe(cold ? 'cold' : 'hot');
			if (cold) {
				expect(planned.aid).toBe('none');
				expect(planned.stringAid ?? false).toBe(false);
			}
			if (planned.aid !== 'none') expect(planned.phase).toBe('learning');
			if (planned.stringAid) expect(planned.mechanic).toBe(LOCATE);
			// Never the previous item nor its mirror, but for the aided presentation right after a
			// probe not recalled directly (the procedure's judgement, not the player's success).
			if (previous !== null) {
				const presentation =
					previous.planned.phase === 'probe' &&
					previous.key === key &&
					planned.phase === 'learning' &&
					planned.aid === 'show-position';
				if (!presentation) {
					expect(key, `prompt ${prompt}`).not.toBe(previous.key);
					expect(isMirrorPair(card, asNeckCard(previous.planned))).toBe(false);
				}
			}
			if (planned.temperature === 'hot') hot.add(key);
			if (planned.phase === 'review') reviews += 1;
			expect(reviews).toBeLessThanOrEqual(LEARN_COLD_CAP);
			expect(hot.size).toBeLessThanOrEqual(MAX_WORKING_SET);

			const success = succeeds(planned, key);
			const outcome = procedure.record(answerOf(planned, success, { at: now }), now);
			if (planned.phase === 'probe' && !success) missedProbes += 1;
			if (planned.phase === 'learning' && outcome?.card?.learnedAt != null) {
				learnedByLadder.add(planned.mechanic);
			}
			previous = { planned, key, success };
			now += 4_000;
		}
		expect(missedProbes).toBeGreaterThanOrEqual(1);
		expect([...learnedByLadder].sort()).toEqual([IDENTIFY, LOCATE]);
	});
});
