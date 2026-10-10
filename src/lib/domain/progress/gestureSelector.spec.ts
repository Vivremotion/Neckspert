import { describe, expect, it } from 'vitest';
import { GESTURE_EXERCISES } from '$lib/domain/gesture';
import { chordGridRules, type ChordGridItem } from '$lib/domain/mechanics';
import { cardKey, type Attempt, type CardState, type PlannedItem } from '$lib/domain/types';
import { shapeId, triadCards } from '$lib/testing/shapes';
import { createGestureSelector, GESTURE_SESSION_MS } from './gestureSelector';
import type { SessionSelector } from './selector';

const NOW = Date.parse('2026-10-10T10:00:00.000Z');
const G_B_E = [3, 2, 1] as const;
const D_G_B = [4, 3, 2] as const;

const IOHEFY = [
	['D', 'min'],
	['G', 'maj'],
	['C', 'maj'],
	['F', 'maj'],
	['E', 'min'],
	['Eb', 'min'],
	['Ab', 'maj']
] as const;

/** Every exercise open: the triads of iohefy-a acquired in anchor and in the zone, on both sets. */
const ALL_OPEN: CardState[] = IOHEFY.flatMap(([root, quality]) =>
	[G_B_E, D_G_B].flatMap((set) => [
		...triadCards('triad-anchor', root, quality, set),
		...triadCards('triad-zone', root, quality, set)
	])
);

function selector(
	cards: readonly CardState[],
	attempts: readonly Attempt[] = [],
	sessionId = 's1'
) {
	return createGestureSelector({ definitions: GESTURE_EXERCISES, cards, attempts, sessionId });
}

const itemOf = (planned: PlannedItem) => planned.item as ChordGridItem;

/** The attempt of a planned change, right (or not), with the shape heard. */
function attemptOf(
	planned: PlannedItem,
	promptedAt: number,
	correct = true,
	decided: string | null = null
): Attempt {
	return {
		sessionId: 's1',
		exerciseId: planned.exerciseId,
		mechanic: 'chord-grid',
		cardKey: cardKey('chord-grid', chordGridRules.itemKey(itemOf(planned))),
		phase: 'free',
		temperature: 'hot',
		aid: planned.aid,
		promptedAt,
		tempoBpm: 80,
		leadBeats: null,
		timingOffsetMs: correct ? 0 : null,
		reactionMs: correct ? 100 : null,
		correct,
		verdict: correct ? 'perfect' : 'wrong',
		data: { item: planned.item, answer: decided === null ? null : { decided }, confusion: null },
		observations: []
	};
}

/** Plays a whole passage, every change right unless `correct` says. Returns its changes. */
function playPassage(
	s: SessionSelector,
	clock: { now: number },
	correct = true,
	elapsedMs = 0
): PlannedItem[] {
	const played: PlannedItem[] = [];
	for (;;) {
		const planned = s.next({ now: clock.now, elapsedMs, fatigued: false });
		if (!planned) throw new Error('no change');
		played.push(planned);
		clock.now += 1000;
		s.record(attemptOf(planned, clock.now, correct), clock.now);
		const item = itemOf(planned);
		if (item.index === item.changes.length - 1) return played;
	}
}

