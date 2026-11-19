// The item keys of the eight mechanics up to version 12, frozen (chantier 2, plan 2a). Backup
// files of versions 1 to 8 were written with these keys and stay importable for ever, so their
// validation reads this copy and never the live mechanics, which are going to change their keys
// and then go. Each identity copies the key logic of its mechanic as it was; the music
// vocabulary's readers that do not change (`parseVoicingKey`, `parseLocateItem`,
// `parseIdentifyItem`, `parseNoteName`) are called, not copied. A tripwire test compares the
// copy with the live mechanics until they go.

import {
	identifyItemKey,
	locateItemKey,
	parseIdentifyItem,
	parseLocateItem,
	type IdentifyItem,
	type LocateItem
} from '$lib/domain/music/items';
import { parseVoicingKey, voicingOccurrences } from '$lib/domain/music/voicing';
import { occurrenceId, occurrenceOfId } from '$lib/domain/triads/items';
import { parseNoteName } from '$lib/domain/time/noteName';
import type { BackupV8 } from './v12';

/** What a mechanic was up to version 12: its id, whether it had cards, its item keys. Frozen. */
export interface MechanicV12 {
	id: string;
	/** True for the mechanics that were `learner: 'memory'`: their items were FSRS cards. */
	cards: boolean;
	itemKey(item: unknown): string;
	/** Throws on an invalid key. */
	parseItem(key: string): unknown;
	/** The part of a prompted item its card keeps. */
	cardItem?(item: unknown): unknown;
}

const SEPARATOR = '@';

/** The length in beats a key ends with (`...@4`), positive and written plainly. */
function parseBeatsV12(part: string, itemKey: string): number {
	const beats = Number(part);
	if (!Number.isFinite(beats) || beats <= 0 || String(beats) !== part) {
		throw new Error(`Invalid length in beats in item key: "${itemKey}"`);
	}
	return beats;
}

interface VoicingKeyItem {
	voicingKey: string;
}

const locateV12: MechanicV12 = {
	id: 'locate',
	cards: true,
	itemKey: (item) => locateItemKey(item as LocateItem),
	parseItem: parseLocateItem
};

const identifyV12: MechanicV12 = {
	id: 'identify',
	cards: true,
	itemKey: (item) => identifyItemKey(item as IdentifyItem),
	parseItem: parseIdentifyItem
};

const triadAnchorV12: MechanicV12 = {
	id: 'triad-anchor',
	cards: true,
	itemKey: (item) => (item as VoicingKeyItem).voicingKey,
	parseItem: (key) => {
		parseVoicingKey(key);
		return { voicingKey: key };
	}
};

const triadZoneV12: MechanicV12 = {
	id: 'triad-zone',
	cards: true,
	itemKey: (item) => (item as VoicingKeyItem).voicingKey,
	// A card knows its voicing only: the position was drawn for each prompt.
	parseItem: (key) => {
		parseVoicingKey(key);
		return { voicingKey: key };
	},
	cardItem: (item) => ({ voicingKey: (item as VoicingKeyItem).voicingKey })
};

const INDEX_SEPARATOR = '#';

const chordGridV12: MechanicV12 = {
	id: 'chord-grid',
	cards: false,
	itemKey: (item) => {
		const { element, index } = item as { element: string; index: number };
		return `${element}${INDEX_SEPARATOR}${index}`;
	},
	parseItem: (key) => {
		const at = key.lastIndexOf(INDEX_SEPARATOR);
		const element = at < 0 ? '' : key.slice(0, at);
		const index = Number(at < 0 ? NaN : key.slice(at + 1));
		if (element === '' || !Number.isInteger(index) || index < 0) {
			throw new RangeError(`Not a chord change key: "${key}"`);
		}
		return { element, index };
	},
	cardItem: (item) => {
		const { element, index } = item as { element: string; index: number };
		return { element, index };
	}
};

