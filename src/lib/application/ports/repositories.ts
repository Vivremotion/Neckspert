import type {
	Attempt,
	BackupFile,
	CardKey,
	CardState,
	ExerciseId,
	Progression,
	SessionRecord,
	Settings
} from '$lib/domain/types';

export interface AttemptRepositoryPort {
	/** Stores the attempt and returns its id. */
	add(attempt: Attempt): Promise<number>;
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
	get(exerciseId: ExerciseId): Promise<Progression | undefined>;
	/** Replaces the progression stored for the same exercise. */
	put(progression: Progression): Promise<void>;
	all(): Promise<Progression[]>;
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
