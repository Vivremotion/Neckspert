import type { MechanicId } from '$lib/domain/exercise/types';
import type { TriadAnchorItem, TriadZoneItem, VoicingFigureItem } from '$lib/domain/mechanics';
import {
	fretLabel,
	parseVoicingKey,
	stringLabel,
	type IdentifyItem,
	type LocateItem
} from '$lib/domain/music';
import type { Locale } from '$lib/domain/types';
import { nameAtFret, noteName, promptFretLabel } from './noteWords';
import { aroundLabel, chordName, rootName, rootStringName, stringSetLabel } from './triadWords';

/** What a mechanic's items offer to the words of a prompt: `{name}` in a slot reads `fields`. */
export interface ItemFields {
	names: readonly string[];
	/** Every field, written for one item. A field with nothing to say is the empty string. */
	fields(item: unknown, locale: Locale, random: () => number): Record<string, string>;
}

const locateFields: ItemFields = {
	names: ['note', 'string', 'fret'],
	fields: (raw, locale, random) => {
		const item = raw as LocateItem;
		return {
			note: noteName(item.pitch, random),
			string: stringLabel(item.string, locale),
			fret: promptFretLabel(item, locale) ?? ''
		};
	}
};

const identifyFields: ItemFields = {
	names: ['fret', 'string', 'name'],
	fields: (raw, locale, random) => {
		const item = raw as IdentifyItem;
		return {
			fret: fretLabel(item.fret, locale),
			string: stringLabel(item.string, locale),
			name: nameAtFret(item, random)
		};
	}
};

function triadFields(item: TriadAnchorItem, locale: Locale) {
	const voicing = parseVoicingKey(item.voicingKey);
	return {
		chord: chordName(voicing),
		root: rootName(voicing),
		rootString: rootStringName(voicing, locale),
		strings: stringSetLabel(voicing, locale)
	};
}

const triadAnchorFields: ItemFields = {
	names: ['chord', 'root', 'rootString', 'strings'],
	fields: (item, locale) => triadFields(item as TriadAnchorItem, locale)
};

const triadZoneFields: ItemFields = {
	names: ['chord', 'root', 'rootString', 'strings', 'around'],
	fields: (item, locale) => ({
		...triadFields(item as TriadZoneItem, locale),
		around: aroundLabel(item as TriadZoneItem, locale)
	})
};

const voicingFigureFields: ItemFields = {
	names: ['chord', 'strings'],
	fields: (raw, locale) => {
		const voicing = parseVoicingKey((raw as VoicingFigureItem).voicing);
		return { chord: chordName(voicing), strings: stringSetLabel(voicing, locale) };
	}
};

/** The fields of a prompt's words, by mechanic. A mechanic left out offers none. */
export const ITEM_FIELDS: Readonly<Record<MechanicId, ItemFields>> = {
	locate: locateFields,
	identify: identifyFields,
	'triad-anchor': triadAnchorFields,
	'triad-zone': triadZoneFields,
	'voicing-figure': voicingFigureFields
};
