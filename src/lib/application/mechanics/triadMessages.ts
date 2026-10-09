import type { StringNumber } from '$lib/domain/music/types';
import type { Locale } from '$lib/domain/types';

/** Names of the strings in a triad prompt: solfège in French, letters in English. */
export const TRIAD_STRING_NAMES: Record<Locale, Record<StringNumber, string>> = {
	fr: { 1: 'mi', 2: 'si', 3: 'sol', 4: 'ré', 5: 'la', 6: 'mi' },
	en: { 1: 'E', 2: 'B', 3: 'G', 4: 'D', 5: 'A', 6: 'E' }
};

/** What tells the shape heard from the shape asked, after a miss. */
export interface TriadGapMessages {
	'other-inversion': string;
	'other-quality': string;
	'other-octave': string;
	none: string;
	'no-chord': string;
	noChordHeard: string;
	rootHeard: (note: string) => string;
	noRoot: string;
}

export const TRIAD_MESSAGES: Record<
	Locale,
	{
		rootOn: (string: string) => string;
		position: (fret: number) => string;
		open: string;
		gap: TriadGapMessages;
	}
> = {
	fr: {
		rootOn: (string) => `fondamentale sur ${string}`,
		position: (fret) => `position ${fret}`,
		open: 'à vide',
		gap: {
			'other-inversion': 'autre renversement',
			'other-quality': 'autre qualité',
			'other-octave': 'autre octave',
			none: 'rien de reconnu',
			'no-chord': 'pas d’accord dans la bande',
			noChordHeard: 'pas d’accord entendu',
			rootHeard: (note) => `fondamentale entendue : ${note}`,
			noRoot: 'fondamentale non entendue'
		}
	},
	en: {
		rootOn: (string) => `root on ${string}`,
		position: (fret) => `position ${fret}`,
		open: 'open',
		gap: {
			'other-inversion': 'other inversion',
			'other-quality': 'other quality',
			'other-octave': 'other octave',
			none: 'nothing recognized',
			'no-chord': 'no chord in the band',
			noChordHeard: 'no chord heard',
			rootHeard: (note) => `root heard: ${note}`,
			noRoot: 'no root heard'
		}
	}
};
