import type { Refusal } from '$lib/domain/definitions';

/** The number of imported files with at least one refusal. */
export function importedProblemCount(refusals: readonly Refusal[]): number {
	return new Set(refusals.map((refusal) => refusal.file)).size;
}
