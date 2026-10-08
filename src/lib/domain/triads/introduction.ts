import {
	CHROMATIC_NOTES,
	pitchOfSpelled,
	voicingOccurrences,
	type PitchName,
	type Voicing
} from '$lib/domain/music';
import { triadVoicings, voicingPositions, type TriadParams } from './items';
import { occurrencePosition } from './position';

/** Where the lowest shape of a voicing sits; a shape on open strings is the lowest of all. */
function lowestPosition(voicing: Voicing): number {
	const [lowest] = voicingOccurrences(voicing);
	const position = lowest ? occurrencePosition(lowest) : Infinity;
	return position === 'open' ? 0 : position;
}

function isNatural(pitch: PitchName): boolean {
	return !pitch.includes('#');
}

/**
 * The anchor introduction queue (spec 2026-10-08, section 2): string set by string set; within a
 * set, root by root, each root's family in the params' quality order, the three inversions up the
 * neck by their lowest shape. Roots come by the number of their positions already acquired in
 * locate (`acquiredPositions`: `string:pitch` keys), most first; then naturals before altered
 * notes; then chromatic order from C.
 */
export function triadIntroductionOrder(
	params: TriadParams,
	acquiredPositions: ReadonlySet<string>
): Voicing[] {
	const voicings = triadVoicings(params);
	return params.stringSets.flatMap((strings) => {
		const onSet = voicings.filter((v) => v.strings.every((s, i) => s.string === strings[i]));
		const known = (root: PitchName) =>
			new Set(
				onSet
					.filter((v) => pitchOfSpelled(v.chord.root) === root)
					.flatMap(voicingPositions)
					.filter((key) => acquiredPositions.has(key))
			).size;
		const roots = [...CHROMATIC_NOTES].sort(
			(a, b) =>
				known(b) - known(a) ||
				Number(isNatural(b)) - Number(isNatural(a)) ||
				CHROMATIC_NOTES.indexOf(a) - CHROMATIC_NOTES.indexOf(b)
		);
		return roots.flatMap((root) =>
			params.qualities.flatMap((quality) =>
				onSet
					.filter((v) => pitchOfSpelled(v.chord.root) === root && v.chord.quality.id === quality)
					.sort((a, b) => lowestPosition(a) - lowestPosition(b))
			)
		);
	});
}
