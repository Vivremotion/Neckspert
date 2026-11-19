import { describe, expect, it } from 'vitest';
import { parseVoicingKey } from '$lib/domain/music';
import { FAMILIES, familyNamed, INDEX_DERIVATIONS, indexDerivation } from './index';

describe('families', () => {
	it('registers the guitar families by their id', () => {
		expect(Object.keys(FAMILIES).sort()).toEqual(['chord-shapes', 'note-places']);
		for (const [id, family] of Object.entries(FAMILIES)) expect(family.id).toBe(id);
		expect(familyNamed('note-places')).toBe(FAMILIES['note-places']);
		expect(familyNamed('nothing')).toBeNull();
		expect(familyNamed('toString')).toBeNull();
	});
});

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
	});

	it('gives a note on a string as the index of its places', () => {
		expect(INDEX_DERIVATIONS.note.index({ string: 2, pitch: 'F' })).toEqual({
			pitch: 'F',
			string: 2
		});
	});

	it('gives a voicing as its chord, its strings and its degrees', () => {
		const key = 'C|maj|3:1,2:3,1:5';
		expect(INDEX_DERIVATIONS.voicing.index({ voicingKey: key, position: 5 })).toEqual({
			chord: parseVoicingKey(key).chord,
			strings: [3, 2, 1],
			degrees: ['1', '3', '5']
		});
	});

	it('gives the root of a voicing on the string that carries it', () => {
		expect(INDEX_DERIVATIONS.root.index({ voicingKey: 'C|maj|3:5,2:1,1:3' })).toEqual({
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
