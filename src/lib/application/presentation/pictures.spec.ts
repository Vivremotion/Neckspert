import { describe, expect, it } from 'vitest';
import { CONTENT_DERIVATIONS } from '$lib/domain/derivations';
import { DERIVED_PICTURES, PICTURES } from './pictures';

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
