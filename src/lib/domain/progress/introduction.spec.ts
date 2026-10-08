import { describe, expect, it } from 'vitest';
import type { CardState } from '$lib/domain/types';
import {
	fretsForPitch,
	locateItemKey,
	neckCardKey,
	type LocateItem,
	type NeckCard
} from '$lib/domain/music';
import { introduceCard } from './cards';
import { introductionOrder, nextNewCard } from './introduction';
import { keyed, neckTiming } from './neck';

const NOW = Date.parse('2026-10-02T10:00:00.000Z');

function keys(items: readonly LocateItem[]): string[] {
	return items.map((item) => `${item.string}:${item.pitch}`);
}

const locate = (item: LocateItem): NeckCard => ({ mechanic: 'locate', item });

function introduced(card: NeckCard): CardState {
	return introduceCard(keyed(card), NOW, 's1', neckTiming(card.mechanic));
}

function acquired(card: CardState): CardState {
	return { ...card, learnedAt: NOW, acquiredAt: NOW };
}

describe('introductionOrder', () => {
	it('lists the 66 locate positions once, without open strings', () => {
		const order = introductionOrder();
		expect(order).toHaveLength(66);
		expect(new Set(order.map(locateItemKey)).size).toBe(66);
		expect(order.every((item) => 'pitch' in item && !('fret' in item))).toBe(true);
	});

	it('puts the 36 naturals before the 30 altered notes', () => {
		const order = introductionOrder();
		expect(order.slice(0, 36).every((item) => !item.pitch.includes('#'))).toBe(true);
		expect(order.slice(36).every((item) => item.pitch.includes('#'))).toBe(true);
	});

	it('alternates strings, starting with a natural on a fret marker of each string', () => {
		expect(keys(introductionOrder().slice(0, 6))).toEqual([
			'6:G',
			'5:C',
			'4:F',
			'3:C',
			'2:D',
			'1:G'
		]);
	});

	it('orders the naturals of a string: markers first, then the others, by fret', () => {
		const order = introductionOrder();
		const onString = (string: number) =>
			order
				.slice(0, 36)
				.filter((item) => item.string === string)
				.map((item) => item.pitch);
		expect(onString(6)).toEqual(['G', 'A', 'B', 'F', 'C', 'D']);
		expect(onString(3)).toEqual(['C', 'D', 'E', 'A', 'B', 'F']);
	});

	it('orders the altered notes of a string by fret', () => {
		const altered = introductionOrder()
			.slice(36)
			.filter((item) => item.string === 6)
			.map((item) => item.pitch);
		expect(altered).toEqual(['F#', 'G#', 'A#', 'C#', 'D#']);
	});
});

describe('nextNewCard', () => {
	it('starts with the first position of the order', () => {
		expect(nextNewCard([])).toEqual(locate({ string: 6, pitch: 'G' }));
	});

	it('skips positions that already have a card', () => {
		const cards = [introduced(locate({ string: 6, pitch: 'G' }))];
		expect(nextNewCard(cards)).toEqual(locate({ string: 5, pitch: 'C' }));
	});

	it('offers the identify position of an acquired locate card first', () => {
		const cards = [acquired(introduced(locate({ string: 6, pitch: 'G' })))];
		expect(nextNewCard(cards)).toEqual({ mechanic: 'identify', item: { string: 6, fret: 3 } });
	});

	it('holds back a note whose mirror is not acquired yet, without blocking the next ones', () => {
		const order = introductionOrder();
		const eOnA = order.findIndex((item) => item.string === 5 && item.pitch === 'E');
		const done = order.slice(0, eOnA).flatMap((item) => {
			const fret = fretsForPitch(item.string, item.pitch, 11).find((f) => f > 0) ?? 0;
			return [
				acquired(introduced(locate(item))),
				introduced({ mechanic: 'identify', item: { string: item.string, fret } })
			];
		});
		const aOnLowE = neckCardKey(locate({ string: 6, pitch: 'A' }));
		const cards = done.map((card) => (card.key === aOnLowE ? { ...card, acquiredAt: null } : card));
		expect(nextNewCard(cards)).toEqual(locate(order[eOnA + 1]));
		expect(nextNewCard(done)).toEqual(locate(order[eOnA]));
	});

	it('returns null when every position has a card and none is acquired', () => {
		const cards = introductionOrder().map((item) => introduced(locate(item)));
		expect(nextNewCard(cards)).toBeNull();
	});
});

describe('the notes of the triads being learned', () => {
	const cSharpOnE: LocateItem = { string: 1, pitch: 'C#' };

	it('come first in the queue, in their order, once each', () => {
		const order = introductionOrder([cSharpOnE, cSharpOnE]);
		expect(keys(order.slice(0, 1))).toEqual(['1:C#']);
		expect(keys(order).filter((key) => key === '1:C#')).toHaveLength(1);
		expect(order).toHaveLength(introductionOrder().length);
	});

	it('are the next note introduced', () => {
		expect(nextNewCard([], [cSharpOnE])).toEqual(locate(cSharpOnE));
	});
});
