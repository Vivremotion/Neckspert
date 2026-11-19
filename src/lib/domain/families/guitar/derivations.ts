import { gridById, gridChanges, triadOf } from '$lib/domain/grid';
import { parseVoicingKey, voicingKey, type LocateItem, type StringNumber } from '$lib/domain/music';
import type { ChangeItem } from '$lib/domain/sets/change';
import type { VoicingFigureItem } from '$lib/domain/sets/placedVoicing';
import { rootPosition, type VoicingOnStringsItem } from '$lib/domain/sets/voicingOnStrings';
import type { IndexContext, IndexDerivation, PassageDerivation } from '../index';
import type { ChordShape, ChordShapesIndex } from './chordShapes';
import type { NotePlacesIndex } from './notePlaces';

/** A voicing by its key: its chord, its strings and the degree each carries. */
function voicingIndex(key: string): ChordShapesIndex {
	const voicing = parseVoicingKey(key);
	return {
		chord: voicing.chord,
		strings: voicing.strings.map((s) => s.string),
		degrees: voicing.strings.map((s) => s.degree)
	};
}

/** The indexes the guitar's item sets give its families, by name. */
export const GUITAR_DERIVATIONS = {
	/** A note on a string: its places on that string. */
	note: {
		family: 'note-places',
		reads: ['note-on-string'],
		index: (item: unknown): NotePlacesIndex => {
			const { pitch, string } = item as LocateItem;
			return { pitch, string };
		}
	},
	/** A voicing on strings: its chord, its strings and the degree each carries. */
	voicing: {
		family: 'chord-shapes',
		reads: ['voicing-on-strings'],
		index: (item: unknown): ChordShapesIndex =>
			voicingIndex((item as VoicingOnStringsItem).voicingKey)
	},
	/** A placed voicing: its chord, its strings, the degree and the fret of each. */
	placed: {
		family: 'chord-shapes',
		reads: ['placed-voicing'],
		index: (item: unknown): ChordShapesIndex => {
			const { voicing, frets } = item as VoicingFigureItem;
			return { ...voicingIndex(voicing), frets: [...frets] };
		}
	},
	/**
	 * A change of a grid: the triad of its symbol on the zone of strings of its passage, else of
	 * the params. Throws on a grid or rank it cannot find, and without a zone.
	 */
	'change-chord': {
		family: 'chord-shapes',
		reads: ['change'],
		index: (item: unknown, { of, params }: IndexContext): ChordShapesIndex => {
			const { grid, index } = item as ChangeItem;
			const change = gridChanges(gridById(grid))[index];
			if (!change) throw new Error(`grid "${grid}" has no change at rank ${index}`);
			const strings = of.strings ?? params.strings;
			if (!Array.isArray(strings)) {
				throw new Error('no zone of strings: neither the passage nor the params give "strings"');
			}
			return { chord: triadOf(change.symbol), strings: strings as StringNumber[] };
		}
	},
	/** A voicing's root: the note on the string that carries degree 1. */
	root: {
		family: 'note-places',
		reads: ['voicing-on-strings'],
		index: (item: unknown): NotePlacesIndex => {
			const { pitch, string } = rootPosition(
				parseVoicingKey((item as VoicingOnStringsItem).voicingKey)
			);
			return { pitch, string };
		}
	}
} as const satisfies Record<string, IndexDerivation>;

/** The derivation a family takes from a set when an exercise names none: by family, then by set. */
export const GUITAR_DEFAULT_DERIVATIONS: Readonly<
	Record<string, Readonly<Record<string, keyof typeof GUITAR_DERIVATIONS>>>
> = {
	'note-places': { 'note-on-string': 'note' },
	'chord-shapes': {
		'voicing-on-strings': 'voicing',
		'placed-voicing': 'placed',
		change: 'change-chord'
	}
};

/**
 * A passage of a chord's shapes: the triad of the chord symbol its index names (as a chart writes
 * it, `C#m`) on its zone of strings, else the params'; each shape the placed voicing it is.
 */
export const GUITAR_PASSAGE_DERIVATIONS: Readonly<Record<string, PassageDerivation>> = {
	'chord-shapes': {
		set: 'placed-voicing',
		passageIndex(of, params): ChordShapesIndex {
			if (typeof of.chord !== 'string') {
				throw new Error('a passage of chord-shapes reads "chord", a chord symbol');
			}
			const strings = of.strings ?? params.strings;
			if (!Array.isArray(strings)) {
				throw new Error('no zone of strings: neither the passage nor the params give "strings"');
			}
			return { chord: triadOf(of.chord), strings: strings as StringNumber[] };
		},
		itemOf(member) {
			const { occurrence } = member as ChordShape;
			return {
				voicing: voicingKey(occurrence.voicing),
				frets: occurrence.notes.map((note) => note.fret)
			};
		}
	}
};
