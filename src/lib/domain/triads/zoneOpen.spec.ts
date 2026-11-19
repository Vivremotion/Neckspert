import { describe, expect, it } from 'vitest';
import { introduceCard, markLearned } from '$lib/domain/progress/cards';
import { cardKey, type CardState } from '$lib/domain/types';
import { triadZoneOpen, ZONE_MIN_ACQUIRED_TRIADS } from './zoneOpen';
import { TRIAD_ORDER } from '$lib/testing/catalog';

function card(skill: 'chord-anchor' | 'chord-zone', key: string, acquired: boolean): CardState {
	const learned = markLearned(
		introduceCard({ key: cardKey(skill, key), skill, item: { voicingKey: key } }, 0, 's-old'),
		0
	);
	return { ...learned, acquiredAt: acquired ? 0 : null };
}

describe('triadZoneOpen', () => {
	it('opens the zone once six triads are acquired in anchor', () => {
		expect(ZONE_MIN_ACQUIRED_TRIADS).toBe(6);
		const acquired = TRIAD_ORDER.slice(0, 6).map((key) => card('chord-anchor', key, true));
		expect(triadZoneOpen(acquired.slice(0, 5))).toBe(false);
		expect(
			triadZoneOpen([...acquired.slice(0, 5), card('chord-anchor', TRIAD_ORDER[5], false)])
		).toBe(false);
		expect(triadZoneOpen(acquired)).toBe(true);
	});

	it('keeps the zone open once it has a card', () => {
		expect(
			triadZoneOpen([
				card('chord-anchor', TRIAD_ORDER[0], true),
				card('chord-zone', TRIAD_ORDER[0], false)
			])
		).toBe(true);
	});
});
