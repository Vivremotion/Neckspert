import { describe, expect, it } from 'vitest';
import { ITEM_SET_NAMES } from './names';
import { ITEM_SETS, itemSet, setOfSkill } from './index';

describe('ITEM_SETS', () => {
	it('holds the seven sets the code knows, one per name', () => {
		expect(ITEM_SETS.map((set) => set.id)).toEqual([...ITEM_SET_NAMES]);
	});

	it('finds a set by its id, and refuses an id it does not hold', () => {
		for (const name of ITEM_SET_NAMES) expect(itemSet(name).id).toBe(name);
		expect(() => itemSet('chords')).toThrow('Unknown item set: chords');
	});
});

describe('setOfSkill', () => {
	it('gives the anchor and the zone one set, the voicings on strings', () => {
		expect(setOfSkill('chord-zone')).toBe(setOfSkill('chord-anchor'));
		expect(setOfSkill('chord-anchor').id).toBe('voicing-on-strings');
	});

	it('reads the set the skill’s definition names', () => {
		expect(setOfSkill('locate-note-string').id).toBe('note-on-string');
		expect(setOfSkill('identify-note').id).toBe('placed-note');
		expect(setOfSkill('inversion-run').id).toBe('placed-voicing');
		expect(setOfSkill('grid-reading').id).toBe('change');
		expect(setOfSkill('inner-pulse').id).toBe('figure');
	});
});

describe('the voicings on strings', () => {
	const set = itemSet('voicing-on-strings');
	const voicing = 'D|maj|3:5,2:1,1:3';

	it('keys an item by its voicing, whatever position the prompt adds', () => {
		expect(set.itemKey({ voicingKey: voicing })).toBe(voicing);
		expect(set.itemKey({ voicingKey: voicing, position: 7, fret: 8 })).toBe(voicing);
	});

	it('keeps on a card the voicing alone', () => {
		expect(set.cardItem?.({ voicingKey: voicing, position: 7, fret: 8 })).toEqual({
			voicingKey: voicing
		});
		expect(set.parseItem(voicing)).toEqual({ voicingKey: voicing });
		expect(() => set.parseItem('nothing')).toThrow();
	});
});

describe('the changes', () => {
	const set = itemSet('change');

	it('keys a change by its grid and its rank, and reads the key back', () => {
		expect(set.itemKey({ grid: 'iohefy-a', index: 2 })).toBe('iohefy-a#2');
		expect(set.parseItem('iohefy-a#2')).toEqual({ grid: 'iohefy-a', index: 2 });
		expect(() => set.parseItem('iohefy-a')).toThrow();
		expect(() => set.parseItem('jam:blues-f#3')).toThrow();
	});
});
