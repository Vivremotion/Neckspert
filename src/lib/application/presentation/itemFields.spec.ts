import { describe, expect, it } from 'vitest';
import { ITEM_FIELDS } from './itemFields';

const D_ON_B = 'D|maj|3:5,2:1,1:3';

/** One item of each mechanic that offers fields. */
const SAMPLES: Record<string, unknown> = {
	locate: { string: 2, pitch: 'F' },
	identify: { string: 3, fret: 8 },
	'triad-anchor': { voicingKey: D_ON_B },
	'triad-zone': { voicingKey: D_ON_B, position: 2, fret: 3 }
};

describe('ITEM_FIELDS', () => {
	it('names exactly the fields it writes for an item', () => {
		expect(Object.keys(ITEM_FIELDS).sort()).toEqual(Object.keys(SAMPLES).sort());
		for (const [mechanic, offered] of Object.entries(ITEM_FIELDS)) {
			for (const locale of ['fr', 'en'] as const) {
				const written = offered.fields(SAMPLES[mechanic], locale, () => 0);
				expect(Object.keys(written).sort(), mechanic).toEqual([...offered.names].sort());
			}
		}
	});
});

describe('the fields of a triad', () => {
	const anchor = ITEM_FIELDS['triad-anchor'];
	const zone = ITEM_FIELDS['triad-zone'];

	it('spells Eb, Ab and Bb with a flat', () => {
		expect(anchor.fields({ voicingKey: 'D#|min|3:5,2:1,1:b3' }, 'fr', () => 0).chord).toBe('Ebm');
		expect(anchor.fields({ voicingKey: 'C#|maj|3:5,2:1,1:3' }, 'fr', () => 0).chord).toBe('C#');
	});

	it('names the fret drawn for a zone, else the lowest fret of its shape', () => {
		expect(zone.fields({ voicingKey: D_ON_B, position: 2, fret: 3 }, 'fr', () => 0).around).toBe(
			'vers la case 3'
		);
		expect(zone.fields({ voicingKey: D_ON_B, position: 2, fret: 3 }, 'en', () => 0).around).toBe(
			'around fret 3'
		);
		// An attempt stored before the fret was drawn.
		expect(zone.fields({ voicingKey: D_ON_B, position: 2 }, 'fr', () => 0).around).toBe(
			'vers la case 2'
		);
	});

	it('calls a shape on open strings open', () => {
		const open = { voicingKey: 'E|min|3:b3,2:5,1:1', position: 'open' };
		expect(zone.fields(open, 'fr', () => 0)).toMatchObject({ chord: 'Em', around: 'à vide' });
		expect(zone.fields(open, 'en', () => 0).around).toBe('open');
	});
});
