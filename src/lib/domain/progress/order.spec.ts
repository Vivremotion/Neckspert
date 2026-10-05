import { describe, expect, it } from 'vitest';
import type { LocateItem, NeckCard } from '$lib/domain/music';
import { allowedAfter, pickAtRandom } from './order';

const on = (string: LocateItem['string'], pitch: LocateItem['pitch']): NeckCard => ({
	mechanic: 'locate',
	item: { string, pitch }
});
/** A candidate carrying a card, as cards and planned items do. */
const item = (card: NeckCard) => ({ ...card, key: 'k' });

describe('allowedAfter', () => {
	it('never allows the same card or its mirror right after a card', () => {
		expect(allowedAfter(on(6, 'A'), on(6, 'A'))).toBe(false);
		expect(allowedAfter(on(5, 'E'), on(6, 'A'))).toBe(false);
		expect(allowedAfter(on(5, 'F'), on(6, 'A'))).toBe(true);
		expect(allowedAfter(on(6, 'A'), null)).toBe(true);
	});

	it('tells a locate card from the identify card of the same position', () => {
		expect(allowedAfter({ mechanic: 'identify', item: { string: 6, fret: 5 } }, on(6, 'A'))).toBe(
			true
		);
	});
});

describe('pickAtRandom', () => {
	const candidates = [on(6, 'G'), on(5, 'C'), on(4, 'F'), on(6, 'A')].map(item);

	it('draws with the injected random among allowed candidates', () => {
		expect(pickAtRandom(candidates, null, () => 0)?.item).toEqual(on(6, 'G').item);
		expect(pickAtRandom(candidates, null, () => 0.99)?.item).toEqual(on(6, 'A').item);
		expect(pickAtRandom(candidates, null, () => 0.5)?.item).toEqual(on(4, 'F').item);
	});

	it('skips the previous card and its mirror', () => {
		const picked = pickAtRandom([on(6, 'A'), on(5, 'E')].map(item), on(6, 'A'), () => 0);
		expect(picked).toBeNull();
	});

	it('avoids the string just played while another string is possible', () => {
		const previous = on(6, 'F');
		for (const r of [0, 0.3, 0.6, 0.99]) {
			expect(pickAtRandom(candidates, previous, () => r)?.item.string).not.toBe(6);
		}
		expect(pickAtRandom([on(6, 'G')].map(item), previous, () => 0)?.item).toEqual(on(6, 'G').item);
	});

	it('returns null without candidates', () => {
		expect(pickAtRandom([], null, () => 0)).toBeNull();
	});
});
