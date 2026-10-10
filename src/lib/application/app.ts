import { getContext, setContext } from 'svelte';
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
	/** « Joué juste » from the summary: labels the attempt contested, nothing else. */
	contest(attemptId: number): Promise<void>;
	sessionSummary(sessionId: string): Promise<SessionSummary>;
	neckMap(): Promise<NeckMapCell[]>;
	/** Plans the session and returns its controller, not yet started. */
	startSession(kind: SessionKind): Promise<PlaySessionController>;
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
