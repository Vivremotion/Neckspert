import { describe, expect, it } from 'vitest';
import type { LocateItem, NeckCard } from '$lib/domain/music';
import { allowedAfter, pickAtRandom } from './order';

const on = (string: LocateItem['string'], pitch: LocateItem['pitch']): NeckCard => ({
	skill: 'locate-note-string',
	item: { string, pitch }
});
/** A candidate carrying a card, as cards and planned items do. */
const item = (card: NeckCard) => ({ ...card, key: 'k' });

describe('allowedAfter', () => {
	it('never allows the same card right after a card, its mirror allowed', () => {
		expect(allowedAfter(on(6, 'A'), on(6, 'A'))).toBe(false);
		expect(allowedAfter(on(5, 'E'), on(6, 'A'))).toBe(true);
		expect(allowedAfter(on(5, 'F'), on(6, 'A'))).toBe(true);
		expect(allowedAfter(on(6, 'A'), null)).toBe(true);
	});

	it('tells a locate card from the identify card of the same position', () => {
		expect(allowedAfter({ skill: 'identify-note', item: { string: 6, fret: 5 } }, on(6, 'A'))).toBe(
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

	it('skips the previous card only, preferring no string', () => {
		expect(pickAtRandom([on(6, 'A')].map(item), on(6, 'A'), () => 0)).toBeNull();
		const picked = pickAtRandom([on(6, 'A'), on(5, 'E')].map(item), on(6, 'A'), () => 0);
		expect(picked?.item).toEqual(on(5, 'E').item);
		// The string just played may come again.
		expect(pickAtRandom(candidates, on(6, 'F'), () => 0)?.item).toEqual(on(6, 'G').item);
	});

	it('returns null without candidates', () => {
		expect(pickAtRandom([], null, () => 0)).toBeNull();
	});
});
