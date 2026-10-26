import { describe, expect, it } from 'vitest';
import { IDENTIFY_NECK, LOCATE_NECK } from '$lib/domain/exercise/catalog';
import { pacingOf } from '$lib/domain/exercise/pacing';
import { recallThresholdOf } from '$lib/domain/exercise/recall';
import { NECK_LADDER_V9, backupV4ToV5, levelStatesV9, neckLevelOfCard } from './v9';

type Row = Record<string, unknown>;

function locateCard(leadBeats: number, learnedAt: number | null = 1000, item = '6:F'): Row {
	return { key: `locate:${item}`, mechanic: 'locate', leadBeats, learnedAt };
}

function identifyCard(learnedAt: number | null, item = '6:3'): Row {
	return { key: `identify:${item}`, mechanic: 'identify', leadBeats: 2, learnedAt };
}

function levelOf(card: Row): unknown {
	return neckLevelOfCard(card)?.level;
}

describe('neckLevelOfCard', () => {
	it('gives a learned locate card the level of its lead on the ladder at 80 bpm', () => {
		expect(levelOf(locateCard(8))).toBe(0);
		expect(levelOf(locateCard(4))).toBe(1);
		expect(levelOf(locateCard(2))).toBe(2);
	});

	it('starts a locate card still learned at level 0, and an identify card at 0 or at its top', () => {
		expect(levelOf(locateCard(2, null))).toBe(0);
		expect(levelOf(identifyCard(null))).toBe(0);
		expect(levelOf(identifyCard(1000))).toBe(1);
	});

	it('names the exercise and the item without the mechanic, with an empty scope and fresh counts', () => {
		expect(neckLevelOfCard(locateCard(4, 1000, '6:G#'))).toEqual({
			exerciseId: 'locate-neck',
			scope: '',
			item: '6:G#',
			level: 1,
			successes: 0,
			failures: 0,
			resumeAfter: null
		});
		expect(neckLevelOfCard(identifyCard(1000, '5:8'))).toMatchObject({
			exerciseId: 'identify-neck',
			item: '5:8'
		});
	});

	it('gives no level to a card outside the neck', () => {
		expect(neckLevelOfCard({ key: 'triad-anchor:3-2-1:C:maj:root', learnedAt: 1 })).toBeNull();
	});
});

describe('levelStatesV9', () => {
	it('seeds no triad card and keeps a stored level state', () => {
		const stored = { ...neckLevelOfCard(locateCard(8)), level: 2, successes: 1 };
		const cards = [
			locateCard(8),
			locateCard(4, 1000, '5:A'),
			{ key: 'triad-zone:x', learnedAt: 1 },
			identifyCard(1000)
		];
		const seeded = levelStatesV9(cards, [stored]);
		expect(seeded.map((state) => `${state.exerciseId}/${state.item}`)).toEqual([
			'locate-neck/5:A',
			'identify-neck/6:3'
		]);
	});
});

describe('NECK_LADDER_V9', () => {
	// Tripwire, as for V7_RELATIONS: the migration never reads the catalog, but a divergence must
	// be noticed, then decided (the frozen ladders stay as they are).
	it('keeps the frozen ladders equal to the catalog', () => {
		expect(NECK_LADDER_V9.locate.exerciseId).toBe(LOCATE_NECK.id);
		expect([...NECK_LADDER_V9.locate.leadSteps]).toEqual([...pacingOf(LOCATE_NECK).leadSteps]);
		expect(NECK_LADDER_V9.locate.learnedAfter).toBe(pacingOf(LOCATE_NECK).learnedAfter);
		expect(NECK_LADDER_V9.locate.recallThresholdMs).toBe(recallThresholdOf(LOCATE_NECK));
		expect(NECK_LADDER_V9.identify.exerciseId).toBe(IDENTIFY_NECK.id);
		expect(NECK_LADDER_V9.identify.learnedAfter).toBe(pacingOf(IDENTIFY_NECK).learnedAfter);
	});
});

describe('backupV4ToV5', () => {
	it('upgrades a version 4 backup to 5 with the same level states', () => {
		const rhythm = {
			exerciseId: 'rhythm-silent-bars',
			scope: '',
			item: '',
			level: 2,
			successes: 1,
			failures: 0,
			resumeAfter: null
		};
		const v4 = {
			app: 'neckspert-play',
			version: 4,
			exportedAt: 5,
			progressions: [{ exerciseId: 'locate-neck', tempoBpm: 160 }],
			cards: [locateCard(2), identifyCard(1000)],
			levelStates: [rhythm]
		};
		const v5 = backupV4ToV5(v4);
		expect(v5).toEqual({
			...v4,
			version: 5,
			levelStates: [rhythm, neckLevelOfCard(locateCard(2)), neckLevelOfCard(identifyCard(1000))]
		});
		// Seeded at 80 bpm whatever the progression: a lead of 2 keeps its level 2.
		expect((v5.levelStates as Row[])[1].level).toBe(2);
	});
});
