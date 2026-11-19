import type { SkillId } from '$lib/domain/skill/types';
import {
	parseVoicingKey,
	voicingKey,
	voicingOccurrences,
	type VoicingOccurrence
} from '$lib/domain/music';

/** A skill of the triads (its items are `voicing-on-strings`). */
export type TriadSkill = SkillId;

/** Joins the voicing key and the frets of a shape: `D|maj|3:5,2:1,1:3@2-3-2`. */
const OCCURRENCE_SEPARATOR = '@';

/** The id of a shape among chord candidates: its voicing and its frets. */
export function occurrenceId(occurrence: VoicingOccurrence): string {
	return placedShapeId(
		voicingKey(occurrence.voicing),
		occurrence.notes.map((note) => note.fret)
	);
}

/**
 * The id of the shape of voicing key `voicing` at `frets` (in its strings' order), as
 * `occurrenceId` writes it, whether or not the voicing has a place there.
 */
export function placedShapeId(voicing: string, frets: readonly number[]): string {
	return `${voicing}${OCCURRENCE_SEPARATOR}${frets.join('-')}`;
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
