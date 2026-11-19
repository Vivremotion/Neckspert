import { parseVoicingKey, type LocateItem } from '$lib/domain/music';
import { rootPosition, type VoicingOnStringsItem } from '$lib/domain/sets/voicingOnStrings';
import type { IndexDerivation } from '../index';
import type { ChordShapesIndex } from './chordShapes';
import type { NotePlacesIndex } from './notePlaces';

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
		index: (item: unknown): ChordShapesIndex => {
			const voicing = parseVoicingKey((item as VoicingOnStringsItem).voicingKey);
			return {
				chord: voicing.chord,
				strings: voicing.strings.map((s) => s.string),
				degrees: voicing.strings.map((s) => s.degree)
			};
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
	'chord-shapes': { 'voicing-on-strings': 'voicing' }
};