const figureV12: MechanicV12 = {
	id: 'figure',
	cards: false,
	itemKey: (item) => {
		const { figureId, level } = item as { figureId: string; level: number };
		return `${figureId}${SEPARATOR}${level}`;
	},
	parseItem: (key) => {
		const at = key.lastIndexOf(SEPARATOR);
		const level = key.slice(at + 1);
		if (at < 1 || !/^-?\d+$/.test(level)) throw new Error(`Invalid figure item key: "${key}"`);
		return { figureId: key.slice(0, at), level: Number(level) };
	}
};

const voicingFigureV12: MechanicV12 = {
	id: 'voicing-figure',
	cards: false,
	itemKey: (item) => {
		const { voicing, occurrence, beats } = item as {
			voicing: string;
			occurrence: number;
			beats?: number;
		};
		return `${voicing}${SEPARATOR}${occurrence}${beats === undefined ? '' : `${SEPARATOR}${beats}`}`;
	},
	parseItem: (key) => {
		const [voicing, occurrence, beats, ...rest] = key.split(SEPARATOR);
		if (!voicing || occurrence === undefined || !/^\d+$/.test(occurrence) || rest.length > 0) {
			throw new Error(`Invalid voicing figure item key: "${key}"`);
		}
		parseVoicingKey(voicing);
		return beats === undefined
			? { voicing, occurrence: Number(occurrence) }
			: { voicing, occurrence: Number(occurrence), beats: parseBeatsV12(beats, key) };
	}
};

const formFigureV12: MechanicV12 = {
	id: 'form-figure',
	cards: false,
	itemKey: (item) => {
		const { form, first, beats } = item as { form: string; first: string; beats?: number };
		return `${form}${SEPARATOR}${first}${beats === undefined ? '' : `${SEPARATOR}${beats}`}`;
	},
	parseItem: (key) => {
		const [form, first, beats, ...rest] = key.split(SEPARATOR);
		if (!form || first === undefined || rest.length > 0) {
			throw new Error(`Invalid form figure item key: "${key}"`);
		}
		parseNoteName(first);
		return beats === undefined
			? { form, first }
			: { form, first, beats: parseBeatsV12(beats, key) };
	}
};

/** The eight mechanics up to version 12, in the order the live registry listed them. */
export const MECHANICS_V12: readonly MechanicV12[] = [
	locateV12,
	identifyV12,
	triadAnchorV12,
	triadZoneV12,
	chordGridV12,
	figureV12,
	voicingFigureV12,
	formFigureV12
];

// Version 13 (backup 9): a card and an attempt name the skill they practise, not the mechanic
// that played it, and their key begins with that skill. The tables are frozen: they are what the
// catalog of version 12 played; a tripwire test compares the exercises' with the catalog.

type Row = Record<string, unknown>;

/** The skill of a card of each memory mechanic of version 12. Frozen. */
export const SKILL_OF_MECHANIC_V13: Readonly<Record<string, string>> = {
	locate: 'locate-note-string',
	identify: 'identify-note',
	'triad-anchor': 'chord-anchor',
	'triad-zone': 'chord-zone'
};

/** The skill each exercise of the catalog of version 12 practises, by its id then. Frozen. */
export const SKILL_OF_EXERCISE_V12: Readonly<Record<string, string>> = {
	'locate-neck': 'locate-note-string',
	'identify-neck': 'identify-note',
	'triads-anchor': 'chord-anchor',
	'triads-zone': 'chord-zone',
	'gesture-link': 'inversion-run',
	'gesture-climb': 'grid-in-direction',
	'gesture-zone': 'grid-in-zone',
	'gesture-jam': 'grid-reading',
	'rhythm-silent-bars': 'inner-pulse',
	'rhythm-two-four': 'displaced-pulse',
	'rhythm-offbeats': 'figure-independence'
};

/** `key` with its prefix (up to the first `:`) replaced by `skill`; as it is without a prefix. */
function rekeyed(key: unknown, skill: string): unknown {
	if (typeof key !== 'string') return key;
	const colon = key.indexOf(':');
	return colon < 0 ? key : `${skill}:${key.slice(colon + 1)}`;
}

