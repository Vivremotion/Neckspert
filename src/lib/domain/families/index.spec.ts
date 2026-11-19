import { describe, expect, it } from 'vitest';
import { triadOf } from '$lib/domain/grid';
import { parseVoicingKey } from '$lib/domain/music';
import { FAMILIES, familyNamed, INDEX_DERIVATIONS, indexDerivation } from './index';

describe('families', () => {
	it('registers the guitar and music families by their id', () => {
		expect(Object.keys(FAMILIES).sort()).toEqual(['chord-shapes', 'grid-changes', 'note-places']);
		for (const [id, family] of Object.entries(FAMILIES)) expect(family.id).toBe(id);
		expect(familyNamed('note-places')).toBe(FAMILIES['note-places']);
		expect(familyNamed('nothing')).toBeNull();
		expect(familyNamed('toString')).toBeNull();
	});
});

/** What a derivation reads besides its item, out of a passage. */
const NO_PASSAGE = { of: {}, params: {} };

describe('index derivations', () => {
	it('names the families they index and the sets they read', () => {
		expect(INDEX_DERIVATIONS.note).toMatchObject({
			family: 'note-places',
			reads: ['note-on-string']
		});
		expect(INDEX_DERIVATIONS.voicing).toMatchObject({
			family: 'chord-shapes',
			reads: ['voicing-on-strings']
		});
		expect(INDEX_DERIVATIONS.root).toMatchObject({
			family: 'note-places',
			reads: ['voicing-on-strings']
		});
		expect(INDEX_DERIVATIONS['change-chord']).toMatchObject({
			family: 'chord-shapes',
			reads: ['change']
		});
		expect(INDEX_DERIVATIONS.placed).toMatchObject({
			family: 'chord-shapes',
			reads: ['placed-voicing']
		});
	});

	it('gives a change as the triad of its symbol on the zone of strings of its passage', () => {
		const change = INDEX_DERIVATIONS['change-chord'];
		const zone = [4, 3, 2, 1];
		expect(
			change.index({ grid: 'iohefy-a', index: 4 }, { of: { strings: zone }, params: {} })
		).toEqual({
			chord: triadOf('Cmaj7'),
			strings: zone
		});
		expect(
			change.index(
				{ grid: 'blues-f', index: 8 },
				{ of: { strings: zone }, params: { strings: [3, 2, 1] } }
			)
		).toEqual({ chord: triadOf('C7'), strings: zone });
		expect(
			change.index({ grid: 'iohefy-a', index: 7 }, { of: {}, params: { strings: [3, 2, 1] } })
		).toEqual({
			chord: triadOf('Ebm7'),
			strings: [3, 2, 1]
		});
	});

	it('refuses a change it cannot find, or without a zone of strings', () => {
		const change = INDEX_DERIVATIONS['change-chord'];
		const zone = { of: { strings: [4, 3, 2, 1] }, params: {} };
		expect(() => change.index({ grid: 'nowhere', index: 0 }, zone)).toThrow(
			'Unknown grid: nowhere'
		);
		expect(() => change.index({ grid: 'iohefy-a', index: 9 }, zone)).toThrow(
			'grid "iohefy-a" has no change at rank 9'
		);
		expect(() => change.index({ grid: 'iohefy-a', index: 0 }, NO_PASSAGE)).toThrow(
			'no zone of strings: neither the passage nor the params give "strings"'
		);
		expect(() =>
			change.index({ grid: 'iohefy-a', index: 0 }, { of: { strings: 4 }, params: {} })
		).toThrow('no zone of strings');
	});

	it('gives a placed voicing as its chord, strings, degrees and frets', () => {
		const key = 'C|maj|3:1,2:3,1:5';
		expect(INDEX_DERIVATIONS.placed.index({ voicing: key, frets: [5, 5, 3] }, NO_PASSAGE)).toEqual({
			chord: parseVoicingKey(key).chord,
			strings: [3, 2, 1],
			degrees: ['1', '3', '5'],
			frets: [5, 5, 3]
		});
	});

	it('gives a note on a string as the index of its places', () => {
		expect(INDEX_DERIVATIONS.note.index({ string: 2, pitch: 'F' }, NO_PASSAGE)).toEqual({
			pitch: 'F',
			string: 2
		});
	});

	it('gives a voicing as its chord, its strings and its degrees', () => {
		const key = 'C|maj|3:1,2:3,1:5';
		expect(INDEX_DERIVATIONS.voicing.index({ voicingKey: key, position: 5 }, NO_PASSAGE)).toEqual({
			chord: parseVoicingKey(key).chord,
			strings: [3, 2, 1],
			degrees: ['1', '3', '5']
		});
	});

	it('gives the root of a voicing on the string that carries it', () => {
		expect(INDEX_DERIVATIONS.root.index({ voicingKey: 'C|maj|3:5,2:1,1:3' }, NO_PASSAGE)).toEqual({
			pitch: 'C',
			string: 2
		});
	});

	it('finds the default derivation of a family on a set, and a named one', () => {
		expect(indexDerivation('note-places', 'note-on-string')).toBe(INDEX_DERIVATIONS.note);
		expect(indexDerivation('chord-shapes', 'voicing-on-strings')).toBe(INDEX_DERIVATIONS.voicing);
		expect(indexDerivation('note-places', 'voicing-on-strings')).toBeNull();
		expect(indexDerivation('note-places', 'voicing-on-strings', 'root')).toBe(
			INDEX_DERIVATIONS.root
		);
		expect(indexDerivation('chord-shapes', 'change')).toBe(INDEX_DERIVATIONS['change-chord']);
		expect(indexDerivation('chord-shapes', 'placed-voicing')).toBe(INDEX_DERIVATIONS.placed);
		expect(indexDerivation('grid-changes', 'change')).toBeNull();
	});

	it('finds none for a name, family or set that does not fit', () => {
		expect(indexDerivation('chord-shapes', 'note-on-string')).toBeNull();
		expect(indexDerivation('chord-shapes', 'voicing-on-strings', 'root')).toBeNull();
		expect(indexDerivation('note-places', 'note-on-string', 'root')).toBeNull();
		expect(indexDerivation('note-places', 'note-on-string', 'nothing')).toBeNull();
		expect(indexDerivation('note-places', 'note-on-string', 'toString')).toBeNull();
		expect(indexDerivation('nothing', 'note-on-string')).toBeNull();
	});
});
