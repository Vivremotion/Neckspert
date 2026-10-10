import { describe, expect, it } from 'vitest';
import { triadCards } from '$lib/testing/shapes';
import { GESTURE_CLIMB, GESTURE_JAM, GESTURE_LINK, GESTURE_ZONE } from './exercises';
import { gestureOpen, openElements } from './opening';

const G_B_E = [3, 2, 1] as const;
const D_G_B = [4, 3, 2] as const;

/** The triads of iohefy-a: Dm, G, C, F, Em, Ebm, Ab. */
const IOHEFY = [
	['D', 'min'],
	['G', 'maj'],
	['C', 'maj'],
	['F', 'maj'],
	['E', 'min'],
	['Eb', 'min'],
	['Ab', 'maj']
] as const;

const iohefyOn = (mechanic: 'triad-anchor' | 'triad-zone', set: readonly (3 | 2 | 1 | 4)[]) =>
	IOHEFY.flatMap(([root, quality]) => triadCards(mechanic, root, quality, set));

describe('openElements', () => {
	it('opens linking a chord on a set once its three inversions are acquired in anchor', () => {
		const three = triadCards('triad-anchor', 'D', 'maj', G_B_E);
		expect(openElements(GESTURE_LINK, three).map((e) => e.key)).toEqual(['link:D|maj:3,2,1']);
		expect(openElements(GESTURE_LINK, three.slice(0, 2))).toEqual([]);
		const learning = triadCards('triad-anchor', 'D', 'maj', G_B_E, null);
		expect(openElements(GESTURE_LINK, learning)).toEqual([]);
		// Acquired in the zone does not open the link.
		expect(openElements(GESTURE_LINK, triadCards('triad-zone', 'D', 'maj', G_B_E))).toEqual([]);
	});

	it('opens the climb of a grid on a set once every triad of it is acquired there in anchor', () => {
		const cards = iohefyOn('triad-anchor', G_B_E);
		expect(openElements(GESTURE_CLIMB, cards).map((e) => e.key)).toEqual(['climb:iohefy-a:3,2,1']);
		expect(openElements(GESTURE_CLIMB, cards.slice(3))).toEqual([]);
	});

	it('opens the zone of a grid once every triad of it is acquired in the zone on both sets', () => {
		const both = [...iohefyOn('triad-zone', G_B_E), ...iohefyOn('triad-zone', D_G_B)];
		expect(openElements(GESTURE_ZONE, both).map((e) => e.key)).toEqual(['zone:iohefy-a']);
		expect(openElements(GESTURE_ZONE, iohefyOn('triad-zone', G_B_E))).toEqual([]);
		expect(
			openElements(GESTURE_ZONE, [
				...iohefyOn('triad-anchor', G_B_E),
				...iohefyOn('triad-anchor', D_G_B)
			])
		).toEqual([]);
	});

	it('opens the jam of a grid once every triad of it is acquired in anchor on one set at least', () => {
		const mixed = IOHEFY.flatMap(([root, quality], i) =>
			triadCards('triad-anchor', root, quality, i % 2 === 0 ? G_B_E : D_G_B)
		);
		expect(openElements(GESTURE_JAM, mixed).map((e) => e.key)).toEqual(['jam:iohefy-a']);
		expect(openElements(GESTURE_JAM, mixed.slice(1))).toEqual([]);
	});

	it('opens an exercise when one of its elements is open', () => {
		const cards = triadCards('triad-anchor', 'D', 'maj', G_B_E);
		expect(gestureOpen(GESTURE_LINK, cards)).toBe(true);
		expect(gestureOpen(GESTURE_CLIMB, cards)).toBe(false);
		expect(gestureOpen(GESTURE_LINK, [])).toBe(false);
	});
});
