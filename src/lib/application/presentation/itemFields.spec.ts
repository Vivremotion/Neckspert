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
