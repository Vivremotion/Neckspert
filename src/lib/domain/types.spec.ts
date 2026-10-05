import { describe, expect, it } from 'vitest';
import { cardKey, parseCardKey } from './types';

describe('cardKey', () => {
	it('prefixes an item key with its mechanic', () => {
		expect(cardKey('locate', '6:F')).toBe('locate:6:F');
		expect(cardKey('identify', '5:8')).toBe('identify:5:8');
	});

	it('splits a key into its mechanic and its item key', () => {
		expect(parseCardKey('identify:6:3')).toEqual({ mechanic: 'identify', itemKey: '6:3' });
		expect(parseCardKey(cardKey('locate', '6:G#'))).toEqual({
			mechanic: 'locate',
			itemKey: '6:G#'
		});
	});

	it('rejects a key without a mechanic or an item', () => {
		expect(() => parseCardKey('locate')).toThrow();
		expect(() => parseCardKey('locate:')).toThrow();
		expect(() => parseCardKey(':6:F')).toThrow();
	});
});
