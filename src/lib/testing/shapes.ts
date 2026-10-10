import {
	closeTriadVoicings,
	parseSpelledNote,
	qualityById,
	voicingKey,
	voicingOccurrences,
	type StringNumber,
	type VoicingOccurrence
} from '$lib/domain/music';
import { occurrenceId } from '$lib/domain/triads';
import { cardKey, type CardState } from '$lib/domain/types';

/** The close triad shape of `root` `quality` on `set` at `frets` ("7-7-5"). Throws without one. */
export function shapeAt(
	root: string,
	quality: string,
	set: readonly StringNumber[],
	frets: string
): VoicingOccurrence {
	const chord = { root: parseSpelledNote(root), quality: qualityById(quality) };
	const found = closeTriadVoicings(chord, set)
		.flatMap((voicing) => voicingOccurrences(voicing))
		.find((o) => o.notes.map((n) => n.fret).join('-') === frets);
	if (!found) throw new Error(`No ${root}${quality} on ${set.join()} at ${frets}`);
	return found;
}

/** The candidate id of that shape, as the chord sensor decides it. */
export function shapeId(
	root: string,
	quality: string,
	set: readonly StringNumber[],
	frets: string
): string {
	return occurrenceId(shapeAt(root, quality, set, frets));
}

/** The cards of the three inversions of a close triad in a triads mechanic, acquired or not. */
export function triadCards(
	mechanic: 'triad-anchor' | 'triad-zone',
	root: string,
	quality: string,
	set: readonly StringNumber[],
	acquiredAt: number | null = 1000
): CardState[] {
	const chord = { root: parseSpelledNote(root), quality: qualityById(quality) };
	return closeTriadVoicings(chord, set).map((voicing) => {
		const key = voicingKey(voicing);
		return {
			key: cardKey(mechanic, key),
			mechanic,
			item: { voicingKey: key },
			introducedAt: 1000,
			introducedInSession: 's0',
			leadBeats: 2,
			scheduling: {
				due: 0,
				stability: 0,
				difficulty: 0,
				elapsedDays: 0,
				scheduledDays: 0,
				learningSteps: 0,
				reps: 0,
				lapses: 0,
				state: 2,
				lastReview: null
			},
			learnedAt: 1000,
			acquiredAt,
			masteredAt: null
		};
	});
}
