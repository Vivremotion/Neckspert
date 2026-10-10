import type { ChordGridConfusion } from '$lib/domain/mechanics';
import type { Locale } from '$lib/domain/types';

/** What tells the shape heard from the shape admitted, after a missed change. */
export type ChordGridGapMessages = Record<ChordGridConfusion['kind'], string> & {
	noChordHeard: string;
};

/** The cue of a gesture exercise and its gaps, in each language. */
export const CHORD_GRID_MESSAGES: Record<
	Locale,
	{
		up: string;
		down: string;
		zone: (from: number, to: number) => string;
		gap: ChordGridGapMessages;
	}
> = {
	fr: {
		up: '↑ en montant',
		down: '↓ en descendant',
		zone: (from, to) => `cases ${from} à ${to}`,
		gap: {
			none: 'rien de reconnu',
			'other-chord': 'autre accord',
			'other-quality': 'autre qualité',
			'other-set': 'autres cordes',
			'other-shape': 'autre forme',
			'not-higher': 'pas plus haut',
			'not-lower': 'pas plus bas',
			'out-of-zone': 'hors de la zone',
			noChordHeard: 'pas d’accord entendu'
		}
	},
	en: {
		up: '↑ going up',
		down: '↓ going down',
		zone: (from, to) => `frets ${from} to ${to}`,
		gap: {
			none: 'nothing recognized',
			'other-chord': 'other chord',
			'other-quality': 'other quality',
			'other-set': 'other strings',
			'other-shape': 'other shape',
			'not-higher': 'not higher',
			'not-lower': 'not lower',
			'out-of-zone': 'out of the zone',
			noChordHeard: 'no chord heard'
		}
	}
};
