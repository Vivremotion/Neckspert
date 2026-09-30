import {
	DEFAULT_SETTINGS,
	type Attempt,
	type CardKey,
	type CardState,
	type SessionRecord,
	type Settings,
	type Verdict
} from '$lib/domain/types';
import type {
	AttemptRepositoryPort,
	AudioClockPort,
	AudioInputDevice,
	BeatEvent,
	CardStateRepositoryPort,
	MetronomePort,
	NoteDetectorPort,
	NoteOnset,
	SessionRepositoryPort,
	SettingsRepositoryPort,
	SoundCuePort
} from '$lib/application/ports';

export class FakeSoundCues implements SoundCuePort {
	readonly played: { verdict: Verdict; time: number | undefined }[] = [];

	play(verdict: Verdict, time?: number): void {
		this.played.push({ verdict, time });
	}
}

export class FakeClock implements AudioClockPort {
	time = 0;
	epochAtZero = Date.UTC(2026, 0, 1);

	async resume(): Promise<void> {}

	now(): number {
		return this.time;
	}

	toEpochMs(audioTime: number): number {
		return this.epochAtZero + audioTime * 1000;
	}

	advance(seconds: number): void {
		this.time += seconds;
	}
}

export class FakeMetronome implements MetronomePort {
	audible = true;
	private bpm = 80;
	private firstBeatTime: number | null = null;
	private lastEmitted = -1;
	private readonly listeners = new Set<(beat: BeatEvent) => void>();

	/** `lookaheadS` mirrors the real scheduler: beats are announced up to that far before their time. */
	constructor(
		private readonly clock: FakeClock,
		private readonly beatsPerBar = 4,
		private readonly lookaheadS = 0.1
	) {}

	setTempo(bpm: number): void {
		if (this.isRunning()) throw new Error('Cannot change tempo while running');
		this.bpm = bpm;
	}

	getTempo(): number {
		return this.bpm;
	}

	secondsPerBeat(): number {
		return 60 / this.bpm;
	}

	start(firstBeatTime: number): void {
		this.firstBeatTime = firstBeatTime;
		this.lastEmitted = -1;
	}

	setAudible(audible: boolean): void {
		this.audible = audible;
	}

	stop(): void {
		this.firstBeatTime = null;
	}

	isRunning(): boolean {
		return this.firstBeatTime !== null;
	}

	beatTime(index: number): number {
		if (this.firstBeatTime === null) throw new Error('Metronome not running');
		return this.firstBeatTime + index * this.secondsPerBeat();
	}

	onBeat(callback: (beat: BeatEvent) => void): () => void {
		this.listeners.add(callback);
		return () => this.listeners.delete(callback);
	}

	/** Emits every beat whose audio time is within the lookahead of the clock. */
	flush(): void {
		if (this.firstBeatTime === null) return;
		while (this.beatTime(this.lastEmitted + 1) <= this.clock.now() + this.lookaheadS) {
			this.lastEmitted++;
			const beat: BeatEvent = {
				index: this.lastEmitted,
				time: this.beatTime(this.lastEmitted),
				isDownbeat: this.lastEmitted % this.beatsPerBar === 0
			};
			this.listeners.forEach((listener) => listener(beat));
		}
	}
}

export class FakeNoteDetector implements NoteDetectorPort {
	running = false;
	deviceId: string | null = null;
	private readonly noteListeners = new Set<(onset: NoteOnset) => void>();
	private readonly levelListeners = new Set<(rms: number) => void>();

	async listInputs(): Promise<AudioInputDevice[]> {
		return [{ id: 'fake-input', label: 'Fake input' }];
	}

	builtInGain = 1;

	async start(deviceId: string | null): Promise<void> {
		this.running = true;
		this.deviceId = deviceId;
	}

	setBuiltInGain(gain: number): void {
		this.builtInGain = gain;
	}

	stop(): void {
		this.running = false;
	}

	onNote(callback: (onset: NoteOnset) => void): () => void {
		this.noteListeners.add(callback);
		return () => this.noteListeners.delete(callback);
	}

	onLevel(callback: (rms: number) => void): () => void {
		this.levelListeners.add(callback);
		return () => this.levelListeners.delete(callback);
	}

	emitNote(onset: NoteOnset): void {
		if (!this.running) return;
		this.noteListeners.forEach((listener) => listener(onset));
	}

	emitLevel(rms: number): void {
		if (!this.running) return;
		this.levelListeners.forEach((listener) => listener(rms));
	}
}

function byPromptedAt(a: Attempt, b: Attempt): number {
	return a.promptedAt - b.promptedAt;
}

export class InMemoryAttemptRepository implements AttemptRepositoryPort {
	private readonly attempts: Attempt[] = [];

	async add(attempt: Attempt): Promise<number> {
		const id = this.attempts.length + 1;
		this.attempts.push({ ...attempt, id });
		return id;
	}

	async listByCard(key: CardKey): Promise<Attempt[]> {
		return this.attempts.filter((a) => a.cardKey === key).sort(byPromptedAt);
	}

	async listBySession(sessionId: string): Promise<Attempt[]> {
		return this.attempts.filter((a) => a.sessionId === sessionId).sort(byPromptedAt);
	}

	async listSince(epochMs: number): Promise<Attempt[]> {
		return this.attempts.filter((a) => a.promptedAt >= epochMs).sort(byPromptedAt);
	}

	async all(): Promise<Attempt[]> {
		return [...this.attempts].sort(byPromptedAt);
	}
}

export class InMemoryCardStateRepository implements CardStateRepositoryPort {
	private readonly states = new Map<CardKey, CardState>();

	async get(key: CardKey): Promise<CardState | undefined> {
		return this.states.get(key);
	}

	async put(state: CardState): Promise<void> {
		this.states.set(state.key, state);
	}

	async putMany(states: CardState[]): Promise<void> {
		states.forEach((state) => this.states.set(state.key, state));
	}

	async all(): Promise<CardState[]> {
		return [...this.states.values()];
	}
}

export class InMemorySessionRepository implements SessionRepositoryPort {
	private readonly records = new Map<string, SessionRecord>();

	async put(record: SessionRecord): Promise<void> {
		this.records.set(record.id, record);
	}

	async get(id: string): Promise<SessionRecord | undefined> {
		return this.records.get(id);
	}

	async list(): Promise<SessionRecord[]> {
		return [...this.records.values()].sort((a, b) => a.startedAt - b.startedAt);
	}
}

export class InMemorySettingsRepository implements SettingsRepositoryPort {
	private stored: Partial<Settings> = {};

	async get(): Promise<Settings> {
		return { ...DEFAULT_SETTINGS, ...this.stored };
	}

	async update(patch: Partial<Settings>): Promise<Settings> {
		this.stored = { ...this.stored, ...patch };
		return this.get();
	}
}
