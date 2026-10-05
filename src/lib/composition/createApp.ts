import { createAppServices } from '$lib/application/services/createAppServices';
import { NECK_PRESENTERS } from '$lib/application/mechanics';
import { noteSensor, tapSensor } from '$lib/application/session/sensors';
import type { AppServices } from '$lib/application/app';
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
	const detector = new WebAudioNoteDetector(context, { resume: () => clock.resume() });

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
		now: () => Date.now(),
		random: () => Math.random(),
		newId: () => crypto.randomUUID(),
		mechanics: NECK_PRESENTERS,
		sensors: { note: noteSensor(detector), tap: tapSensor() }
	});
}
