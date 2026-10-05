import { describe, expect, it } from 'vitest';
import {
	identifyItemKey,
	locateItemKey,
	neckCardKey,
	parseIdentifyItem,
	parseLocateItem
} from './items';

describe('locate item keys', () => {
	it('round-trips a string and a pitch', () => {
		expect(locateItemKey({ string: 6, pitch: 'F' })).toBe('6:F');
		expect(parseLocateItem('6:F')).toEqual({ string: 6, pitch: 'F' });
		expect(parseLocateItem(locateItemKey({ string: 1, pitch: 'C#' }))).toEqual({
			string: 1,
			pitch: 'C#'
		});
	});

	it('rejects an unknown string, an unknown pitch and a missing pitch', () => {
		expect(() => parseLocateItem('7:F')).toThrow();
		expect(() => parseLocateItem('1:H')).toThrow();
		expect(() => parseLocateItem('1:')).toThrow();
		expect(() => parseLocateItem('1:F:2')).toThrow();
	});
});

describe('identify item keys', () => {
	it('round-trips a string and a fret', () => {
		expect(identifyItemKey({ string: 6, fret: 3 })).toBe('6:3');
		expect(parseIdentifyItem('6:3')).toEqual({ string: 6, fret: 3 });
		expect(parseIdentifyItem('1:0')).toEqual({ string: 1, fret: 0 });
		expect(parseIdentifyItem('1:11')).toEqual({ string: 1, fret: 11 });
	});

	it('rejects a fret past the prompted frets', () => {
		expect(() => parseIdentifyItem('1:12')).toThrow();
		expect(() => parseIdentifyItem('1:-1')).toThrow();
		expect(() => parseIdentifyItem('1:1.5')).toThrow();
		expect(() => parseIdentifyItem('0:3')).toThrow();
		expect(() => parseIdentifyItem('1:')).toThrow();
	});
});

describe('neckCardKey', () => {
	it('prefixes the item key with its mechanic', () => {
		expect(neckCardKey({ mechanic: 'identify', item: { string: 6, fret: 3 } })).toBe(
			'identify:6:3'
		);
		expect(neckCardKey({ mechanic: 'locate', item: { string: 6, pitch: 'F' } })).toBe('locate:6:F');
	});
});
