import type { Aid, PlannedItem } from '$lib/domain/types';

/** The aids a planned prompt showed: the fret (`show-position`) and the drawn string. */
export function aidsOf(planned: PlannedItem): Aid[] {
	return [
		...(planned.aid === 'show-position' ? (['show-position'] as const) : []),
		...(planned.stringAid ? (['string-aid'] as const) : [])
	];
}
