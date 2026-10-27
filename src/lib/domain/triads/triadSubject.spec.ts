import { describe, expect, it } from 'vitest';
import { TRIADS_ANCHOR, TRIADS_ZONE } from '$lib/domain/exercise';
import { ladderOf } from '$lib/domain/exercise/ladder';
import type { ExerciseDefinition, MechanicId } from '$lib/domain/exercise/types';
import { createLearningProcedure } from '$lib/domain/learning/procedure';
import type { CardRef } from '$lib/domain/learning/subject';
import { attemptOf } from '$lib/domain/learning/testing/fakeSubject';
import type { TriadZoneItem } from '$lib/domain/mechanics';
import { parseVoicingKey, voicingKey, voicingOccurrences } from '$lib/domain/music';
import { LEARN_COLD_CAP, MAX_WORKING_SET } from '$lib/domain/progress/constants';
import { graduateToReview, introScheduling } from '$lib/domain/progress/scheduling';
import type { LevelState } from '$lib/domain/time/levels';
import {
	cardKey,
	type Attempt,
	type CardKey,
	type CardState,
	type PlannedItem
} from '$lib/domain/types';
import { triadIntroductionOrder } from './introduction';
import { triadParams, voicingPositions } from './items';
import { occurrencePosition } from './position';
import { triadSubject, type TriadMechanic } from './triadSubject';

const ANCHOR = 'triad-anchor' as MechanicId;
const ZONE = 'triad-zone' as MechanicId;
const DEFINITIONS = { anchor: TRIADS_ANCHOR, zone: TRIADS_ZONE };
const ORDER = triadIntroductionOrder(triadParams(TRIADS_ANCHOR), new Set()).map(voicingKey);
/** 80 bpm: a beat is 750 ms; leads 8, 4, 2 beats are 6 000, 3 000, 1 500 ms. */
const TEMPO = 80;
const NO_HISTORY = new Map<CardKey, readonly Attempt[]>();
const NOTHING_BLOCKED = () => false;
const NOW = 1_000_000;

function subjectOf(mechanic: TriadMechanic, attempts: readonly Attempt[] = []) {
	return triadSubject({
		mechanic,
		definitions: DEFINITIONS,
		acquiredPositions: new Set(),
		attempts
	});
}

const ref = (mechanic: MechanicId, voicing: string): CardRef => ({
	mechanic,
	item: { voicingKey: voicing }
});

/**
 * A triad card in the store. Default: being learned; `learnedAt` set gives it a review
 * scheduling, `due` 0 makes it due for its cold review.
 */
function triadCard(
	mechanic: MechanicId,
	voicing: string,
	fields: Partial<Pick<CardState, 'learnedAt' | 'acquiredAt'>> & { due?: number } = {}
): CardState {
	const learnedAt = fields.learnedAt ?? null;
	const scheduling = learnedAt === null ? introScheduling(0) : graduateToReview(0);
	return {
		key: cardKey(mechanic, voicing),
		mechanic,
		item: { voicingKey: voicing },
		introducedAt: 0,
		introducedInSession: 'past',
		leadBeats: 2,
		learnedAt,
		acquiredAt: fields.acquiredAt ?? null,
		masteredAt: null,
		scheduling: { ...scheduling, due: fields.due ?? 1e15 }
	};
}

function voicingOf(planned: Pick<PlannedItem, 'item'>): string {
	return (planned.item as { voicingKey: string }).voicingKey;
}

/** The attempt of a planned triad, a success unless `success` is false. */
function answerOf(
	planned: PlannedItem,
	success: boolean,
	overrides: Parameters<typeof attemptOf>[1] = {}
): Attempt {
	return attemptOf(planned, {
		success,
		tempoBpm: TEMPO,
		cardKey: cardKey(planned.mechanic, voicingOf(planned)),
		data: { item: planned.item, answer: null, confusion: success ? null : { kind: 'quality' } },
		...overrides
	});
}

function withoutThreshold(definition: ExerciseDefinition): ExerciseDefinition {
	const params = { ...definition.params };
	delete params.recallThresholdMs;
	return { ...definition, params };
}

