import { describe, expect, it } from 'vitest';
import { cardKey, type CardState, type LocateTarget } from '$lib/domain/types';
import { fretsForPitch } from '$lib/domain/music';
import { introduceCard } from './cards';
import { introductionOrder, nextNewTarget } from './introduction';

const NOW = Date.parse('2026-10-02T10:00:00.000Z');

function keys(targets: readonly LocateTarget[]): string[] {
	return targets.map((target) => `${target.string}:${target.pitch}`);
}

function acquired(card: CardState): CardState {
	return { ...card, learnedAt: NOW, acquiredAt: NOW };
}

describe('introductionOrder', () => {
	it('lists the 66 locate positions once, without open strings', () => {
		const order = introductionOrder();
		expect(order).toHaveLength(66);
		expect(new Set(order.map((target) => cardKey(target))).size).toBe(66);
		expect(order.every((target) => target.direction === 'locate')).toBe(true);
	});

	it('puts the 36 naturals before the 30 altered notes', () => {
		const order = introductionOrder();
		expect(order.slice(0, 36).every((target) => !target.pitch.includes('#'))).toBe(true);
		expect(order.slice(36).every((target) => target.pitch.includes('#'))).toBe(true);
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
				.filter((target) => target.string === string)
				.map((target) => target.pitch);
		expect(onString(6)).toEqual(['G', 'A', 'B', 'F', 'C', 'D']);
		expect(onString(3)).toEqual(['C', 'D', 'E', 'A', 'B', 'F']);
	});

	it('orders the altered notes of a string by fret', () => {
		const altered = introductionOrder()
			.slice(36)
			.filter((target) => target.string === 6)
			.map((target) => target.pitch);
		expect(altered).toEqual(['F#', 'G#', 'A#', 'C#', 'D#']);
	});
});

describe('nextNewTarget', () => {
	it('starts with the first position of the order', () => {
		expect(nextNewTarget([])).toEqual({ direction: 'locate', string: 6, pitch: 'G' });
	});

	it('skips positions that already have a card', () => {
		const cards = [introduceCard({ direction: 'locate', string: 6, pitch: 'G' }, NOW, 's1')];
		expect(nextNewTarget(cards)).toEqual({ direction: 'locate', string: 5, pitch: 'C' });
	});

	it('offers the identify position of an acquired locate card first', () => {
		const cards = [
			acquired(introduceCard({ direction: 'locate', string: 6, pitch: 'G' }, NOW, 's1'))
		];
		expect(nextNewTarget(cards)).toEqual({ direction: 'identify', string: 6, fret: 3 });
	});

	it('holds back a note whose mirror is not acquired yet, without blocking the next ones', () => {
		const order = introductionOrder();
		const eOnA = order.findIndex((target) => target.string === 5 && target.pitch === 'E');
		const done = order.slice(0, eOnA).flatMap((target) => {
			const fret = fretsForPitch(target.string, target.pitch, 11).find((f) => f > 0) ?? 0;
			return [
				acquired(introduceCard(target, NOW, 's1')),
				introduceCard({ direction: 'identify', string: target.string, fret }, NOW, 's1')
			];
		});
		const aOnLowE = cardKey({ direction: 'locate', string: 6, pitch: 'A' });
		const cards = done.map((card) => (card.key === aOnLowE ? { ...card, acquiredAt: null } : card));
		expect(nextNewTarget(cards)).toEqual(order[eOnA + 1]);
		expect(nextNewTarget(done)).toEqual(order[eOnA]);
	});

	it('returns null when every position has a card and none is acquired', () => {
		const cards = introductionOrder().map((target) => introduceCard(target, NOW, 's1'));
		expect(nextNewTarget(cards)).toBeNull();
	});
});
