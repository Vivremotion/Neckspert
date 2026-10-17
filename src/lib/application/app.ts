import type { OracleReport } from '$lib/application/ports';
import { getContext, setContext } from 'svelte';
import type { ExerciseId } from '$lib/domain/exercise/types';
import type { HomeStats, NeckMapCell, SessionKind, SessionSummary } from '$lib/domain/types';
import type {
	BackupPort,
	CalibrationPort,
	NoteDetectorPort,
	SettingsRepositoryPort
} from './ports';
import type { PlaySessionController } from './session/contract';

/** The diagnostic journal as the settings screen sees it. */
export interface DiagnosticsService {
	usage(): Promise<{ bytes: number; takes: number }>;
	/** A zip (application/zip): the learning backup and every take. */
	exportArchive(): Promise<Blob>;
	/** A zip of runs for the oracle of the attack sensor: their sound, their labels, `suites.json`. */
	oracleArchive(): Promise<Blob>;
	/** The report of an annotated oracle: `suites.json` and the corrected `suite-NN.txt`. */
	oracleReport(files: readonly { name: string; text: string }[]): OracleReport;
	clear(): Promise<void>;
}

/** The triads exercises on the home screen: their reviews due now, and whether the zone is open. */
export interface TriadsHome {
	anchorDue: number;
	/** Null while the zone is closed (`triadZoneOpen`): it is not offered. */
	zoneDue: number | null;
}

/** Everything the screens need. Implemented by the application layer, wired by the composition root. */
export interface AppServices {
	settings: SettingsRepositoryPort;
	backup: BackupPort;
	detector: NoteDetectorPort;
	calibration: CalibrationPort;
	diagnostics: DiagnosticsService;
	homeStats(): Promise<HomeStats>;
	/** The triads exercises as the home screen offers them. */
	triads(): Promise<TriadsHome>;
	/** The gesture track: open once one of its exercises is. */
	gesture(): Promise<{ open: boolean }>;
	/**
	 * « Joué juste » or « C’était en place » from the summary: labels the attempt contested, with
	 * the reason contested when there is one, nothing else.
	 */
	contest(attemptId: number, reason?: string): Promise<void>;
	/** Plays run `runId` of a session still in memory; rejects a run whose take is not held. */
	replayRun(sessionId: string, runId: number): Promise<void>;
	stopReplay(): void;
	/** Of `exerciseIds`, those resting after « On change d’air » (`resumeAfter` still ahead). */
	resting(exerciseIds: readonly ExerciseId[]): Promise<ExerciseId[]>;
	sessionSummary(sessionId: string): Promise<SessionSummary>;
	neckMap(): Promise<NeckMapCell[]>;
	/** Plans the session and returns its controller, not yet started. Rejects `'exercise'` (see `startExercise`). */
	startSession(kind: SessionKind): Promise<PlaySessionController>;
	/**
	 * Free play of one exercise played cycle after cycle (a session of kind `'exercise'`): its
	 * controller, not yet started. Rejects an unknown exercise, or one without levels.
	 */
	startExercise(exerciseId: ExerciseId): Promise<PlaySessionController>;
}

const APP_SERVICES = Symbol('app-services');

export function provideAppServices(services: AppServices): void {
	setContext(APP_SERVICES, services);
}

export function useAppServices(): AppServices {
	const services = getContext<AppServices | undefined>(APP_SERVICES);
	if (!services) throw new Error('AppServices not provided');
	return services;
}