describe('createGestureSelector', () => {
	it('plays one passage of each open exercise in the order of the ladder, round after round', () => {
		const s = selector(ALL_OPEN);
		const clock = { now: NOW };
		const exercises = Array.from({ length: 8 }, () => playPassage(s, clock)[0].exerciseId);
		expect(exercises).toEqual([
			'gesture-link',
			'gesture-climb',
			'gesture-zone',
			'gesture-jam',
			'gesture-link',
			'gesture-climb',
			'gesture-zone',
			'gesture-jam'
		]);
	});

	it('skips an exercise with nothing open', () => {
		const s = selector(triadCards('triad-anchor', 'D', 'maj', G_B_E));
		const clock = { now: NOW };
		expect(playPassage(s, clock)[0].exerciseId).toBe('gesture-link');
		expect(playPassage(s, clock)[0].exerciseId).toBe('gesture-link');
	});

	it('takes the element played least recently, the two sets of a chord in turn', () => {
		const cards = [
			...triadCards('triad-anchor', 'D', 'maj', G_B_E),
			...triadCards('triad-anchor', 'D', 'maj', D_G_B)
		];
		const s = selector(cards);
		const clock = { now: NOW };
		const elements = Array.from({ length: 3 }, () => itemOf(playPassage(s, clock)[0]).element);
		expect(elements).toEqual(['link:D|maj:3,2,1', 'link:D|maj:4,3,2', 'link:D|maj:3,2,1']);
	});

	it('remembers the elements played in earlier sessions', () => {
		const cards = [
			...triadCards('triad-anchor', 'D', 'maj', G_B_E),
			...triadCards('triad-anchor', 'D', 'maj', D_G_B)
		];
		const before = playPassage(selector(cards), { now: NOW });
		const history = before.map((planned, i) => attemptOf(planned, NOW + i));
		const s = selector(cards, history, 's2');
		expect(itemOf(playPassage(s, { now: NOW + 3_600_000 })[0]).element).toBe('link:D|maj:4,3,2');
	});

	it('links the shapes of a chord one per bar, up then down, the first change counted in', () => {
		const s = selector(triadCards('triad-anchor', 'D', 'maj', G_B_E));
		const passage = playPassage(s, { now: NOW });
		expect(passage.map((p) => itemOf(p).shape)).toEqual([
			shapeId('D', 'maj', G_B_E, '2-3-2'),
			shapeId('D', 'maj', G_B_E, '7-7-5'),
			shapeId('D', 'maj', G_B_E, '11-10-10'),
			shapeId('D', 'maj', G_B_E, '14-15-14'),
			shapeId('D', 'maj', G_B_E, '11-10-10'),
			shapeId('D', 'maj', G_B_E, '7-7-5'),
			shapeId('D', 'maj', G_B_E, '2-3-2')
		]);
		expect(passage.map((p) => p.countIn ?? false)).toEqual([
			true,
			false,
			false,
			false,
			false,
			false,
			false
		]);
		expect(itemOf(passage[0])).toMatchObject({
			rule: 'link',
			passageId: 's1:0',
			symbol: 'D',
			chord: 'D|maj',
			sets: [[3, 2, 1]],
			changes: [0, 4, 8, 12, 16, 20, 24].map((at) => ({ at, length: 4, symbol: 'D' }))
		});
		expect(passage[0]).toMatchObject({
			mechanic: 'chord-grid',
			phase: 'free',
			temperature: 'hot',
			leadBeats: null
		});
	});

	it('alternates the direction of the climb, from one session to the next too', () => {
		const cards = IOHEFY.flatMap(([root, quality]) =>
			triadCards('triad-anchor', root, quality, G_B_E)
		);
		const s = selector(cards);
		const clock = { now: NOW };
		const climbs: PlannedItem[][] = [];
		while (climbs.length < 2) {
			const passage = playPassage(s, clock);
			if (passage[0].exerciseId === 'gesture-climb') climbs.push(passage);
		}
		expect(climbs.map((c) => itemOf(c[0]).direction)).toEqual(['up', 'down']);
		const history = climbs.flat().map((planned, i) => attemptOf(planned, NOW + i));
		const next = selector(cards, history, 's2');
		for (;;) {
			const passage = playPassage(next, clock);
			if (passage[0].exerciseId !== 'gesture-climb') continue;
			expect(itemOf(passage[0]).direction).toBe('up');
			expect(passage.every((p) => itemOf(p).direction === 'up')).toBe(true);
			break;
		}
	});

	it('gives a zone passage its zone, the next passage the zone after', () => {
		const s = selector(ALL_OPEN);
		const clock = { now: NOW };
		const zones: unknown[] = [];
		while (zones.length < 2) {
			const passage = playPassage(s, clock);
			if (passage[0].exerciseId === 'gesture-zone') zones.push(itemOf(passage[0]).zone);
		}
		expect(zones).toEqual([
			{ from: 7, to: 10 },
			{ from: 10, to: 13 }
		]);
	});

	it('follows the last shape heard in the passage', () => {
		const s = selector(triadCards('triad-anchor', 'D', 'maj', G_B_E));
		const ctx = { now: NOW, elapsedMs: 0, fatigued: false };
		const first = s.next(ctx)!;
		expect(itemOf(first).previous).toBeNull();
		const heard = shapeId('D', 'maj', G_B_E, '2-3-2');
		s.record(attemptOf(first, NOW, true, heard), NOW);
		const second = s.next(ctx)!;
		expect(itemOf(second).previous).toBe(heard);
		// Nothing heard: the shape before still rings.
		s.record(attemptOf(second, NOW, false, null), NOW);
		expect(itemOf(s.next(ctx)!).previous).toBe(heard);
	});

	it('aids a passage until one succeeds, and again after a failed one', () => {
		const s = selector(triadCards('triad-anchor', 'D', 'maj', G_B_E));
		const clock = { now: NOW };
		const aids = [true, false, true, true].map((correct) => {
			const passage = playPassage(s, clock, correct);
			return passage[0].aid;
		});
		expect(aids).toEqual(['show-position', 'none', 'show-position', 'none']);
	});

	it('starts no passage after GESTURE_SESSION_MS or once fatigued, but finishes the one begun', () => {
		expect(GESTURE_SESSION_MS).toBe(300_000);
		const s = selector(triadCards('triad-anchor', 'D', 'maj', G_B_E));
		const late = { now: NOW, elapsedMs: GESTURE_SESSION_MS - 1, fatigued: false };
		const first = s.next(late)!;
		const over = { ...late, elapsedMs: GESTURE_SESSION_MS + 60_000 };
		let rest = 0;
		let planned: PlannedItem | null = first;
		while (planned) {
			s.record(attemptOf(planned, NOW), NOW);
			planned = s.next(over);
			if (planned) rest++;
		}
		expect(rest).toBe(6);
		const tired = selector(triadCards('triad-anchor', 'D', 'maj', G_B_E));
		expect(tired.next({ now: NOW, elapsedMs: 0, fatigued: true })).toBeNull();
	});

	it('serves nothing when nothing is open', () => {
		expect(selector([]).next({ now: NOW, elapsedMs: 0, fatigued: false })).toBeNull();
	});
});
