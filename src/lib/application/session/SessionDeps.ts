import type { AttemptRecorder } from './AttemptRecorder';
import type { SessionMemory } from './sessionMemory';
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
	SoundSchedulerPort,
	TakeBufferPort
} from '$lib/application/ports';
import type { MechanicPresenter, SensorKind } from '$lib/application/mechanics/types';
import type { ExerciseDefinition, ExerciseId, MechanicId } from '$lib/domain/exercise/types';
import type { Locale } from '$lib/domain/types';
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
 * sound takes, where each exercise stands in its levels, and the input of the last run kept to be
 * heard again.
 */
export interface PlanSessionDeps extends SessionDeps {
	sounds: SoundSchedulerPort;
	levels: LevelStateRepositoryPort;
	takes: TakeBufferPort;
	/** Where a series leaves its trace and its takes for the summary. */
	memory: SessionMemory;
}

/**
 * What a series of response rounds on the transport needs: the one path every sound takes, the
 * sensors and presenters of its mechanics, where it writes, and whether
 * the development tools (« Joué juste ») show.
 */
export interface ResponseSeriesDeps {
	clock: AudioClockPort;
	sounds: SoundSchedulerPort;
	/** The guitar input, opened at start with the device and the built-in gain of the settings. */
	detector: NoteDetectorPort;
	sensors: SessionDeps['sensors'];
	mechanics: SessionDeps['mechanics'];
	repositories: Pick<SessionDeps, 'attempts' | 'sessions' | 'settings' | 'progressions'>;
	/** The recorder of one series: a new series (a start after the end) gets its own. */
	recorderFor: (sessionId: string) => AttemptRecorder;
	/** The definition of an exercise (its view, its instruction); throws on an unknown one. */
	exercise: (id: ExerciseId) => ExerciseDefinition;
	locale: () => Locale;
	/** The id of a new series started after the end. */
	newId: () => string;
	development: boolean;
	/** Spells the notes: one value is drawn per item taken from the source. */
	random: () => number;
}
