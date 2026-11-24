// Version 14 (issue #19): an exercise has levels only, counted from 1 (index 0). The seven
// exercises of the catalog that had one aid level (index -1) made it their level 1, so every
// stored level of theirs moves up by one; a level state no longer keeps `resumeAfter`. Everything
// read of the code of version 13 is frozen here; a tripwire test compares it with the catalog.

import type { BackupV9 } from './v13';

type Row = Record<string, unknown>;

/** How many aid levels each exercise had, by exercise id. */
export type AidLevelsV14 = Readonly<Record<string, number>>;

/** The exercises of the catalog of version 13 that had aid levels, and how many. Frozen. */
export const AID_LEVELS_V13: AidLevelsV14 = {
	'inversion-run': 1,
	'grid-in-direction': 1,
	'grid-in-zone': 1,
	'grid-reading': 1,
	'rhythm-silent-bars': 1,
	'rhythm-two-four': 1,
	'rhythm-offbeats': 1
};

/**
 * The aids an attempt could keep up to database 13, frozen: nothing writes them since issue #19,
 * an attempt stored before keeps its list, which nothing reads.
 */
export const AIDS_V13 = [
	'show-position',
	'string-aid',
	'cursor',
	'listen',
	'play-along',
	'aid-level'
] as const;

const isRow = (value: unknown): value is Row =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/** The exercises a definition file's text defines; none when it is not the JSON of a file. */
function exercisesOf(text: unknown): unknown[] {
	if (typeof text !== 'string') return [];
	try {
		const json: unknown = JSON.parse(text);
		return isRow(json) && Array.isArray(json.exercises) ? json.exercises : [];
	} catch {
		return [];
	}
}

/**
 * The aid levels of the exercises the imported definition files define: by exercise, the number
 * of its levels that write `"aid": true`, for those that write one. An unreadable text gives
 * nothing. When two files define one id, the first counts: loading refuses an id already taken.
 */
export function aidLevelsOfFilesV14(files: readonly Row[]): Record<string, number> {
	const counts: Record<string, number> = {};
	const seen = new Set<string>();
	for (const file of files) {
		for (const exercise of exercisesOf(file.text)) {
			if (!isRow(exercise) || typeof exercise.id !== 'string' || seen.has(exercise.id)) continue;
			seen.add(exercise.id);
			const levels = Array.isArray(exercise.levels) ? exercise.levels : [];
			const aid = levels.filter((level) => isRow(level) && level.aid === true).length;
			if (aid > 0) counts[exercise.id] = aid;
		}
	}
	return counts;
}

/**
 * The aid levels version 14 shifts by: the imported files' (`aidLevelsOfFilesV14`), and the
 * catalog's (`AID_LEVELS_V13`), which win on an id both name: loading refuses a file's exercise
 * that takes an id of the catalog.
 */
export function aidLevelsV14(files: readonly Row[]): AidLevelsV14 {
	return { ...aidLevelsOfFilesV14(files), ...AID_LEVELS_V13 };
}

/** The aid levels of `exerciseId`; 0 for an exercise that had none, or that nothing defines. */
function shiftOf(exerciseId: unknown, aidLevels: AidLevelsV14): number {
	return typeof exerciseId === 'string' && Object.hasOwn(aidLevels, exerciseId)
		? aidLevels[exerciseId]
		: 0;
}

/** `level` moved up by `shift`; a value that is not a whole number as it is. */
function shifted(level: unknown, shift: number): unknown {
	return Number.isInteger(level) ? (level as number) + shift : level;
}

/**
 * A level state as version 14 keeps it: no `resumeAfter`; an exercise level (`item` empty) of an
 * exercise that had aid levels moved up by their number, in every scope. An item's level does not
 * move: items had no aid levels.
 */
export function levelStateToV14(state: Row, aidLevels: AidLevelsV14): Row {
	const { resumeAfter: _resumeAfter, ...rest } = state;
	if (state.item !== '') return rest;
	const shift = shiftOf(state.exerciseId, aidLevels);
	return shift === 0 ? rest : { ...rest, level: shifted(state.level, shift) };
}

/** A session as version 14 keeps it: the level reached of a session of one exercise moved up. */
export function sessionToV14(session: Row, aidLevels: AidLevelsV14): Row {
	const shift = shiftOf(session.exercise, aidLevels);
	if (shift === 0 || !Object.hasOwn(session, 'levelReached')) return { ...session };
	return { ...session, levelReached: shifted(session.levelReached, shift) };
}

/**
 * An attempt as version 14 keeps it: the level its data names (`data.level`) moved up for an
 * attempt judged by the cycle verdict; everything else as it is, its phase and aids included.
 */
export function attemptToV14(attempt: Row, aidLevels: AidLevelsV14): Row {
	const shift = shiftOf(attempt.exerciseId, aidLevels);
	const { verdict, data } = attempt;
	if (shift === 0 || !isRow(verdict) || verdict.relation !== 'cycle' || !isRow(data)) {
		return { ...attempt };
	}
	if (!Object.hasOwn(data, 'level')) return { ...attempt };
	return { ...attempt, data: { ...data, level: shifted(data.level, shift) } };
}

/** A backup at version 10: levels counted from 1, no `resumeAfter` on a level state. */
export interface BackupV10 extends Row {
	version: 10;
	definitionFiles: Row[];
}

/**
 * A version 9 backup as version 10: its level states, sessions and attempts upgraded
 * (`levelStateToV14`, `sessionToV14`, `attemptToV14`) by the aid levels of the catalog and of
 * the definition files it holds (`aidLevelsV14`).
 */
export function backupV9ToV10(backup: BackupV9): BackupV10 {
	const rows = (value: unknown): Row[] => (Array.isArray(value) ? (value as Row[]) : []);
	const aidLevels = aidLevelsV14(rows(backup.definitionFiles));
	return {
		...backup,
		version: 10,
		attempts: rows(backup.attempts).map((attempt) => attemptToV14(attempt, aidLevels)),
		levelStates: rows(backup.levelStates).map((state) => levelStateToV14(state, aidLevels)),
		sessions: rows(backup.sessions).map((session) => sessionToV14(session, aidLevels))
	};
}
