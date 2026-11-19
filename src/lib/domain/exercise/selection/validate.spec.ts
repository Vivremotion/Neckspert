import { describe, expect, it } from 'vitest';
import { IDENTIFY_NECK, LOCATE_NECK, TRIADS_ZONE } from '$lib/testing/catalog';
import { CLIMB_PASSAGES } from '$lib/testing/changesPassages';
import { selectionProblemOf } from './validate';

describe('selectionProblemOf', () => {
	it('accepts a selection the exercise can run', () => {
		expect(selectionProblemOf(LOCATE_NECK, { family: 'note-places' })).toBeNull();
		expect(
			selectionProblemOf(TRIADS_ZONE, {
				family: 'chord-shapes',
				where: [{ at: { item: 'fret' } }, { other: 'previous' }],
				order: ['position'],
				take: 1
			})
		).toBeNull();
	});

	it('names the selection’s own fields, with no prefix', () => {
		expect(selectionProblemOf(LOCATE_NECK, { family: 'nope' })).toBe(
			'names family "nope", which is not registered'
		);
		expect(selectionProblemOf(IDENTIFY_NECK, { family: 'chord-shapes' })).toBe(
			'set placed-note gives no index of chord-shapes'
		);
		expect(selectionProblemOf(TRIADS_ZONE, { family: 'chord-shapes', of: 'nope' })).toBe(
			'of "nope" gives no index of chord-shapes from voicing-on-strings'
		);
		expect(selectionProblemOf(LOCATE_NECK, { family: 'note-places', where: [{ near: 1 }] })).toBe(
			'where[0] is no filter (in, at, position, other)'
		);
		expect(
			selectionProblemOf(TRIADS_ZONE, { family: 'chord-shapes', where: [{ at: { item: 'nope' } }] })
		).toBe('where[0] reads item value "nope", which voicing-on-strings does not have');
		expect(selectionProblemOf(LOCATE_NECK, { family: 'note-places', take: 0 })).toBe(
			'take must be a positive whole number'
		);
		expect(selectionProblemOf(LOCATE_NECK, { family: 'note-places', order: ['nope'] })).toBe(
			'order names attribute "nope", which family "note-places" does not have'
		);
		expect(selectionProblemOf(LOCATE_NECK, { family: 'note-places', from: 'x' })).toMatch(
			/^from is not a key/
		);
	});

	it('refuses more filters or attributes of order than allowed, before looking at them', () => {
		expect(
			selectionProblemOf(LOCATE_NECK, {
				family: 'note-places',
				where: Array.from({ length: 45_000 }, () => ({ near: 1 }))
			})
		).toBe('where has 45000 filters, more than 16');
		expect(
			selectionProblemOf(LOCATE_NECK, { family: 'note-places', order: Array(9).fill('nope') })
		).toBe('order names 9 attributes, more than 8');
	});

	it('reads the direction of a position in a param, up or down at every level', () => {
		const climbing = (toward: unknown) => ({
			family: 'chord-shapes',
			where: [{ position: { beyond: 'previous', toward, turns: true } }]
		});
		expect(selectionProblemOf(CLIMB_PASSAGES, climbing({ param: 'direction' }))).toBeNull();
		const sideways = { ...TRIADS_ZONE, params: { ...TRIADS_ZONE.params, way: 'sideways' } };
		expect(selectionProblemOf(sideways, climbing({ param: 'way' }))).toBe(
			'where[0].position.toward reads param "way", which exercise level 0, item level 0 gives as "sideways", not up or down'
		);
		expect(selectionProblemOf(TRIADS_ZONE, climbing({ param: 'nope' }))).toBe(
			'where[0].position.toward reads param "nope", which no level of the exercise writes'
		);
		expect(selectionProblemOf(TRIADS_ZONE, climbing('left'))).toBe(
			'where[0].position must be { beyond: "previous", toward: "up", "down" or { param }, turns?: true or false }'
		);
	});

	it('knows no `andBack`: only a passage’s members write it', () => {
		expect(selectionProblemOf(TRIADS_ZONE, { family: 'chord-shapes', andBack: true })).toMatch(
			/^andBack is not a key of its place/
		);
	});
});
