// The notes on levels (plan H4): Dexie version 9 and backup version 5. Every locate and identify
// card gets the level state its lead stands for, so the notes play on the same level machinery as
// the rhythm. Pure functions on plain records, applied alike by the database upgrade (`db.ts`)
// and by the import of a backup (`validateBackup.ts`).

type Row = Record<string, unknown>;

/**
 * The tempo every locate level is seeded at: locate plays at 80 bpm, fixed (spec amendment
 * 2026-10-26), whatever tempo its progression had reached. At 80 bpm the ladder is 8, 4, 2.
 */
const LOCATE_TEMPO_V9 = 80;

/**
 * The neck's ladders as version 9 knew them: frozen, a tripwire test compares them with the live
 * catalog. A migration never reads live code, so changing the catalog later cannot change what
 * this step does to cards still waiting for it.
 */
export const NECK_LADDER_V9 = {
	locate: {
		exerciseId: 'locate-neck',
		leadSteps: [8, 4, 2],
		recallThresholdMs: 1500,
		learnedAfter: 2
	},
	identify: { exerciseId: 'identify-neck', learnedAfter: 2 }
} as const;

/** Lead steps kept at a tempo: down to the longest one that fits the threshold, at least the shortest. */
function keptLeads(tempoBpm: number): number[] {
	const { leadSteps, recallThresholdMs } = NECK_LADDER_V9.locate;
	const beatMs = 60_000 / tempoBpm;
	const fits = leadSteps.findIndex((lead) => lead * beatMs <= recallThresholdMs);
	const kept: number[] = leadSteps.slice(0, (fits < 0 ? leadSteps.length - 1 : fits) + 1);
	// A single step gives two levels at that lead: aided, then unaided.
	return kept.length === 1 ? [kept[0], kept[0]] : kept;
}

/** The level of a learned locate card: its lead's place in the ladder; shorter than the top → the top. */
function learnedLocateLevel(leadBeats: number): number {
	const kept = keptLeads(LOCATE_TEMPO_V9);
	const index = kept.findLastIndex((lead) => lead >= leadBeats);
	return index < 0 ? kept.length - 1 : index;
}

/**
 * The level of a neck card from its lead, on the locate ladder at 80 bpm; null for a card outside
 * the neck. A card still being learned starts at level 0 (the aided presentation).
 */
export function neckLevelOfCard(card: Row): Row | null {
	const key = card.key;
	if (typeof key !== 'string') return null;
	const colon = key.indexOf(':');
	if (colon < 0) return null;
	const mechanic = key.slice(0, colon);
	const item = key.slice(colon + 1);
	const learned = card.learnedAt !== null && card.learnedAt !== undefined;
	let exerciseId: string;
	let level: number;
	if (mechanic === 'locate') {
		exerciseId = NECK_LADDER_V9.locate.exerciseId;
		level = learned ? learnedLocateLevel(card.leadBeats as number) : 0;
	} else if (mechanic === 'identify') {
		exerciseId = NECK_LADDER_V9.identify.exerciseId;
		level = learned ? 1 : 0;
	} else {
		return null;
	}
	return { exerciseId, scope: '', item, level, successes: 0, failures: 0, resumeAfter: null };
}

function stateKey(row: Row): string {
	return JSON.stringify([row.exerciseId, row.scope, row.item]);
}

/** Level states for every neck card without one; `existing` keeps a stored state. */
export function levelStatesV9(cards: Row[], existing: Row[]): Row[] {
	const stored = new Set(existing.map(stateKey));
	const seeded: Row[] = [];
	for (const card of cards) {
		const state = neckLevelOfCard(card);
		if (state && !stored.has(stateKey(state))) seeded.push(state);
	}
	return seeded;
}

/** A version 4 backup as version 5: its level states complete with those of the neck cards. */
export function backupV4ToV5(file: Row): Row {
	const cards = file.cards as Row[];
	const existing = file.levelStates as Row[];
	return {
		...file,
		version: 5,
		levelStates: [...existing, ...levelStatesV9(cards, existing)]
	};
}
