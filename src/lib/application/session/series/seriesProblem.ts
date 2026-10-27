import type { ExerciseDefinition } from '$lib/domain/exercise/types';

/**
 * Null when the series can play the exercise's round as written, else what it cannot, naming the
 * exercise and the field. Since the series plays cycles (plan H6, Task 7) it plays every round the
 * domain accepts: a round closed on its answers or judged as a whole cycle, a verdict against the
 * level's thresholds (the series gives them), muted bars (the series mutes its click there).
 */
export function seriesProblem(definition: ExerciseDefinition): string | null {
	void definition;
	return null;
}
