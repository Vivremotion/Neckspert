import type { ExerciseDefinition } from '$lib/domain/exercise/types';
import { gridById, gridChanges } from '$lib/domain/grid';
import type {
	ChangeItem,
	FormFigureItem,
	VoicingOnStringsItem,
	VoicingFigureItem
} from '$lib/domain/sets';
import {
	fretLabel,
	parseVoicingKey,
	stringLabel,
	type IdentifyItem,
	type LocateItem
} from '$lib/domain/music';
import { parseNoteName } from '$lib/domain/time/noteName';
import type { Locale } from '$lib/domain/types';
import { CHORD_GRID_MESSAGES } from '$lib/application/sets/chordGridMessages';
import { nameAtFret, noteName, promptFretLabel } from './noteWords';
import { aroundLabel, chordName, rootName, rootStringName, stringSetLabel } from './triadWords';

/** What a set's items offer to the words of a prompt: `{name}` in a slot reads `fields`. */
export interface ItemFields {
	names: readonly string[];
	/**
	 * Every field, written for one item of `definition`. A field with nothing to say is the empty
	 * string.
	 */
	fields(
		item: unknown,
		locale: Locale,
		random: () => number,
		definition: ExerciseDefinition
	): Record<string, string>;
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

function triadFields(item: VoicingOnStringsItem, locale: Locale) {
	const voicing = parseVoicingKey(item.voicingKey);
	return {
		chord: chordName(voicing),
		root: rootName(voicing),
		rootString: rootStringName(voicing, locale),
		strings: stringSetLabel(voicing, locale)
	};
}

/** The anchor's fields and the zone's together; `around` is empty for an item without a position. */
const voicingOnStringsFields: ItemFields = {
	names: ['chord', 'root', 'rootString', 'strings', 'around'],
	fields: (raw, locale) => {
		const item = raw as VoicingOnStringsItem;
		const { position } = item;
		return {
			...triadFields(item, locale),
			around: position === undefined ? '' : aroundLabel({ ...item, position }, locale)
		};
	}
};

const voicingFigureFields: ItemFields = {
	names: ['chord', 'strings', 'quality'],
	fields: (raw, locale) => {
		const voicing = parseVoicingKey((raw as VoicingFigureItem).voicing);
		return {
			chord: chordName(voicing),
			strings: stringSetLabel(voicing, locale),
			quality: CHORD_GRID_MESSAGES[locale].quality(voicing.chord.quality.id)
		};
	}
};

/** A change of a grid: its chord as the grid writes it, and the grid's title. */
const changeFields: ItemFields = {
	names: ['symbol', 'title'],
	fields: (raw) => {
		const { grid, index } = raw as ChangeItem;
		const written = gridById(grid);
		return { symbol: gridChanges(written)[index]?.symbol ?? '', title: written.title };
	}
};

const formFigureFields: ItemFields = {
	names: ['chord'],
	fields: (raw, _locale, _random, definition) => {
		const { shape, first } = raw as FormFigureItem;
		// A round that derives nothing may list a shape the exercise does not write: the note alone.
		const symbol = definition.shapes?.find(({ id }) => id === shape)?.symbol ?? '';
		return { chord: `${parseNoteName(first).name}${symbol}` };
	}
};

/** The fields of a prompt's words, by set. A set left out offers none. */
export const ITEM_FIELDS: Readonly<Record<string, ItemFields>> = {
	'note-on-string': locateFields,
	'placed-note': identifyFields,
	'voicing-on-strings': voicingOnStringsFields,
	'placed-voicing': voicingFigureFields,
	'placed-shape': formFigureFields,
	change: changeFields
};
