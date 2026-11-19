import type { RoutineDefinition } from './types';

/** The live routines, with the origin (file) that defined each; empty until files are read. */
const registered = new Map<string, { routine: RoutineDefinition; origin: string }>();

/** Null: registered. Else the origin that already holds this id; nothing changes. */
export function registerRoutine(routine: RoutineDefinition, origin: string): string | null {
	const known = registered.get(routine.id);
	if (known) return known.origin;
	registered.set(routine.id, { routine, origin });
	return null;
}

/** The routine of `id`, or nothing when no file defines it. */
export function findRoutine(id: string): RoutineDefinition | undefined {
	return registered.get(id)?.routine;
}

/** Every routine, in the order registered. */
export function routines(): RoutineDefinition[] {
	return [...registered.values()].map((entry) => entry.routine);
}

export function clearRoutines(): void {
	registered.clear();
}
