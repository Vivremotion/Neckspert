// Records to the target model (spec 2026-10-14, section 9): Dexie version 8 and backup version 4.
// Pure functions on plain records, applied alike by the database upgrade (`db.ts`) and by the
// import of a backup (`validateBackup.ts`), so both reach the same rows.

import { mechanicRules } from '$lib/domain/mechanics';

type Row = Record<string, unknown>;

/** The time relation a stored attempt was judged by: its mechanic's, from the registry. */
export function relationOfMechanic(mechanic: string): string {
	return mechanicRules(mechanic).timing.id;
}

/**
 * An attempt stored with a bare verdict (a string), a boolean `correct` and the planned `aid`
 * gets its success (right and not off the beat), its verdict wrapped for the relation of its
 * mechanic, its aids (the shown fret; the drawn string was not stored), no measures, no plan.
 * An attempt already at the target model is returned as it is: a database may hold both.
 */
export function attemptToV8(row: Row, relationOf: (mechanic: string) => string): Row {
	if (typeof row.verdict !== 'string') return row;
	const { aid, ...rest } = row;
	return {
		...rest,
		success: row.correct === true && row.verdict !== 'offbeat',
		verdict: { relation: relationOf(row.mechanic as string), version: 1, value: row.verdict },
		aids: aid === 'show-position' ? ['show-position'] : [],
		measures: {},
		plan: null
	};
}

/**
 * The one calibrated offset, measured by the player on the click, becomes the latency of the
 * note and chord sensors; the click was never found to bleed. Settings already converted, and
 * the fields they hold, are kept.
 */
export function settingsToV8(row: Row): Row {
	const { calibrationOffsetMs: offset, ...rest } = row;
	const latency =
		typeof offset === 'number'
			? {
					note: { ms: offset, provenance: 'player' },
					chord: { ms: offset, provenance: 'player' }
				}
			: {};
	return { ...rest, latency: rest.latency ?? latency, clickBleed: rest.clickBleed ?? false };
}

/** A version 3 backup as version 4: its settings and attempts converted, no level states yet. */
export function backupV3ToV4(file: Row, relationOf: (mechanic: string) => string): Row {
	return {
		...file,
		version: 4,
		settings: settingsToV8(file.settings as Row),
		attempts: (file.attempts as Row[]).map((attempt) => attemptToV8(attempt, relationOf)),
		levelStates: []
	};
}
