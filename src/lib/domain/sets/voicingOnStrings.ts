import {
	parseVoicingKey,
	pitchOfSpelled,
	spellInterval,
	type Confusion,
	type LocateItem,
	type Midi,
	type Voicing
} from '$lib/domain/music';
import type { ChordConfusion, ChordReading } from './triadChord';
import type { ItemSet } from './types';

/**
 * A triad voicing on a set of strings (the card), and, when a prompt asks one, the shape asked
 * this time: its position, and the fret the prompt names.
 */
export interface VoicingOnStringsItem {
	voicingKey: string;
	/** Lowest fretted fret of the shape asked; 'open' for a shape on open strings only. */
	position?: number | 'open';
	/**
	 * Fret the prompt names, drawn among those the shape covers (`cueFrets`); absent for a shape
	 * on open strings only, and on attempts stored before it (the position is named then).
	 */
	fret?: number;
}

/** Find a triad from its root on a named string: the voicing, all octaves together. */
export interface TriadAnchorItem {
	voicingKey: string;
}

/** Find a triad around a fret: the voicing (the card) and the shape asked this time. */
export type TriadZoneItem = VoicingOnStringsItem & { position: number | 'open' };

/** A wrong root, named as locate names it. */
export type RootConfusion = Confusion & { part: 'root' };

export type TriadAnchorConfusion =
	RootConfusion | ChordConfusion | { kind: 'no-chord'; part: 'chord' };

/** `Attempt.data` of a round that asks the root, then the chord (the anchor's). */
export interface TriadAnchorData {
	item: TriadAnchorItem;
	/**
	 * What was heard of each part; null without any answer. `chord` is the first chord, the
	 * answer; `correction`, a later chord read right that put a wrong one right.
	 */
	answer: {
		root: { midi: Midi } | null;
		chord: ChordReading | null;
		correction: ChordReading | null;
	} | null;
	confusion: TriadAnchorConfusion | null;
}

/** `Attempt.data` of a round that asks the chord alone (the zone's). */
export interface TriadZoneData {
	item: TriadZoneItem;
	answer: ChordReading | null;
	confusion: ChordConfusion | null;
}

/** The root of a voicing as a located note: its pitch on the string that carries degree 1. */
export function rootPosition(voicing: Voicing): LocateItem {
	const carrier = voicing.strings.find((s) => s.degree === '1');
	if (!carrier) throw new Error('A triad voicing carries its root');
	return {
		string: carrier.string,
		pitch: pitchOfSpelled(spellInterval(voicing.chord.root, '1'))
	};
}

/** Triad voicings on sets of strings. One card per voicing: a position is drawn for each prompt. */
export const voicingOnStringsSet: ItemSet<VoicingOnStringsItem> = {
	id: 'voicing-on-strings',
	itemKey: (item) => item.voicingKey,
	parseItem: (itemKey) => {
		parseVoicingKey(itemKey);
		return { voicingKey: itemKey };
	},
	cardItem: (item) => ({ voicingKey: item.voicingKey })
};
