import type { Chord } from './chord';
import { createVoicing, type StringSet, type Voicing } from './voicing';

const TRIAD_SIZE = 3;

/**
 * The three close voicings of a triad on three strings: root on the lowest string (root
 * position), on the highest (first inversion), on the middle one (second inversion).
 */
export function closeTriadVoicings(chord: Chord, strings: StringSet): Voicing[] {
	const degrees = chord.quality.degrees;
	if (degrees.length !== TRIAD_SIZE) {
		throw new RangeError(`${chord.quality.id} is not a triad quality`);
	}
	if (strings.length !== TRIAD_SIZE) throw new RangeError('A close triad needs three strings');
	return [0, 1, 2].map((inversion) =>
		createVoicing(
			chord,
			strings.map((string, i) => ({ string, degree: degrees[(i + inversion) % TRIAD_SIZE] }))
		)
	);
}
