import { parseChordString, CHROMATIC_NOTES } from './Pitch';
import { generateVoicings } from './generate';
import type { Voicing } from './Voicing';

/**
 * Search for voicings matching an input string such as "C", "Dm", "F#Maj7", "Bb".
 * Returns one Voicing per (quality, shape) combination for the parsed root.
 * An empty string returns [].
 */
export function searchVoicings(input: string): Voicing[] {
	if (!input) return [];

	const parsed = parseChordString(input);
	if (!parsed) return [];

	const { root, displayRoot, suffix } = parsed;

	if (!CHROMATIC_NOTES.includes(root)) return [];

	const all = generateVoicings(root, displayRoot);

	if (!suffix) return all;

	return all.filter((v) => v.chord.quality.toLowerCase().startsWith(suffix.toLowerCase()));
}
