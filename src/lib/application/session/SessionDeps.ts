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
import type { Curriculum } from '$lib/domain/types';

export interface SessionDeps {
	clock: AudioClockPort;
	metronome: MetronomePort;
	detector: NoteDetectorPort;
	cues: SoundCuePort;
	attempts: AttemptRepositoryPort;
	cards: CardStateRepositoryPort;
	sessions: SessionRepositoryPort;
	settings: SettingsRepositoryPort;
	curriculum: Curriculum;
	now: () => number;
	random: () => number;
	newId: () => string;
}
