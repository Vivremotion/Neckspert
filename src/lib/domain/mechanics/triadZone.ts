import { parseVoicingKey } from '$lib/domain/music';
import { beatTiming } from '$lib/domain/timing';
import { CHORD_VOICING_CONTENT, CONTENT_JUDGES } from '$lib/domain/judges';
import type { ChordConfusion, ChordReading } from './triadChord';
import type { MechanicRules } from './types';

/** Find a triad around a fret: the voicing (the card) and the shape asked this time. */
export interface TriadZoneItem {
	voicingKey: string;
	/** Lowest fretted fret of the shape asked; 'open' for a shape on open strings only. */
	position: number | 'open';
	/**
	 * Fret the prompt names, drawn among those the shape covers (`cueFrets`); absent for a shape
	 * on open strings only, and on attempts stored before it (the position is named then).
	 */
	fret?: number;
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
	timing: beatTiming,
	learner: 'memory',
	itemKey: (item) => item.voicingKey,
	// A card knows its voicing only: the position is drawn for each prompt.
	parseItem: (itemKey) => {
		parseVoicingKey(itemKey);
		return { voicingKey: itemKey } as TriadZoneItem;
	},
	cardItem: (item) => ({ voicingKey: item.voicingKey }),
	judge: (item, reading) =>
		CONTENT_JUDGES[CHORD_VOICING_CONTENT].judge(
			{ voicingKey: item.voicingKey, position: item.position },
			reading
		) as { correct: boolean; answer: ChordReading; confusion: ChordConfusion | null }
};
