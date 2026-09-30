import { createAppServices } from '$lib/application/services/createAppServices';
import type { AppServices } from '$lib/application/app';
import { buildCurriculum } from '$lib/domain/music';
import { WebAudioClock, WebAudioMetronome } from '$lib/infrastructure/audio/clock';
import { WebAudioCues } from '$lib/infrastructure/audio/cues';
import { CalibrationService } from '$lib/infrastructure/audio/calibration';
import { WebAudioNoteDetector } from '$lib/infrastructure/audio/detection';
import {
	createDatabase,
	DexieAttemptRepository,
	DexieBackup,
	DexieCardStateRepository,
	DexieSessionRepository,
	DexieSettingsRepository
} from '$lib/infrastructure/storage';

export interface CreateAppOptions {
	/** Injected in tests. Production uses the browser AudioContext via WebAudioClock. */
	createContext?: () => AudioContext;
	/** Injected in tests. Production uses the default Dexie name `neckspert-play`. */
	databaseName?: string;
}

/**
 * Composition root. One WebAudioClock owns the single AudioContext (lazy on resume).
 * Metronome, cues and detector share () => clock.context(). One Dexie database feeds
 * every repository and DexieBackup. Calibration reads inputDeviceId from settings.
 */
export function createApp(options: CreateAppOptions = {}): AppServices {
	const clock = new WebAudioClock(options.createContext);
	const context = () => clock.context();
	const metronome = new WebAudioMetronome(context);
	const cues = new WebAudioCues(context);
	const detector = new WebAudioNoteDetector(context);

	const db = createDatabase(options.databaseName);
	const attempts = new DexieAttemptRepository(db);
	const cards = new DexieCardStateRepository(db);
	const sessions = new DexieSessionRepository(db);
	const settings = new DexieSettingsRepository(db);
	const backup = new DexieBackup(db);

	const calibration = new CalibrationService({
		clock,
		metronome,
		detector,
		deviceId: async () => (await settings.get()).inputDeviceId
	});

	return createAppServices({
		clock,
		metronome,
		detector,
		cues,
		attempts,
		cards,
		sessions,
		settings,
		backup,
		calibration,
		curriculum: buildCurriculum(),
		now: () => Date.now(),
		random: () => Math.random(),
		newId: () => crypto.randomUUID()
	});
}
