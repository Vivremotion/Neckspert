import { findExercise } from '$lib/domain/exercise/registry';
import { findRoutine } from '$lib/domain/routine/registry';
import type { SessionOrigin } from '$lib/domain/types';

/**
 * What /session plays (D6): `?routine=<id>`, freely with `&free=1`, or `?exercise=<id>`, alone.
 * Null when the address names neither, or an id no file defines (the old `?kind=` is not read).
 * An address naming a routine means that routine alone: an exercise also named is not read, and
 * an unknown routine is not found even when the exercise exists (one address, one meaning).
 */
export function sessionFromQuery(query: URLSearchParams): SessionOrigin | null {
	const routine = query.get('routine');
	if (routine !== null) {
		if (!findRoutine(routine)) return null;
		return query.get('free') === '1' ? { routine, free: true } : { routine };
	}
	const exercise = query.get('exercise');
	if (exercise !== null && findExercise(exercise)) return { exercise };
	return null;
}
