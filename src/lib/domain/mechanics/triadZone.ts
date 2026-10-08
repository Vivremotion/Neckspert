import { parseVoicingKey } from '$lib/domain/music';
import { DEFAULT_PACING } from '$lib/domain/exercise/pacing';
import { createBeatTiming } from '$lib/domain/timing';
import { classifyChord, type ChordConfusion, type ChordReading } from './triadChord';
import type { MechanicRules } from './types';

/** Find a triad in a position: the voicing (the card) and the position asked this time. */
export interface TriadZoneItem {
	voicingKey: string;
	/** Lowest fretted fret of the shape asked; 'open' for a shape on open strings only. */
	position: number | 'open';
}

/** `Attempt.data` of a zone attempt. */
export interface TriadZoneData {
	item: TriadZoneItem;
	answer: ChordReading | null;
	confusion: ChordConfusion | null;
}

/** The chord at the position asked, on the target beat (chord sensor). One card per voicing. */
export const triadZoneRules: MechanicRules<
	TriadZoneItem,
	ChordReading,
	ChordReading,
	ChordConfusion
> = {
	id: 'triad-zone',
	timing: createBeatTiming(DEFAULT_PACING),
	timingFor: createBeatTiming,
	learner: 'memory',
	itemKey: (item) => item.voicingKey,
	// A card knows its voicing only: the position is drawn for each prompt.
	parseItem: (itemKey) => {
		parseVoicingKey(itemKey);
		return { voicingKey: itemKey } as TriadZoneItem;
	},
	cardItem: (item) => ({ voicingKey: item.voicingKey }),
	judge: (item, { decided }) => ({
		...classifyChord(parseVoicingKey(item.voicingKey), item.position, decided),
		answer: { decided }
	})
};
