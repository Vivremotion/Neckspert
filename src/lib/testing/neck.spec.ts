import { describe, expect, it } from 'vitest';
import { asNeckCard, neckCardKey } from './neck';

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
