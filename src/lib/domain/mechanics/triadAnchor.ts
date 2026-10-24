import { CHORD_VOICING_CONTENT, CONTENT_JUDGES, NOTE_CONTENT } from '$lib/domain/judges';
import {
	parseVoicingKey,
	pitchOfSpelled,
	spellInterval,
	type Confusion,
	type LocateItem,
	type Midi,
	type Voicing
} from '$lib/domain/music';
import { DEFAULT_PACING } from '$lib/domain/exercise/pacing';
import { createAnchorTiming } from '$lib/domain/timing';
import type { ChordConfusion, ChordReading } from './triadChord';
import type { MechanicRules } from './types';

/** Find a triad from its root on a named string: the voicing, all octaves together. */
export interface TriadAnchorItem {
	voicingKey: string;
}

/** A wrong root, named as locate names it. */
export type RootConfusion = Confusion & { part: 'root' };

export type TriadAnchorConfusion =
	RootConfusion | ChordConfusion | { kind: 'no-chord'; part: 'chord' };

/** `Attempt.data` of an anchor attempt. */
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

/** The root of a voicing as a located note: its pitch on the string that carries degree 1. */
export function rootPosition(voicing: Voicing): LocateItem {
	const carrier = voicing.strings.find((s) => s.degree === '1');
	if (!carrier) throw new Error('A triad voicing carries its root');
	return {
		string: carrier.string,
		pitch: pitchOfSpelled(spellInterval(voicing.chord.root, '1'))
	};
}

function parseAnchorItem(itemKey: string): TriadAnchorItem {
	parseVoicingKey(itemKey);
	return { voicingKey: itemKey };
}

/** The root on the target beat (note sensor), then the chord in the bar (chord sensor). */
export const triadAnchorRules: MechanicRules<
	TriadAnchorItem,
	unknown,
	{ midi: Midi } | ChordReading,
	TriadAnchorConfusion
> = {
	id: 'triad-anchor',
	timing: createAnchorTiming(DEFAULT_PACING),
	timingFor: createAnchorTiming,
	learner: 'memory',
	itemKey: (item) => item.voicingKey,
	parseItem: parseAnchorItem,
	judge: (item, payload, sensor) => {
		const voicing = parseVoicingKey(item.voicingKey);
		if (sensor === 'note') {
			const root = CONTENT_JUDGES[NOTE_CONTENT].judge(rootPosition(voicing), payload) as {
				correct: boolean;
				answer: { midi: Midi };
				confusion: Confusion | null;
			};
			return {
				...root,
				confusion: root.confusion && { ...root.confusion, part: 'root' as const }
			};
		}
		if (sensor === 'chord') {
			return CONTENT_JUDGES[CHORD_VOICING_CONTENT].judge(
				{ voicingKey: item.voicingKey, position: null },
				payload
			) as { correct: boolean; answer: ChordReading; confusion: ChordConfusion | null };
		}
		throw new Error(`The anchor hears a root and a chord, not: ${String(sensor)}`);
	}
};
