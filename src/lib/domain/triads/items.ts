import type { ExerciseDefinition, ExercisePacing } from '$lib/domain/exercise/types';
import {
	CHROMATIC_NOTES,
	closeTriadVoicings,
	pitchOfSpelled,
	qualityById,
	spelledFromPitch,
	spellInterval,
	type PitchName,
	type StringSet,
	type Voicing
} from '$lib/domain/music';

/** What a triads exercise is made of, and its rhythm. */
export interface TriadParams {
	/** In the order they are introduced. */
	stringSets: StringSet[];
	/** Quality ids, in the order they are introduced within a root ('maj' then 'min'). */
	qualities: string[];
	pacing: ExercisePacing;
}

/** The params of a triads exercise. Throws on another exercise. */
export function triadParams(definition: ExerciseDefinition): TriadParams {
	const params = definition.params as Partial<TriadParams>;
	if (!Array.isArray(params.stringSets) || !Array.isArray(params.qualities) || !params.pacing) {
		throw new Error(`Not a triads exercise: ${definition.id}`);
	}
	return params as TriadParams;
}

/** Every close voicing of the params: string set, then root (sharps, from C), then quality. */
export function triadVoicings(params: TriadParams): Voicing[] {
	return params.stringSets.flatMap((strings) =>
		CHROMATIC_NOTES.flatMap((pitch) =>
			params.qualities.flatMap((quality) =>
				closeTriadVoicings(
					{ root: spelledFromPitch(pitch), quality: qualityById(quality) },
					strings
				)
			)
		)
	);
}

/** `${string}:${pitch}`: a position of the neck, keyed like a locate item. */
export function positionKey(string: number, pitch: PitchName): string {
	return `${string}:${pitch}`;
}

/** The positions (string and note, any octave) a voicing plays. */
export function voicingPositions(voicing: Voicing): string[] {
	return voicing.strings.map(({ string, degree }) =>
		positionKey(string, pitchOfSpelled(spellInterval(voicing.chord.root, degree)))
	);
}
