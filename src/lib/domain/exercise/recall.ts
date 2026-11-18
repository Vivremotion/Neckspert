import type { ExerciseDefinition } from './types';

/**
 * The direct-recall threshold an exercise declares in its params
 * (`params.recallThresholdMs`), in ms; null when it declares none (the gesture,
 * the rhythm: never direct recall). Throws on a value that is not a positive
 * finite number.
 */
export function recallThresholdOf(definition: ExerciseDefinition): number | null {
	const value = definition.params.recallThresholdMs;
	if (value === undefined) return null;
	if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
		throw new Error('recallThresholdMs must be a positive number');
	}
	return value;
}