function lookUp(table: Readonly<Record<string, string>>, name: unknown): string | undefined {
	return typeof name === 'string' && Object.hasOwn(table, name) ? table[name] : undefined;
}

/**
 * A card as version 13 keeps it: the skill of its mechanic, its key prefixed by it, no
 * `mechanic`. A card of a mechanic the table does not know keeps its mechanic as its skill and
 * its key as it is: never dropped.
 */
export function cardToV13(card: Row): Row {
	const { mechanic, ...rest } = card;
	const skill = lookUp(SKILL_OF_MECHANIC_V13, mechanic);
	if (skill === undefined) return { ...rest, skill: mechanic };
	return { ...rest, skill, key: rekeyed(card.key, skill) };
}

const isRow = (value: unknown): value is Row =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The item key version 13 gives an attempt's item, from its key and its data as version 12 wrote
 * them: the key says the element only, never the length of its turn nor the rank of a shape among
 * its places. Null when it cannot read them. Frozen; it reads the places of a voicing live
 * (`voicingOccurrences`, tripwire test).
 */
function itemKeyV13(mechanic: unknown, itemKey: string, data: unknown): string | null {
	try {
		if (mechanic === 'voicing-figure') {
			const { voicing, occurrence } = voicingFigureV12.parseItem(itemKey) as {
				voicing: string;
				occurrence: number;
			};
			const place = voicingOccurrences(parseVoicingKey(voicing))[occurrence];
			return place ? occurrenceId(place) : null;
		}
		if (mechanic === 'form-figure') {
			const { form, first } = formFigureV12.parseItem(itemKey) as { form: string; first: string };
			return `${form}${SEPARATOR}${first}`;
		}
		if (mechanic === 'chord-grid') {
			const item = isRow(data) ? data.item : undefined;
			if (!isRow(item)) return null;
			if (item.rule === 'link') {
				return typeof item.shape === 'string' && occurrenceOfId(item.shape) ? item.shape : null;
			}
			const grid = typeof item.element === 'string' ? item.element.split(':')[1] : undefined;
			const index = item.index;
			if (!grid || typeof index !== 'number' || !Number.isInteger(index) || index < 0) return null;
			return `${grid}${INDEX_SEPARATOR}${index}`;
		}
	} catch {
		return null;
	}
	return itemKey;
}

/**
 * An attempt as version 13 keeps it: the skill of its exercise (its exercise id when the
 * catalog of version 12 had no such exercise), its card key prefixed by it and its item key as
 * version 13 writes it (`itemKeyV13`; the rest of its old key when that cannot read it), no
 * `mechanic`. Its data stays as version 12 wrote it. An attempt without an exercise id keeps the
 * rest as it is.
 */
export function attemptToV13(attempt: Row): Row {
	const { mechanic, ...rest } = attempt;
	const skill = lookUp(SKILL_OF_EXERCISE_V12, attempt.exerciseId) ?? attempt.exerciseId;
	if (typeof skill !== 'string') return rest;
	const key = attempt.cardKey;
	const colon = typeof key === 'string' ? key.indexOf(':') : -1;
	if (typeof key !== 'string' || colon < 0) return { ...rest, skill, cardKey: rekeyed(key, skill) };
	const old = key.slice(colon + 1);
	const itemKey = itemKeyV13(mechanic, old, attempt.data) ?? old;
	return { ...rest, skill, cardKey: `${skill}:${itemKey}` };
}

/** A backup at version 9: cards and attempts name their skill. */
export interface BackupV9 extends Row {
	version: 9;
}

/** A version 8 backup as version 9: its cards and attempts upgraded (`cardToV13`, `attemptToV13`). */
export function backupV8ToV9(backup: BackupV8): BackupV9 {
	const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);
	return {
		...backup,
		version: 9,
		cards: rows(backup.cards).map(cardToV13),
		attempts: rows(backup.attempts).map(attemptToV13)
	};
}
