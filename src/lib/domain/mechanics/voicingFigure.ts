import { parseVoicingKey } from '$lib/domain/music';
import { parseItemBeats, type MechanicIdentity } from './types';

/**
 * What a voicing-figure attempt is about: a chord shape, at its `occurrence`-th place on the neck
 * (0: the lowest), played as a figure. `beats` is the length of its turn, when the exercise lists
 * its shapes with one.
 */
export interface VoicingFigureItem {
	/** A voicing key (`voicingKey`). */
	voicing: string;
	occurrence: number;
	beats?: number;
}

const SEPARATOR = '@';
const OCCURRENCE = /^\d+$/;

/**
 * Figures played on the notes of a chord shape: a skill (its attempts are kept with their
 * observations, no card). The key is `${voicing}@${occurrence}`, followed by `@${beats}` when the
 * item has a length.
 */
export const voicingFigureRules: MechanicIdentity<VoicingFigureItem> = {
	id: 'voicing-figure',
	learner: 'skill',
	itemKey: ({ voicing, occurrence, beats }) =>
		`${voicing}${SEPARATOR}${occurrence}${beats === undefined ? '' : `${SEPARATOR}${beats}`}`,
	parseItem: (itemKey) => {
		const [voicing, occurrence, beats, ...rest] = itemKey.split(SEPARATOR);
		if (!voicing || occurrence === undefined || !OCCURRENCE.test(occurrence) || rest.length > 0) {
			throw new Error(`Invalid voicing figure item key: "${itemKey}"`);
		}
		parseVoicingKey(voicing);
		return beats === undefined
			? { voicing, occurrence: Number(occurrence) }
			: { voicing, occurrence: Number(occurrence), beats: parseItemBeats(beats, itemKey) };
	}
};
