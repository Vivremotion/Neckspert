import type { ExerciseDefinition } from '$lib/domain/exercise';
import type { MechanicPresenter } from './types';

/**
 * A mechanic's presenter as `definition` plays it, alone in its session: it listens with the
 * sensors its round names, its mechanic's only where its round names none. A session opens the
 * sensors of its presenters, and a round ignores all but its own.
 */
export function exercisePresenter(
	presenter: MechanicPresenter,
	definition: ExerciseDefinition
): MechanicPresenter {
	const sensors = [...new Set(definition.round?.expectations.map((entry) => entry.sensor) ?? [])];
	return sensors.length > 0 ? { ...presenter, sensors } : presenter;
}
