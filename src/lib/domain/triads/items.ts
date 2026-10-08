import type { ExerciseDefinition, ExercisePacing } from '$lib/domain/exercise/types';
import {
	CHROMATIC_NOTES,
	closeTriadVoicings,
	pitchOfSpelled,
	qualityById,
	spelledFromPitch,
	spellInterval,
	type PitchName,
	parseVoicingKey,
	voicingKey,
	voicingOccurrences,
	type StringSet,
	type Voicing,
	type VoicingOccurrence
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

/** Joins the voicing key and the frets of a shape: `D|maj|3:5,2:1,1:3@2-3-2`. */
const OCCURRENCE_SEPARATOR = '@';

/** The id of a shape among chord candidates: its voicing and its frets. */
export function occurrenceId(occurrence: VoicingOccurrence): string {
	const frets = occurrence.notes.map((note) => note.fret).join('-');
	return `${voicingKey(occurrence.voicing)}${OCCURRENCE_SEPARATOR}${frets}`;
}

/** The voicing and the shape an id names; null for an id that names none. */
export function occurrenceOfId(id: string): VoicingOccurrence | null {
	const at = id.lastIndexOf(OCCURRENCE_SEPARATOR);
	if (at < 0) return null;
	try {
		const voicing = parseVoicingKey(id.slice(0, at));
		const frets = id.slice(at + 1);
		return (
			voicingOccurrences(voicing).find(
				(o) => o.notes.map((note) => note.fret).join('-') === frets
			) ?? null
		);
	} catch {
		return null;
	}
}
