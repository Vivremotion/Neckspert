import type { ChordDiagramStyle, Settings } from '$lib/domain/types';
import type { ExerciseDefinition } from './types';

/** How an exercise's chord shapes are drawn: as it imposes, else as the player chose. */
export function chordDiagramFor(
	definition: ExerciseDefinition,
	settings: Pick<Settings, 'chordDiagram'>
): ChordDiagramStyle {
	return definition.chordDiagram ?? settings.chordDiagram;
}
