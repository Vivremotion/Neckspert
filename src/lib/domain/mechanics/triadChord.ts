import { pitchOfSpelled, voicingKey, type Voicing } from '$lib/domain/music';
import { occurrenceOfId, occurrencePosition } from '$lib/domain/triads';

/** What went wrong with a chord: the chord heard, or none. Part of a triad confusion. */
export type ChordConfusion = {
	kind: 'other-octave' | 'other-inversion' | 'other-quality' | 'none';
	part: 'chord';
};

/** The chord sensor's reading, as the triad judges read it. */
export interface ChordReading {
	decided: string | null;
}

/** How the chord heard relates to the one asked (`position`: the shape asked, if any). */
export function classifyChord(
	asked: Voicing,
	position: number | 'open' | null,
	decided: string | null
): { correct: boolean; confusion: ChordConfusion | null } {
	const heard = decided === null ? null : occurrenceOfId(decided);
	if (!heard) return { correct: false, confusion: { kind: 'none', part: 'chord' } };
	const sameChord =
		pitchOfSpelled(heard.voicing.chord.root) === pitchOfSpelled(asked.chord.root) &&
		heard.voicing.chord.quality.id === asked.chord.quality.id;
	if (!sameChord) return { correct: false, confusion: { kind: 'other-quality', part: 'chord' } };
	if (voicingKey(heard.voicing) !== voicingKey(asked)) {
		return { correct: false, confusion: { kind: 'other-inversion', part: 'chord' } };
	}
	if (position !== null && occurrencePosition(heard) !== position) {
		return { correct: false, confusion: { kind: 'other-octave', part: 'chord' } };
	}
	return { correct: true, confusion: null };
}