function seeded(seed: number): () => number {
	return () => {
		seed = (seed * 1_664_525 + 1_013_904_223) >>> 0;
		return seed / 2 ** 32;
	};
}

/** Levels at the top of the ladder for stored cards. */
function topLevels(
	subject: ReturnType<typeof subjectOf>,
	cards: readonly CardState[]
): LevelState[] {
	return cards.map((card) => ({
		exerciseId: subject.exerciseOf(card.mechanic),
		scope: '',
		item: subject.itemKey(card),
		level: subject.ladder(card.mechanic).length - 1,
		successes: 0,
		failures: 0,
		resumeAfter: null
	}));
}

describe('triadSubject', () => {
	it('plays each mechanic in its exercise and climbs its leads', () => {
		const subject = subjectOf('triad-anchor');
		expect(subject.exerciseOf(ANCHOR)).toBe(TRIADS_ANCHOR.id);
		expect(subject.exerciseOf(ZONE)).toBe(TRIADS_ZONE.id);
		expect(`triad-anchor:${subject.itemKey(ref(ANCHOR, ORDER[0]))}`).toBe(
			cardKey(ANCHOR, ORDER[0])
		);
		// The ladder each exercise writes: 8 beats aided, 4, then 2 where only a direct recall counts.
		expect(subject.ladder(ANCHOR).map((level) => level.params)).toEqual([
			{ leadBeats: 8, aided: true },
			{ leadBeats: 4, aided: false },
			{ leadBeats: 2, aided: false }
		]);
		expect(subject.ladder(ANCHOR)).toEqual(ladderOf(TRIADS_ANCHOR));
		expect(subject.ladder(ZONE)).toEqual(ladderOf(TRIADS_ZONE));
		expect(subject.ladder(ZONE)[2].success).toBe('direct-recall');
		expect(subject.fadingAid(ANCHOR)).toBe(false);
		expect(subject.fadingAid(ZONE)).toBe(false);
		expect(subject.prefers).toBeUndefined();
		const planned: PlannedItem = {
			exerciseId: TRIADS_ANCHOR.id,
			mechanic: ANCHOR,
			item: { voicingKey: ORDER[0] },
			phase: 'consolidation',
			temperature: 'hot',
			aid: 'none',
			leadBeats: 2
		};
		expect(subject.confused(answerOf(planned, false))).toBe(true);
		expect(subject.confused(answerOf(planned, true))).toBe(false);
		// Direct recall by the exercise's threshold: 2 beats at 80 bpm is 1 500 ms, 4 beats is not.
		expect(subject.recall(ANCHOR)(answerOf(planned, true))).toBe(true);
		expect(subject.recall(ANCHOR)(answerOf({ ...planned, leadBeats: 4 }, true))).toBe(false);
	});

	it('refuses a triads exercise that declares no recall threshold', () => {
		expect(() =>
			triadSubject({
				mechanic: 'triad-anchor',
				definitions: { anchor: withoutThreshold(TRIADS_ANCHOR), zone: TRIADS_ZONE },
				acquiredPositions: new Set(),
				attempts: []
			})
		).toThrow(/recall threshold/);
	});

	it('introduces anchor triads in their queue, the acquired notes’ triads first', () => {
		const subject = subjectOf('triad-anchor');
		expect(subject.nextNew([], NO_HISTORY, NOTHING_BLOCKED)).toEqual(ref(ANCHOR, ORDER[0]));
		const first = triadCard(ANCHOR, ORDER[0]);
		expect(subject.nextNew([first], NO_HISTORY, NOTHING_BLOCKED)).toEqual(ref(ANCHOR, ORDER[1]));
		// The head still ringing: the one after it.
		const ringing = (card: CardRef) => subject.itemKey(card) === ORDER[0];
		expect(subject.nextNew([], NO_HISTORY, ringing)).toEqual(ref(ANCHOR, ORDER[1]));
		// A zone card does not take the anchor's place in its queue.
		expect(subject.nextNew([triadCard(ZONE, ORDER[0])], NO_HISTORY, NOTHING_BLOCKED)).toEqual(
			ref(ANCHOR, ORDER[0])
		);

		// The notes of a later root acquired in locate: its triads come first.
		const later = triadIntroductionOrder(triadParams(TRIADS_ANCHOR), new Set()).find(
			(voicing) => voicing.chord.root.letter !== 'C'
		);
		expect(later).toBeDefined();
		if (!later) return;
		const acquired = new Set(voicingPositions(later));
		const prioritized = triadSubject({
			mechanic: 'triad-anchor',
			definitions: DEFINITIONS,
			acquiredPositions: acquired,
			attempts: []
		});
		const head = prioritized.nextNew([], NO_HISTORY, NOTHING_BLOCKED);
		expect(head).not.toEqual(ref(ANCHOR, ORDER[0]));
		const headVoicing = parseVoicingKey(prioritized.itemKey(head as CardRef));
		expect(headVoicing.chord.root).toEqual(later.chord.root);
	});

	it('opens a zone triad only once it is acquired in anchor', () => {
		const subject = subjectOf('triad-zone');
		expect(subject.nextNew([], NO_HISTORY, NOTHING_BLOCKED)).toBeNull();
		const learned = triadCard(ANCHOR, ORDER[0], { learnedAt: 0 });
		expect(subject.nextNew([learned], NO_HISTORY, NOTHING_BLOCKED)).toBeNull();

		// Acquired by a cold direct recall in its history.
		const review: PlannedItem = {
			exerciseId: TRIADS_ANCHOR.id,
			mechanic: ANCHOR,
			item: { voicingKey: ORDER[0] },
			phase: 'review',
			temperature: 'cold',
			aid: 'none',
			leadBeats: 2
		};
		const later = 2 * 24 * 60 * 60 * 1000;
		const history = new Map<CardKey, readonly Attempt[]>([
			[learned.key, [answerOf(review, true, { at: later })]]
		]);
		expect(subject.nextNew([learned], history, NOTHING_BLOCKED)).toEqual(ref(ZONE, ORDER[0]));

		// Marked acquired; its zone card taken: the next acquired one.
		const acquired = [
			triadCard(ANCHOR, ORDER[0], { learnedAt: 0, acquiredAt: 0 }),
			triadCard(ANCHOR, ORDER[1], { learnedAt: 0, acquiredAt: 0 })
		];
		expect(subject.nextNew(acquired, NO_HISTORY, NOTHING_BLOCKED)).toEqual(ref(ZONE, ORDER[0]));
		expect(
			subject.nextNew([...acquired, triadCard(ZONE, ORDER[0])], NO_HISTORY, NOTHING_BLOCKED)
		).toEqual(ref(ZONE, ORDER[1]));
		// Still ringing: the next one.
		const ringing = (card: CardRef) => subject.itemKey(card) === ORDER[0];
		expect(subject.nextNew(acquired, NO_HISTORY, ringing)).toEqual(ref(ZONE, ORDER[1]));
	});

	it('serves only its own exercise’s cards', () => {
		for (const mechanic of ['triad-anchor', 'triad-zone'] as const) {
			const subject = subjectOf(mechanic);
			expect(subject.owns({ mechanic: ANCHOR })).toBe(mechanic === 'triad-anchor');
			expect(subject.owns({ mechanic: ZONE })).toBe(mechanic === 'triad-zone');
			expect(subject.owns({ mechanic: 'locate' as MechanicId })).toBe(false);
			// Both exercises' cards in the store, due for review, solid, or being learned.
			const cards = [ANCHOR, ZONE].flatMap((of) => [
				triadCard(of, ORDER[0], { learnedAt: 0, acquiredAt: 0, due: 0 }),
				triadCard(of, ORDER[1], { learnedAt: 0, acquiredAt: 0 }),
				triadCard(of, ORDER[2], { learnedAt: 0 }),
				triadCard(of, ORDER[3])
			]);
			const procedure = createLearningProcedure({
				subject,
				cards,
				attempts: [],
				levels: topLevels(subject, cards),
				sessionId: 'session',
				random: seeded(3)
			});
			let now = NOW;
			const served: MechanicId[] = [];
			for (let prompt = 0; prompt < 20; prompt += 1) {
				const planned = procedure.next({ now, elapsedMs: 0, fatigued: false });
				if (!planned) break;
				served.push(planned.mechanic);
				// Misses every other prompt: recoveries and consolidations come too.
				procedure.record(answerOf(planned, prompt % 2 === 0, { at: now }), now);
				now += 4_000;
			}
			expect(served.length).toBeGreaterThan(5);
			expect(new Set(served)).toEqual(new Set([mechanic]));
		}
	});

	it('never asks the voicing still ringing', () => {
		const subject = subjectOf('triad-zone');
		expect(subject.neighbours(ref(ANCHOR, ORDER[0]), ref(ZONE, ORDER[0]))).toBe(true);
		expect(subject.neighbours(ref(ZONE, ORDER[0]), ref(ZONE, ORDER[0]))).toBe(true);
		expect(subject.neighbours(ref(ZONE, ORDER[0]), ref(ZONE, ORDER[1]))).toBe(false);
	});

	it('asks a zone triad at another position than the last', () => {
		const voicing = ORDER[0];
		const positions = voicingOccurrences(parseVoicingKey(voicing)).map(occurrencePosition);
		expect(positions.length).toBeGreaterThan(1);
		const card = ref(ZONE, voicing);
		// The last position asked, read from the stored attempts (the latest one).
		const asked = (position: number | 'open', at: number) =>
			answerOf(
				{
					exerciseId: TRIADS_ZONE.id,
					mechanic: ZONE,
					item: { voicingKey: voicing, position },
					phase: 'review',
					temperature: 'cold',
					aid: 'none',
					leadBeats: 2
				},
				true,
				{ at }
			);
		const stored = [asked(positions[1], 2), asked(positions[0], 1)];
		const subject = subjectOf('triad-zone', stored);
		let last: number | 'open' = positions[1];
		for (let draw = 0; draw < 6; draw += 1) {
			const item = subject.promptItem?.(card, seeded(draw)) as TriadZoneItem;
			expect(item.voicingKey).toBe(voicing);
			expect(positions).toContain(item.position);
			expect(item.position).not.toBe(last);
			const shape = voicingOccurrences(parseVoicingKey(voicing)).find(
				(occurrence) => occurrencePosition(occurrence) === item.position
			);
			expect(shape?.notes.some((note) => note.fret === item.fret) ?? false).toBe(
				item.fret !== undefined
			);
			last = item.position;
		}
		// The anchor asks its card's item as it is.
		expect(subjectOf('triad-anchor').promptItem).toBeUndefined();
	});

	it('plays a zone session on the triads acquired in anchor, a new position each time', () => {
		const subject = subjectOf('triad-zone');
		const acquired = [ORDER[0], ORDER[2], ORDER[4]];
		const stored = [
			...acquired.map((voicing) => triadCard(ANCHOR, voicing, { learnedAt: 0, acquiredAt: 0 })),
			// Learned in anchor, not acquired: its zone triad stays closed.
			triadCard(ANCHOR, ORDER[1], { learnedAt: 0 })
		];
		const procedure = createLearningProcedure({
			subject,
			cards: stored,
			attempts: [],
			levels: topLevels(subject, stored),
			sessionId: 'session',
			random: seeded(11)
		});
		const lastPosition = new Map<string, number | 'open'>();
		const introduced = new Set<string>();
		let changes = 0;
		let previous: string | null = null;
		let now = NOW;
		for (let prompt = 0; prompt < 20; prompt += 1) {
			const planned = procedure.next({ now, elapsedMs: 0, fatigued: false });
			if (!planned) break;
			expect(planned.mechanic).toBe(ZONE);
			const item = planned.item as TriadZoneItem;
			expect(item.voicingKey).not.toBe(previous);
			if (planned.phase === 'probe') introduced.add(item.voicingKey);
			const last = lastPosition.get(item.voicingKey);
			// A voicing of a single shape is asked there again.
			const shapes = voicingOccurrences(parseVoicingKey(item.voicingKey)).length;
			if (last !== undefined && shapes > 1) {
				expect(item.position, `prompt ${prompt}`).not.toBe(last);
				changes += 1;
			}
			lastPosition.set(item.voicingKey, item.position);
			procedure.record(answerOf(planned, true, { at: now }), now);
			previous = item.voicingKey;
			now += 4_000;
		}
		expect([...introduced].sort()).toEqual([...acquired].sort());
		expect(changes).toBeGreaterThan(0);
	});

	it('plays a triads session end to end on the procedure', () => {
		const subject = subjectOf('triad-anchor');
		// Already in the store, at the top of their ladder: an acquired triad (solid, not due), a
		// learned one, one due for its review; and the zone's cards, never served here.
		const stored = [
			triadCard(ANCHOR, ORDER[ORDER.length - 1], { learnedAt: 0, acquiredAt: 0 }),
			triadCard(ANCHOR, ORDER[ORDER.length - 2], { learnedAt: 0 }),
			triadCard(ANCHOR, ORDER[ORDER.length - 3], { learnedAt: 0, due: 0 }),
			triadCard(ZONE, ORDER[ORDER.length - 1], { learnedAt: 0, due: 0 }),
			triadCard(ZONE, ORDER[ORDER.length - 2])
		];
		const procedure = createLearningProcedure({
			subject,
			cards: stored,
			attempts: [],
			levels: topLevels(subject, stored),
			sessionId: 'session',
			random: seeded(7)
		});

		// The player: right at every prompt but the first probe, so that triad is learned through
		// its ladder (8 aided, 4, 2, 2).
		let unknown: CardKey | null = null;
		const succeeds = (planned: PlannedItem, key: CardKey): boolean => {
			if (planned.phase !== 'probe') return true;
			unknown ??= key;
			return key !== unknown;
		};

		const hot = new Set<CardKey>();
		let previous: string | null = null;
		let missedProbes = 0;
		let learnedByLadder = 0;
		let reviews = 0;
		let now = NOW;
		for (let prompt = 0; prompt < 30; prompt += 1) {
			const planned = procedure.next({ now, elapsedMs: 0, fatigued: false });
			expect(planned, `prompt ${prompt}`).not.toBeNull();
			if (!planned) return;
			const voicing = voicingOf(planned);
			const key = cardKey(planned.mechanic, voicing);

			// The anchor's own cards only, in its exercise, at a lead of its exercise.
			expect(planned.mechanic).toBe(ANCHOR);
			expect(planned.exerciseId).toBe(TRIADS_ANCHOR.id);
			expect([8, 4, 2]).toContain(planned.leadBeats);
			// Never the chord still ringing.
			expect(voicing, `prompt ${prompt}`).not.toBe(previous);
			// Probes and reviews cold and unaided, learning and consolidation hot; aided only learning.
			const cold = planned.phase === 'probe' || planned.phase === 'review';
			expect(planned.temperature).toBe(cold ? 'cold' : 'hot');
			if (cold) expect(planned.aid).toBe('none');
			if (planned.aid !== 'none') expect(planned.phase).toBe('learning');
			expect(planned.stringAid ?? false).toBe(false);
			if (planned.temperature === 'hot') hot.add(key);
			if (planned.phase === 'review') reviews += 1;
			expect(reviews).toBeLessThanOrEqual(LEARN_COLD_CAP);
			expect(hot.size).toBeLessThanOrEqual(MAX_WORKING_SET);

			const success = succeeds(planned, key);
			const outcome = procedure.record(answerOf(planned, success, { at: now }), now);
			if (planned.phase === 'probe' && !success) missedProbes += 1;
			if (planned.phase === 'learning' && outcome?.card?.learnedAt != null) learnedByLadder += 1;
			previous = voicing;
			now += 4_000;
		}
		expect(missedProbes).toBe(1);
		expect(learnedByLadder).toBeGreaterThanOrEqual(1);
	});
});
