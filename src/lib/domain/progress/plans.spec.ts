import { describe, expect, it } from 'vitest';
import { asNeckCard, neckCardKey, type NeckCard } from '$lib/domain/music';
import { FREE_PLAY_COUNT } from './constants';
import { IDENTIFY_NECK, LOCATE_NECK } from '$lib/domain/exercise';
import type { LevelState } from '$lib/domain/time/levels';
import { neckSubject } from './neckSubject';
import { buildFreePlan, freeLeadOf, freeLevelOf } from './plans';

const L1: NeckCard = { mechanic: 'locate', item: { string: 6, pitch: 'G' } };
const L2: NeckCard = { mechanic: 'locate', item: { string: 6, pitch: 'A' } };

describe('buildFreePlan', () => {
	it('draws from every position, including ones with no card yet', () => {
		const plan = buildFreePlan({
			leadOf: (item) => (item.pitch === 'G' ? 2 : 8),
			count: 1000,
			random: () => 0
		});

		expect(plan).toHaveLength(132);
		expect(plan.every((item) => item.phase === 'free')).toBe(true);
		expect(plan.every((item) => item.temperature === 'hot')).toBe(true);
		expect(plan.every((item) => item.aid === 'none')).toBe(true);
		expect(plan.filter((item) => item.mechanic === 'identify')).toHaveLength(66);
		const keyOf = (item: (typeof plan)[number]) => neckCardKey(asNeckCard(item));
		expect(plan.find((item) => keyOf(item) === neckCardKey(L1))?.leadBeats).toBe(2);
		expect(plan.find((item) => keyOf(item) === neckCardKey(L2))?.leadBeats).toBe(8);
		expect(plan.find((item) => item.mechanic === 'identify')?.leadBeats).toBeNull();
		expect(plan.find((item) => item.mechanic === 'locate')?.exerciseId).toBe('locate-neck');
		expect(plan.find((item) => item.mechanic === 'identify')?.exerciseId).toBe('identify-neck');
	});

	it('plays one series of the free-play length by default', () => {
		const capped = buildFreePlan({ leadOf: () => 8, random: () => 0 });
		expect(capped).toHaveLength(FREE_PLAY_COUNT);
	});
});

describe('freeLeadOf', () => {
	const subject = neckSubject({ definitions: { locate: LOCATE_NECK, identify: IDENTIFY_NECK } });
	const level = (item: string, at: number): LevelState => ({
		exerciseId: 'locate-neck',
		scope: '',
		item,
		level: at,
		successes: 0,
		failures: 0,
		resumeAfter: null
	});
	const levels = [level('6:G', 2), level('6:A', 1)];

	it('plays a note at the lead of its level, on the ladder locate writes', () => {
		expect(freeLeadOf({ subject, levels })(L1.item)).toBe(2);
		expect(freeLeadOf({ subject, levels })(L2.item)).toBe(4);
		// A level above the ladder is brought to its top.
		expect(freeLeadOf({ subject, levels: [level('6:G', 5)] })(L1.item)).toBe(2);
	});

	it('plays a note with no level at the first lead, as the procedure would', () => {
		expect(freeLeadOf({ subject, levels: [] })(L1.item)).toBe(8);
		// Another exercise's or another scope's level is not the note's.
		expect(
			freeLeadOf({
				subject,
				levels: [
					{ ...level('6:G', 2), scope: 'other' },
					{ ...level('6:G', 2), exerciseId: 'x' }
				]
			})(L1.item)
		).toBe(8);
	});

	it('serves a free plan at those leads', () => {
		const plan = buildFreePlan({
			leadOf: freeLeadOf({ subject, levels }),
			count: 1000,
			random: () => 0
		});
		const keyOf = (item: (typeof plan)[number]) => neckCardKey(asNeckCard(item));
		expect(plan.find((item) => keyOf(item) === neckCardKey(L1))?.leadBeats).toBe(2);
		expect(plan.find((item) => keyOf(item) === neckCardKey(L2))?.leadBeats).toBe(4);
		expect(plan.find((item) => keyOf(item) === 'locate:5:C')?.leadBeats).toBe(8);
	});

	it('serves a free plan at those levels, the identified notes without one', () => {
		expect(freeLevelOf({ subject, levels: [level('6:G', 5)] })(L1.item)).toBe(2);
		const plan = buildFreePlan({
			leadOf: freeLeadOf({ subject, levels }),
			levelOf: freeLevelOf({ subject, levels }),
			count: 1000,
			random: () => 0
		});
		const keyOf = (item: (typeof plan)[number]) => neckCardKey(asNeckCard(item));
		expect(plan.find((item) => keyOf(item) === neckCardKey(L1))?.level).toBe(2);
		expect(plan.find((item) => keyOf(item) === neckCardKey(L2))?.level).toBe(1);
		expect(plan.find((item) => keyOf(item) === 'locate:5:C')?.level).toBe(0);
		expect(
			plan.filter((item) => item.mechanic === 'identify').every((item) => !('level' in item))
		).toBe(true);
		expect(plan.every((item) => item.exerciseLevel === 0)).toBe(true);
	});
});
