import { describe, expect, it } from 'vitest';
import { asNeckCard, neckCardKey, type NeckCard } from '$lib/testing/neck';
import { FREE_PLAY_COUNT } from './constants';
import type { LevelState } from '$lib/domain/time/levels';
import { exerciseSubject } from '$lib/domain/learning/exerciseSubject';
import { buildFreePlan, freeLeadOf, freeLevelOf } from './plans';
import { IDENTIFY_NECK, LOCATE_NECK, TRIADS_ANCHOR } from '$lib/testing/catalog';

const L1: NeckCard = { skill: 'locate-note-string', item: { string: 6, pitch: 'G' } };
const L2: NeckCard = { skill: 'locate-note-string', item: { string: 6, pitch: 'A' } };

/** The notes' two exercises in the order their routine writes them. */
const NOTES = [IDENTIFY_NECK, LOCATE_NECK];
const subject = exerciseSubject({ exercises: NOTES, attempts: [] });

const level = (item: string, at: number): LevelState => ({
	exerciseId: 'locate-note-string',
	scope: '',
	item,
	level: at,
	successes: 0,
	failures: 0,
	resumeAfter: null
});

/** A seeded random (mulberry32), so a draw can be compared draw for draw. */
function seeded(seed: number): () => number {
	let a = seed;
	return () => {
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

describe('buildFreePlan', () => {
	it('draws among the items its exercises list, including ones with no card yet', () => {
		const plan = buildFreePlan({
			exercises: NOTES,
			subject,
			levels: [level('6:G', 2)],
			count: 1000,
			random: () => 0
		});

		expect(plan).toHaveLength(132);
		expect(plan.every((item) => item.phase === 'free')).toBe(true);
		expect(plan.every((item) => item.temperature === 'hot')).toBe(true);
		expect(plan.every((item) => item.aid === 'none')).toBe(true);
		expect(plan.filter((item) => item.skill === 'identify-note')).toHaveLength(66);
		const keyOf = (item: (typeof plan)[number]) => neckCardKey(asNeckCard(item));
		expect(plan.find((item) => keyOf(item) === neckCardKey(L1))?.leadBeats).toBe(2);
		expect(plan.find((item) => keyOf(item) === neckCardKey(L2))?.leadBeats).toBe(8);
		expect(plan.find((item) => item.skill === 'identify-note')?.leadBeats).toBeNull();
		expect(plan.find((item) => item.skill === 'locate-note-string')?.exerciseId).toBe(
			'locate-note-string'
		);
		expect(plan.find((item) => item.skill === 'identify-note')?.exerciseId).toBe('identify-note');
	});

	it('plays one series of the free-play length by default', () => {
		const capped = buildFreePlan({ exercises: NOTES, subject, levels: [], random: () => 0 });
		expect(capped).toHaveLength(FREE_PLAY_COUNT);
	});

	it('draws the notes as frozen for a seeded random (the draw of plan 5a, Task 6)', () => {
		const levels = [level('6:G', 2), level('6:A', 1), level('5:C', 5)];
		const plan = buildFreePlan({ exercises: NOTES, subject, levels, random: seeded(2026) });
		const drawn = plan
			.slice(0, 10)
			.map((item) => [item.exerciseId, item.item, item.leadBeats, item.level ?? null]);
		expect(drawn).toEqual([
			['identify-note', { string: 1, fret: 2 }, null, 0],
			['identify-note', { string: 3, fret: 7 }, null, 0],
			['locate-note-string', { string: 4, pitch: 'D#' }, 8, 0],
			['locate-note-string', { string: 5, pitch: 'G' }, 8, 0],
			['identify-note', { string: 4, fret: 2 }, null, 0],
			['locate-note-string', { string: 1, pitch: 'G#' }, 8, 0],
			['identify-note', { string: 6, fret: 6 }, null, 0],
			['identify-note', { string: 6, fret: 7 }, null, 0],
			['locate-note-string', { string: 4, pitch: 'A' }, 8, 0],
			['locate-note-string', { string: 2, pitch: 'G' }, 8, 0]
		]);
		expect(plan).toHaveLength(FREE_PLAY_COUNT);
		expect(plan.find((item) => neckCardKey(asNeckCard(item)) === neckCardKey(L2))).toMatchObject({
			leadBeats: 4,
			level: 1
		});
	});

	it('draws one exercise alone among its own items only', () => {
		const alone = exerciseSubject({ exercises: [LOCATE_NECK], attempts: [] });
		const plan = buildFreePlan({
			exercises: [LOCATE_NECK],
			subject: alone,
			levels: [],
			count: 1000,
			random: () => 0
		});
		expect(plan).toHaveLength(66);
		expect(plan.every((item) => item.exerciseId === 'locate-note-string')).toBe(true);
	});

	it('plays an item of a timed exercise at its level, whatever its exercise', () => {
		const chords = exerciseSubject({ exercises: [TRIADS_ANCHOR], attempts: [] });
		const first = (TRIADS_ANCHOR.items ?? [])[0] as string;
		const plan = buildFreePlan({
			exercises: [TRIADS_ANCHOR],
			subject: chords,
			levels: [{ ...level(first, 2), exerciseId: TRIADS_ANCHOR.id }],
			count: 1000,
			random: () => 0
		});
		expect(plan).toHaveLength(TRIADS_ANCHOR.items?.length ?? 0);
		const served = plan.find((item) => (item.item as { voicingKey: string }).voicingKey === first);
		expect(served).toMatchObject({ exerciseId: TRIADS_ANCHOR.id, level: 2, leadBeats: 2 });
	});
});

describe('freeLeadOf', () => {
	const levels = [level('6:G', 2), level('6:A', 1)];

	it('plays a note at the lead of its level, on the ladder locate writes', () => {
		expect(freeLeadOf({ subject, levels })(L1)).toBe(2);
		expect(freeLeadOf({ subject, levels })(L2)).toBe(4);
		// A level above the ladder is brought to its top.
		expect(freeLeadOf({ subject, levels: [level('6:G', 5)] })(L1)).toBe(2);
	});

	it('plays a note with no level at the first lead, as the procedure would', () => {
		expect(freeLeadOf({ subject, levels: [] })(L1)).toBe(8);
		// Another exercise's or another scope's level is not the note's.
		expect(
			freeLeadOf({
				subject,
				levels: [
					{ ...level('6:G', 2), scope: 'other' },
					{ ...level('6:G', 2), exerciseId: 'x' }
				]
			})(L1)
		).toBe(8);
	});

	it('gives no lead to an item answered in free time', () => {
		expect(
			freeLeadOf({ subject, levels })({ skill: 'identify-note', item: { string: 6, fret: 3 } })
		).toBeNull();
	});

	it('serves a free plan at those leads', () => {
		const plan = buildFreePlan({ exercises: NOTES, subject, levels, count: 1000, random: () => 0 });
		const keyOf = (item: (typeof plan)[number]) => neckCardKey(asNeckCard(item));
		expect(plan.find((item) => keyOf(item) === neckCardKey(L1))?.leadBeats).toBe(2);
		expect(plan.find((item) => keyOf(item) === neckCardKey(L2))?.leadBeats).toBe(4);
		expect(plan.find((item) => keyOf(item) === 'locate-note-string:5:C')?.leadBeats).toBe(8);
	});

	it('serves a free plan at those levels, the identified notes too', () => {
		expect(freeLevelOf({ subject, levels: [level('6:G', 5)] })(L1)).toBe(2);
		const plan = buildFreePlan({ exercises: NOTES, subject, levels, count: 1000, random: () => 0 });
		const keyOf = (item: (typeof plan)[number]) => neckCardKey(asNeckCard(item));
		expect(plan.find((item) => keyOf(item) === neckCardKey(L1))?.level).toBe(2);
		expect(plan.find((item) => keyOf(item) === neckCardKey(L2))?.level).toBe(1);
		expect(plan.find((item) => keyOf(item) === 'locate-note-string:5:C')?.level).toBe(0);
		// An item answered in free time is played at its level too: its screen, its temperature.
		expect(
			plan.filter((item) => item.skill === 'identify-note').every((item) => item.level === 0)
		).toBe(true);
		const named = buildFreePlan({
			exercises: NOTES,
			subject,
			levels: [{ ...level('6:3', 1), exerciseId: 'identify-note' }],
			count: 1000,
			random: () => 0
		});
		expect(
			named.find((item) => neckCardKey(asNeckCard(item)) === 'identify-note:6:3')
		).toMatchObject({ level: 1, leadBeats: null });
		expect(plan.every((item) => item.exerciseLevel === 0)).toBe(true);
	});
});
