import { describe, expect, it } from 'vitest';
import { TRIADS_ANCHOR } from '$lib/domain/exercise';
import { voicingKey } from '$lib/domain/music';
import { introduceCard, markLearned } from '$lib/domain/progress/cards';
import { cardKey, type CardState } from '$lib/domain/types';
import { triadIntroductionOrder } from './introduction';
import { triadParams } from './items';
import { triadZoneOpen, ZONE_MIN_ACQUIRED_TRIADS } from './zoneOpen';

const ORDER = triadIntroductionOrder(triadParams(TRIADS_ANCHOR), new Set()).map(voicingKey);

function card(mechanic: 'triad-anchor' | 'triad-zone', key: string, acquired: boolean): CardState {
	const learned = markLearned(
		introduceCard({ key: cardKey(mechanic, key), mechanic, item: { voicingKey: key } }, 0, 's-old'),
		0
	);
	return { ...learned, acquiredAt: acquired ? 0 : null };
}

describe('triadZoneOpen', () => {
	it('opens the zone once six triads are acquired in anchor', () => {
		expect(ZONE_MIN_ACQUIRED_TRIADS).toBe(6);
		const acquired = ORDER.slice(0, 6).map((key) => card('triad-anchor', key, true));
		expect(triadZoneOpen(acquired.slice(0, 5))).toBe(false);
		expect(triadZoneOpen([...acquired.slice(0, 5), card('triad-anchor', ORDER[5], false)])).toBe(
			false
		);
		expect(triadZoneOpen(acquired)).toBe(true);
	});

	it('keeps the zone open once it has a card', () => {
		expect(
			triadZoneOpen([card('triad-anchor', ORDER[0], true), card('triad-zone', ORDER[0], false)])
		).toBe(true);
	});
});
