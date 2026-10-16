import type {
	Attempt,
	BackupFile,
	CardKey,
	CardState,
	ExerciseId,
	LevelState,
	Progression,
	RecordedObservation,
	SessionRecord,
	Settings
} from '$lib/domain/types';

export interface AttemptRepositoryPort {
	/** Stores the attempt and returns its id. */
	add(attempt: Attempt): Promise<number>;
	/** Replaces the observations of attempt `id`, leaving its other fields. Rejects an unknown id. */
	setObservations(id: number, observations: RecordedObservation[]): Promise<void>;
	/** Marks attempt `id` contested (a refused chord played right). Rejects an unknown id. */
	setContested(id: number): Promise<void>;
	/** Oldest first. */
	listByCard(key: CardKey): Promise<Attempt[]>;
	/** Oldest first. */
	listBySession(sessionId: string): Promise<Attempt[]>;
	/** Attempts prompted at or after `epochMs`, oldest first. */
	listSince(epochMs: number): Promise<Attempt[]>;
	/** Oldest first. */
	all(): Promise<Attempt[]>;
}

export interface CardStateRepositoryPort {
	get(key: CardKey): Promise<CardState | undefined>;
	put(state: CardState): Promise<void>;
	putMany(states: CardState[]): Promise<void>;
	all(): Promise<CardState[]>;
}

export interface SessionRepositoryPort {
	put(record: SessionRecord): Promise<void>;
	get(id: string): Promise<SessionRecord | undefined>;
	/** Oldest first. */
	list(): Promise<SessionRecord[]>;
}

/** The tempo reached on each exercise, one row per exercise. */
export interface ProgressionRepositoryPort {
	/** The progression of the exercise in `scope`; without one, the exercise's own. */
	get(exerciseId: ExerciseId, scope?: string): Promise<Progression | undefined>;
	/** Replaces the progression stored for the same exercise. */
	put(progression: Progression): Promise<void>;
	all(): Promise<Progression[]>;
}

/** Where each exercise stands in its levels, by exercise, scope and item ('' when absent). */
export interface LevelStateRepositoryPort {
	get(key: { exerciseId: string; scope: string; item: string }): Promise<LevelState | undefined>;
	/** Replaces the state stored under the same exercise, scope and item. */
	put(state: LevelState): Promise<void>;
	all(): Promise<LevelState[]>;
}

export interface SettingsRepositoryPort {
	/** Returns DEFAULT_SETTINGS merged with stored values. */
	get(): Promise<Settings>;
	update(patch: Partial<Settings>): Promise<Settings>;
}

export interface BackupPort {
	exportAll(): Promise<BackupFile>;
	/** Validates the file, then replaces all stored data. Throws on an invalid file. */
	importAll(file: unknown): Promise<void>;
}
