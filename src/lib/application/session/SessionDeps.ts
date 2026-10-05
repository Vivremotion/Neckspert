import type {
	AttemptRepositoryPort,
	AudioClockPort,
	CardStateRepositoryPort,
	MetronomePort,
	NoteDetectorPort,
	SessionRepositoryPort,
	SettingsRepositoryPort,
	SoundCuePort
} from '$lib/application/ports';
import type { MechanicPresenter, SensorKind } from '$lib/application/mechanics/types';
import type { MechanicId } from '$lib/domain/exercise/types';
import type { SensorFactory } from './sensors';

export interface SessionDeps {
	clock: AudioClockPort;
	metronome: MetronomePort;
	detector: NoteDetectorPort;
	cues: SoundCuePort;
	attempts: AttemptRepositoryPort;
	cards: CardStateRepositoryPort;
	sessions: SessionRepositoryPort;
	settings: SettingsRepositoryPort;
	now: () => number;
	random: () => number;
	newId: () => string;
	/** How each mechanic shows and is answered, by mechanic id. */
	mechanics: Record<MechanicId, MechanicPresenter>;
	/** The observation sources a series opens, by sensor kind. */
	sensors: Record<SensorKind, SensorFactory>;
}
