import { describe, expect, it } from 'vitest';
import {
	asNeckCard,
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
	it('prefixes the item key with its skill', () => {
		expect(neckCardKey({ skill: 'identify-note', item: { string: 6, fret: 3 } })).toBe(
			'identify-note:6:3'
		);
		expect(neckCardKey({ skill: 'locate-note-string', item: { string: 6, pitch: 'F' } })).toBe(
			'locate-note-string:6:F'
		);
	});
});

describe('asNeckCard', () => {
	it('reads a card of either neck skill', () => {
		const card = {
			key: 'locate-note-string:6:F',
			skill: 'locate-note-string',
			item: { string: 6, pitch: 'F' }
		};
		expect(asNeckCard(card)).toEqual({
			skill: 'locate-note-string',
			item: { string: 6, pitch: 'F' }
		});
		expect(asNeckCard({ skill: 'identify-note', item: { string: 6, fret: 3 } })).toEqual({
			skill: 'identify-note',
			item: { string: 6, fret: 3 }
		});
	});

	it('throws on another skill', () => {
		expect(() => asNeckCard({ skill: 'chords', item: {} })).toThrow(/chords/);
	});
});
