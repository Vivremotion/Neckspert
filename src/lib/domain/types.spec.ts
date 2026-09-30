import { describe, expect, it } from 'vitest';
import { cardKey, parseCardKey, type Target } from './types';

describe('cardKey', () => {
	it('encodes locate and identify targets', () => {
		expect(cardKey({ direction: 'locate', string: 2, pitch: 'F' })).toBe('locate:2:F');
		expect(cardKey({ direction: 'identify', string: 5, fret: 8 })).toBe('identify:5:8');
	});

	it('round-trips through parseCardKey', () => {
		const targets: Target[] = [
			{ direction: 'locate', string: 6, pitch: 'G#' },
			{ direction: 'identify', string: 1, fret: 0 },
			{ direction: 'identify', string: 3, fret: 11 }
		];
		for (const target of targets) {
			expect(parseCardKey(cardKey(target))).toEqual(target);
		}
	});

	it('rejects malformed keys', () => {
		expect(() => parseCardKey('locate:7:F')).toThrow();
		expect(() => parseCardKey('locate:2:H')).toThrow();
		expect(() => parseCardKey('identify:2:12')).toThrow();
		expect(() => parseCardKey('play:2:F')).toThrow();
		expect(() => parseCardKey('identify:2:')).toThrow();
		expect(() => parseCardKey('locate:2:F:extra')).toThrow();
	});
});
