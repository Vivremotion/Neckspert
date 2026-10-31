import { describe, expect, it } from 'vitest';
import { CONTENT_DERIVATIONS } from '$lib/domain/derivations';
import { DERIVED_PICTURES, neckPicture, PICTURES } from './pictures';

describe('DERIVED_PICTURES', () => {
	it('maps derivations of lists of notes to pictures that read their mechanics', () => {
		const entries = Object.entries(DERIVED_PICTURES);
		expect(entries.length).toBeGreaterThan(0);
		for (const [derivation, picture] of entries) {
			expect(Object.keys(CONTENT_DERIVATIONS), derivation).toContain(derivation);
			expect(CONTENT_DERIVATIONS[derivation].list, derivation).toBe(true);
			expect(Object.keys(PICTURES), picture).toContain(picture);
			// The picture draws the items the derivation reads.
			expect(PICTURES[picture].reads, picture).toEqual(
				expect.arrayContaining([...CONTENT_DERIVATIONS[derivation].reads])
			);
		}
	});
});

describe('neckPicture', () => {
	it('draws a place a form comes back to once', () => {
		const picture = neckPicture([
			{ midi: 60, string: 3 },
			{ midi: 64, string: 2 },
			{ midi: 67, string: 1 },
			{ midi: 64, string: 2 }
		]);
		expect(picture).toMatchObject({
			kind: 'neck',
			notes: [
				{ string: 3, fret: 5 },
				{ string: 2, fret: 5 },
				{ string: 1, fret: 3 }
			]
		});
	});
});
