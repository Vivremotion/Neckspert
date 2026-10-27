// The triads on levels (plan H5): Dexie version 10 and backup version 6. Every triad card gets the
// level state its lead stands for, then no card keeps a lead: the level of an item is its level
// state, whatever its mechanic. Pure functions on plain records, applied alike by the database
// upgrade (`db.ts`) and by the import of a backup (`validateBackup.ts`).

type Row = Record<string, unknown>;

/**
 * The triads' ladder as version 10 knew it: frozen, a tripwire test compares it with the live
 * catalog. A migration never reads live code, so changing the catalog later cannot change what
 * this step does to cards still waiting for it.
 */
export const TRIAD_LADDER_V10 = {
	leadSteps: [8, 4, 2],
	exercises: { 'triad-anchor': 'triads-anchor', 'triad-zone': 'triads-zone' }
} as const;

type TriadMechanicV10 = keyof typeof TRIAD_LADDER_V10.exercises;

function isTriadMechanic(mechanic: string): mechanic is TriadMechanicV10 {
	return Object.hasOwn(TRIAD_LADDER_V10.exercises, mechanic);
}

/** The level of a learned triad card: its lead's place in the ladder; shorter than the top → the top. */
function learnedTriadLevel(leadBeats: unknown): number {
	const { leadSteps } = TRIAD_LADDER_V10;
	const index = leadSteps.findLastIndex((lead) => lead >= (leadBeats as number));
	return index < 0 ? leadSteps.length - 1 : index;
}

/**
 * The level of a triad card from its lead; null for a card outside the triads. A card still being
 * learned (`learnedAt` null, as version 9 reads the neck cards) starts at level 0, the aided one.
 */
export function triadLevelOfCard(card: Row): Row | null {
	const key = card.key;
	if (typeof key !== 'string') return null;
	const colon = key.indexOf(':');
	if (colon < 0) return null;
	const mechanic = key.slice(0, colon);
	if (!isTriadMechanic(mechanic)) return null;
	const learned = card.learnedAt !== null && card.learnedAt !== undefined;
	return {
		exerciseId: TRIAD_LADDER_V10.exercises[mechanic],
		scope: '',
		item: key.slice(colon + 1),
		level: learned ? learnedTriadLevel(card.leadBeats) : 0,
		successes: 0,
		failures: 0,
		resumeAfter: null
	};
}

function stateKey(row: Row): string {
	return JSON.stringify([row.exerciseId, row.scope, row.item]);
}

/** Level states for every triad card without one; `existing` keeps a stored state. */
export function levelStatesV10(cards: Row[], existing: Row[]): Row[] {
	const stored = new Set(existing.map(stateKey));
	const seeded: Row[] = [];
	for (const card of cards) {
		const state = triadLevelOfCard(card);
		if (state && !stored.has(stateKey(state))) {
			seeded.push(state);
			stored.add(stateKey(state));
		}
	}
	return seeded;
}

/** A card without its lead. */
export function cardToV10(card: Row): Row {
	const { leadBeats: _lead, ...rest } = card;
	return rest;
}

/** A version 5 backup as version 6: a level state per triad card, then no card with a lead. */
export function backupV5ToV6(file: Row): Row {
	const cards = file.cards as Row[];
	const existing = file.levelStates as Row[];
	return {
		...file,
		version: 6,
		cards: cards.map(cardToV10),
		levelStates: [...existing, ...levelStatesV10(cards, existing)]
	};
}
