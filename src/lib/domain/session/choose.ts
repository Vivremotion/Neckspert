import type { ExerciseId } from '$lib/domain/exercise/types';
import type { ItemSource } from '$lib/domain/progress/selector';

export interface SeriesCandidate {
	exerciseId: ExerciseId;
	source: ItemSource;
}

/** The series to play next among the candidates. H2: one candidate, the session's; the score comes with chantier 5. */
export function choose(candidates: readonly SeriesCandidate[]): SeriesCandidate | null {
	return candidates[0] ?? null;
}
