import {
	closeTriadVoicings,
	parseSpelledNote,
	qualityById,
	voicingOccurrences,
	type StringNumber,
	type VoicingOccurrence
} from '$lib/domain/music';
import { occurrenceId } from '$lib/domain/triads';

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
