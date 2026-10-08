import type { StringNumber } from '$lib/domain/music/types';
import type { Locale } from '$lib/domain/types';

/** Names of the strings in a triad prompt: solfège in French, letters in English. */
export const TRIAD_STRING_NAMES: Record<Locale, Record<StringNumber, string>> = {
	fr: { 1: 'mi', 2: 'si', 3: 'sol', 4: 'ré', 5: 'la', 6: 'mi' },
	en: { 1: 'E', 2: 'B', 3: 'G', 4: 'D', 5: 'A', 6: 'E' }
};

export const TRIAD_MESSAGES: Record<
	Locale,
	{ rootOn: (string: string) => string; position: (fret: number) => string; open: string }
> = {
	fr: {
		rootOn: (string) => `fondamentale sur ${string}`,
		position: (fret) => `position ${fret}`,
		open: 'à vide'
	},
	en: {
		rootOn: (string) => `root on ${string}`,
		position: (fret) => `position ${fret}`,
		open: 'open'
	}
};
