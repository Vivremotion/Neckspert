// The gesture's tempo as its exercise level (plan H6, D5): Dexie version 11 and backup version 7.
// Every gesture progression the game still read becomes the exercise level of its scope; the
// others, which the game ignored, are dropped with the progression tables; an attempt's
// `tempoScope` becomes `scope`. Pure functions on plain records, applied alike by the database
// upgrade (`db.ts`) and by the import of a backup (`validateBackup.ts`).

import type { LevelState } from '$lib/domain/time';

type Row = Record<string, unknown>;

/** A tempo progression as versions 5 to 10 stored it; `scope` only in a scope of its exercise. */
export interface ProgressionV10 {
	exerciseId: string;
	scope?: string;
	mechanic: string;
	tempoBpm: number;
	updatedAt: number;
}

/** A backup at version 6: its tempo progressions, attempts with their `tempoScope`. */
export interface BackupV6 extends Row {
	version: 6;
	progressions: ProgressionV10[];
	attempts: Row[];
	levelStates: LevelState[];
}

/** A backup at version 7: no progressions, attempts with their `scope`. */
export interface BackupV7 extends Row {
	version: 7;
	attempts: Row[];
	levelStates: LevelState[];
}

/**
 * The gesture's tempo levels at version 11, frozen: level i plays at GESTURE_TEMPOS_V11[i]. A
 * tripwire test compares them with the live catalog; a migration never reads live code.
 */
export const GESTURE_TEMPOS_V11: readonly number[] = [80, 85, 90, 95, 100, 105, 110, 115, 120];

/** The gesture's exercises at version 11, frozen. */
export const GESTURE_EXERCISES_V11: readonly string[] = [
	'gesture-link',
	'gesture-climb',
	'gesture-zone',
	'gesture-jam'
];

/**
 * Those of them played on grids, frozen: their tempo was read only in a scope, their grid (an
 * unscoped one was ignored from version 7). The others (the link) had one tempo, unscoped.
 */
export const GESTURE_GRID_EXERCISES_V11: readonly string[] = [
	'gesture-climb',
	'gesture-zone',
	'gesture-jam'
];

/** The highest gesture level whose tempo is not above `tempoBpm`; level 0 below them all. */
export function gestureLevelOfTempo(tempoBpm: number): number {
	return Math.max(
		0,
		GESTURE_TEMPOS_V11.findLastIndex((tempo) => tempo <= tempoBpm)
	);
}

/** Whether the game read this progression at version 10: a gesture one, in the scope it used. */
function wasRead(progression: ProgressionV10): boolean {
	if (!GESTURE_EXERCISES_V11.includes(progression.exerciseId)) return false;
	const scoped = progression.scope !== undefined && progression.scope !== '';
	return scoped === GESTURE_GRID_EXERCISES_V11.includes(progression.exerciseId);
}

function stateKey(state: { exerciseId: string; scope: string; item: string }): string {
	return JSON.stringify([state.exerciseId, state.scope, state.item]);
}

/**
 * The exercise level of each gesture progression the game read, in its scope; a level state
 * already in `existing` is kept, and the progressions the game ignored are dropped.
 */
export function levelStatesV11(
	progressions: readonly ProgressionV10[],
	existing: readonly LevelState[]
): LevelState[] {
	const stored = new Set(existing.map(stateKey));
	const seeded: LevelState[] = [];
	for (const progression of progressions) {
		if (!wasRead(progression)) continue;
		const state: LevelState = {
			exerciseId: progression.exerciseId,
			scope: progression.scope ?? '',
			item: '',
			level: gestureLevelOfTempo(progression.tempoBpm),
			successes: 0,
			failures: 0,
			resumeAfter: null
		};
		if (stored.has(stateKey(state))) continue;
		seeded.push(state);
		stored.add(stateKey(state));
	}
	return seeded;
}

/** An attempt whose `tempoScope` is now `scope`: the scope of its exercise level. */
export function attemptToV11<T extends { tempoScope?: string }>(
	attempt: T
): Omit<T, 'tempoScope'> & { scope?: string } {
	if (!Object.hasOwn(attempt, 'tempoScope')) return attempt;
	const { tempoScope, ...rest } = attempt;
	return tempoScope === undefined ? rest : { ...rest, scope: tempoScope };
}

/** A version 6 backup as version 7: gesture progressions as levels, no progressions, `scope`. */
export function backupV6ToV7(backup: BackupV6): BackupV7 {
	const { progressions, ...rest } = backup;
	return {
		...rest,
		version: 7,
		attempts: backup.attempts.map(attemptToV11),
		levelStates: [...backup.levelStates, ...levelStatesV11(progressions, backup.levelStates)]
	};
}
