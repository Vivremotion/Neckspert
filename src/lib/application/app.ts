import type { OracleReport } from '$lib/application/ports';
import { getContext, setContext } from 'svelte';
import type { ExerciseId } from '$lib/domain/exercise/types';
import type { HomeStats, NeckMapCell, SessionSummary } from '$lib/domain/types';
import type {
	BackupPort,
	CalibrationPort,
	NoteDetectorPort,
	SettingsRepositoryPort
} from './ports';
import type { DefinitionsService } from './definitions/service';
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

/** A routine as the home screen offers it. */
export interface RoutineEntry {
	id: string;
	title: { fr: string; en: string };
	/**
	 * Every exercise of it is defined, and: its opening holds and one of its exercises has
	 * something to play, or (memory exercises) one of their skills already has a served card,
	 * so a routine once played stays offered with its reviews.
	 */
	open: boolean;
	/** Reviews due now, for a routine of memory exercises; null otherwise. */
	due: number | null;
	/** When the next reviews come, for a routine of memory exercises with a card learned; else null. */
	nextReviewAt: number | null;
	/** One of its exercises rests after « On change d’air ». */
	resting: boolean;
}

/** An exercise as the Library lists it. */
export interface LibraryEntry {
	exerciseId: ExerciseId;
	/** The exercise's title, else the name of its skill. */
	title: { fr: string; en: string };
	/** The titles of the routines that list it. */
	routines: { fr: string; en: string }[];
	resting: boolean;
	/** It has something to play now, alone. */
	playable: boolean;
}

/** Everything the screens need. Implemented by the application layer, wired by the composition root. */
export interface AppServices {
	settings: SettingsRepositoryPort;
	/** Replacing the stored data reloads the definition files the backup carries. */
	backup: BackupPort;
	/** The imported definition files; the layout awaits `ready()` before drawing anything. */
	definitions: DefinitionsService;
	detector: NoteDetectorPort;
	calibration: CalibrationPort;
	diagnostics: DiagnosticsService;
	/** The gap to the beat the home screen shows, and its trend. */
	homeStats(): Promise<HomeStats>;
	/** Every registered routine, in the order registered, the closed ones included. */
	routines(): Promise<RoutineEntry[]>;
	/**
	 * Every exercise of the registry, none filtered or ranked, in an order of presentation: the
	 * routines' exercises in the routines' order, each once, then those no routine lists, in the
	 * order registered. What each is, the routines that list it, whether it rests, and whether
	 * `startExercise` has something to play of it now.
	 */
	library(): Promise<LibraryEntry[]>;
	/**
	 * « Joué juste » or « C’était en place » from the summary: labels the attempt contested, with
	 * the reason contested when there is one, nothing else.
	 */
	contest(attemptId: number, reason?: string): Promise<void>;
	/** Plays run `runId` of a session still in memory; rejects a run whose take is not held. */
	replayRun(sessionId: string, runId: number): Promise<void>;
	stopReplay(): void;
	/**
	 * Of `exerciseIds`, those resting after « On change d’air » (`resumeAfter` still ahead), at
	 * scope `''`: kept for the exercises played alone until plan 5b.
	 */
	resting(exerciseIds: readonly ExerciseId[]): Promise<ExerciseId[]>;
	sessionSummary(sessionId: string): Promise<SessionSummary>;
	neckMap(): Promise<NeckMapCell[]>;
	/**
	 * The session of a routine, not yet started: how it draws is deduced from its exercises, the
	 * learning procedure on memory exercises, else their passages in turn. `free` plays a routine
	 * of memory exercises freely, among the items they list. Rejects an unknown routine, one an
	 * exercise of which no file defines, and the free play of a routine without memory.
	 */
	startRoutine(routineId: string, options?: { free?: boolean }): Promise<PlaySessionController>;
	/**
	 * Any exercise of the registry, alone (D7), not yet started: a memory exercise freely among
	 * its items, a passages exercise on its passages, another cycle after cycle as an exercise
	 * session plays it. Rejects an exercise no file defines, or one nothing can serve.
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
