import type { AppServices } from '$lib/application/app';
import type {
	BackupPort,
	CalibrationOutcome,
	CalibrationPort,
	CalibrationProgress
} from '$lib/application/ports';
import type { BackupFile, HomeStats, NeckMapCell, SessionSummary } from '$lib/domain/types';
import { DEFAULT_SETTINGS } from '$lib/domain/types';
import { validateBackup } from '$lib/infrastructure/storage';
import { FakeNoteDetector, InMemorySettingsRepository } from '$lib/testing/fakes';

export class FakeCalibration implements CalibrationPort {
	nextOutcome: CalibrationOutcome = { ok: true, offsetMs: 35, spreadMs: 8 };
	progressSteps: CalibrationProgress[] = [
		{ hits: 1, needed: 10, lastOffsetMs: 40 },
		{ hits: 5, needed: 10, lastOffsetMs: 30 },
		{ hits: 10, needed: 10, lastOffsetMs: 35 }
	];
	runCalls = 0;
	cancelled = false;

	async run(onProgress: (progress: CalibrationProgress) => void): Promise<CalibrationOutcome> {
		this.runCalls += 1;
		this.cancelled = false;
		for (const step of this.progressSteps) {
			if (this.cancelled) return { ok: false, reason: 'cancelled' };
			onProgress(step);
		}
		return this.nextOutcome;
	}

	cancel(): void {
		this.cancelled = true;
	}
}

export class FakeBackup implements BackupPort {
	private file: BackupFile = {
		app: 'neckspert-play',
		version: 1,
		exportedAt: 1,
		settings: { ...DEFAULT_SETTINGS },
		cards: [],
		attempts: [],
		sessions: []
	};

	constructor(private readonly settingsRepo: InMemorySettingsRepository) {}

	async exportAll(): Promise<BackupFile> {
		const settings = await this.settingsRepo.get();
		return { ...structuredClone(this.file), settings };
	}

	async importAll(raw: unknown): Promise<void> {
		this.file = structuredClone(validateBackup(raw));
		await this.settingsRepo.update(this.file.settings);
	}

	/** Test helper: seed the in-memory backup. */
	seed(file: BackupFile): void {
		this.file = structuredClone(file);
	}
}

const EMPTY_HOME: HomeStats = {
	nextAction: 'wait',
	nextReviewAt: null,
	medianColdOffsetMs: null,
	trend: null
};

const EMPTY_SUMMARY: SessionSummary = {
	sessionId: 'none',
	coldCount: 0,
	coldCorrect: 0,
	medianColdOffsetMs: null,
	identifyMedianReactionMs: null,
	learnedCount: 0,
	fatigueDetected: false,
	nextSuggestedAt: null
};

export function createFakeAppServices(overrides: Partial<AppServices> = {}): AppServices & {
	detector: FakeNoteDetector;
	calibration: FakeCalibration;
	backup: FakeBackup;
	settings: InMemorySettingsRepository;
} {
	const settings = new InMemorySettingsRepository();
	const detector = new FakeNoteDetector();
	const calibration = new FakeCalibration();
	const backup = new FakeBackup(settings);

	return {
		homeStats: async () => EMPTY_HOME,
		sessionSummary: async () => EMPTY_SUMMARY,
		neckMap: async (): Promise<NeckMapCell[]> => [],
		startSession: async () => {
			throw new Error('startSession is not used by I3 screens');
		},
		...overrides,
		settings,
		detector,
		calibration,
		backup
	};
}
