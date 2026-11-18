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
import { parseVoicingKey } from '$lib/domain/music/voicing';
import { parseNoteName } from '$lib/domain/time/noteName';

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
