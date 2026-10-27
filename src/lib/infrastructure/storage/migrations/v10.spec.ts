import { describe, expect, it } from 'vitest';
import { TRIADS_ANCHOR, TRIADS_ZONE } from '$lib/domain/exercise/catalog';
import { ladderOf } from '$lib/domain/exercise/ladder';
import { TRIAD_LADDER_V10, backupV5ToV6, cardToV10, levelStatesV10, triadLevelOfCard } from './v10';
import { neckLevelOfCard } from './v9';

type Row = Record<string, unknown>;

const VOICING = 'D|maj|3:5,2:1,1:3';

function anchorCard(leadBeats: number, learnedAt: number | null = 1000, item = VOICING): Row {
	return { key: `triad-anchor:${item}`, mechanic: 'triad-anchor', leadBeats, learnedAt };
}

function zoneCard(leadBeats: number, learnedAt: number | null = 1000, item = VOICING): Row {
	return { key: `triad-zone:${item}`, mechanic: 'triad-zone', leadBeats, learnedAt };
}

function locateCard(leadBeats: number, learnedAt: number | null = 1000, item = '6:F'): Row {
	return { key: `locate:${item}`, mechanic: 'locate', leadBeats, learnedAt };
}

function levelOf(card: Row): unknown {
	return triadLevelOfCard(card)?.level;
}

describe('triadLevelOfCard', () => {
	it('gives a learned anchor card the level of its lead', () => {
		expect(levelOf(anchorCard(8))).toBe(0);
		expect(levelOf(anchorCard(4))).toBe(1);
		expect(levelOf(anchorCard(2))).toBe(2);
		// Shorter than the top, the old one-beat step: the top.
		expect(levelOf(anchorCard(1))).toBe(2);
		expect(levelOf(zoneCard(4))).toBe(1);
	});

	it('starts a triad card still learned at level 0', () => {
		expect(levelOf(anchorCard(2, null))).toBe(0);
		expect(levelOf(zoneCard(4, null))).toBe(0);
		expect(levelOf({ ...anchorCard(4), learnedAt: undefined })).toBe(0);
	});

	it('names the exercise and the voicing, with an empty scope and fresh counts', () => {
		expect(triadLevelOfCard(anchorCard(4))).toEqual({
			exerciseId: 'triads-anchor',
			scope: '',
			item: VOICING,
			level: 1,
			successes: 0,
			failures: 0,
			resumeAfter: null
		});
		expect(triadLevelOfCard(zoneCard(2, 1000, 'A|min|4:1,3:3,2:5'))).toMatchObject({
			exerciseId: 'triads-zone',
			item: 'A|min|4:1,3:3,2:5',
			level: 2
		});
	});

	it('gives no level to a card outside the triads, or of an unknown mechanic', () => {
		expect(triadLevelOfCard(locateCard(4))).toBeNull();
		expect(triadLevelOfCard({ key: 'identify:6:3', learnedAt: 1, leadBeats: 2 })).toBeNull();
		expect(triadLevelOfCard({ key: 'chord-grid:link#0', learnedAt: 1, leadBeats: 2 })).toBeNull();
		expect(triadLevelOfCard({ key: 'tuba:x', learnedAt: 1, leadBeats: 2 })).toBeNull();
		expect(triadLevelOfCard({ key: 'no-colon', learnedAt: 1, leadBeats: 2 })).toBeNull();
		expect(triadLevelOfCard({ learnedAt: 1, leadBeats: 2 })).toBeNull();
	});
});

describe('levelStatesV10', () => {
	it('seeds no neck card and keeps a stored level state', () => {
		const stored = { ...triadLevelOfCard(anchorCard(8)), level: 2, successes: 1 };
		const cards = [
			anchorCard(8),
			anchorCard(4, 1000, 'C|maj|3:5,2:1,1:3'),
			zoneCard(2, null),
			locateCard(4),
			{ key: 'identify:6:3', mechanic: 'identify', leadBeats: 2, learnedAt: 1 }
		];
		const seeded = levelStatesV10(cards, [stored, neckLevelOfCard(locateCard(4)) as Row]);
		expect(seeded.map((state) => `${state.exerciseId}/${state.item}/${state.level}`)).toEqual([
			'triads-anchor/C|maj|3:5,2:1,1:3/1',
			`triads-zone/${VOICING}/0`
		]);
	});
});

describe('cardToV10', () => {
	it('removes the lead from every card', () => {
		const scheduling = { due: 1, state: 2 };
		const cards: Row[] = [
			anchorCard(4),
			zoneCard(2, null),
			locateCard(8),
			{ key: 'identify:6:3', mechanic: 'identify', leadBeats: 2, learnedAt: 1 },
			{ key: 'tuba:x', mechanic: 'tuba', leadBeats: 2, learnedAt: 1 }
		];
		for (const card of cards) {
			const full: Row = { ...card, item: { a: 1 }, scheduling, acquiredAt: 3 };
			const { leadBeats: _lead, ...rest } = full;
			const upgraded = cardToV10(full);
			expect(upgraded).toEqual(rest);
			expect(Object.hasOwn(upgraded, 'leadBeats')).toBe(false);
		}
		// The card given is left as it was.
		const card = anchorCard(4);
		cardToV10(card);
		expect(card.leadBeats).toBe(4);
	});

	it('leaves a card without a lead as it is', () => {
		const card = { key: 'locate:6:F', mechanic: 'locate', learnedAt: 1 };
		expect(cardToV10(card)).toEqual(card);
	});
});

describe('TRIAD_LADDER_V10', () => {
	// Tripwire, as for NECK_LADDER_V9: the migration never reads the catalog, but a divergence must
	// be noticed, then decided (the frozen ladder stays as it is).
	it('keeps the frozen ladder equal to the catalog', () => {
		const anchor = ladderOf(TRIADS_ANCHOR, 'triad-anchor');
		const zone = ladderOf(TRIADS_ZONE, 'triad-zone');
		expect([...TRIAD_LADDER_V10.leadSteps]).toEqual(anchor.map((level) => level.params.leadBeats));
		expect([...TRIAD_LADDER_V10.leadSteps]).toEqual(zone.map((level) => level.params.leadBeats));
		expect(TRIAD_LADDER_V10.exercises).toEqual({
			[TRIADS_ANCHOR.mechanic]: TRIADS_ANCHOR.id,
			[TRIADS_ZONE.mechanic]: TRIADS_ZONE.id
		});
	});
});

describe('backupV5ToV6', () => {
	it('upgrades a version 5 backup to 6 with the same level states', () => {
		const rhythm = {
			exerciseId: 'rhythm-silent-bars',
			scope: '',
			item: '',
			level: 2,
			successes: 1,
			failures: 0,
			resumeAfter: null
		};
		const locateLevel = neckLevelOfCard(locateCard(4)) as Row;
		const cards = [anchorCard(4), zoneCard(2, null), locateCard(4)];
		const v5 = {
			app: 'neckspert-play',
			version: 5,
			exportedAt: 5,
			cards,
			levelStates: [rhythm, locateLevel]
		};
		const v6 = backupV5ToV6(v5);
		expect(v6).toEqual({
			...v5,
			version: 6,
			cards: cards.map(cardToV10),
			levelStates: [
				rhythm,
				locateLevel,
				triadLevelOfCard(anchorCard(4)),
				triadLevelOfCard(zoneCard(2, null))
			]
		});
		expect((v6.cards as Row[]).some((card) => Object.hasOwn(card, 'leadBeats'))).toBe(false);
		// The file given is left as it was.
		expect(v5.version).toBe(5);
		expect(cards[0].leadBeats).toBe(4);
	});
});
