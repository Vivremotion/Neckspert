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
}
