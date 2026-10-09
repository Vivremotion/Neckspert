import { describe, expect, it } from 'vitest';
import { TRIADS_ANCHOR, TRIADS_ZONE } from '$lib/domain/exercise';
import { triadAnchorRules, triadZoneRules } from '$lib/domain/mechanics';
import { parseVoicingKey, voicingKey, voicingOccurrences } from '$lib/domain/music';
import {
	cueFrets,
	occurrencePosition,
	triadIntroductionOrder,
	triadParams
} from '$lib/domain/triads';
import { cardKey, type Attempt, type CardState, type PlannedItem } from '$lib/domain/types';
import { introduceCard, markLearned } from './cards';
import type { SessionSelector } from './selector';
import { createTriadSelector, triadZoneOpen } from './triadSelector';

const NOW = Date.parse('2026-10-08T10:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const FAR = NOW + 30 * 24 * HOUR;
const ORDER = triadIntroductionOrder(triadParams(TRIADS_ANCHOR), new Set()).map(voicingKey);
const TEMPOS = { [TRIADS_ANCHOR.id]: 80, [TRIADS_ZONE.id]: 80 };

function anchorCard(key: string, overrides: Partial<CardState> = {}): CardState {
	const card = markLearned(
		introduceCard(
			{ key: cardKey('triad-anchor', key), mechanic: 'triad-anchor', item: { voicingKey: key } },
			NOW - 3 * 24 * HOUR,
			's-old',
			triadAnchorRules.timing
		),
		NOW - 3 * 24 * HOUR,
		triadAnchorRules.timing,
		80
	);
	return { ...card, scheduling: { ...card.scheduling, due: FAR }, ...overrides };
}

function acquiredAnchor(key: string, overrides: Partial<CardState> = {}): CardState {
	return anchorCard(key, { acquiredAt: NOW - 2 * 24 * HOUR, ...overrides });
}

function zoneCard(key: string, overrides: Partial<CardState> = {}): CardState {
	const card = markLearned(
		introduceCard(
			{ key: cardKey('triad-zone', key), mechanic: 'triad-zone', item: { voicingKey: key } },
			NOW - 3 * 24 * HOUR,
			's-old',
			triadZoneRules.timing
		),
		NOW - 3 * 24 * HOUR,
		triadZoneRules.timing,
		80
	);
	return { ...card, scheduling: { ...card.scheduling, due: FAR }, ...overrides };
}

function due(card: CardState): CardState {
	return { ...card, scheduling: { ...card.scheduling, due: NOW - 1000 } };
}

function select(
	cards: CardState[] = [],
	random: () => number = () => 0,
	attempts: Attempt[] = [],
	mechanic: 'triad-anchor' | 'triad-zone' = 'triad-anchor'
): SessionSelector {
	return createTriadSelector({
		mechanic,
		cards,
		attempts,
		sessionId: 's-now',
		definitions: { anchor: TRIADS_ANCHOR, zone: TRIADS_ZONE },
		acquiredPositions: new Set(),
		tempos: TEMPOS,
		random
	});
}

/** The attempt a prompt gets, right in time or a miss. */
function attemptOf(item: PlannedItem, right: boolean, at: number): Attempt {
	const { voicingKey: key } = item.item as { voicingKey: string };
	return {
		sessionId: 's-now',
		exerciseId: item.exerciseId,
		mechanic: item.mechanic,
		cardKey: cardKey(item.mechanic, key),
		phase: item.phase,
		temperature: item.temperature,
		aid: item.aid,
		promptedAt: at,
		tempoBpm: 80,
		leadBeats: item.leadBeats,
		timingOffsetMs: right ? 0 : null,
		reactionMs: right ? 1500 : null,
		correct: right,
		verdict: right ? 'perfect' : 'wrong',
		data: { item: item.item, answer: null, confusion: null },
		observations: null
	};
}

/** A session of the zone exercise. */
function selectZone(cards: CardState[] = [], random: () => number = () => 0): SessionSelector {
	return select(cards, random, [], 'triad-zone');
}

/** Serves `count` prompts, answering each with `answer(item, index)`. */
function play(
	selector: SessionSelector,
	count: number,
	answer: (item: PlannedItem, index: number) => boolean = () => true
): PlannedItem[] {
	const served: PlannedItem[] = [];
	for (let i = 0; i < count; i++) {
		const at = NOW + i * 10_000;
		const item = selector.next({ now: at, elapsedMs: i * 10_000, fatigued: false });
		if (!item) break;
		served.push(item);
		selector.record(attemptOf(item, answer(item, i), at), at);
	}
	return served;
}

const voicingOf = (item: PlannedItem) => (item.item as { voicingKey: string }).voicingKey;

/** A seeded draw, so that long runs vary but stay reproducible. */
function seeded(seed: number): () => number {
	let state = seed;
	return () => {
		state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
		return state / 2_147_483_648;
	};
}

describe('createTriadSelector', () => {
	it('probes the first triad of the anchor queue in a blank session', () => {
		const item = select().next({ now: NOW, elapsedMs: 0, fatigued: false });
		expect(item).toEqual({
			exerciseId: 'triads-anchor',
			mechanic: 'triad-anchor',
			item: { voicingKey: ORDER[0] },
			phase: 'probe',
			temperature: 'cold',
			aid: 'none',
			leadBeats: 2
		});
	});

	it('presents a missed probe with its aid, as soon as another chord has rung in between', () => {
		const served = play(select(), 3, (_, i) => i !== 0);
		expect(voicingOf(served[1])).not.toBe(ORDER[0]);
		expect(served[2]).toMatchObject({
			mechanic: 'triad-anchor',
			item: { voicingKey: ORDER[0] },
			phase: 'learning',
			temperature: 'hot',
			aid: 'show-position',
			leadBeats: 8
		});
	});

	it('learns a triad after two successes at the shortest lead of its pacing', () => {
		const selector = select();
		const leads: (number | null)[] = [];
		let learnedAt: number | null = null;
		for (let i = 0; i < 40 && learnedAt === null; i++) {
			const at = NOW + i * 10_000;
			const item = selector.next({ now: at, elapsedMs: i * 10_000, fatigued: false })!;
			const first = voicingOf(item) === ORDER[0];
			if (first && item.phase === 'learning') leads.push(item.leadBeats);
			const outcome = selector.record(attemptOf(item, !(first && item.phase === 'probe'), at), at);
			if (first && outcome?.card.learnedAt) learnedAt = outcome.card.learnedAt;
		}
		expect(leads).toEqual([8, 4, 2, 2]);
		expect(learnedAt).not.toBeNull();
	});

	it('probes around a fret, in a zone session, a triad acquired in anchor', () => {
		const item = selectZone([acquiredAnchor(ORDER[0])]).next({
			now: NOW,
			elapsedMs: 0,
			fatigued: false
		});
		expect(item).toMatchObject({
			exerciseId: 'triads-zone',
			mechanic: 'triad-zone',
			item: { voicingKey: ORDER[0], position: expect.anything() },
			phase: 'probe',
			leadBeats: 2
		});
	});

	it('never brings a triad in a zone session before it is acquired in anchor', () => {
		const served = play(selectZone([anchorCard(ORDER[0]), anchorCard(ORDER[1])]), 30);
		expect(served).toEqual([]);
	});

	it('serves only anchor prompts in an anchor session, even with zone cards due', () => {
		const cards = [
			...ORDER.slice(0, 8).map((key) => due(acquiredAnchor(key))),
			...ORDER.slice(0, 8).map((key) => due(zoneCard(key, { acquiredAt: NOW - 2 * 24 * HOUR })))
		];
		const served = play(select(cards, seeded(2)), 60);
		expect(served.length).toBeGreaterThan(20);
		expect(new Set(served.map((item) => item.mechanic))).toEqual(new Set(['triad-anchor']));
	});

	it('serves only zone prompts in a zone session, even with anchor cards due', () => {
		const cards = [
			...ORDER.slice(0, 8).map((key) => due(acquiredAnchor(key))),
			...ORDER.slice(0, 8).map((key) => due(zoneCard(key, { acquiredAt: NOW - 2 * 24 * HOUR })))
		];
		const served = play(selectZone(cards, seeded(2)), 60);
		expect(served.length).toBeGreaterThan(20);
		expect(new Set(served.map((item) => item.mechanic))).toEqual(new Set(['triad-zone']));
	});

	it('never serves the same voicing twice in a row', () => {
		for (const mechanic of ['triad-anchor', 'triad-zone'] as const) {
			const random = seeded(7);
			const cards = [
				...ORDER.slice(0, 6).map((key) => due(acquiredAnchor(key))),
				...ORDER.slice(0, 3).map((key) => due(zoneCard(key, { acquiredAt: NOW - 2 * 24 * HOUR })))
			];
			const served = play(select(cards, random, [], mechanic), 200, () => random() > 0.3);
			expect(served.length).toBeGreaterThan(20);
			served.slice(1).forEach((item, i) => expect(voicingOf(item)).not.toBe(voicingOf(served[i])));
		}
	});

	it('draws another position than the last one asked for the same card', () => {
		const random = seeded(3);
		const cards = [
			...ORDER.slice(0, 3).map((key) => due(acquiredAnchor(key))),
			...ORDER.slice(0, 3).map((key) => zoneCard(key, { acquiredAt: NOW - 2 * 24 * HOUR }))
		];
		const served = play(selectZone(cards, random), 120, () => random() > 0.5);
		const byCard = new Map<string, (number | 'open')[]>();
		for (const item of served) {
			if (item.mechanic !== 'triad-zone') continue;
			const { position } = item.item as { position: number | 'open' };
			byCard.set(voicingOf(item), [...(byCard.get(voicingOf(item)) ?? []), position]);
		}
		// A shape with a single place on the neck (C 9-8-8) can only be asked there.
		const placed = (key: string) => voicingOccurrences(parseVoicingKey(key)).length > 1;
		const runs = [...byCard.entries()]
			.filter(([key, positions]) => placed(key) && positions.length > 1)
			.map(([, positions]) => positions);
		expect(runs.length).toBeGreaterThan(0);
		for (const positions of runs) {
			positions.slice(1).forEach((p, i) => expect(p).not.toBe(positions[i]));
		}
	});

	it('names a fret the asked shape covers, drawn anew at each prompt', () => {
		const random = seeded(5);
		const cards = ORDER.slice(0, 3).flatMap((key) => [
			due(acquiredAnchor(key)),
			zoneCard(key, { acquiredAt: NOW - 2 * 24 * HOUR })
		]);
		const served = play(selectZone(cards, random), 120, () => random() > 0.5);
		const named = new Set<number>();
		for (const item of served) {
			if (item.mechanic !== 'triad-zone') continue;
			const { position, fret } = item.item as { position: number | 'open'; fret?: number };
			const shape = voicingOccurrences(parseVoicingKey(voicingOf(item))).find(
				(o) => occurrencePosition(o) === position
			);
			if (!shape) throw new Error('no shape at the asked position');
			const frets = cueFrets(shape);
			if (frets.length === 0) expect(fret).toBeUndefined();
			else expect(frets).toContain(fret);
			if (fret !== undefined && fret !== position) named.add(fret);
		}
		expect(named.size).toBeGreaterThan(0);
	});

	it('ends with the session time', () => {
		expect(select().next({ now: NOW, elapsedMs: 5 * 60 * 1000, fatigued: false })).toBeNull();
	});
});

describe('triadZoneOpen', () => {
	it('opens the zone once six triads are acquired in anchor', () => {
		const acquired = ORDER.slice(0, 6).map((key) => acquiredAnchor(key));
		expect(triadZoneOpen(acquired.slice(0, 5))).toBe(false);
		expect(triadZoneOpen([...acquired.slice(0, 5), anchorCard(ORDER[5])])).toBe(false);
		expect(triadZoneOpen(acquired)).toBe(true);
	});

	it('keeps the zone open once it has a card', () => {
		expect(triadZoneOpen([acquiredAnchor(ORDER[0]), zoneCard(ORDER[0])])).toBe(true);
	});
});
