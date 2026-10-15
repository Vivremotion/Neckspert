import type {
	AttemptRepositoryPort,
	AudioClockPort,
	CardStateRepositoryPort,
	LevelStateRepositoryPort,
	MetronomePort,
	NoteDetectorPort,
	ProgressionRepositoryPort,
	SessionRepositoryPort,
	SettingsRepositoryPort,
	SoundCuePort,
	SoundSchedulerPort
} from '$lib/application/ports';
import type { MechanicPresenter, SensorKind } from '$lib/application/mechanics/types';
import type { ExerciseDefinition, ExerciseId, MechanicId } from '$lib/domain/exercise/types';
import type { SensorFactory } from './sensors';

export interface SessionDeps {
	clock: AudioClockPort;
	metronome: MetronomePort;
	detector: NoteDetectorPort;
	cues: SoundCuePort;
	attempts: AttemptRepositoryPort;
	cards: CardStateRepositoryPort;
	sessions: SessionRepositoryPort;
	/** Tempo reached on each exercise on the beat; a learn session writes the next one. */
	progressions: ProgressionRepositoryPort;
	/** Locale, calibration, input device and gain. */
	settings: SettingsRepositoryPort;
	now: () => number;
	random: () => number;
	newId: () => string;
	/** How each mechanic shows and is answered, by mechanic id. */
	mechanics: Record<MechanicId, MechanicPresenter>;
	/** The observation sources a series opens, by sensor kind. */
	sensors: Record<SensorKind, SensorFactory>;
	/** The definition of an exercise, for its pacing; the catalog's when omitted. */
	exercise?: (id: ExerciseId) => ExerciseDefinition;
}

/**
 * What a session that plays figures cycle after cycle needs beyond the core's: the one path every
 * sound takes, and where each exercise stands in its levels.
 */
export interface PlanSessionDeps extends SessionDeps {
	sounds: SoundSchedulerPort;
	levels: LevelStateRepositoryPort;
}
